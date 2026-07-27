/**
 * Shared labelling / grouping for pre-trip checklist answers.
 *
 * The stored `checklist` record is a flat `key -> answer` map built from the
 * inspection form. Both the detail view and the PDF export need the same
 * human-readable labels and the same section ordering, so they live here
 * rather than inside the page component.
 */

/**
 * Human-readable labels for every checklist key. Keys not listed here fall back
 * to a humanized version of the raw key, so a record is never silently dropped.
 */
export const CHECKLIST_LABELS: Record<string, string> = {
  odometer: 'Odometer reading',
  fuelType: 'Fuel type',
  truckUsed: 'Truck used to tow',
  regIns: 'Registration & insurance',
  cvi: 'CVI & decal',
  tires: 'Tires & rims',
  body: 'Body (doors, bumpers / fenders, ramps)',
  mirrors: 'Mirrors',
  toolboxes: 'Toolboxes secured',
  doors: 'Doors secured',
  load: 'Load secured (no debris)',
  oil: 'Engine oil',
  coolant: 'Coolant',
  transFluid: 'Transmission fluid',
  powerSteering: 'Power steering fluid',
  seats: 'Seats & seat belts',
  wipers: 'Windshield wipers',
  defroster: 'Defroster',
  horn: 'Horn',
  cabClean: 'Free of dangerous items',
  hitchPinned: 'Truck hitch pinned',
  ballSize: 'Hitch ball correct size',
  coupler: 'Coupler latched & pinned',
  chains: 'Chains crossed / connect',
  electricalCon: 'Electrical connector secured',
  headlights: 'Headlights',
  markerLights: 'Running & marker lights',
  turnSignals: 'Turn signals / hazard',
  brakeLights: 'Brake lights',
  parkingBrake: 'Parking brake',
  brakes: 'Service brakes',
  steering: 'Steering',
  tugTest: 'Gain up tug test',
  rollTest: 'Gain up roll test',
  breakaway: 'Electrical breakaway test',
  firstAid: 'First aid kit',
  fireExtinguisher: 'Charged fire extinguisher',
  wheelChocks: 'Wheel chocks',
  triangles: 'Reflective triangles / cones',
  spillKit: 'Spill kit',
  tireChains: 'Winter tire chains',
};

const humanizeKey = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export const labelForChecklistKey = (key: string) => CHECKLIST_LABELS[key] ?? humanizeKey(key);

/** Section order mirrors the inspection form so a printed record reads the same way. */
const CHECKLIST_SECTIONS: { title: string; keys: string[] }[] = [
  { title: 'Unit details', keys: ['odometer', 'fuelType', 'truckUsed'] },
  {
    title: 'Documentation & exterior',
    keys: ['regIns', 'cvi', 'tires', 'body', 'mirrors', 'toolboxes', 'doors', 'load'],
  },
  {
    title: 'Under hood & cab',
    keys: ['oil', 'coolant', 'transFluid', 'powerSteering', 'seats', 'wipers', 'defroster', 'horn', 'cabClean'],
  },
  { title: 'Hitch & connection', keys: ['hitchPinned', 'ballSize', 'coupler', 'chains', 'electricalCon'] },
  {
    title: 'Lights & brakes',
    keys: ['headlights', 'markerLights', 'turnSignals', 'brakeLights', 'parkingBrake', 'brakes', 'steering'],
  },
  { title: 'Trailer tests', keys: ['tugTest', 'rollTest', 'breakaway'] },
  {
    title: 'Emergency equipment',
    keys: ['firstAid', 'fireExtinguisher', 'wheelChocks', 'triangles', 'spillKit', 'tireChains'],
  },
];

export type ChecklistItem = { key: string; label: string; value: string };
export type ChecklistSection = { title: string; items: ChecklistItem[] };

/**
 * Groups a stored checklist into display sections. Sections with no answers are
 * dropped; any key that isn't part of a known section is collected under
 * "Other items" so nothing recorded on the form disappears from the record.
 */
export function groupChecklist(checklist: Record<string, string>): ChecklistSection[] {
  const remaining = new Map(Object.entries(checklist ?? {}));
  const sections: ChecklistSection[] = [];

  for (const section of CHECKLIST_SECTIONS) {
    const items: ChecklistItem[] = [];
    for (const key of section.keys) {
      if (!remaining.has(key)) continue;
      items.push({ key, label: labelForChecklistKey(key), value: remaining.get(key) ?? '' });
      remaining.delete(key);
    }
    if (items.length) sections.push({ title: section.title, items });
  }

  if (remaining.size) {
    sections.push({
      title: 'Other items',
      items: [...remaining].map(([key, value]) => ({ key, label: labelForChecklistKey(key), value })),
    });
  }

  return sections;
}

/** Every checklist item answered "Fail", in form order. */
export function failedItems(checklist: Record<string, string>): ChecklistItem[] {
  return groupChecklist(checklist)
    .flatMap((s) => s.items)
    .filter((i) => i.value === 'Fail');
}
