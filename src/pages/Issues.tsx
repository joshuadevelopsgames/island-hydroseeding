import { useCallback, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { formatInVancouver } from '../lib/vancouverTime';
import { AlertTriangle } from 'lucide-react';
import { MorphingPlusX } from '../components/MorphingPlusX';
import type { FleetIssue, FleetIssueSeverity, FleetIssueStatus } from '../lib/fleetTypes';
import { loadAssets, loadIssues, saveIssues, assetDisplayName } from '../lib/fleetStore';
import type { FleetAsset } from '../lib/fleetTypes';

export default function Issues() {
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [issues, setIssues] = useState<FleetIssue[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  const refresh = useCallback(() => {
    setAssets(loadAssets());
    setIssues(loadIssues());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = (next: FleetIssue[]) => {
    saveIssues(next);
    setIssues(next);
  };

  const addIssue = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const assetId = String(fd.get('assetId') || '');
    const a = assets.find((x) => x.id === assetId);
    const sev = String(fd.get('severity') || 'medium') as FleetIssueSeverity;
    const row: FleetIssue = {
      id: uuidv4(),
      assetId: a?.id ?? null,
      assetLabel: a ? assetDisplayName(a) : String(fd.get('assetLabel') || '').trim() || '—',
      title: String(fd.get('title') || '').trim(),
      description: String(fd.get('description') || '').trim(),
      severity: ['low', 'medium', 'high', 'down'].includes(sev) ? sev : 'medium',
      status: 'open',
      linkedWorkOrderId: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    if (!row.title) return;
    persist([row, ...issues]);
    setFormOpen(false);
    e.currentTarget.reset();
  };

  const setStatus = (id: string, status: FleetIssueStatus) => {
    const now = new Date().toISOString();
    persist(
      issues.map((i) =>
        i.id === id
          ? {
              ...i,
              status,
              resolvedAt: status === 'resolved' ? now : null,
            }
          : i
      )
    );
  };

  const open = issues.filter((i) => i.status !== 'resolved');
  const done = issues.filter((i) => i.status === 'resolved');

  return (
    <div>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2 flex items-center gap-2">
            <AlertTriangle size={28} aria-hidden /> Fleet issues &amp; defects
          </h1>
          <p className="text-secondary mb-0">Track faults and safety items; mark resolved when repaired.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary page-toolbar__cta"
          aria-expanded={formOpen}
          onClick={() => setFormOpen((v) => !v)}
        >
          <MorphingPlusX isOpen={formOpen} size={16} />
          {formOpen ? 'Close' : 'Report issue'}
        </button>
      </div>

      {formOpen && (
        <div className="card mb-8">
          <h3 className="mb-4">New issue</h3>
          <form onSubmit={addIssue} className="flex flex-col gap-4">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label>Asset</label>
                <select name="assetId">
                  <option value="">—</option>
                  {assets.map((x) => (
                    <option key={x.id} value={x.id}>
                      {assetDisplayName(x)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Or label</label>
                <input name="assetLabel" />
              </div>
              <div>
                <label>Title *</label>
                <input name="title" required />
              </div>
              <div>
                <label>Severity</label>
                <select name="severity" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="down">Down / out of service</option>
                </select>
              </div>
            </div>
            <div>
              <label>Description</label>
              <textarea name="description" rows={3} />
            </div>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </form>
        </div>
      )}

      <div className="card mb-8">
        <h3 className="mb-4">Open ({open.length})</h3>
        {open.length === 0 ? (
          <p className="text-muted">No open issues.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((i) => (
              <li
                key={i.id}
                className="card"
                style={{ borderLeft: `4px solid ${severityColor(i.severity)}`, padding: '1rem' }}
              >
                <div className="flex justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold">{i.title}</p>
                    <p className="text-sm text-muted">
                      {i.assetLabel} · {i.severity} · reported {formatInVancouver(i.createdAt, 'MMM d, yyyy')}
                    </p>
                    {i.description && <p className="text-sm mt-2">{i.description}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {i.status === 'open' && (
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => setStatus(i.id, 'monitoring')}>
                        Monitoring
                      </button>
                    )}
                    {(i.status === 'open' || i.status === 'monitoring') && (
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => setStatus(i.id, 'scheduled')}>
                        Scheduled
                      </button>
                    )}
                    <button type="button" className="btn btn-primary" style={{ fontSize: '0.75rem' }} onClick={() => setStatus(i.id, 'resolved')}>
                      Resolve
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="mb-4">Resolved ({done.length})</h3>
        {done.length === 0 ? (
          <p className="text-muted">None yet.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {done.slice(0, 20).map((i) => (
              <li key={i.id} className="flex justify-between border-b border-[var(--border-color)] pb-2">
                <span>
                  {i.title} — {i.assetLabel}
                </span>
                <button type="button" className="btn-ghost-link" style={{ fontSize: '0.75rem' }} onClick={() => setStatus(i.id, 'open')}>
                  Reopen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function severityColor(s: FleetIssueSeverity) {
  switch (s) {
    case 'low':
      return '#22c55e';
    case 'medium':
      return '#f59e0b';
    case 'high':
      return '#ef4444';
    case 'down':
      return '#7f1d1d';
    default:
      return '#64748b';
  }
}
