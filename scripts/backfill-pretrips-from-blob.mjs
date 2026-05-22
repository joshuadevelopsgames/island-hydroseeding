/**
 * One-time backfill: copy pre-trip inspections out of the legacy
 * app_workspace JSON blob (payload->preTripLogs_v2) into the new
 * fleet_pretrips table.
 *
 * Photos are NOT recovered — the old app kept them in per-device IndexedDB,
 * which never reached the server, so backfilled rows have no photos.
 *
 * Safe to run more than once: rows already present (matched on
 * inspected_at + employee_name + equipment_id) are skipped.
 *
 * Prereqs: migration 026_fleet_pretrips.sql applied. Reads creds from .env.local.
 *
 *   node scripts/backfill-pretrips-from-blob.mjs
 */
import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = env.DEFAULT_TENANT_ID;
if (!URL_ || !KEY || !TENANT) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEFAULT_TENANT_ID in .env.local');
  process.exit(1);
}
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// 1) Pull legacy logs out of the blob.
const wsRes = await fetch(
  `${URL_}/rest/v1/app_workspace?tenant_id=eq.${TENANT}&id=eq.default&select=logs:payload->preTripLogs_v2`,
  { headers: h }
);
if (!wsRes.ok) {
  console.error('Failed to read app_workspace:', wsRes.status, await wsRes.text());
  process.exit(1);
}
const wsRows = await wsRes.json();
const legacy = Array.isArray(wsRows[0]?.logs) ? wsRows[0].logs : [];
console.log(`legacy pre-trips in blob: ${legacy.length}`);
if (!legacy.length) process.exit(0);

// 2) Read existing rows to stay idempotent.
const existRes = await fetch(
  `${URL_}/rest/v1/fleet_pretrips?tenant_id=eq.${TENANT}&select=inspected_at,employee_name,equipment_id`,
  { headers: h }
);
if (!existRes.ok) {
  console.error('Failed to read fleet_pretrips (is migration 026 applied?):', existRes.status, await existRes.text());
  process.exit(1);
}
const existing = await existRes.json();
const keyOf = (iso, name, equip) => `${Date.parse(iso) || 0}|${(name || '').trim()}|${(equip || '').trim()}`;
const seen = new Set(existing.map((r) => keyOf(r.inspected_at, r.employee_name, r.equipment_id)));

// 3) Map + insert the missing ones.
const rows = [];
for (const l of legacy) {
  const iso = Number.isFinite(Date.parse(l.date)) ? new Date(l.date).toISOString() : new Date().toISOString();
  const k = keyOf(iso, l.employeeName, l.equipmentId);
  if (seen.has(k)) continue;
  seen.add(k);
  rows.push({
    tenant_id: TENANT,
    type: l.type === 'Trailer' ? 'Trailer' : 'Truck',
    inspected_at: iso,
    employee_name: String(l.employeeName || ''),
    equipment_id: String(l.equipmentId || ''),
    location: String(l.location || ''),
    status: l.status === 'Action Req' ? 'Action Req' : 'Passed',
    remarks: String(l.remarks || ''),
    checklist: {},
    photo_paths: [],
  });
}

console.log(`new rows to insert: ${rows.length} (skipped ${legacy.length - rows.length} already present)`);
if (!rows.length) process.exit(0);

const insRes = await fetch(`${URL_}/rest/v1/fleet_pretrips`, {
  method: 'POST',
  headers: { ...h, Prefer: 'return=representation' },
  body: JSON.stringify(rows),
});
if (!insRes.ok) {
  console.error('Insert failed:', insRes.status, await insRes.text());
  process.exit(1);
}
const inserted = await insRes.json();
console.log(`inserted ${inserted.length} pre-trip(s).`);
