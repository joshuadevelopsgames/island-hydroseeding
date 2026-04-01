import type { DocRecord, DocFolder, DocumentsRepoState } from './documentsTypes';

export function migrateDocRecord(raw: unknown): DocRecord {
  const o = raw as Record<string, unknown>;
  return {
    id: String(o.id ?? ''),
    name: String(o.name ?? ''),
    category: String(o.category ?? ''),
    size: String(o.size ?? '—'),
    type: String(o.type ?? 'file'),
    dataUrl: typeof o.dataUrl === 'string' ? o.dataUrl : undefined,
    storedFileName: typeof o.storedFileName === 'string' ? o.storedFileName : undefined,
    mimeType: typeof o.mimeType === 'string' ? o.mimeType : undefined,
    folderId: typeof o.folderId === 'string' ? o.folderId : '',
  };
}

function slugFolderId(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'folder';
}

function migrateV1Array(parsed: unknown[]): DocumentsRepoState {
  const documents = parsed.map(migrateDocRecord);
  const categoryNames = [...new Set(documents.map((d) => d.category || 'General'))];
  const folders: DocFolder[] = categoryNames.map((name, i) => ({
    id: `cat-${slugFolderId(name || 'general')}-${i}`,
    name: name || 'General',
    parentId: null,
  }));

  const nameToFolderId = new Map(folders.map((f) => [f.name, f.id]));
  for (const d of documents) {
    const cat = d.category || 'General';
    d.folderId = nameToFolderId.get(cat) ?? folders[0]?.id ?? '';
  }

  return { folders, documents };
}

const V1_KEY = 'documentsRepository';
const V2_KEY = 'documentsRepositoryV2';

export function loadDocumentsRepo(): DocumentsRepoState {
  const v2 = localStorage.getItem(V2_KEY);
  if (v2) {
    try {
      const o = JSON.parse(v2) as { folders?: unknown; documents?: unknown };
      const folders = Array.isArray(o.folders)
        ? (o.folders as DocFolder[]).filter((f) => f && typeof f.id === 'string')
        : [];
      const documents = Array.isArray(o.documents) ? o.documents.map(migrateDocRecord) : [];
      return { folders, documents };
    } catch {
      return { folders: [], documents: [] };
    }
  }

  const v1 = localStorage.getItem(V1_KEY);
  if (v1) {
    try {
      const parsed = JSON.parse(v1) as unknown[];
      const migrated = Array.isArray(parsed) ? migrateV1Array(parsed) : { folders: [], documents: [] };
      saveDocumentsRepo(migrated);
      return migrated;
    } catch {
      return { folders: [], documents: [] };
    }
  }

  return { folders: [], documents: [] };
}

export function saveDocumentsRepo(state: DocumentsRepoState): void {
  localStorage.setItem(V2_KEY, JSON.stringify(state));
}

export function ensureDefaultFolder(state: DocumentsRepoState): DocumentsRepoState {
  let { folders, documents } = state;

  if (folders.length === 0) {
    const id = crypto.randomUUID?.() ?? `f-${Math.random().toString(36).slice(2, 11)}`;
    const general: DocFolder = { id, name: 'General', parentId: null };
    documents = documents.map((d) => ({
      ...d,
      folderId: d.folderId || general.id,
    }));
    return { folders: [general], documents };
  }

  documents = documents.map((d) => {
    if (d.folderId && folders.some((f) => f.id === d.folderId)) return d;
    return { ...d, folderId: folders[0].id, category: folders[0].name };
  });

  return { folders, documents };
}
