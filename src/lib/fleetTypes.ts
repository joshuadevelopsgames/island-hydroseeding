/** Fleet ops model — local-first (localStorage). Excludes external integrations. */

export type FleetAssetType = 'truck' | 'trailer' | 'heavy_equipment' | 'other';

export type FleetAsset = {
  id: string;
  name: string;
  type: FleetAssetType;
  /** Fleet / unit number */
  unitNumber: string;
  vin: string;
  notes: string;
  odometerKm: number | null;
  engineHours: number | null;
  odometerUpdatedAt: string | null;
  /** Preventive maintenance intervals */
  pmIntervalKm: number | null;
  pmIntervalHours: number | null;
  lastPmOdometerKm: number | null;
  lastPmEngineHours: number | null;
  lastPmAt: string | null;
  /** CVIP (Commercial Vehicle Inspection Program — BC) */
  cvip: {
    enabled: boolean;
    certificateOrDecal: string;
    lastInspectionDate: string | null;
    /** User-assigned next due — reminders use this date */
    nextDueDate: string | null;
  };
  warrantyExpiresAt: string | null;
  tireNotes: string;
  lastTireServiceDate: string | null;
  createdAt: string;
};

export type WorkOrderStatus = 'open' | 'in_progress' | 'completed';

export type WorkOrderPartLine = {
  inventoryItemId: string | null;
  name: string;
  quantity: number;
};

export type WorkOrder = {
  id: string;
  assetId: string | null;
  /** Fallback label when assetId missing (legacy import) */
  assetLabel: string;
  title: string;
  dueDate: string;
  status: WorkOrderStatus;
  vendor: string;
  estimatedCost: number | null;
  actualCost: number | null;
  parts: WorkOrderPartLine[];
  odometerAtServiceKm: number | null;
  warrantyFlag: boolean;
  notes: string;
  createdAt: string;
  completedAt: string | null;
};

export type FuelVolumeUnit = 'L' | 'gal_us';

export type FuelEntry = {
  id: string;
  assetId: string | null;
  assetLabel: string;
  date: string;
  volume: number;
  unit: FuelVolumeUnit;
  totalCost: number | null;
  odometerKm: number | null;
  stationNote: string;
};

export type RoadCostType = 'toll' | 'citation' | 'parking' | 'other';

export type RoadCost = {
  id: string;
  assetId: string | null;
  assetLabel: string;
  type: RoadCostType;
  date: string;
  amount: number;
  reference: string;
  notes: string;
};

export type FleetIssueSeverity = 'low' | 'medium' | 'high' | 'down';

export type FleetIssueStatus = 'open' | 'monitoring' | 'scheduled' | 'resolved';

export type FleetIssue = {
  id: string;
  assetId: string | null;
  assetLabel: string;
  title: string;
  description: string;
  severity: FleetIssueSeverity;
  status: FleetIssueStatus;
  linkedWorkOrderId: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export type PurchaseOrder = {
  id: string;
  vendor: string;
  orderedAt: string;
  expectedAt: string | null;
  total: number | null;
  status: PurchaseOrderStatus;
  lineSummary: string;
  notes: string;
};
