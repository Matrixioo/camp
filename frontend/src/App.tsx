import { useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  ApiError,
  type Session,
  createBoard,
  createUnit,
  deleteBoard,
  deleteUnit,
  fetchBoards,
  fetchMe,
  fetchReservations,
  fetchUnassigned,
  fetchUnits,
  logout,
  reorderBoards,
  reorderUnits,
  updateBoard,
  updateReservation,
  updateUnit,
} from './api';
import { clearToken, getToken, setToken } from './auth';
import { AuthScreen } from './components/AuthScreen';
import { BoardSettingsModal } from './components/BoardSettingsModal';
import { BoardTabs } from './components/BoardTabs';
import { Grid, INITIAL_DAYS, LOAD_MORE_DAYS, MAX_DAYS, TODAY_RESET_OFFSET_DAYS } from './components/Grid';
import { MembersModal } from './components/MembersModal';
import { ReservationModal } from './components/ReservationModal';
import { SidePanel } from './components/SidePanel';
import { addDays, daysBetween, parseISODate, startOfDay, toISODate } from './dates';
import type { Board, Membership, Reservation, Role, Unit, User } from './types';

interface ModalState {
  reservation: Reservation | null;
  unitId: number | null;
  dateFrom: string;
  dateTo: string;
}

function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null);

  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [unassigned, setUnassigned] = useState<Reservation[]>([]);
  const [windowStart] = useState(() => addDays(startOfDay(new Date()), -TODAY_RESET_OFFSET_DAYS));
  const [totalDays, setTotalDays] = useState(INITIAL_DAYS);
  const [armed, setArmed] = useState<Reservation | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flashSignal, setFlashSignal] = useState<{ id: number; dateFrom?: string } | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setAuthLoading(false);
      return;
    }
    fetchMe()
      .then(({ user, memberships }) => {
        setUser(user);
        setMemberships(memberships);
      })
      .catch(() => clearToken())
      .finally(() => setAuthLoading(false));
  }, []);

  const hotels = useMemo(
    () => memberships.map((m) => ({ id: m.hotel, name: m.hotel_name, role: m.role })),
    [memberships],
  );

  useEffect(() => {
    if (hotels.length > 0 && (selectedHotelId === null || !hotels.some((h) => h.id === selectedHotelId))) {
      setSelectedHotelId(hotels[0].id);
    }
    if (hotels.length === 0) setSelectedHotelId(null);
  }, [hotels, selectedHotelId]);

  const role: Role | null = useMemo(
    () => memberships.find((m) => m.hotel === selectedHotelId)?.role ?? null,
    [memberships, selectedHotelId],
  );
  const canManageBoard = role === 'owner' || role === 'admin';

  function handleAuthenticated(session: Session) {
    setToken(session.token);
    setUser(session.user);
    setMemberships(session.memberships);
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {}
    clearToken();
    setUser(null);
    setMemberships([]);
    setSelectedHotelId(null);
    setBoards([]);
    setSelectedBoard(null);
  }

  useEffect(() => {
    if (selectedHotelId === null) return;
    fetchBoards()
      .then((data) => {
        const hotelBoards = data.filter((b) => b.hotel === selectedHotelId);
        setBoards(hotelBoards);
        setSelectedBoard((prev) => (prev && hotelBoards.some((b) => b.id === prev.id) ? prev : hotelBoards[0] ?? null));
      })
      .catch(() => setLoadError('Could not reach the API. Is the Django server running?'));
  }, [selectedHotelId]);

  function reloadBoardData(board: Board, start: Date, days: number) {
    const from = toISODate(start);
    const to = toISODate(addDays(start, days));

    fetchUnits(board.id).then(setUnits).catch(() => setLoadError('Could not load units.'));
    fetchReservations(board.id, from, to)
      .then(setReservations)
      .catch(() => setLoadError('Could not load reservations.'));
    fetchUnassigned(board.id)
      .then(setUnassigned)
      .catch(() => setLoadError('Could not load unassigned reservations.'));
  }

  useEffect(() => {
    if (selectedBoard) reloadBoardData(selectedBoard, windowStart, totalDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoard, windowStart, totalDays]);

  function refresh() {
    if (selectedBoard) reloadBoardData(selectedBoard, windowStart, totalDays);
  }

  function handleNeedMoreDays() {
    setTotalDays((d) => Math.min(d + LOAD_MORE_DAYS, MAX_DAYS));
  }

  async function handleCreateBoard(name: string) {
    if (!selectedHotelId) return;
    const board = await createBoard(selectedHotelId, name);
    setBoards((prev) => [...prev, board]);
    setSelectedBoard(board);
  }

  async function handleAddUnit(name: string, category: string) {
    if (!selectedBoard) return;
    await createUnit({ board: selectedBoard.id, name, category, capacity: null, order: units.length });
    refresh();
  }

  async function handleEditUnit(unit: Unit, name: string, category: string) {
    await updateUnit(unit.id, { name, category });
    refresh();
  }

  async function handleDeleteUnit(unit: Unit) {
    await deleteUnit(unit.id);
    refresh();
  }

  async function handleReorderUnits(newOrder: Unit[]) {
    setUnits(newOrder);
    if (!selectedBoard) return;
    try {
      const updated = await reorderUnits(selectedBoard.id, newOrder.map((u) => u.id));
      setUnits(updated);
    } catch {}
  }

  async function handleDeleteBoard(board: Board) {
    await deleteBoard(board.id);
    setBoards((prev) => {
      const remaining = prev.filter((b) => b.id !== board.id);
      if (selectedBoard?.id === board.id) {
        setSelectedBoard(remaining[0] ?? null);
      }
      return remaining;
    });
  }

  async function handleRenameBoard(board: Board, name: string) {
    const updated = await updateBoard(board.id, { name });
    setBoards((prev) => prev.map((b) => (b.id === board.id ? updated : b)));
    setSelectedBoard((prev) => (prev?.id === board.id ? updated : prev));
  }

  async function handleReorderBoards(newOrder: Board[]) {
    setBoards(newOrder);
    try {
      const updated = await reorderBoards(newOrder.map((b) => b.id));
      setBoards(updated.filter((b) => b.hotel === selectedHotelId));
    } catch {}
  }

  function handleCreateReservation(unit: Unit, dateFrom: Date, dateTo: Date) {
    setModal({
      reservation: null,
      unitId: unit.id,
      dateFrom: toISODate(dateFrom),
      dateTo: toISODate(dateTo),
    });
  }

  function handleOpenReservation(reservation: Reservation) {
    setArmed(null);
    setModal({
      reservation,
      unitId: reservation.unit,
      dateFrom: reservation.date_from,
      dateTo: reservation.date_to,
    });
  }

  async function handlePlaceArmed(unit: Unit, date: Date) {
    if (!armed) return;
    const duration = daysBetween(parseISODate(armed.date_from), parseISODate(armed.date_to));
    const dateFrom = date;
    const dateTo = addDays(date, duration);

    try {
      await updateReservation(armed.id, {
        unit: unit.id,
        date_from: toISODate(dateFrom),
        date_to: toISODate(dateTo),
      });
      setArmed(null);
      refresh();
    } catch (err) {
      const message = err instanceof ApiError ? JSON.stringify(err.errors) : 'Could not place this reservation.';
      window.alert(message);
    }
  }

  async function handleUpdateReservation(reservation: Reservation, unitId: number, dateFrom: Date, dateTo: Date) {
    try {
      await updateReservation(reservation.id, {
        unit: unitId,
        date_from: toISODate(dateFrom),
        date_to: toISODate(dateTo),
      });
      refresh();
    } catch (err) {
      const message = err instanceof ApiError ? JSON.stringify(err.errors) : 'Could not update this reservation.';
      window.alert(message);
    }
  }

  if (authLoading) {
    return null;
  }

  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  const currentHotel = hotels.find((h) => h.id === selectedHotelId) ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>camp</h1>
          <p className="muted">Reception panel.</p>
        </div>
        <div className="app-header-account">
          {hotels.length > 1 && (
            <select
              className="hotel-switcher"
              value={selectedHotelId ?? ''}
              onChange={(e) => setSelectedHotelId(Number(e.target.value))}
            >
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}
          <span className="muted">{user.username}</span>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {loadError && <p className="error-list">{loadError}</p>}

      {hotels.length === 0 && (
        <p className="muted">
          You don't have access to any hotel yet. Ask an owner or admin to add your username.
        </p>
      )}

      {selectedHotelId && (
        <>
          <div className="board-tabs-row">
            <BoardTabs
              boards={boards}
              selectedId={selectedBoard?.id ?? null}
              canManage={canManageBoard}
              onSelect={setSelectedBoard}
              onCreate={handleCreateBoard}
              onDelete={handleDeleteBoard}
              onRename={handleRenameBoard}
              onReorder={handleReorderBoards}
            />
            {selectedBoard && canManageBoard && (
              <button
                type="button"
                className="settings-button"
                title="Board settings"
                onClick={() => setShowBoardSettings(true)}
              >
                ⚙
              </button>
            )}
            {currentHotel && canManageBoard && (
              <button type="button" className="settings-button" title="Team" onClick={() => setShowMembers(true)}>
                👥
              </button>
            )}
          </div>

          {selectedBoard && (
            <div className="board-content-row">
              <Grid
                board={selectedBoard}
                units={units}
                reservations={reservations}
                windowStart={windowStart}
                totalDays={totalDays}
                armedReservation={armed}
                canManage={canManageBoard}
                onPlaceArmed={handlePlaceArmed}
                onCreateReservation={handleCreateReservation}
                onOpenReservation={handleOpenReservation}
                onUpdateReservation={handleUpdateReservation}
                onAddUnit={handleAddUnit}
                onEditUnit={handleEditUnit}
                onDeleteUnit={handleDeleteUnit}
                onReorderUnits={handleReorderUnits}
                onNeedMoreDays={handleNeedMoreDays}
                flashSignal={flashSignal}
              />

              <SidePanel
                unassigned={unassigned}
                reservations={reservations}
                units={units}
                armedId={armed?.id ?? null}
                onArm={setArmed}
                onOpen={handleOpenReservation}
              />
            </div>
          )}
        </>
      )}

      {showBoardSettings && selectedBoard && (
        <BoardSettingsModal
          board={selectedBoard}
          onClose={() => setShowBoardSettings(false)}
          onSaved={(board) => {
            setSelectedBoard(board);
            setBoards((prev) => prev.map((b) => (b.id === board.id ? board : b)));
            setShowBoardSettings(false);
          }}
        />
      )}

      {showMembers && currentHotel && role && (
        <MembersModal hotel={currentHotel} role={role} onClose={() => setShowMembers(false)} />
      )}

      {modal && selectedBoard && (
        <ReservationModal
          boardId={selectedBoard.id}
          boards={boards}
          units={units}
          reservation={modal.reservation}
          role={role}
          initialUnitId={modal.unitId}
          initialDateFrom={modal.dateFrom}
          initialDateTo={modal.dateTo}
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setModal(null);
            refresh();
            setFlashSignal({ id: saved.id, dateFrom: saved.date_from });
          }}
          onDeleted={() => {
            setModal(null);
            refresh();
          }}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}

export default App;
