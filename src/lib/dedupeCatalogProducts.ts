/**
 * Catalog rows can be duplicated in DB (e.g. migrations). Keep stable order and first wins.
 */
export function dedupeCatalogProducts<T extends { id: string; name: string }>(rows: T[]): T[] {
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seenId.has(r.id)) continue;
    seenId.add(r.id);
    const nk = r.name.trim().toLowerCase();
    if (seenName.has(nk)) continue;
    seenName.add(nk);
    out.push(r);
  }
  return out;
}
