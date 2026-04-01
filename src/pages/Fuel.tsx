import { useEffect, useMemo, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { parseISO } from 'date-fns';
import { formatInVancouver, vancouverDateInputToIso } from '../lib/vancouverTime';
import { Fuel as FuelIcon, Receipt } from 'lucide-react';
import { MorphingPlusX } from '../components/MorphingPlusX';
import type { FuelEntry, FuelVolumeUnit, RoadCost, RoadCostType } from '../lib/fleetTypes';
import { loadAssets, loadFuelEntries, loadRoadCosts, saveFuelEntries, saveRoadCosts, assetDisplayName } from '../lib/fleetStore';
import type { FleetAsset } from '../lib/fleetTypes';

function lPer100km(prev: FuelEntry, cur: FuelEntry): number | null {
  if (prev.odometerKm == null || cur.odometerKm == null) return null;
  const dist = cur.odometerKm - prev.odometerKm;
  if (dist <= 0) return null;
  const volL = cur.unit === 'L' ? cur.volume : cur.volume * 3.78541;
  return (volL / dist) * 100;
}

export default function Fuel() {
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [fuel, setFuel] = useState<FuelEntry[]>([]);
  const [road, setRoad] = useState<RoadCost[]>([]);
  const [tab, setTab] = useState<'fuel' | 'road'>('fuel');
  const [fuelForm, setFuelForm] = useState(false);
  const [roadForm, setRoadForm] = useState(false);

  const refresh = useCallback(() => {
    setAssets(loadAssets());
    setFuel(loadFuelEntries());
    setRoad(loadRoadCosts());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sortedFuel = useMemo(() => {
    return [...fuel].sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
  }, [fuel]);

  const addFuel = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const assetId = String(fd.get('assetId') || '');
    const a = assets.find((x) => x.id === assetId);
    const unit = String(fd.get('unit') || 'L') as FuelVolumeUnit;
    const row: FuelEntry = {
      id: uuidv4(),
      assetId: a?.id ?? null,
      assetLabel: a ? assetDisplayName(a) : String(fd.get('assetLabel') || '').trim() || '—',
      date: vancouverDateInputToIso(String(fd.get('date') || '')),
      volume: Number(fd.get('volume')) || 0,
      unit: unit === 'gal_us' ? 'gal_us' : 'L',
      totalCost: fd.get('totalCost') ? Number(fd.get('totalCost')) : null,
      odometerKm: fd.get('odometerKm') ? Number(fd.get('odometerKm')) : null,
      stationNote: String(fd.get('stationNote') || '').trim(),
    };
    const next = [row, ...fuel];
    saveFuelEntries(next);
    setFuel(next);
    setFuelForm(false);
    e.currentTarget.reset();
  };

  const addRoad = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const assetId = String(fd.get('assetId') || '');
    const a = assets.find((x) => x.id === assetId);
    const t = String(fd.get('type') || 'toll') as RoadCostType;
    const row: RoadCost = {
      id: uuidv4(),
      assetId: a?.id ?? null,
      assetLabel: a ? assetDisplayName(a) : String(fd.get('assetLabel') || '').trim() || '—',
      type: ['toll', 'citation', 'parking', 'other'].includes(t) ? t : 'other',
      date: vancouverDateInputToIso(String(fd.get('date') || '')),
      amount: Number(fd.get('amount')) || 0,
      reference: String(fd.get('reference') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
    };
    const next = [row, ...road];
    saveRoadCosts(next);
    setRoad(next);
    setRoadForm(false);
    e.currentTarget.reset();
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
        <div>
          <h1 className="mb-2 flex items-center gap-2">
            <FuelIcon size={28} /> Fuel &amp; road costs
          </h1>
          <p className="text-secondary">Log fuel by asset with odometer for consumption hints; record tolls and citations.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={`btn ${tab === 'fuel' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('fuel')}>
            Fuel
          </button>
          <button type="button" className={`btn ${tab === 'road' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('road')}>
            <Receipt size={16} /> Tolls &amp; citations
          </button>
        </div>
      </div>

      {tab === 'fuel' && (
        <>
          <div className="flex justify-end mb-4">
            <button
              type="button"
              className="btn btn-primary"
              aria-expanded={fuelForm}
              onClick={() => setFuelForm((v) => !v)}
            >
              <MorphingPlusX isOpen={fuelForm} size={16} />
              {fuelForm ? 'Close' : 'Log fill-up'}
            </button>
          </div>
          {fuelForm && (
            <div className="card mb-8">
              <h3 className="mb-4">Fuel entry</h3>
              <form onSubmit={addFuel} className="flex flex-col gap-4">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
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
                    <label>Label if no asset</label>
                    <input name="assetLabel" />
                  </div>
                  <div>
                    <label>Date *</label>
                    <input name="date" type="date" required />
                  </div>
                  <div>
                    <label>Volume *</label>
                    <input name="volume" type="number" min={0} step="0.01" required />
                  </div>
                  <div>
                    <label>Unit</label>
                    <select name="unit" defaultValue="L">
                      <option value="L">Litres</option>
                      <option value="gal_us">US gallons</option>
                    </select>
                  </div>
                  <div>
                    <label>Total cost ($)</label>
                    <input name="totalCost" type="number" min={0} step="0.01" />
                  </div>
                  <div>
                    <label>Odometer (km)</label>
                    <input name="odometerKm" type="number" min={0} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Station / notes</label>
                    <input name="stationNote" placeholder="Card, location…" />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </form>
            </div>
          )}

          <div className="card">
            <h3 className="mb-4">Fuel log</h3>
            {sortedFuel.length === 0 ? (
              <p className="text-muted">No entries yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Asset</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Volume</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Cost</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Odo (km)</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>L/100km hint</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFuel.map((row) => {
                    const sameAsset = sortedFuel.filter((r) => r.assetId === row.assetId && row.assetId);
                    const idx = sameAsset.findIndex((r) => r.id === row.id);
                    const prev = idx >= 0 && idx < sameAsset.length - 1 ? sameAsset[idx + 1] : null;
                    const hint = prev ? lPer100km(prev, row) : null;
                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{formatInVancouver(row.date, 'MMM d, yyyy')}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{row.assetLabel}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          {row.volume} {row.unit}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{row.totalCost != null ? `$${row.totalCost.toFixed(2)}` : '—'}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{row.odometerKm ?? '—'}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{hint != null ? `${hint.toFixed(2)}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'road' && (
        <>
          <div className="flex justify-end mb-4">
            <button
              type="button"
              className="btn btn-primary"
              aria-expanded={roadForm}
              onClick={() => setRoadForm((v) => !v)}
            >
              <MorphingPlusX isOpen={roadForm} size={16} />
              {roadForm ? 'Close' : 'Add cost'}
            </button>
          </div>
          {roadForm && (
            <div className="card mb-8">
              <h3 className="mb-4">Toll, citation, parking</h3>
              <form onSubmit={addRoad} className="flex flex-col gap-4">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label>Type</label>
                    <select name="type" defaultValue="toll">
                      <option value="toll">Toll</option>
                      <option value="citation">Citation</option>
                      <option value="parking">Parking</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
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
                    <label>Label if no asset</label>
                    <input name="assetLabel" />
                  </div>
                  <div>
                    <label>Date *</label>
                    <input name="date" type="date" required />
                  </div>
                  <div>
                    <label>Amount ($) *</label>
                    <input name="amount" type="number" min={0} step="0.01" required />
                  </div>
                  <div>
                    <label>Reference #</label>
                    <input name="reference" placeholder="Ticket / notice #" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Notes</label>
                    <textarea name="notes" rows={2} />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </form>
            </div>
          )}

          <div className="card">
            <h3 className="mb-4">Road costs</h3>
            {road.length === 0 ? (
              <p className="text-muted">No entries.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Type</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Asset</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Amount</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {[...road]
                    .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
                    .map((row) => (
                      <tr key={row.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{formatInVancouver(row.date, 'MMM d, yyyy')}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{row.type}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{row.assetLabel}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>${row.amount.toFixed(2)}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{row.reference || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
