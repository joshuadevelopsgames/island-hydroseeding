import { X } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  message: string;
  buttonLabel?: string;
  onClose: () => void;
};

export default function AlertDialog({ open, title, message, buttonLabel = 'OK', onClose }: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="btn-icon modal-panel__dismiss"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <h2 id="alert-dialog-title" className="modal-panel__title">
          {title}
        </h2>
        <p id="alert-dialog-desc" className="text-secondary" style={{ marginBottom: 0 }}>
          {message}
        </p>
        <div className="modal-panel__foot" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
