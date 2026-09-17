import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ApiError,
  createReservation,
  deleteReservation,
  fetchUnits,
  linkReservationToBoard,
  unlinkReservation,
  updateReservation,
} from '../api';
import { CountryAutocomplete } from './CountryAutocomplete';
import { ConfirmDialog } from './ConfirmDialog';
import type { Board, DocumentType, FieldErrors, Guest, NotesCategory, Reservation, ReservationStatus, Role, Unit } from '../types';
import { useBodyScrollLock } from '../useBodyScrollLock';
import { flattenErrors } from '../errors';

const NOTES_TABS: { key: NotesCategory; label: string }[] = [
  { key: 'notes_reception', label: 'Reception' },
  { key: 'notes_kitchen', label: 'Kitchen' },
  { key: 'notes_housekeeping', label: 'Housekeeping' },
  { key: 'notes_system', label: 'System' },
  { key: 'notes_parking', label: 'Parking' },
];

type NotesTabKey = NotesCategory | 'general';
type MainTabKey = 'details' | 'links';

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
};

const STATUS_ORDER: ReservationStatus[] = ['confirmed', 'checked_in', 'checked_out'];

const NEXT_STATUS: Record<ReservationStatus, ReservationStatus | null> = {
  confirmed: 'checked_in',
  checked_in: 'checked_out',
  checked_out: null,
};

const NEXT_STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmed: 'Check in',
  checked_in: 'Check out',
  checked_out: '',
};

interface Props {
  boardId: number;
  boards: Board[];
  units: Unit[];
  reservation: Reservation | null;
  role: Role | null;
  initialUnitId: number | null;
  initialDateFrom: string;
  initialDateTo: string;
  onClose: () => void;
  onSaved: (reservation: Reservation) => void;
  onDeleted: (id: number) => void;
  onRefresh: () => void;
}

function emptyGuest(): Guest {
  return {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    date_of_birth: null,
    birth_country: '',
    birth_city: '',
    residence_street: '',
    residence_building: '',
    residence_city: '',
    residence_postal_code: '',
    residence_country: '',
    document_type: '',
    document_number: '',
    document_country: '',
    visa_number: '',
  };
}

export function ReservationModal({
  boardId,
  boards,
  units,
  reservation,
  role,
  initialUnitId,
  initialDateFrom,
  initialDateTo,
  onClose,
  onSaved,
  onDeleted,
  onRefresh,
}: Props) {
  useBodyScrollLock();

  const isEdit = reservation !== null;
  const board = boards.find((b) => b.id === boardId);

  const [guests, setGuests] = useState<Guest[]>(
    reservation && reservation.guests.length > 0 ? reservation.guests : [emptyGuest()],
  );
  const [unitId, setUnitId] = useState<number | null>(reservation?.unit ?? initialUnitId);
  const [dateFrom, setDateFrom] = useState(reservation?.date_from ?? initialDateFrom);
  const [dateTo, setDateTo] = useState(reservation?.date_to ?? initialDateTo);
  const [checkInTime, setCheckInTime] = useState(
    reservation?.check_in_time?.slice(0, 5) ?? board?.default_check_in_time?.slice(0, 5) ?? '',
  );
  const [checkOutTime, setCheckOutTime] = useState(
    reservation?.check_out_time?.slice(0, 5) ?? board?.default_check_out_time?.slice(0, 5) ?? '',
  );
  const [status, setStatus] = useState<ReservationStatus>(reservation?.status ?? 'confirmed');
  const [refNumber, setRefNumber] = useState(reservation?.ref_number ?? '');
  const [agency, setAgency] = useState(reservation?.agency ?? '');
  const [contactName, setContactName] = useState(reservation?.contact_name ?? '');
  const [notesGeneral, setNotesGeneral] = useState(reservation?.notes_general ?? '');
  const [notesReception, setNotesReception] = useState(reservation?.notes_reception ?? '');
  const [notesKitchen, setNotesKitchen] = useState(reservation?.notes_kitchen ?? '');
  const [notesHousekeeping, setNotesHousekeeping] = useState(reservation?.notes_housekeeping ?? '');
  const [notesSystem, setNotesSystem] = useState(reservation?.notes_system ?? '');
  const [notesParking, setNotesParking] = useState(reservation?.notes_parking ?? '');
  const [activeNotesTab, setActiveNotesTab] = useState<NotesTabKey>('general');
  const [activeMainTab, setActiveMainTab] = useState<MainTabKey>('details');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [expandedGuest, setExpandedGuest] = useState<number>(-1);

  const [liveReservation, setLiveReservation] = useState<Reservation | null>(reservation);
  const [linkBoardId, setLinkBoardId] = useState<number | ''>('');
  const [linkUnits, setLinkUnits] = useState<Unit[]>([]);
  const [linkUnitId, setLinkUnitId] = useState<number | ''>('');
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (linkBoardId === '') {
      setLinkUnits([]);
      setLinkUnitId('');
      return;
    }
    setLinkUnitId('');
    fetchUnits(linkBoardId)
      .then(setLinkUnits)
      .catch(() => setLinkUnits([]));
  }, [linkBoardId]);

  const notesValues: Record<NotesCategory, string> = {
    notes_reception: notesReception,
    notes_kitchen: notesKitchen,
    notes_housekeeping: notesHousekeeping,
    notes_system: notesSystem,
    notes_parking: notesParking,
  };
  const notesSetters: Record<NotesCategory, (value: string) => void> = {
    notes_reception: setNotesReception,
    notes_kitchen: setNotesKitchen,
    notes_housekeeping: setNotesHousekeeping,
    notes_system: setNotesSystem,
    notes_parking: setNotesParking,
  };

  function updateGuestCount(raw: string) {
    const count = Math.max(1, parseInt(raw, 10) || 1);
    setGuests((prev) => {
      if (count === prev.length) return prev;
      if (count > prev.length) {
        return [...prev, ...Array.from({ length: count - prev.length }, emptyGuest)];
      }
      setExpandedGuest((e) => Math.min(e, count - 1));
      return prev.slice(0, count);
    });
  }

  function updateGuest(index: number, field: keyof Guest, value: string) {
    setGuests((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    setSubmitting(true);

    const payload = {
      board: boardId,
      unit: unitId,
      status,
      guests: guests.map((g) => ({ ...g, date_of_birth: g.date_of_birth || null })),
      date_from: dateFrom,
      date_to: dateTo,
      check_in_time: checkInTime || null,
      check_out_time: checkOutTime || null,
      ref_number: refNumber,
      agency,
      contact_name: contactName,
      notes_general: notesGeneral,
      notes_reception: notesReception,
      notes_kitchen: notesKitchen,
      notes_housekeeping: notesHousekeeping,
      notes_system: notesSystem,
      notes_parking: notesParking,
      requested_category: reservation?.requested_category ?? '',
    };

    try {
      const saved = isEdit
        ? await updateReservation(reservation!.id, payload)
        : await createReservation(payload);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(flattenErrors(err.errors as FieldErrors));
      } else {
        setErrors(['Something went wrong. Please try again.']);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!reservation) return;
    setConfirmingDelete(false);
    setSubmitting(true);
    try {
      if (reservation.unit !== null) {
        const saved = await updateReservation(reservation.id, { unit: null });
        onSaved(saved);
      } else {
        await deleteReservation(reservation.id);
        onDeleted(reservation.id);
      }
    } catch {
      setErrors(['Could not remove this reservation.']);
      setSubmitting(false);
    }
  }

  function guestLabel(guest: Guest, index: number) {
    const name = `${guest.first_name} ${guest.last_name}`.trim();
    return name ? `${index + 1}. ${name}` : `Guest ${index + 1}`;
  }

  async function handleLinkBoard() {
    if (!liveReservation || linkBoardId === '') return;
    setLinking(true);
    try {
      const updated = await linkReservationToBoard(liveReservation.id, linkBoardId, linkUnitId === '' ? null : linkUnitId);
      setLiveReservation(updated);
      setLinkBoardId('');
      setLinkUnitId('');
      onRefresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(flattenErrors(err.errors as FieldErrors));
      } else {
        setErrors(['Could not link this reservation to that board.']);
      }
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(linkedId: number) {
    if (!liveReservation) return;
    try {
      const updated = await unlinkReservation(liveReservation.id, linkedId);
      setLiveReservation(updated);
      onRefresh();
    } catch {
      setErrors(['Could not unlink this reservation.']);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        className="modal reservation-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          const target = e.target as HTMLElement;
          if (e.key === 'Enter' && target.tagName !== 'TEXTAREA' && target.tagName !== 'BUTTON') {
            e.preventDefault();
          }
        }}
      >
        <h3>{isEdit ? 'Edit reservation' : 'New reservation'}</h3>

        {isEdit && (
          <div className="modal-tabs">
            <button
              type="button"
              className={`modal-tab ${activeMainTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveMainTab('details')}
            >
              Details
            </button>
            <button
              type="button"
              className={`modal-tab ${activeMainTab === 'links' ? 'active' : ''}`}
              onClick={() => setActiveMainTab('links')}
            >
              Linked bookings{liveReservation && liveReservation.linked_reservations.length > 0
                ? ` (${liveReservation.linked_reservations.length})`
                : ''}
            </button>
          </div>
        )}

        {activeMainTab === 'links' && liveReservation ? (
          <div className="linked-bookings">
            <p className="muted">
              Duplicate this reservation's dates onto another board (e.g. a matching parking spot), straight
              onto a room/row there if you pick one, and keep it linked here.
            </p>

            {liveReservation.linked_reservations.length > 0 && (
              <div className="linked-bookings-list">
                {liveReservation.linked_reservations.map((linked) => (
                  <div key={linked.id} className="linked-booking-item">
                    <div className="linked-booking-info">
                      <strong>{linked.board_name}</strong>
                      <span className="muted">
                        {linked.lead_guest_name} · {linked.date_from} → {linked.date_to}
                        {' · '}
                        {linked.unit === null ? 'unassigned' : linked.unit_name}
                      </span>
                    </div>
                    <button type="button" onClick={() => handleUnlink(linked.id)}>
                      Unlink
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="link-board-row">
              <label>
                Link to board
                <select value={linkBoardId} onChange={(e) => setLinkBoardId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">— choose a board —</option>
                  {boards
                    .filter(
                      (b) =>
                        b.id !== boardId &&
                        !liveReservation.linked_reservations.some((linked) => linked.board === b.id),
                    )
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </label>
              {linkBoardId !== '' && (
                <label>
                  Room / row
                  <select value={linkUnitId} onChange={(e) => setLinkUnitId(e.target.value === '' ? '' : Number(e.target.value))}>
                    <option value="">— unassigned —</option>
                    {linkUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.category ? ` (${u.category})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" onClick={handleLinkBoard} disabled={linkBoardId === '' || linking}>
                {linking ? 'Linking...' : 'Link & create'}
              </button>
            </div>
          </div>
        ) : (
        <div className="reservation-layout">
          <section className="guests-column">
            <div className="guests-section-header">
              <h4>Guests</h4>
              <label className="guest-count-field">
                Count
                <input
                  type="number"
                  min={1}
                  value={guests.length}
                  onChange={(e) => updateGuestCount(e.target.value)}
                />
              </label>
            </div>

            <div className="guest-accordion">
              {guests.map((guest, index) => {
                const isOpen = expandedGuest === index;
                return (
                  <div key={index} className={`guest-accordion-item ${isOpen ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="guest-accordion-toggle"
                      onClick={() => setExpandedGuest(isOpen ? -1 : index)}
                    >
                      <span>{guestLabel(guest, index)}</span>
                      <span className="guest-accordion-caret">{isOpen ? '▾' : '▸'}</span>
                    </button>

                    <div className="guest-accordion-collapse">
                      <div className="guest-accordion-body">
                        <div className="field-row">
                          <label>
                            First name
                            <input
                              value={guest.first_name}
                              onChange={(e) => updateGuest(index, 'first_name', e.target.value)}
                            />
                          </label>
                          <label>
                            Last name
                            <input
                              value={guest.last_name}
                              onChange={(e) => updateGuest(index, 'last_name', e.target.value)}
                            />
                          </label>
                        </div>
                        <div className="field-row">
                          <label>
                            Email
                            <input
                              type="email"
                              value={guest.email}
                              onChange={(e) => updateGuest(index, 'email', e.target.value)}
                            />
                          </label>
                          <label>
                            Phone
                            <input value={guest.phone} onChange={(e) => updateGuest(index, 'phone', e.target.value)} />
                          </label>
                        </div>

                        <div className="guest-subsection-title">Birth</div>
                        <div className="field-row">
                          <label>
                            Date of birth
                            <input
                              type="date"
                              value={guest.date_of_birth ?? ''}
                              onChange={(e) => updateGuest(index, 'date_of_birth', e.target.value)}
                            />
                          </label>
                          <label>
                            Country of birth
                            <CountryAutocomplete
                              value={guest.birth_country}
                              onChange={(v) => updateGuest(index, 'birth_country', v)}
                            />
                          </label>
                        </div>
                        <label>
                          City of birth
                          <input
                            value={guest.birth_city}
                            onChange={(e) => updateGuest(index, 'birth_city', e.target.value)}
                          />
                        </label>

                        <div className="guest-subsection-title">Residence address</div>
                        <div className="field-row">
                          <label>
                            Street
                            <input
                              value={guest.residence_street}
                              onChange={(e) => updateGuest(index, 'residence_street', e.target.value)}
                            />
                          </label>
                          <label>
                            Building no.
                            <input
                              value={guest.residence_building}
                              onChange={(e) => updateGuest(index, 'residence_building', e.target.value)}
                            />
                          </label>
                        </div>
                        <div className="field-row">
                          <label>
                            City
                            <input
                              value={guest.residence_city}
                              onChange={(e) => updateGuest(index, 'residence_city', e.target.value)}
                            />
                          </label>
                          <label>
                            Postal code
                            <input
                              value={guest.residence_postal_code}
                              onChange={(e) => updateGuest(index, 'residence_postal_code', e.target.value)}
                            />
                          </label>
                        </div>
                        <label>
                          Country
                          <CountryAutocomplete
                            value={guest.residence_country}
                            onChange={(v) => updateGuest(index, 'residence_country', v)}
                          />
                        </label>

                        <div className="guest-subsection-title">Identity document</div>
                        <div className="field-row">
                          <label>
                            Document type
                            <select
                              value={guest.document_type}
                              onChange={(e) => updateGuest(index, 'document_type', e.target.value as DocumentType)}
                            >
                              <option value="">—</option>
                              <option value="passport">Passport</option>
                              <option value="id_card">ID card</option>
                              <option value="drivers_license">Driver's license</option>
                            </select>
                          </label>
                          <label>
                            Document number
                            <input
                              value={guest.document_number}
                              onChange={(e) => updateGuest(index, 'document_number', e.target.value)}
                            />
                          </label>
                        </div>
                        <div className="field-row">
                          <label>
                            Document country
                            <CountryAutocomplete
                              value={guest.document_country}
                              onChange={(v) => updateGuest(index, 'document_country', v)}
                            />
                          </label>
                          <label>
                            Visa number
                            <input
                              value={guest.visa_number}
                              onChange={(e) => updateGuest(index, 'visa_number', e.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="reservation-side-column">
            <section className="reservation-info-box">
              <h4>Reservation info</h4>

              {isEdit && unitId !== null && (
                <div className="status-row">
                  <select
                    className="status-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ReservationStatus)}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  {NEXT_STATUS[status] && (
                    <button
                      type="button"
                      className="status-toggle-button"
                      onClick={() => setStatus(NEXT_STATUS[status]!)}
                    >
                      {NEXT_STATUS_LABEL[status]}
                    </button>
                  )}
                </div>
              )}

              <div className="field-row">
                <label>
                  Check-in
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required />
                </label>
                <label>
                  Check-out
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} required />
                </label>
              </div>

              <div className="field-row">
                <label>
                  Check-in time <span className="muted">(optional)</span>
                  <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
                </label>
                <label>
                  Check-out time <span className="muted">(optional)</span>
                  <input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} />
                </label>
              </div>

              <label>
                Unit
                <select
                  value={unitId ?? ''}
                  onChange={(e) => setUnitId(e.target.value === '' ? null : Number(e.target.value))}
                >
                  <option value="">— unassigned —</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                      {unit.category ? ` (${unit.category})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Guest contact name <span className="muted">(optional)</span>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </label>

              <div className="field-row">
                <label>
                  Ref. number
                  <input value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
                </label>
                <label>
                  Agency
                  <input value={agency} onChange={(e) => setAgency(e.target.value)} />
                </label>
              </div>
            </section>

            <section className="reservation-notes-box">
              <div className="notes-tabs">
                <button
                  type="button"
                  className={`notes-tab ${activeNotesTab === 'general' ? 'active' : ''}`}
                  onClick={() => setActiveNotesTab('general')}
                >
                  General
                </button>
                {NOTES_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`notes-tab ${activeNotesTab === tab.key ? 'active' : ''}`}
                    onClick={() => setActiveNotesTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {activeNotesTab === 'general' ? (
                <div className="notes-field notes-general">
                  <textarea
                    className="notes-general-input"
                    value={notesGeneral}
                    onChange={(e) => setNotesGeneral(e.target.value)}
                    placeholder="General notes..."
                  />
                  {NOTES_TABS.filter((tab) => notesValues[tab.key].trim()).length > 0 && (
                    <div className="notes-general-summary">
                      {NOTES_TABS.filter((tab) => notesValues[tab.key].trim()).map((tab) => (
                        <div key={tab.key} className="notes-general-block">
                          <strong>{tab.label}</strong>
                          <div>{notesValues[tab.key]}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <textarea
                  className="notes-field"
                  value={notesValues[activeNotesTab]}
                  onChange={(e) => notesSetters[activeNotesTab](e.target.value)}
                />
              )}
            </section>
          </div>
        </div>
        )}

        {errors.length > 0 && (
          <ul className="error-list">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          {isEdit && (
            <button
              type="button"
              className="danger"
              onClick={() => setConfirmingDelete(true)}
              disabled={submitting || (role === 'staff' && reservation!.unit === null)}
              title={role === 'staff' && reservation!.unit === null ? 'Only an admin or owner can delete a reservation outright' : undefined}
            >
              {reservation!.unit !== null ? 'Unassign' : 'Delete'}
            </button>
          )}
          <div className="spacer" />
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>

      {confirmingDelete && reservation && (
        <ConfirmDialog
          title={reservation.unit !== null ? 'Unassign reservation' : 'Delete reservation'}
          message={
            reservation.unit !== null
              ? 'Remove this reservation from its room? It will move to Unassigned reservations, not be deleted.'
              : 'Delete this unassigned reservation? This cannot be undone.'
          }
          confirmLabel={reservation.unit !== null ? 'Unassign' : 'Delete'}
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
