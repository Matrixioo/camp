import { useState } from 'react';
import type { FormEvent } from 'react';
import { updateBoard } from '../api';
import type { Board } from '../types';
import { useBodyScrollLock } from '../useBodyScrollLock';

interface Props {
  board: Board;
  onClose: () => void;
  onSaved: (board: Board) => void;
}

export function BoardSettingsModal({ board, onClose, onSaved }: Props) {
  useBodyScrollLock();

  const [checkInTime, setCheckInTime] = useState(board.default_check_in_time.slice(0, 5));
  const [checkOutTime, setCheckOutTime] = useState(board.default_check_out_time.slice(0, 5));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const saved = await updateBoard(board.id, {
        default_check_in_time: checkInTime,
        default_check_out_time: checkOutTime,
      });
      onSaved(saved);
    } catch {
      setError('Could not save settings.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Board settings — {board.name}</h3>
        <p className="muted">
          Default check-in / check-out time for this board. Used to shape reservation bars on the
          grid when a booking doesn't specify its own time.
        </p>

        <div className="field-row">
          <label>
            Default check-in time
            <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} required />
          </label>
          <label>
            Default check-out time
            <input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} required />
          </label>
        </div>

        {error && <p className="error-list">{error}</p>}

        <div className="modal-actions">
          <div className="spacer" />
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
