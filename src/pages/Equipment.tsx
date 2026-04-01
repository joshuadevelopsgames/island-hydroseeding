import { useState, useMemo, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Calendar as CalendarIcon, AlertCircle, CheckCircle } from 'lucide-react';
import { MorphingPlusX } from '../components/MorphingPlusX';
import {
  format,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import {
  formatInVancouver,
  isSameVancouverDay,
  toVancouverDate,
  vancouverDateInputToIso,
  vancouverNow,
} from '../lib/vancouverTime';
import type { WorkOrder, WorkOrderStatus } from '../lib/fleetTypes';
import { loadAssets, loadWorkOrders, saveWorkOrders, assetDisplayName } from '../lib/fleetStore';
import type { FleetAsset } from '../lib/fleetTypes';

function woLabel(wo: WorkOrder, assets: FleetAsset[]): string {
  if (wo.assetId) {
    const a = assets.find((x) => x.id === wo.assetId);
    if (a) return assetDisplayName(a);
  }
  return wo.assetLabel || 'Unassigned';
}

export default function Equipment() {
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [currentDate, setCurrentDate] = useState(() => vancouverNow());
  const [formOpen, setFormOpen] = useState(false);

  const refresh = useCallback(() => {
    setAssets(loadAssets());
    setOrders(loadWorkOrders());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = (next: WorkOrder[]) => {
    saveWorkOrders(next);
    setOrders(next);
  };

  const openOrders = orders.filter((o) => o.status !== 'completed');
  const completedOrders = orders.filter((o) => o.status === 'completed');

  const daysInMonth = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const setStatus = (id: string, status: WorkOrderStatus) => {
    const now = new Date().toISOString();
    persist(
      orders.map((o) =>
        o.id === id
          ? {
              ...o,
              status,
              completedAt: status === 'completed' ? o.completedAt ?? now : null,
            }
          : o
      )
    );
  };

  const addWorkOrder = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const assetId = String(fd.get('assetId') || '');
    const title = String(fd.get('title') || '').trim();
    const due = String(fd.get('dueDate') || '');
    if (!title || !due) return;

    const a = assets.find((x) => x.id === assetId);
    const wo: WorkOrder = {
      id: uuidv4(),
      assetId: a ? a.id : null,
      assetLabel: a ? assetDisplayName(a) : String(fd.get('assetLabel') || '').trim() || 'Unassigned',
      title,
      dueDate: vancouverDateInputToIso(due),
      status: 'open',
      vendor: String(fd.get('vendor') || '').trim(),
      estimatedCost: fd.get('estimatedCost') ? Number(fd.get('estimatedCost')) : null,
      actualCost: null,
      parts: [],
      odometerAtServiceKm: fd.get('odometerAtServiceKm') ? Number(fd.get('odometerAtServiceKm')) : null,
      warrantyFlag: fd.get('warrantyFlag') === 'on',
      notes: String(fd.get('notes') || '').trim(),
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    persist([wo, ...orders]);
    setFormOpen(false);
    e.currentTarget.reset();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="mb-2">Maintenance &amp; work orders</h1>
          <p>Schedule service, vendors, costs, and odometer-at-service. Tie orders to fleet assets when possible.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          aria-expanded={formOpen}
          aria-label={formOpen ? 'Close new work order form' : 'Open new work order form'}
          onClick={() => setFormOpen((v) => !v)}
        >
          <MorphingPlusX isOpen={formOpen} size={16} />
          <span>{formOpen ? 'Close form' : 'New work order'}</span>
        </button>
      </div>

      {formOpen && (
        <div className="card mb-8">
          <h3 className="mb-4">New work order</h3>
          <form onSubmit={addWorkOrder} className="flex flex-col gap-4">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label>Asset</label>
                <select name="assetId">
                  <option value="">— Unassigned / other —</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {assetDisplayName(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Label (if no asset)</label>
                <input name="assetLabel" placeholder="Free-text unit name" />
              </div>
              <div>
                <label>Service title *</label>
                <input name="title" required placeholder="Oil change, CVIP prep, hydraulic leak…" />
              </div>
              <div>
                <label>Due date *</label>
                <input name="dueDate" type="date" required />
              </div>
              <div>
                <label>Vendor / shop</label>
                <input name="vendor" placeholder="Shop name" />
              </div>
              <div>
                <label>Est. cost ($)</label>
                <input name="estimatedCost" type="number" min={0} step="0.01" />
              </div>
              <div>
                <label>Odometer at service (km)</label>
                <input name="odometerAtServiceKm" type="number" min={0} />
              </div>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--surface-color)_92%,var(--bg-color))] px-3 py-2.5 -mt-1">
              <label className="mb-0 flex w-max max-w-full cursor-pointer items-start gap-3 !font-medium leading-snug text-[var(--text-secondary)]">
                <input type="checkbox" name="warrantyFlag" className="mt-0.5" />
                <span>Warranty / claim-related</span>
              </label>
            </div>
            <div>
              <label>Notes</label>
              <textarea name="notes" rows={2} />
            </div>
            <button type="submit" className="btn btn-primary">
              Save work order
            </button>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>
        <div className="card" style={{ height: 'fit-content' }}>
          <h3 className="mb-4 flex items-center gap-2">
            <AlertCircle size={20} color="#ef4444" /> Open
          </h3>
          <div className="flex flex-col gap-3">
            {openOrders.map((task) => (
              <div
                key={task.id}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  backgroundColor: '#fffbfa',
                  borderLeft: '4px solid #ef4444',
                }}
              >
                <p className="font-semibold text-sm mb-1">{woLabel(task, assets)}</p>
                <p className="text-sm text-secondary mb-1">{task.title}</p>
                {task.vendor && <p className="text-xs text-muted">Vendor: {task.vendor}</p>}
                <div className="flex justify-between items-center mt-3 flex-wrap gap-2">
                  <span className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                    Due: {formatInVancouver(task.dueDate, 'MMM d, yyyy')}
                  </span>
                  <div className="flex gap-2">
                    {task.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => setStatus(task.id, 'in_progress')}
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        Start
                      </button>
                    )}
                    {task.status === 'in_progress' && (
                      <button
                        type="button"
                        onClick={() => setStatus(task.id, 'open')}
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        Re-open
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setStatus(task.id, 'completed')}
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      Complete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {openOrders.length === 0 && <p className="text-sm text-muted text-center py-4">No open work orders.</p>}
          </div>

          <h3 className="mb-4 mt-8 flex items-center gap-2">
            <CheckCircle size={20} color="var(--lawn-green)" /> Completed
          </h3>
          <div className="flex flex-col gap-3">
            {completedOrders.slice(0, 12).map((task) => (
              <div
                key={task.id}
                style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', opacity: 0.85 }}
              >
                <div className="flex justify-between">
                  <p className="font-semibold text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
                    {woLabel(task, assets)} — {task.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus(task.id, 'open')}
                    className="btn-ghost-link"
                    style={{ fontSize: '0.75rem', padding: '0.15rem 0' }}
                  >
                    Reopen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h3 className="flex items-center gap-2">
              <CalendarIcon size={20} /> Schedule calendar
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCurrentDate(toVancouverDate(subMonths(currentDate, 1)))}
              >
                Prev
              </button>
              <h3 style={{ width: '150px', textAlign: 'center' }}>{format(currentDate, 'MMMM yyyy')}</h3>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCurrentDate(toVancouverDate(addMonths(currentDate, 1)))}
              >
                Next
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '1px',
              backgroundColor: 'var(--border-color)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.5rem',
              overflow: 'hidden',
            }}
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--surface-color)',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  fontSize: '0.875rem',
                }}
              >
                {day}
              </div>
            ))}
            {daysInMonth.map((day) => {
              const dayOrders = orders.filter((t) => isSameVancouverDay(t.dueDate, day));
              return (
                <div
                  key={day.toString()}
                  style={{
                    minHeight: '100px',
                    padding: '0.5rem',
                    backgroundColor: !isSameMonth(day, currentDate) ? 'var(--bg-color)' : 'var(--surface-color)',
                    color: !isSameMonth(day, currentDate) ? 'var(--text-muted)' : 'var(--text-primary)',
                  }}
                >
                  <div className="text-right text-sm font-semibold mb-1" style={{ opacity: isSameDay(day, vancouverNow()) ? 1 : 0.7 }}>
                    {isSameDay(day, vancouverNow()) ? (
                      <span style={{ backgroundColor: 'var(--primary-green)', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '99px' }}>
                        {format(day, 'd')}
                      </span>
                    ) : (
                      format(day, 'd')
                    )}
                  </div>
                  {dayOrders.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.25rem 0.5rem',
                        backgroundColor: t.status === 'completed' ? 'var(--light-green)' : '#fee2e2',
                        color: t.status === 'completed' ? 'var(--lawn-green)' : '#ef4444',
                        borderRadius: '0.25rem',
                        marginBottom: '0.25rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={`${woLabel(t, assets)} — ${t.title}`}
                    >
                      {t.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
