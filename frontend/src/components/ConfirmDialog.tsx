import type { ReactNode } from 'react';
import { useBodyScrollLock } from '../useBodyScrollLock';

interface Props {
  title?: string;
  message?: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, children, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: Props) {
  useBodyScrollLock();

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div className="modal confirm-dialog" onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {message && <p>{message}</p>}
        {children}
        <div className="modal-actions">
          <div className="spacer" />
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
