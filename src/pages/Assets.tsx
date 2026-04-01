import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { parseISO } from 'date-fns';
import {
  formatInVancouver,
  vancouverDateInputFromIso,
  vancouverDateInputToIso,
  vancouverDifferenceInCalendarDays,
  vancouverNow,
} from '../lib/vancouverTime';
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  Bell,
  BellOff,
  AlertTriangle,
  Gauge,
  ShieldCheck,
} from 'lucide-react';
import type { FleetAsset, FleetAssetType } from '../lib/fleetTypes';
import {
  loadAssets,
  saveAssets,
  assetDisplayName,
  emptyAsset,
} from '../lib/fleetStore';
import { buildCvipIcsEvent, downloadIcs } from '../lib/cvipIcs';
import {
  cvipNotificationSupported,
  requestCvipNotificationPermission,
  runCvipDueNotifications,
} from '../lib/cvipNotify';
import ConfirmDialog from '../components/ConfirmDialog';

function pmHint(asset: FleetAsset): string | null {
  const parts: string[] = [];
  if (asset.pmIntervalKm != null && asset.lastPmOdometerKm != null && asset.odometerKm != null) {
    const next = asset.lastPmOdometerKm + asset.pmIntervalKm;
    const remain = next - asset.odometerKm;
    if (remain <= 0) parts.push(`PM by odometer overdue (~${-remain} km past due)`);
    else parts.push(`~${remain} km to PM (odometer)`);
  }
  if (asset.pmIntervalHours != null && asset.lastPmEngineHours != null && asset.engineHours != null) {
    const next = asset.lastPmEngineHours + asset.pmIntervalHours;
    const remain = next - asset.engineHours;
    if (remain <= 0) parts.push(`PM by hours overdue (~${-remain} hrs)`);
    else parts.push(`~${remain} hrs to PM`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export default function Assets() {
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  const reload = useCallback(() => {
    setAssets(loadAssets());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    runCvipDueNotifications(loadAssets());
  }, [assets]);

  const persist = (next: FleetAsset[]) => {
    saveAssets(next);
    setAssets(next);
    runCvipDueNotifications(next);
  };

  const cvipAlerts = useMemo(() => {
    const now = vancouverNow();
    return assets.filter((a) => {
      if (!a.cvip.enabled || !a.cvip.nextDueDate) return false;
      try {
        const d = parseISO(a.cvip.nextDueDate);
        return vancouverDifferenceInCalendarDays(d, now) <= 30;
      } catch {
        return false;
      }
    });
  }, [assets]);

  const startAdd = () => {
    setEditingId(null);
    setIsAdding(true);
  };

  const startEdit = (id: string) => {
    setIsAdding(false);
    setEditingId(id);
  };

  const cancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    if (!name) return;

    const type = String(fd.get('type') || 'truck') as FleetAssetType;
    const odo = String(fd.get('odometerKm') || '').trim();
    const hrs = String(fd.get('engineHours') || '').trim();
    const cvipEnabled = fd.get('cvipEnabled') === 'on';
    const nextDue = String(fd.get('cvipNextDue') || '').trim();
    const lastCvip = String(fd.get('cvipLast') || '').trim();
    const cert = String(fd.get('cvipCert') || '').trim();

    const base: FleetAsset = emptyAsset({
      id: editingId ?? uuidv4(),
      name,
      type: ['truck', 'trailer', 'heavy_equipment', 'other'].includes(type) ? type : 'truck',
      unitNumber: String(fd.get('unitNumber') || '').trim(),
      vin: String(fd.get('vin') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
      odometerKm: odo === '' ? null : Number(odo),
      engineHours: hrs === '' ? null : Number(hrs),
      odometerUpdatedAt: odo !== '' || hrs !== '' ? new Date().toISOString() : null,
      pmIntervalKm: fd.get('pmIntervalKm') ? Number(fd.get('pmIntervalKm')) : null,
      pmIntervalHours: fd.get('pmIntervalHours') ? Number(fd.get('pmIntervalHours')) : null,
      lastPmOdometerKm: fd.get('lastPmOdometerKm') ? Number(fd.get('lastPmOdometerKm')) : null,
      lastPmEngineHours: fd.get('lastPmEngineHours') ? Number(fd.get('lastPmEngineHours')) : null,
      lastPmAt: (() => {
        const s = String(fd.get('lastPmAt') || '').trim();
        return s ? vancouverDateInputToIso(s) : null;
      })(),
      cvip: {
        enabled: cvipEnabled,
        certificateOrDecal: cert,
        lastInspectionDate: lastCvip ? vancouverDateInputToIso(lastCvip) : null,
        nextDueDate: nextDue ? vancouverDateInputToIso(nextDue) : null,
      },
      warrantyExpiresAt: (() => {
        const s = String(fd.get('warrantyExpiresAt') || '').trim();
        return s ? vancouverDateInputToIso(s) : null;
      })(),
      tireNotes: String(fd.get('tireNotes') || '').trim(),
      lastTireServiceDate: (() => {
        const s = String(fd.get('lastTireServiceDate') || '').trim();
        return s ? vancouverDateInputToIso(s) : null;
      })(),
    });

    if (editingId) {
      const prev = assets.find((a) => a.id === editingId);
      persist(assets.map((a) => (a.id === editingId ? { ...base, createdAt: prev?.createdAt ?? base.createdAt } : a)));
    } else {
      persist([base, ...assets]);
    }
    cancelForm();
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    persist(assets.filter((a) => a.id !== deleteId));
    setDeleteId(null);
    if (editingId === deleteId) cancelForm();
  };

  const editing = editingId ? assets.find((a) => a.id === editingId) : null;

  return (
    <div>
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete asset?"
        message="Removes this vehicle/equipment from the fleet list. Work orders referencing it keep text labels."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2">Fleet assets</h1>
          <p className="text-secondary mb-0">
            Register units, odometer/hours, PM intervals, CVIP due dates, warranty, and tires. Add CVIP to{' '}
            <strong>iPhone Calendar</strong> for same-day alerts; enable browser notifications for reminders when this app is open.
          </p>
        </div>
        <button type="button" className="btn btn-primary page-toolbar__cta" onClick={startAdd}>
          <Plus size={16} strokeWidth={2.25} aria-hidden /> Add asset
        </button>
      </div>

      {cvipAlerts.length > 0 && (
        <div className="card mb-6" style={{ borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}>
                 <h3 className="mb-2 flex items-center gap-2" style={{ color: '#b45309' }}>
                   <AlertTriangle size={20} /> CVIP coming due (30 days)
                 </h3>
          <ul className="text-sm space-y-1">
            {cvipAlerts.map((a) => (
              <li key={a.id}>
                <strong>{assetDisplayName(a)}</strong>
                {a.cvip.nextDueDate
                  ? ` — due ${formatInVancouver(a.cvip.nextDueDate, 'MMM d, yyyy')}`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mb-8">
        <h3 className="mb-2 flex items-center gap-2">
          <Bell size={18} /> iPhone &amp; browser reminders
        </h3>
        <p className="text-sm text-secondary mb-4">
          <strong>Calendar:</strong> on each asset, use &quot;Download CVIP .ics&quot; and open the file on iPhone — add to Calendar for a native notification on the due date.
          Browser notifications work when the app is in use (or shortly after); they do not replace a server push while the phone is locked all day.
        </p>
        {cvipNotificationSupported() ? (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm">
              Permission: <strong>{notifPerm}</strong>
            </span>
            {notifPerm !== 'granted' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  const p = await requestCvipNotificationPermission();
                  setNotifPerm(p);
                  if (p === 'granted') runCvipDueNotifications(loadAssets());
                }}
              >
                <Bell size={16} /> Allow notifications
              </button>
            )}
            {notifPerm === 'denied' && (
              <span className="text-xs text-muted flex items-center gap-1">
                <BellOff size={14} /> Unblock in device Settings → Safari → this site (or use Calendar .ics).
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Notifications not supported in this browser.</p>
        )}
      </div>

      {(isAdding || editing) && (
        <div className="card mb-8">
          <h3 className="mb-4">{editing ? 'Edit asset' : 'New asset'}</h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div>
                <label>Name *</label>
                <input name="name" required defaultValue={editing?.name} placeholder="e.g. Hydro truck 1" />
              </div>
              <div>
                <label>Type</label>
                <select name="type" defaultValue={editing?.type ?? 'truck'}>
                  <option value="truck">Truck</option>
                  <option value="trailer">Trailer</option>
                  <option value="heavy_equipment">Heavy equipment</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label>Unit #</label>
                <input name="unitNumber" defaultValue={editing?.unitNumber} placeholder="Fleet number" />
              </div>
              <div>
                <label>VIN</label>
                <input name="vin" defaultValue={editing?.vin} placeholder="VIN" />
              </div>
              <div>
                <label>Odometer (km)</label>
                <input name="odometerKm" type="number" min={0} defaultValue={editing?.odometerKm ?? ''} placeholder="Optional" />
              </div>
              <div>
                <label>Engine hours</label>
                <input name="engineHours" type="number" min={0} step="0.1" defaultValue={editing?.engineHours ?? ''} />
              </div>
            </div>

            <div className="border-t border-[var(--border-color)] pt-4">
              <h4 className="mb-2 flex items-center gap-2">
                <Gauge size={16} /> Preventive maintenance (odometer / hours)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                <div>
                  <label>PM interval (km)</label>
                  <input name="pmIntervalKm" type="number" min={0} defaultValue={editing?.pmIntervalKm ?? ''} />
                </div>
                <div>
                  <label>Last PM odometer (km)</label>
                  <input name="lastPmOdometerKm" type="number" min={0} defaultValue={editing?.lastPmOdometerKm ?? ''} />
                </div>
                <div>
                  <label>PM interval (hours)</label>
                  <input name="pmIntervalHours" type="number" min={0} step="0.1" defaultValue={editing?.pmIntervalHours ?? ''} />
                </div>
                <div>
                  <label>Last PM hours</label>
                  <input name="lastPmEngineHours" type="number" min={0} step="0.1" defaultValue={editing?.lastPmEngineHours ?? ''} />
                </div>
                <div>
                  <label>Last PM date</label>
                  <input name="lastPmAt" type="date" defaultValue={vancouverDateInputFromIso(editing?.lastPmAt)} />
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--border-color)] pt-4">
              <h4 className="mb-2 flex items-center gap-2">
                <ShieldCheck size={16} /> CVIP
              </h4>
              <label className="flex items-center gap-2 mb-3">
                <input type="checkbox" name="cvipEnabled" defaultChecked={editing?.cvip.enabled} />
                Track CVIP for this asset
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div>
                  <label>Decal / certificate #</label>
                  <input name="cvipCert" defaultValue={editing?.cvip.certificateOrDecal} />
                </div>
                <div>
                  <label>Last CVIP date</label>
                  <input name="cvipLast" type="date" defaultValue={vancouverDateInputFromIso(editing?.cvip.lastInspectionDate)} />
                </div>
                <div>
                  <label>Next due date *</label>
                  <input name="cvipNextDue" type="date" defaultValue={vancouverDateInputFromIso(editing?.cvip.nextDueDate)} />
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--border-color)] pt-4">
              <h4 className="mb-2">Warranty &amp; tires</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div>
                  <label>Warranty expires</label>
                  <input name="warrantyExpiresAt" type="date" defaultValue={vancouverDateInputFromIso(editing?.warrantyExpiresAt)} />
                </div>
                <div>
                  <label>Last tire service</label>
                  <input name="lastTireServiceDate" type="date" defaultValue={vancouverDateInputFromIso(editing?.lastTireServiceDate)} />
                </div>
              </div>
              <div className="mt-3">
                <label>Tire notes</label>
                <textarea name="tireNotes" rows={2} defaultValue={editing?.tireNotes} placeholder="Positions, pressure program, supplier…" />
              </div>
            </div>

            <div>
              <label>Notes</label>
              <textarea name="notes" rows={2} defaultValue={editing?.notes} />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button type="submit" className="btn btn-primary">
                Save
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3 className="mb-4">Registered assets ({assets.length})</h3>
        {assets.length === 0 ? (
          <p className="text-muted">No assets yet. Add your trucks, trailers, and yellow iron.</p>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Asset</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>PM</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>CVIP</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const hint = pmHint(a);
                  const cvip = a.cvip.enabled && a.cvip.nextDueDate;
                  let cvipLabel = '—';
                  if (cvip) {
                    try {
                      cvipLabel = formatInVancouver(a.cvip.nextDueDate!, 'MMM d, yyyy');
                    } catch {
                      cvipLabel = a.cvip.nextDueDate!;
                    }
                  }
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <div className="font-semibold">{assetDisplayName(a)}</div>
                        <div className="text-xs text-muted">
                          {a.vin ? `VIN ${a.vin}` : a.type}
                          {a.odometerKm != null ? ` · ${a.odometerKm} km` : ''}
                          {a.engineHours != null ? ` · ${a.engineHours} hrs` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem' }}>{hint ?? '—'}</td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem' }}>
                        {a.cvip.enabled ? cvipLabel : 'Off'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem' }} onClick={() => startEdit(a.id)}>
                            <Pencil size={14} /> Edit
                          </button>
                          {a.cvip.enabled && a.cvip.nextDueDate && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 0.6rem' }}
                              onClick={() => {
                                const ics = buildCvipIcsEvent(a, a.cvip.nextDueDate!);
                                downloadIcs(
                                  `cvip-${a.unitNumber || a.name}-${formatInVancouver(a.cvip.nextDueDate!, 'yyyy-MM-dd')}.ics`,
                                  ics
                                );
                              }}
                            >
                              <Download size={14} /> CVIP .ics
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.6rem', color: '#b91c1c' }}
                            onClick={() => setDeleteId(a.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
