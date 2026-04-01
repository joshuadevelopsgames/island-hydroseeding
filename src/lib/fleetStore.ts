import { v4 as uuidv4 } from 'uuid';
import type {
  FleetAsset,
  WorkOrder,
  FuelEntry,
  RoadCost,
  FleetIssue,
  PurchaseOrder,
} from './fleetTypes';

const ASSETS_KEY = 'fleetAssets_v1';
const WORK_ORDERS_KEY = 'fleetWorkOrders_v1';
const LEGACY_MAINT_KEY = 'equipmentMaintenance';
const FUEL_KEY = 'fleetFuelEntries_v1';
const ROAD_KEY = 'fleetRoadCosts_v1';
const ISSUES_KEY = 'fleetIssues_v1';
const PO_KEY = 'fleetPurchaseOrders_v1';

type LegacyMaint = {
  id: string;
  equipment: string;
  service: string;
  dueDate: string;
  status: 'pending' | 'completed';
};

export function emptyAsset(partial: Partial<FleetAsset> & Pick<FleetAsset, 'name'>): FleetAsset {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? uuidv4(),
    name: partial.name,
    type: partial.type ?? 'truck',
    unitNumber: partial.unitNumber ?? '',
    vin: partial.vin ?? '',
    notes: partial.notes ?? '',
    odometerKm: partial.odometerKm ?? null,
    engineHours: partial.engineHours ?? null,
    odometerUpdatedAt: partial.odometerUpdatedAt ?? null,
    pmIntervalKm: partial.pmIntervalKm ?? null,
    pmIntervalHours: partial.pmIntervalHours ?? null,
    lastPmOdometerKm: partial.lastPmOdometerKm ?? null,
    lastPmEngineHours: partial.lastPmEngineHours ?? null,
    lastPmAt: partial.lastPmAt ?? null,
    cvip: partial.cvip ?? {
      enabled: false,
      certificateOrDecal: '',
      lastInspectionDate: null,
      nextDueDate: null,
    },
    warrantyExpiresAt: partial.warrantyExpiresAt ?? null,
    tireNotes: partial.tireNotes ?? '',
    lastTireServiceDate: partial.lastTireServiceDate ?? null,
    createdAt: partial.createdAt ?? now,
  };
}

export function loadAssets(): FleetAsset[] {
  const raw = localStorage.getItem(ASSETS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FleetAsset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAssets(next: FleetAsset[]) {
  localStorage.setItem(ASSETS_KEY, JSON.stringify(next));
}

const MIGRATED_FLAG = 'fleetMigratedLegacyMaint_v1';

export function loadWorkOrders(): WorkOrder[] {
  const raw = localStorage.getItem(WORK_ORDERS_KEY);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as WorkOrder[];
      if (Array.isArray(parsed)) {
        if (localStorage.getItem(MIGRATED_FLAG) !== '1') {
          localStorage.setItem(MIGRATED_FLAG, '1');
        }
        return parsed;
      }
    } catch {
      /* fall through */
    }
  }
  if (localStorage.getItem(MIGRATED_FLAG) === '1') {
    return [];
  }
  const migrated = migrateLegacyMaintenance();
  localStorage.setItem(MIGRATED_FLAG, '1');
  if (migrated.length) {
    saveWorkOrders(migrated);
    return migrated;
  }
  saveWorkOrders([]);
  return [];
}

function migrateLegacyMaintenance(): WorkOrder[] {
  const legacyRaw = localStorage.getItem(LEGACY_MAINT_KEY);
  if (!legacyRaw) return [];
  try {
    const legacy = JSON.parse(legacyRaw) as LegacyMaint[];
    if (!Array.isArray(legacy)) return [];
    const now = new Date().toISOString();
    return legacy.map((row) => ({
      id: row.id && String(row.id).length ? String(row.id) : uuidv4(),
      assetId: null,
      assetLabel: String(row.equipment || ''),
      title: String(row.service || 'Maintenance'),
      dueDate: String(row.dueDate || now),
      status: row.status === 'completed' ? 'completed' : 'open',
      vendor: '',
      estimatedCost: null,
      actualCost: null,
      parts: [],
      odometerAtServiceKm: null,
      warrantyFlag: false,
      notes: '',
      createdAt: now,
      completedAt: row.status === 'completed' ? now : null,
    }));
  } catch {
    return [];
  }
}

export function saveWorkOrders(next: WorkOrder[]) {
  localStorage.setItem(WORK_ORDERS_KEY, JSON.stringify(next));
}

export function loadFuelEntries(): FuelEntry[] {
  const raw = localStorage.getItem(FUEL_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FuelEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFuelEntries(next: FuelEntry[]) {
  localStorage.setItem(FUEL_KEY, JSON.stringify(next));
}

export function loadRoadCosts(): RoadCost[] {
  const raw = localStorage.getItem(ROAD_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RoadCost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRoadCosts(next: RoadCost[]) {
  localStorage.setItem(ROAD_KEY, JSON.stringify(next));
}

export function loadIssues(): FleetIssue[] {
  const raw = localStorage.getItem(ISSUES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FleetIssue[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveIssues(next: FleetIssue[]) {
  localStorage.setItem(ISSUES_KEY, JSON.stringify(next));
}

export function loadPurchaseOrders(): PurchaseOrder[] {
  const raw = localStorage.getItem(PO_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PurchaseOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePurchaseOrders(next: PurchaseOrder[]) {
  localStorage.setItem(PO_KEY, JSON.stringify(next));
}

/** Keys we include in a full workspace export */
export const EXPORT_KEYS = [
  ASSETS_KEY,
  WORK_ORDERS_KEY,
  LEGACY_MAINT_KEY,
  FUEL_KEY,
  ROAD_KEY,
  ISSUES_KEY,
  PO_KEY,
  'preTripLogs_v2',
  'flhaLogs_v2',
  'documentsRepository',
  'documentsRepositoryV2',
  'inventoryState',
  'tasksBoard',
  'timeLogs',
  'timeEmployees',
  'timeLastEmployeeId',
  'crmLeads',
  'appUsers',
  'currentUserId',
  'fleetMigratedLegacyMaint_v1',
] as const;

export function exportAllLocalData(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EXPORT_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      out[key] = JSON.parse(raw);
    } catch {
      out[key] = raw;
    }
  }
  out.exportedAt = new Date().toISOString();
  return out;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function assetDisplayName(a: FleetAsset): string {
  const unit = a.unitNumber?.trim();
  return unit ? `${a.name} (${unit})` : a.name;
}

export { ASSETS_KEY, WORK_ORDERS_KEY };
