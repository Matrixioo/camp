import { useEffect, useRef, useState } from 'react';
import { searchReservations } from '../api';
import { ConfirmDialog } from './ConfirmDialog';
import type { Board, Reservation, Unit } from '../types';
import {
  addDays,
  daysBetween,
  formatDayNumber,
  formatMonthLabel,
  formatWeekdayShort,
  parseISODate,
  startOfDay,
  timeToDayFraction,
} from '../dates';

export const TODAY_RESET_OFFSET_DAYS = 65;
export const INITIAL_DAYS = 135;
export const LOAD_MORE_DAYS = 30;
export const MAX_DAYS = 365;
const DAY_WIDTH = 40;
const LOAD_MORE_THRESHOLD_PX = DAY_WIDTH * 10;
const BAR_INSET_PX = 2;
const SEARCH_DEBOUNCE_MS = 300;
const HIGHLIGHT_MS = 1000;
const SAVE_HIGHLIGHT_MS = 1500;
const DRAG_THRESHOLD_PX = 5;
const MIN_WIDTH_FOR_META_PX = 110;

interface Props {
  board: Board;
  units: Unit[];
  reservations: Reservation[];
  windowStart: Date;
  totalDays: number;
  armedReservation: Reservation | null;
  onPlaceArmed: (unit: Unit, date: Date) => void;
  onCreateReservation: (unit: Unit, dateFrom: Date, dateTo: Date) => void;
  onOpenReservation: (reservation: Reservation) => void;
  onUpdateReservation: (reservation: Reservation, unitId: number, dateFrom: Date, dateTo: Date) => void;
  onAddUnit: (name: string, category: string) => void;
  onEditUnit: (unit: Unit, name: string, category: string) => void;
  onDeleteUnit: (unit: Unit) => void;
  onReorderUnits: (units: Unit[]) => void;
  onNeedMoreDays: () => void;
  flashSignal: { id: number; dateFrom?: string } | null;
}

interface DragState {
  unitId: number;
  startIdx: number;
  endIdx: number;
}

interface ResizeDrag {
  reservation: Reservation;
  edge: 'start' | 'end';
  anchorIdx: number;
  currentIdx: number;
}

interface MoveDrag {
  reservation: Reservation;
  duration: number;
  grabOffset: number;
  startIdx: number;
  startUnitId: number;
  currentIdx: number;
  currentUnitId: number;
}

interface PendingChange {
  reservation: Reservation;
  unitId: number;
  dateFrom: Date;
  dateTo: Date;
}

export function Grid({
  board,
  units,
  reservations,
  windowStart,
  totalDays,
  armedReservation,
  onPlaceArmed,
  onCreateReservation,
  onOpenReservation,
  onUpdateReservation,
  onAddUnit,
  onEditUnit,
  onDeleteUnit,
  onReorderUnits,
  onNeedMoreDays,
  flashSignal,
}: Props) {
  const [dragging, setDragging] = useState<DragState | null>(null);
  const draggingRef = useRef<DragState | null>(null);
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null);
  const resizeDragRef = useRef<ResizeDrag | null>(null);
  const [moveDrag, setMoveDrag] = useState<MoveDrag | null>(null);
  const moveDragRef = useRef<MoveDrag | null>(null);
  const [armedHover, setArmedHover] = useState<{ unitId: number; dayIdx: number } | null>(null);
  const armedHoverRef = useRef<{ unitId: number; dayIdx: number } | null>(null);
  const armedReservationRef = useRef<Reservation | null>(null);
  const onPlaceArmedRef = useRef(onPlaceArmed);
  const onOpenReservationRef = useRef(onOpenReservation);
  useEffect(() => {
    onPlaceArmedRef.current = onPlaceArmed;
    onOpenReservationRef.current = onOpenReservation;
  });
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitCategory, setNewUnitCategory] = useState('');
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [localUnits, setLocalUnits] = useState(units);
  const [draggingUnitId, setDraggingUnitId] = useState<number | null>(null);
  const unitDragStartRef = useRef<{ id: number; y: number; index: number; moved: boolean } | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [pendingUnitDelete, setPendingUnitDelete] = useState<Unit | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Reservation[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlighted, setSearchHighlighted] = useState(0);
  const [highlightedReservationId, setHighlightedReservationId] = useState<number | null>(null);
  const [flashToday, setFlashToday] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hScrollbarRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const programmaticScrollRef = useRef(false);

  const today = new Date();
  const todayIdx = daysBetween(windowStart, startOfDay(today));
  const days = Array.from({ length: totalDays }, (_, i) => addDays(windowStart, i));

  const monthGroups: { key: string; label: string; startIdx: number; span: number }[] = [];
  days.forEach((day, i) => {
    const key = `${day.getFullYear()}-${day.getMonth()}`;
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.key === key) {
      last.span += 1;
    } else {
      monthGroups.push({ key, label: formatMonthLabel(day), startIdx: i, span: 1 });
    }
  });

  useEffect(() => {
    scrollToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadingMoreRef.current = false;
  }, [totalDays]);

  function scrollGridHorizontallyTo(targetLeft: number) {
    const el = scrollRef.current;
    if (!el) return;

    programmaticScrollRef.current = true;
    const stopGuarding = () => {
      programmaticScrollRef.current = false;
      el.removeEventListener('scrollend', stopGuarding);
    };
    el.addEventListener('scrollend', stopGuarding);
    window.setTimeout(stopGuarding, 800);

    el.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }

  function scrollToToday() {
    scrollGridHorizontallyTo(todayIdx * DAY_WIDTH - DAY_WIDTH * 3);

    setFlashToday(true);
    window.setTimeout(() => setFlashToday(false), 1300);
  }

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      searchReservations(board.id, query)
        .then((results) => {
          setSearchResults(results);
          setSearchHighlighted(0);
        })
        .catch(() => setSearchResults([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchQuery, board.id]);

  function flashReservation(id: number, durationMs: number, dateFrom?: string) {
    document.getElementById(`reservation-bar-${id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    if (dateFrom) {
      const startIdx = daysBetween(windowStart, parseISODate(dateFrom));
      scrollGridHorizontallyTo(startIdx * DAY_WIDTH - DAY_WIDTH * 3);
    }

    setHighlightedReservationId(id);
    window.setTimeout(() => {
      setHighlightedReservationId((current) => (current === id ? null : current));
    }, durationMs);
  }

  function selectSearchResult(result: Reservation) {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    flashReservation(result.id, HIGHLIGHT_MS, result.date_from);
  }

  useEffect(() => {
    if (flashSignal) flashReservation(flashSignal.id, SAVE_HIGHLIGHT_MS, flashSignal.dateFrom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashSignal]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        selectSearchResult(searchResults[searchHighlighted]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchHighlighted((h) => Math.min(h + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el) return;

    if (e.deltaX !== 0) {
      e.preventDefault();
      el.scrollLeft += e.deltaX;
      return;
    }

    const pageNeedsVerticalScroll = document.documentElement.scrollHeight > document.documentElement.clientHeight;
    if (pageNeedsVerticalScroll) return;

    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;

    if (hScrollbarRef.current && hScrollbarRef.current.scrollLeft !== el.scrollLeft) {
      hScrollbarRef.current.scrollLeft = el.scrollLeft;
    }

    if (loadingMoreRef.current || totalDays >= MAX_DAYS) return;

    const distanceToEnd = el.scrollWidth - el.scrollLeft - el.clientWidth;
    if (distanceToEnd < LOAD_MORE_THRESHOLD_PX) {
      loadingMoreRef.current = true;
      onNeedMoreDays();
    }
  }

  function handleScrollbarScroll() {
    const bar = hScrollbarRef.current;
    const el = scrollRef.current;
    if (!bar || !el || programmaticScrollRef.current) return;

    if (el.scrollLeft !== bar.scrollLeft) {
      el.scrollLeft = bar.scrollLeft;
    }
  }

  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  useEffect(() => {
    resizeDragRef.current = resizeDrag;
  }, [resizeDrag]);

  useEffect(() => {
    moveDragRef.current = moveDrag;
  }, [moveDrag]);

  useEffect(() => {
    armedHoverRef.current = armedHover;
  }, [armedHover]);

  useEffect(() => {
    armedReservationRef.current = armedReservation;
    setArmedHover(null);
  }, [armedReservation]);

  useEffect(() => {
    function handleMouseUp() {
      const drag = draggingRef.current;
      if (drag) {
        setDragging(null);
        const startIdx = Math.min(drag.startIdx, drag.endIdx);
        const endIdx = Math.max(drag.startIdx, drag.endIdx);
        const unit = endIdx > startIdx ? units.find((u) => u.id === drag.unitId) : undefined;
        if (unit) {
          onCreateReservation(unit, addDays(windowStart, startIdx), addDays(windowStart, endIdx));
        }
      }

      const resize = resizeDragRef.current;
      if (resize) {
        setResizeDrag(null);
        const startIdx = Math.min(resize.anchorIdx, resize.currentIdx);
        const endIdx = Math.max(resize.anchorIdx, resize.currentIdx);
        const originalStartIdx = daysBetween(windowStart, parseISODate(resize.reservation.date_from));
        const originalEndIdx = daysBetween(windowStart, parseISODate(resize.reservation.date_to));
        const changed = startIdx !== originalStartIdx || endIdx !== originalEndIdx;

        if (endIdx >= startIdx && changed) {
          setPendingChange({
            reservation: resize.reservation,
            unitId: resize.reservation.unit as number,
            dateFrom: addDays(windowStart, startIdx),
            dateTo: addDays(windowStart, endIdx),
          });
        }
      }

      const move = moveDragRef.current;
      if (move) {
        setMoveDrag(null);
        const changed = move.currentIdx !== move.startIdx || move.currentUnitId !== move.startUnitId;

        if (changed) {
          const newStartIdx = move.currentIdx - move.grabOffset;
          setPendingChange({
            reservation: move.reservation,
            unitId: move.currentUnitId,
            dateFrom: addDays(windowStart, newStartIdx),
            dateTo: addDays(windowStart, newStartIdx + move.duration),
          });
        } else {
          onOpenReservationRef.current(move.reservation);
        }
      }

      const armedRes = armedReservationRef.current;
      if (armedRes) {
        const hover = armedHoverRef.current;
        if (hover) {
          const unit = units.find((u) => u.id === hover.unitId);
          if (unit) onPlaceArmedRef.current(unit, addDays(windowStart, hover.dayIdx));
        } else {
          onOpenReservationRef.current(armedRes);
        }
      }
    }

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, windowStart]);

  function startResize(reservation: Reservation, edge: 'start' | 'end') {
    const startIdx = daysBetween(windowStart, parseISODate(reservation.date_from));
    const endIdx = daysBetween(windowStart, parseISODate(reservation.date_to));
    setResizeDrag({
      reservation,
      edge,
      anchorIdx: edge === 'start' ? endIdx : startIdx,
      currentIdx: edge === 'start' ? startIdx : endIdx,
    });
  }

  function startMove(reservation: Reservation, unitId: number, grabbedIdx: number) {
    const startIdx = daysBetween(windowStart, parseISODate(reservation.date_from));
    const endIdx = daysBetween(windowStart, parseISODate(reservation.date_to));
    setMoveDrag({
      reservation,
      duration: endIdx - startIdx,
      grabOffset: grabbedIdx - startIdx,
      startIdx: grabbedIdx,
      startUnitId: unitId,
      currentIdx: grabbedIdx,
      currentUnitId: unitId,
    });
  }

  function submitNewUnit() {
    const trimmed = newUnitName.trim();
    if (trimmed) {
      onAddUnit(trimmed, newUnitCategory.trim());
    }
    setNewUnitName('');
    setNewUnitCategory('');
    setAddingUnit(false);
  }

  function startEditingUnit(unit: Unit) {
    setEditingUnitId(unit.id);
    setEditName(unit.name);
    setEditCategory(unit.category);
  }

  function submitEditUnit(unit: Unit) {
    const trimmed = editName.trim();
    if (trimmed) {
      onEditUnit(unit, trimmed, editCategory.trim());
    }
    setEditingUnitId(null);
  }

  useEffect(() => {
    if (draggingUnitId === null) setLocalUnits(units);
  }, [units, draggingUnitId]);

  useEffect(() => {
    function handleUnitMouseMove(e: MouseEvent) {
      const start = unitDragStartRef.current;
      if (!start) return;

      if (!start.moved) {
        if (Math.abs(e.clientY - start.y) < DRAG_THRESHOLD_PX) return;
        start.moved = true;
        setDraggingUnitId(start.id);
      }
    }

    function handleUnitMouseUp() {
      const start = unitDragStartRef.current;
      unitDragStartRef.current = null;
      if (!start) return;

      if (start.moved) {
        setDraggingUnitId(null);
        onReorderUnits(localUnits);
      }
    }

    window.addEventListener('mousemove', handleUnitMouseMove);
    window.addEventListener('mouseup', handleUnitMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleUnitMouseMove);
      window.removeEventListener('mouseup', handleUnitMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localUnits]);

  function handleUnitLabelMouseEnter(overIndex: number) {
    const start = unitDragStartRef.current;
    if (!start || !start.moved) return;

    setLocalUnits((prev) => {
      const fromIndex = prev.findIndex((u) => u.id === start.id);
      if (fromIndex === -1 || fromIndex === overIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(overIndex, 0, moved);
      return next;
    });
  }

  function checkInFractionFor(reservation: Reservation): number {
    return timeToDayFraction(reservation.check_in_time) ?? timeToDayFraction(board.default_check_in_time) ?? 0;
  }

  function checkOutFractionFor(reservation: Reservation): number {
    return timeToDayFraction(reservation.check_out_time) ?? timeToDayFraction(board.default_check_out_time) ?? 1;
  }

  const dayColumns = `repeat(${totalDays}, ${DAY_WIDTH}px)`;

  return (
    <div className="grid-wrapper">
      <div className="grid-toolbar">
        <button type="button" className="today-button" onClick={scrollToToday} title="Go to today's date">
          T
        </button>

        <div className="reservation-search">
          <input
            type="text"
            placeholder="Search reservations (name, ref. number, notes)..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={handleSearchKeyDown}
          />
          {searchOpen && searchQuery.trim() && (
            <ul className="reservation-search-results">
              {searchResults.length === 0 ? (
                <li className="reservation-search-empty muted">No matches in the last/next 2 months</li>
              ) : (
                searchResults.map((result, i) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      className={i === searchHighlighted ? 'highlighted' : ''}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setSearchHighlighted(i)}
                      onClick={() => selectSearchResult(result)}
                    >
                      <strong>{result.lead_guest_name}</strong>
                      <span className="muted">
                        {result.date_from} → {result.date_to}
                        {result.ref_number ? ` · ${result.ref_number}` : ''}
                        {result.unit === null ? ' · unassigned' : ''}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="grid-body">
        <div className="grid-labels">
          <div className="grid-label-cell grid-label-header" />

          {localUnits.map((unit, index) => (
            <div
              key={unit.id}
              className={`grid-label-cell ${draggingUnitId === unit.id ? 'dragging' : ''}`}
              onMouseEnter={() => handleUnitLabelMouseEnter(index)}
            >
              {editingUnitId === unit.id ? (
                <div className="edit-unit-form">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitEditUnit(unit)}
                  />
                  <input
                    value={editCategory}
                    placeholder="Category"
                    onChange={(e) => setEditCategory(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitEditUnit(unit)}
                  />
                  <div className="edit-unit-actions">
                    <button type="button" onClick={() => submitEditUnit(unit)}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingUnitId(null)}>
                      Cancel
                    </button>
                    <button type="button" className="danger" onClick={() => setPendingUnitDelete(unit)}>
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="unit-label"
                  onMouseDown={(e) => {
                    unitDragStartRef.current = { id: unit.id, y: e.clientY, index, moved: false };
                  }}
                  onDoubleClick={() => startEditingUnit(unit)}
                  title="Drag to reorder, double-click to rename"
                >
                  <strong>{unit.name}</strong>
                  {unit.category && <span className="muted"> {unit.category}</span>}
                </button>
              )}
            </div>
          ))}

          <div className="grid-label-cell add-unit-row">
            {addingUnit ? (
              <div className="add-unit-form">
                <input
                  autoFocus
                  placeholder="Name"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitNewUnit()}
                />
                <input
                  placeholder="Category"
                  value={newUnitCategory}
                  onChange={(e) => setNewUnitCategory(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitNewUnit()}
                />
                <button type="button" onClick={submitNewUnit}>
                  Add
                </button>
              </div>
            ) : (
              <button type="button" className="link-button" onClick={() => setAddingUnit(true)}>
                + Add row
              </button>
            )}
          </div>
        </div>

        <div className="grid-scroll" ref={scrollRef} onWheel={handleWheel} onScroll={handleScroll}>
          <div className="grid-header">
            <div className="grid-month-row" style={{ gridTemplateColumns: dayColumns }}>
              {monthGroups.map((group) => (
                <div
                  key={group.key}
                  className="grid-month-cell"
                  style={{ gridColumn: `${group.startIdx + 1} / span ${group.span}` }}
                >
                  {group.label}
                </div>
              ))}
            </div>
            <div className="grid-day-row" style={{ gridTemplateColumns: dayColumns }}>
              {days.map((day, i) => {
                const isToday = i === todayIdx;
                return (
                  <div
                    key={day.toISOString()}
                    className={`grid-date-cell ${isToday ? 'today' : ''} ${isToday && flashToday ? 'flash-column' : ''}`}
                  >
                    <span className="grid-date-number">{formatDayNumber(day)}</span>
                    <span className="grid-date-weekday">{formatWeekdayShort(day)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {localUnits.map((unit) => {
            const unitReservations = reservations.filter((r) => r.unit === unit.id);

            return (
              <div key={unit.id} className="grid-row" style={{ gridTemplateColumns: dayColumns }}>
                {days.map((_, i) => {
                  const inResizeRange =
                    resizeDrag &&
                    resizeDrag.reservation.unit === unit.id &&
                    i >= Math.min(resizeDrag.anchorIdx, resizeDrag.currentIdx) &&
                    i <= Math.max(resizeDrag.anchorIdx, resizeDrag.currentIdx);

                  const highlighted = inResizeRange;
                  const isTodayCell = i === todayIdx;
                  const isArmedHoverTarget =
                    armedHover !== null && armedHover.unitId === unit.id && armedHover.dayIdx === i;

                  return (
                    <div
                      key={i}
                      className={`cell ${highlighted ? 'drag-range' : ''} ${armedReservation ? 'armed-target' : ''} ${isArmedHoverTarget ? 'armed-target-hover' : ''} ${isTodayCell && flashToday ? 'flash-column' : ''}`}
                      style={{ gridColumn: i + 1 }}
                      onMouseDown={() => {
                        if (armedReservation || resizeDrag || moveDrag) return;
                        setDragging({ unitId: unit.id, startIdx: i, endIdx: i });
                      }}
                      onMouseEnter={() => {
                        if (dragging && dragging.unitId === unit.id) {
                          setDragging({ ...dragging, endIdx: i });
                        }
                        if (resizeDrag) {
                          setResizeDrag({ ...resizeDrag, currentIdx: i });
                        }
                        if (moveDrag) {
                          setMoveDrag({ ...moveDrag, currentIdx: i, currentUnitId: unit.id });
                        }
                        if (armedReservation) {
                          setArmedHover({ unitId: unit.id, dayIdx: i });
                        }
                      }}
                    />
                  );
                })}

                {unitReservations.map((reservation) => {
                  const isResizingThis = resizeDrag?.reservation.id === reservation.id;
                  const isMovingThis = moveDrag?.reservation.id === reservation.id;

                  let startIdx = daysBetween(windowStart, parseISODate(reservation.date_from));
                  let endIdx = daysBetween(windowStart, parseISODate(reservation.date_to));
                  const checkInFraction = checkInFractionFor(reservation);
                  const checkOutFraction = checkOutFractionFor(reservation);

                  if (isResizingThis && resizeDrag) {
                    startIdx = Math.min(resizeDrag.anchorIdx, resizeDrag.currentIdx);
                    endIdx = Math.max(resizeDrag.anchorIdx, resizeDrag.currentIdx);
                  }

                  const startPx = Math.max(0, (startIdx + checkInFraction) * DAY_WIDTH);
                  const endPx = Math.min(totalDays * DAY_WIDTH, (endIdx + checkOutFraction) * DAY_WIDTH);
                  const widthPx = endPx - startPx - BAR_INSET_PX;
                  if (widthPx <= 0) return null;

                  const isHighlighted = highlightedReservationId === reservation.id;
                  const showMeta = widthPx >= MIN_WIDTH_FOR_META_PX && (unit.category || reservation.agency);

                  return (
                    <button
                      key={reservation.id}
                      id={`reservation-bar-${reservation.id}`}
                      type="button"
                      className={`reservation-bar status-${reservation.status} ${isMovingThis ? 'dragging-source' : ''} ${isResizingThis ? 'resizing' : ''} ${isHighlighted ? 'flash-highlight' : ''}`}
                      style={{ left: `${startPx + BAR_INSET_PX / 2}px`, width: `${widthPx}px` }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rowEl = (e.currentTarget as HTMLElement).closest('.grid-row') as HTMLElement | null;
                        const rowLeft = rowEl?.getBoundingClientRect().left ?? e.currentTarget.getBoundingClientRect().left;
                        const grabbedIdx = Math.floor((e.clientX - rowLeft) / DAY_WIDTH);
                        startMove(reservation, unit.id, grabbedIdx);
                      }}
                      title={`${reservation.lead_guest_name}: ${reservation.date_from} → ${reservation.date_to}`}
                    >
                      <span
                        className="resize-handle resize-handle-start"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          startResize(reservation, 'start');
                        }}
                      />
                      <span className="reservation-bar-label">
                        <span className="reservation-bar-name">{reservation.lead_guest_name}</span>
                        {showMeta && (
                          <>
                            <span className="reservation-bar-divider" />
                            <span className="reservation-bar-meta">
                              {unit.category && <span className="reservation-bar-category">{unit.category}</span>}
                              {reservation.agency && (
                                <span className="reservation-bar-agency">{reservation.agency}</span>
                              )}
                            </span>
                          </>
                        )}
                      </span>
                      <span
                        className="resize-handle resize-handle-end"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          startResize(reservation, 'end');
                        }}
                      />
                    </button>
                  );
                })}

                {dragging && dragging.unitId === unit.id && (() => {
                  const startIdx = Math.min(dragging.startIdx, dragging.endIdx);
                  const endIdx = Math.max(dragging.startIdx, dragging.endIdx);
                  const checkInFraction = timeToDayFraction(board.default_check_in_time) ?? 0;
                  const checkOutFraction = timeToDayFraction(board.default_check_out_time) ?? 1;
                  const startPx = Math.max(0, (startIdx + checkInFraction) * DAY_WIDTH);
                  const endPx = Math.min(totalDays * DAY_WIDTH, (endIdx + checkOutFraction) * DAY_WIDTH);
                  const widthPx = endPx - startPx - BAR_INSET_PX;
                  if (widthPx <= 0) return null;

                  return (
                    <div
                      className="reservation-bar reservation-ghost"
                      style={{ left: `${startPx + BAR_INSET_PX / 2}px`, width: `${widthPx}px` }}
                    />
                  );
                })()}

                {moveDrag && moveDrag.currentUnitId === unit.id && (() => {
                  const checkInFraction = checkInFractionFor(moveDrag.reservation);
                  const checkOutFraction = checkOutFractionFor(moveDrag.reservation);
                  const previewStartIdx = moveDrag.currentIdx - moveDrag.grabOffset;
                  const startPx = Math.max(0, (previewStartIdx + checkInFraction) * DAY_WIDTH);
                  const endPx = Math.min(
                    totalDays * DAY_WIDTH,
                    (previewStartIdx + moveDrag.duration + checkOutFraction) * DAY_WIDTH,
                  );
                  const widthPx = endPx - startPx - BAR_INSET_PX;
                  if (widthPx <= 0) return null;

                  return (
                    <div
                      className="reservation-bar reservation-ghost"
                      style={{ left: `${startPx + BAR_INSET_PX / 2}px`, width: `${widthPx}px` }}
                    >
                      <span className="reservation-bar-label">
                        <span className="reservation-bar-name">{moveDrag.reservation.lead_guest_name}</span>
                      </span>
                    </div>
                  );
                })()}

                {armedReservation && armedHover && armedHover.unitId === unit.id && (() => {
                  const checkInFraction = checkInFractionFor(armedReservation);
                  const checkOutFraction = checkOutFractionFor(armedReservation);
                  const duration = daysBetween(
                    parseISODate(armedReservation.date_from),
                    parseISODate(armedReservation.date_to),
                  );
                  const startPx = Math.max(0, (armedHover.dayIdx + checkInFraction) * DAY_WIDTH);
                  const endPx = Math.min(
                    totalDays * DAY_WIDTH,
                    (armedHover.dayIdx + duration + checkOutFraction) * DAY_WIDTH,
                  );
                  const widthPx = endPx - startPx - BAR_INSET_PX;
                  if (widthPx <= 0) return null;

                  return (
                    <div
                      className="reservation-bar reservation-ghost"
                      style={{ left: `${startPx + BAR_INSET_PX / 2}px`, width: `${widthPx}px` }}
                    >
                      <span className="reservation-bar-label">
                        <span className="reservation-bar-name">{armedReservation.lead_guest_name}</span>
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid-hscrollbar-row">
        <div className="grid-hscrollbar-spacer" />
        <div className="grid-hscrollbar" ref={hScrollbarRef} onScroll={handleScrollbarScroll}>
          <div style={{ width: `${totalDays * DAY_WIDTH}px`, height: 1 }} />
        </div>
      </div>

      {pendingChange && (() => {
        function unitLabelFor(unitId: number | null) {
          const unit = units.find((u) => u.id === unitId);
          return unit ? `${unit.name}${unit.category ? ` (${unit.category})` : ''}` : 'Unassigned';
        }

        const fromUnit = unitLabelFor(pendingChange.reservation.unit);
        const fromDates = `${parseISODate(pendingChange.reservation.date_from).toLocaleDateString('en-US')} → ${parseISODate(pendingChange.reservation.date_to).toLocaleDateString('en-US')}`;
        const toUnit = unitLabelFor(pendingChange.unitId);
        const toDates = `${pendingChange.dateFrom.toLocaleDateString('en-US')} → ${pendingChange.dateTo.toLocaleDateString('en-US')}`;

        return (
          <ConfirmDialog
            title="Change reservation"
            confirmLabel="Change"
            onConfirm={() => {
              onUpdateReservation(pendingChange.reservation, pendingChange.unitId, pendingChange.dateFrom, pendingChange.dateTo);
              setPendingChange(null);
            }}
            onCancel={() => setPendingChange(null)}
          >
            <p className="muted">{pendingChange.reservation.lead_guest_name}</p>
            <div className="change-comparison">
              <div className="change-side">
                <strong>{fromUnit}</strong>
                <span className="muted">{fromDates}</span>
              </div>
              <div className="change-arrow">→</div>
              <div className="change-side">
                <strong>{toUnit}</strong>
                <span className="muted">{toDates}</span>
              </div>
            </div>
          </ConfirmDialog>
        );
      })()}

      {pendingUnitDelete && (
        <ConfirmDialog
          title="Delete row"
          message={`Delete row "${pendingUnitDelete.name}"? Its reservations will become unassigned.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            onDeleteUnit(pendingUnitDelete);
            setPendingUnitDelete(null);
          }}
          onCancel={() => setPendingUnitDelete(null)}
        />
      )}
    </div>
  );
}
