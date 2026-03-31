import { useState } from 'react';
import { Bug, Lightbulb, MessageSquarePlus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DEV_EMAIL = 'jrsschroeder@gmail.com';

type FeedbackType = 'bug' | 'feature';

export default function FeedbackFab() {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackType>('feature');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subjPrefix = kind === 'bug' ? '[Bug]' : '[Feature]';
    const subject = `IH Internal Ops ${subjPrefix} ${summary.trim() || 'Feedback'}`.slice(0, 180);
    const who = currentUser ? `${currentUser.name} (${currentUser.email})` : 'Unknown user';
    const body = `Type: ${kind === 'bug' ? 'Bug report' : 'Feature / change request'}\nSummary: ${summary.trim() || '—'}\n\nDetails:\n${details.trim() || '—'}\n\n---\nSubmitted from: ${who}\nPage: ${typeof window !== 'undefined' ? window.location.href : ''}`;
    const mailto = `mailto:${DEV_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setOpen(false);
    setSummary('');
    setDetails('');
    setKind('feature');
  };

  return (
    <>
      <button
        type="button"
        className="feedback-fab"
        onClick={() => setOpen(true)}
        aria-label="Report a bug or suggest a feature"
        title="Feedback & requests"
      >
        <MessageSquarePlus size={22} strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <div className="modal-overlay" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="modal-panel feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <button
              type="button"
              className="btn-icon modal-panel__dismiss"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <p className="page-kicker" style={{ marginBottom: '0.35rem' }}>
              Developer
            </p>
            <h2 id="feedback-title" className="modal-panel__title">
              Bug report or feature request
            </h2>
            <p className="text-sm text-secondary" style={{ marginTop: '-0.25rem', marginBottom: '1rem' }}>
              Opens your email app to send to <strong>{DEV_EMAIL}</strong>. Describe what you need or what went wrong.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="feedback-type-toggle" role="group" aria-label="Request type">
                <button
                  type="button"
                  className={`feedback-type-btn${kind === 'feature' ? ' feedback-type-btn--active' : ''}`}
                  onClick={() => setKind('feature')}
                >
                  <Lightbulb size={18} aria-hidden /> Feature / change
                </button>
                <button
                  type="button"
                  className={`feedback-type-btn${kind === 'bug' ? ' feedback-type-btn--active' : ''}`}
                  onClick={() => setKind('bug')}
                >
                  <Bug size={18} aria-hidden /> Bug report
                </button>
              </div>

              <div>
                <label htmlFor="fb-summary">Short summary</label>
                <input
                  id="fb-summary"
                  value={summary}
                  onChange={(ev) => setSummary(ev.target.value)}
                  placeholder="e.g. Export pre-trips to PDF"
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="fb-details">Details</label>
                <textarea
                  id="fb-details"
                  value={details}
                  onChange={(ev) => setDetails(ev.target.value)}
                  rows={5}
                  placeholder="Steps, screen, what you expected…"
                />
              </div>

              <div className="modal-panel__foot" style={{ marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Open email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
