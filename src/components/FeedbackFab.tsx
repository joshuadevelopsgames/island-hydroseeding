import { useRef, useState } from 'react';
import { Bug, Copy, Crosshair, Lightbulb, MessageSquarePlus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { buildConsoleReportSection } from '../lib/consoleCapture';
import { formatInVancouver } from '../lib/vancouverTime';
import ElementPickerOverlay, { type PickedElementPayload } from './ElementPickerOverlay';

const DEV_EMAIL = 'jrsschroeder@gmail.com';
/** Many mail clients cap mailto body length; we truncate and offer Copy full report. */
const MAILTO_BODY_SAFE_LENGTH = 9_000;

type FeedbackType = 'bug' | 'feature';

function formatPickedElement(p: PickedElementPayload): string {
  return [
    `Tag: ${p.tag}`,
    `id: ${p.id}`,
    `class: ${p.className}`,
    `CSS path: ${p.cssPath}`,
    `Viewport rect (px): top=${p.rect.top} left=${p.rect.left} width=${p.rect.width} height=${p.rect.height}`,
    `Text preview: ${p.textPreview}`,
    `HTML snippet (sensitive values redacted in inputs): ${p.outerHTMLSnippet}`,
  ].join('\n');
}

function buildReportBody(
  kind: FeedbackType,
  summary: string,
  details: string,
  who: string,
  picked: PickedElementPayload | null,
  consoleBlock: string,
  truncatedNote: string
): string {
  const pickedSection = picked
    ? `--- Selected element ---\n${formatPickedElement(picked)}\n`
    : '--- Selected element ---\n(none — use “Select element on page” to attach one)\n';

  const ctx = `--- Context ---\nSubmitted by: ${who}\nPage: ${typeof window !== 'undefined' ? window.location.href : ''}\nUA: ${typeof navigator !== 'undefined' ? navigator.userAgent : '—'}\nViewport: ${typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '—'}\nTime (Pacific / Vancouver): ${formatInVancouver(new Date(), 'PPpp')}\n`;

  const consoleNote =
    '--- Console (this tab only) ---\n' +
    'Captured after app load (buffered log / warn / error / info / debug plus window.onerror & unhandledrejection). ' +
    'The browser does not expose earlier DevTools history.\n\n' +
    consoleBlock;

  return [
    `Type: ${kind === 'bug' ? 'Bug report' : 'Feature / change request'}`,
    `Summary: ${summary.trim() || '—'}`,
    '',
    'Details:',
    details.trim() || '—',
    '',
    pickedSection,
    ctx,
    consoleNote,
    truncatedNote,
  ]
    .filter(Boolean)
    .join('\n');
}

export default function FeedbackFab() {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [kind, setKind] = useState<FeedbackType>('feature');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [picked, setPicked] = useState<PickedElementPayload | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const draftRef = useRef({ summary: '', details: '', kind: 'feature' as FeedbackType });

  const who = currentUser ? `${currentUser.name} (${currentUser.email})` : 'Unknown user';

  const startElementPick = () => {
    draftRef.current = { summary, details, kind };
    setOpen(false);
    setPicking(true);
  };

  const cancelPick = () => {
    const d = draftRef.current;
    setSummary(d.summary);
    setDetails(d.details);
    setKind(d.kind);
    setPicking(false);
    setOpen(true);
  };

  const confirmPick = (payload: PickedElementPayload) => {
    const d = draftRef.current;
    setSummary(d.summary);
    setDetails(d.details);
    setKind(d.kind);
    setPicked(payload);
    setPicking(false);
    setOpen(true);
  };

  const fullBody = () => buildReportBody(kind, summary, details, who, picked, buildConsoleReportSection(14_000), '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subjPrefix = kind === 'bug' ? '[Bug]' : '[Feature]';
    const subject = `IH Internal Ops ${subjPrefix} ${summary.trim() || 'Feedback'}`.slice(0, 180);
    const consoleBlock = buildConsoleReportSection(14_000);
    let rawBody = buildReportBody(kind, summary, details, who, picked, consoleBlock, '');
    if (rawBody.length > MAILTO_BODY_SAFE_LENGTH) {
      const note =
        '\n[Note: email body was truncated for mailto length limits. Use “Copy full report” in the app for the complete text.]';
      rawBody = buildReportBody(kind, summary, details, who, picked, consoleBlock, note).slice(
        0,
        MAILTO_BODY_SAFE_LENGTH
      );
    }
    const mailto = `mailto:${DEV_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(rawBody)}`;
    window.location.href = mailto;
    setOpen(false);
    setSummary('');
    setDetails('');
    setKind('feature');
    setPicked(null);
  };

  const handleCopyFull = async () => {
    const text = fullBody();
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <>
      <button
        type="button"
        className="feedback-fab"
        data-feedback-ui="true"
        onClick={() => setOpen(true)}
        aria-label="Report a bug or suggest a feature"
        title="Feedback & requests"
      >
        <MessageSquarePlus size={22} strokeWidth={2} aria-hidden />
      </button>

      <ElementPickerOverlay active={picking} onPick={confirmPick} onCancel={cancelPick} />

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
              Opens your email app to <strong>{DEV_EMAIL}</strong>. We attach console output from this tab (after load),
              optional pinpointed UI element, and page context. If the draft looks cut off, use <strong>Copy full report</strong>.
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

              <div className="flex flex-col gap-2">
                <button type="button" className="btn btn-secondary page-toolbar__cta" onClick={startElementPick}>
                  <Crosshair size={16} strokeWidth={2.25} aria-hidden /> Select element on page
                </button>
                {picked ? (
                  <p className="text-sm text-secondary mb-0">
                    Selected: <strong>{picked.tag}</strong>
                    {picked.id && picked.id !== '(none)' ? ` #${picked.id}` : ''} —{' '}
                    <button type="button" className="btn-ghost-link" onClick={() => setPicked(null)}>
                      Clear
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-muted mb-0">
                    Optional: highlight exactly what broke or what you’re referring to (outline + details in the email).
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <button type="button" className="btn btn-secondary" onClick={() => void handleCopyFull()}>
                  <Copy size={16} aria-hidden /> {copyDone ? 'Copied' : 'Copy full report'}
                </button>
                <span className="text-xs text-muted">Use if your email app strips a long body.</span>
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
