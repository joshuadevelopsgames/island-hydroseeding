/**
 * DB row ↔ client camelCase for /api/fleet (fleet workspace sync).
 */

export type StaleWarning = {
  table: string;
  id: string;
  serverUpdatedAt: string;
  clientUpdatedAt: string;
};

export function mapAssetOut(row: Record<string, unknown>) {
  const cvip = (row.cvip as Record<string, unknown>) ?? {};
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    type: String(row.type ?? 'truck'),
    unitNumber: String(row.unit_number ?? ''),
    vin: String(row.vin ?? ''),
    notes: String(row.notes ?? ''),
    odometerKm: row.odometer_km != null ? Number(row.odometer_km) : null,
    engineHours: row.engine_hours != null ? Number(row.engine_hours) : null,
    odometerUpdatedAt: row.odometer_updated_at != null ? String(row.odometer_updated_at) : null,
    pmIntervalKm: row.pm_interval_km != null ? Number(row.pm_interval_km) : null,
    pmIntervalHours: row.pm_interval_hours != null ? Number(row.pm_interval_hours) : null,
    lastPmOdometerKm: row.last_pm_odometer_km != null ? Number(row.last_pm_odometer_km) : null,
    lastPmEngineHours: row.last_pm_engine_hours != null ? Number(row.last_pm_engine_hours) : null,
    lastPmAt: row.last_pm_at != null ? String(row.last_pm_at) : null,
    cvip: {
      enabled: Boolean(cvip.enabled),
      certificateOrDecal: String(cvip.certificateOrDecal ?? cvip.certificate_or_decal ?? ''),
      lastInspectionDate: cvip.lastInspectionDate != null ? String(cvip.lastInspectionDate) : null,
      nextDueDate: cvip.nextDueDate != null ? String(cvip.nextDueDate) : null,
    },
    warrantyExpiresAt: row.warranty_expires_at != null ? String(row.warranty_expires_at) : null,
    tireNotes: String(row.tire_notes ?? ''),
    lastTireServiceDate: row.last_tire_service_date != null ? String(row.last_tire_service_date) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export function mapAssetIn(
  tenantId: string,
  a: Record<string, unknown>
): Record<string, unknown> {
  const cvip = (a.cvip as Record<string, unknown>) ?? {};
  return {
    id: a.id,
    tenant_id: tenantId,
    name: String(a.name ?? ''),
    type: String(a.type ?? 'truck'),
    unit_number: String(a.unitNumber ?? a.unit_number ?? ''),
    vin: String(a.vin ?? ''),
    notes: String(a.notes ?? ''),
    odometer_km: a.odometerKm ?? a.odometer_km ?? null,
    engine_hours: a.engineHours ?? a.engine_hours ?? null,
    odometer_updated_at: a.odometerUpdatedAt ?? a.odometer_updated_at ?? null,
    pm_interval_km: a.pmIntervalKm ?? a.pm_interval_km ?? null,
    pm_interval_hours: a.pmIntervalHours ?? a.pm_interval_hours ?? null,
    last_pm_odometer_km: a.lastPmOdometerKm ?? a.last_pm_odometer_km ?? null,
    last_pm_engine_hours: a.lastPmEngineHours ?? a.last_pm_engine_hours ?? null,
    last_pm_at: a.lastPmAt ?? a.last_pm_at ?? null,
    cvip: {
      enabled: Boolean(cvip.enabled),
      certificateOrDecal: String(cvip.certificateOrDecal ?? ''),
      lastInspectionDate: cvip.lastInspectionDate ?? null,
      nextDueDate: cvip.nextDueDate ?? null,
    },
    warranty_expires_at: a.warrantyExpiresAt ?? a.warranty_expires_at ?? null,
    tire_notes: String(a.tireNotes ?? a.tire_notes ?? ''),
    last_tire_service_date: a.lastTireServiceDate ?? a.last_tire_service_date ?? null,
    created_at: a.createdAt ?? a.created_at ?? new Date().toISOString(),
    updated_at: a.updatedAt ?? a.updated_at ?? new Date().toISOString(),
  };
}

export function mapFuelOut(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    assetId: row.asset_id != null ? String(row.asset_id) : null,
    assetLabel: String(row.asset_label ?? ''),
    date: String(row.date),
    volume: Number(row.volume ?? 0),
    unit: String(row.unit ?? 'L'),
    totalCost: row.total_cost != null ? Number(row.total_cost) : null,
    odometerKm: row.odometer_km != null ? Number(row.odometer_km) : null,
    stationNote: String(row.station_note ?? ''),
    updatedAt: String(row.updated_at ?? row.date),
  };
}

export function mapFuelIn(tenantId: string, r: Record<string, unknown>) {
  const updated = r.updatedAt ?? r.updated_at ?? new Date().toISOString();
  return {
    id: r.id,
    tenant_id: tenantId,
    asset_id: r.assetId ?? r.asset_id ?? null,
    asset_label: String(r.assetLabel ?? r.asset_label ?? ''),
    date: r.date,
    volume: r.volume ?? 0,
    unit: String(r.unit ?? 'L'),
    total_cost: r.totalCost ?? r.total_cost ?? null,
    odometer_km: r.odometerKm ?? r.odometer_km ?? null,
    station_note: String(r.stationNote ?? r.station_note ?? ''),
    created_at: r.createdAt ?? r.created_at ?? r.date ?? updated,
    updated_at: updated,
  };
}

export function mapRoadOut(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    assetId: row.asset_id != null ? String(row.asset_id) : null,
    assetLabel: String(row.asset_label ?? ''),
    type: String(row.type ?? 'other'),
    date: String(row.date),
    amount: Number(row.amount ?? 0),
    reference: String(row.reference ?? ''),
    notes: String(row.notes ?? ''),
    updatedAt: String(row.updated_at ?? row.date),
  };
}

export function mapRoadIn(tenantId: string, r: Record<string, unknown>) {
  const updated = r.updatedAt ?? r.updated_at ?? new Date().toISOString();
  return {
    id: r.id,
    tenant_id: tenantId,
    asset_id: r.assetId ?? r.asset_id ?? null,
    asset_label: String(r.assetLabel ?? r.asset_label ?? ''),
    type: String(r.type ?? 'other'),
    date: r.date,
    amount: r.amount ?? 0,
    reference: String(r.reference ?? ''),
    notes: String(r.notes ?? r.notes ?? ''),
    created_at: r.createdAt ?? r.created_at ?? r.date ?? updated,
    updated_at: updated,
  };
}

export function mapIssueOut(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    assetId: row.asset_id != null ? String(row.asset_id) : null,
    assetLabel: String(row.asset_label ?? ''),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    severity: String(row.severity ?? 'medium'),
    status: String(row.status ?? 'open'),
    linkedWorkOrderId: row.linked_work_order_id != null ? String(row.linked_work_order_id) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    resolvedAt: row.resolved_at != null ? String(row.resolved_at) : null,
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export function mapIssueIn(tenantId: string, r: Record<string, unknown>) {
  const updated = r.updatedAt ?? r.updated_at ?? new Date().toISOString();
  return {
    id: r.id,
    tenant_id: tenantId,
    asset_id: r.assetId ?? r.asset_id ?? null,
    asset_label: String(r.assetLabel ?? r.asset_label ?? ''),
    title: String(r.title ?? ''),
    description: String(r.description ?? ''),
    severity: String(r.severity ?? 'medium'),
    status: String(r.status ?? 'open'),
    linked_work_order_id: r.linkedWorkOrderId ?? r.linked_work_order_id ?? null,
    created_at: r.createdAt ?? r.created_at ?? updated,
    resolved_at: r.resolvedAt ?? r.resolved_at ?? null,
    updated_at: updated,
  };
}

export function mapInvOut(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: String(row.category ?? 'General'),
    quantity: Number(row.quantity ?? 0),
    unit: String(row.unit ?? 'units'),
    threshold: Number(row.threshold ?? 0),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export function mapInvIn(tenantId: string, r: Record<string, unknown>) {
  const updated = r.updatedAt ?? r.updated_at ?? new Date().toISOString();
  return {
    id: r.id,
    tenant_id: tenantId,
    name: String(r.name ?? ''),
    category: String(r.category ?? 'General'),
    quantity: r.quantity ?? 0,
    unit: String(r.unit ?? 'units'),
    threshold: r.threshold ?? 0,
    created_at: r.createdAt ?? r.created_at ?? updated,
    updated_at: updated,
  };
}

export function mapPoOut(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    vendor: String(row.vendor ?? ''),
    orderedAt: String(row.ordered_at),
    expectedAt: row.expected_at != null ? String(row.expected_at) : null,
    total: row.total != null ? Number(row.total) : null,
    status: String(row.status ?? 'draft'),
    lineSummary: String(row.line_summary ?? ''),
    notes: String(row.notes ?? ''),
    updatedAt: String(row.updated_at ?? row.ordered_at),
  };
}

export function mapPoIn(tenantId: string, r: Record<string, unknown>) {
  const updated = r.updatedAt ?? r.updated_at ?? new Date().toISOString();
  return {
    id: r.id,
    tenant_id: tenantId,
    vendor: String(r.vendor ?? ''),
    ordered_at: r.orderedAt ?? r.ordered_at,
    expected_at: r.expectedAt ?? r.expected_at ?? null,
    total: r.total ?? null,
    status: String(r.status ?? 'draft'),
    line_summary: String(r.lineSummary ?? r.line_summary ?? ''),
    notes: String(r.notes ?? ''),
    created_at: r.createdAt ?? r.created_at ?? r.orderedAt ?? r.ordered_at ?? updated,
    updated_at: updated,
  };
}

export function mapWoOut(row: Record<string, unknown>) {
  const parts = Array.isArray(row.parts) ? row.parts : [];
  return {
    id: String(row.id),
    assetId: row.asset_id != null ? String(row.asset_id) : null,
    assetLabel: String(row.asset_label ?? ''),
    title: String(row.title ?? ''),
    dueDate: String(row.due_date),
    status: String(row.status ?? 'open'),
    vendor: String(row.vendor ?? ''),
    estimatedCost: row.estimated_cost != null ? Number(row.estimated_cost) : null,
    actualCost: row.actual_cost != null ? Number(row.actual_cost) : null,
    parts,
    odometerAtServiceKm: row.odometer_at_service_km != null ? Number(row.odometer_at_service_km) : null,
    warrantyFlag: Boolean(row.warranty_flag),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    completedAt: row.completed_at != null ? String(row.completed_at) : null,
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export function mapWoIn(tenantId: string, r: Record<string, unknown>) {
  return {
    id: r.id,
    tenant_id: tenantId,
    asset_id: r.assetId ?? r.asset_id ?? null,
    asset_label: String(r.assetLabel ?? r.asset_label ?? ''),
    title: String(r.title ?? ''),
    due_date: r.dueDate ?? r.due_date,
    status: String(r.status ?? 'open'),
    vendor: String(r.vendor ?? ''),
    estimated_cost: r.estimatedCost ?? r.estimated_cost ?? null,
    actual_cost: r.actualCost ?? r.actual_cost ?? null,
    parts: r.parts ?? [],
    odometer_at_service_km: r.odometerAtServiceKm ?? r.odometer_at_service_km ?? null,
    warranty_flag: Boolean(r.warrantyFlag ?? r.warranty_flag),
    notes: String(r.notes ?? ''),
    created_at: r.createdAt ?? r.created_at ?? new Date().toISOString(),
    completed_at: r.completedAt ?? r.completed_at ?? null,
    updated_at: r.updatedAt ?? r.updated_at ?? new Date().toISOString(),
  };
}
