import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Reservation, Unit } from '../types';
import { toISODate } from '../dates';

interface Props {
  unassigned: Reservation[];
  reservations: Reservation[];
  units: Unit[];
  armedId: number | null;
  onArm: (reservation: Reservation) => void;
  onOpen: (reservation: Reservation) => void;
}

type SectionKey = 'unassigned' | 'arrivals' | 'departures';

function PanelSection({
  title,
  count,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`side-panel-section ${isOpen ? 'open' : ''}`}>
      <button type="button" className="side-panel-header" onClick={onToggle}>
        <span>
          {title}
          <span className="side-panel-count">{count}</span>
        </span>
        <span className="side-panel-caret">{isOpen ? '▾' : '▸'}</span>
      </button>
      <div className="side-panel-collapse">
        <div className="side-panel-body">{children}</div>
      </div>
    </div>
  );
}

export function SidePanel({ unassigned, reservations, units, armedId, onArm, onOpen }: Props) {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    unassigned: true,
    arrivals: true,
    departures: true,
  });

  function toggle(key: SectionKey) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function unitLabel(unitId: number | null): string {
    const unit = units.find((u) => u.id === unitId);
    return unit ? unit.name : '';
  }

  const today = toISODate(new Date());
  const arrivals = reservations.filter(
    (r) => r.unit !== null && r.date_from === today && r.status === 'confirmed',
  );
  const departures = reservations.filter(
    (r) => r.unit !== null && r.date_to === today && r.status !== 'checked_out',
  );

  return (
    <aside className="side-panel">
      <PanelSection
        title="Unassigned reservations"
        count={unassigned.length}
        isOpen={open.unassigned}
        onToggle={() => toggle('unassigned')}
      >
        {unassigned.length === 0 ? (
          <p className="muted side-panel-empty">None</p>
        ) : (
          <ul className="side-panel-list">
            {unassigned.map((reservation) => (
              <li key={reservation.id}>
                <button
                  type="button"
                  className={`side-panel-card unassigned-card ${armedId === reservation.id ? 'armed' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onArm(reservation);
                  }}
                >
                  <strong>{reservation.lead_guest_name}</strong>
                  <span className="muted">
                    {reservation.date_from} → {reservation.date_to}
                    {reservation.requested_category ? ` · ${reservation.requested_category}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>

      <PanelSection
        title="Arrivals today"
        count={arrivals.length}
        isOpen={open.arrivals}
        onToggle={() => toggle('arrivals')}
      >
        {arrivals.length === 0 ? (
          <p className="muted side-panel-empty">None</p>
        ) : (
          <ul className="side-panel-list">
            {arrivals.map((reservation) => (
              <li key={reservation.id}>
                <button
                  type="button"
                  className="side-panel-card arrival-card"
                  onClick={() => onOpen(reservation)}
                  title="Click to open"
                >
                  <div className="side-panel-card-main">
                    <strong>{reservation.lead_guest_name}</strong>
                    <span className="muted">
                      {reservation.date_from} → {reservation.date_to}
                    </span>
                  </div>
                  <div className="side-panel-card-divider" />
                  <div className="side-panel-card-unit">{unitLabel(reservation.unit)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>

      <PanelSection
        title="Departures today"
        count={departures.length}
        isOpen={open.departures}
        onToggle={() => toggle('departures')}
      >
        {departures.length === 0 ? (
          <p className="muted side-panel-empty">None</p>
        ) : (
          <ul className="side-panel-list">
            {departures.map((reservation) => (
              <li key={reservation.id}>
                <button
                  type="button"
                  className="side-panel-card departure-card"
                  onClick={() => onOpen(reservation)}
                  title="Click to open"
                >
                  <div className="side-panel-card-main">
                    <strong>{reservation.lead_guest_name}</strong>
                    <span className="muted">
                      {reservation.date_from} → {reservation.date_to}
                    </span>
                  </div>
                  <div className="side-panel-card-divider" />
                  <div className="side-panel-card-unit">{unitLabel(reservation.unit)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
    </aside>
  );
}
