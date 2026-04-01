import {
  ArrowLeft,
  ChevronRight,
  FileArchive,
  FileText,
  Folder,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import type { DocFolder, DocRecord } from '@/lib/documentsTypes';

function docIcon(category: string, type: string, mime?: string) {
  const t = type.toLowerCase();
  const m = (mime ?? '').toLowerCase();
  const c = category.toLowerCase();
  if (c.includes('safety') || c.includes('manual')) return ShieldCheck;
  if (c.includes('emergency') || t.includes('zip') || m.includes('zip')) return FileArchive;
  return FileText;
}

function folderPathLabel(folders: DocFolder[], id: string): string {
  const names: string[] = [];
  let cur: DocFolder | undefined = folders.find((f) => f.id === id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    names.unshift(cur.name);
    const pid = cur.parentId;
    cur = pid ? folders.find((f) => f.id === pid) : undefined;
  }
  return names.join(' / ');
}

function folderLabelById(folders: DocFolder[], id: string): string {
  return folders.find((f) => f.id === id)?.name ?? '—';
}

function countFilesInFolder(documents: DocRecord[], folderId: string): number {
  return documents.filter((d) => d.folderId === folderId).length;
}

export type DocumentFolderBrowserProps = {
  folders: DocFolder[];
  documents: DocRecord[];
  searchQuery: string;
  browseFolderId: string | null;
  onBrowseFolder: (id: string | null) => void;
  /** Call when navigating from search results so the query can clear */
  onNavigateFromSearch: () => void;
  onDownload: (doc: DocRecord) => void;
  onDeleteDocument?: (doc: DocRecord) => void;
};

export function DocumentFolderBrowser({
  folders,
  documents,
  searchQuery,
  browseFolderId,
  onBrowseFolder,
  onNavigateFromSearch,
  onDownload,
  onDeleteDocument,
}: DocumentFolderBrowserProps) {
  const q = searchQuery.trim().toLowerCase();

  const { matchingFolders, matchingDocs } = useMemo(() => {
    if (!q) return { matchingFolders: [] as DocFolder[], matchingDocs: [] as DocRecord[] };
    const mf = folders
      .filter((f) => f.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    const md = documents
      .filter((d) => d.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { matchingFolders: mf, matchingDocs: md };
  }, [q, folders, documents]);

  const rowClass =
    'flex min-h-[3.75rem] w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-raised)] py-4 pl-8 pr-6 text-left transition-colors hover:bg-[var(--surface-hover)]';

  const fileRowClass =
    'flex min-h-[3.75rem] w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-raised)] py-4 pl-8 pr-6';

  if (q) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-[var(--text-muted)]">
          Results for &quot;{searchQuery.trim()}&quot;
        </p>
        {matchingFolders.length === 0 && matchingDocs.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">No folders or files match.</p>
        )}
        {matchingFolders.length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Folders
            </h4>
            <ul className="flex flex-col gap-3">
              {matchingFolders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className={cn(rowClass, 'cursor-pointer')}
                    onClick={() => {
                      onBrowseFolder(f.id);
                      onNavigateFromSearch();
                    }}
                  >
                    <Folder className="size-6 shrink-0 text-[var(--primary-green)]" strokeWidth={2} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{f.name}</span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">
                        {folderPathLabel(folders, f.id)}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {matchingDocs.length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Files</h4>
            <ul className="flex flex-col gap-3">
              {matchingDocs.map((doc) => {
                const Icon = docIcon(doc.category, doc.type, doc.mimeType);
                const inFolder = folderLabelById(folders, doc.folderId);
                return (
                  <li key={doc.id}>
                    <div className={cn(fileRowClass)}>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => onDownload(doc)}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--light-green)] text-[var(--primary-green)]">
                          <Icon size={16} strokeWidth={2} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{doc.name}</span>
                          <span className="block text-xs text-[var(--text-muted)]">
                            {doc.size} · {doc.type.toUpperCase()} · {inFolder}
                          </span>
                        </span>
                      </button>
                      {onDeleteDocument && (
                        <button
                          type="button"
                          className="btn-icon shrink-0 text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                          aria-label={`Delete ${doc.name}`}
                          onClick={() => onDeleteDocument(doc)}
                        >
                          <Trash2 size={16} strokeWidth={2} aria-hidden />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    );
  }

  if (browseFolderId === null) {
    const topFolders = folders
      .filter((f) => f.parentId === null)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (folders.length === 0) {
      return (
        <p className="py-10 text-center text-sm text-[var(--text-muted)]">
          No folders yet. Use the sidebar to create one.
        </p>
      );
    }

    if (topFolders.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-[var(--text-muted)]">
          No top-level folders. Create one in the sidebar with &quot;Inside: Top level&quot;, or move existing folders.
        </p>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <h3 className="mb-0 text-sm font-semibold text-[var(--text-secondary)]">Folders</h3>
        <ul className="flex flex-col gap-3">
          {topFolders.map((f) => (
            <li key={f.id}>
              <button type="button" className={cn(rowClass, 'cursor-pointer')} onClick={() => onBrowseFolder(f.id)}>
                <Folder className="size-6 shrink-0 text-[var(--primary-green)]" strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                <span className="badge badge-gray shrink-0">{countFilesInFolder(documents, f.id)}</span>
                <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const current = folders.find((f) => f.id === browseFolderId);
  if (!current) {
    return (
      <p className="py-6 text-center text-sm text-[var(--text-muted)]">
        Folder not found.{' '}
        <button type="button" className="btn btn-secondary" onClick={() => onBrowseFolder(null)}>
          Back to library
        </button>
      </p>
    );
  }

  const subfolders = folders
    .filter((f) => f.parentId === browseFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = documents
    .filter((d) => d.folderId === browseFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const parentId = current.parentId;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-secondary inline-flex items-center gap-1.5 text-sm"
          onClick={() => onBrowseFolder(parentId)}
        >
          <ArrowLeft size={16} aria-hidden />
          {parentId ? 'Back' : 'All folders'}
        </button>
        <span className="min-w-0 text-sm text-[var(--text-muted)]" aria-current="page">
          <span className="font-medium text-[var(--text-primary)]">{folderPathLabel(folders, current.id)}</span>
        </span>
      </div>

      {subfolders.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">Folders</h3>
          <ul className="flex flex-col gap-3">
            {subfolders.map((f) => (
              <li key={f.id}>
                <button type="button" className={cn(rowClass, 'cursor-pointer')} onClick={() => onBrowseFolder(f.id)}>
                  <Folder className="size-6 shrink-0 text-[var(--primary-green)]" strokeWidth={2} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                  <span className="badge badge-gray shrink-0">{countFilesInFolder(documents, f.id)}</span>
                  <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">Files</h3>
        {files.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-color)] bg-[var(--surface-raised)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            No files in this folder. Use Add document to upload.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {files.map((doc) => {
              const Icon = docIcon(doc.category, doc.type, doc.mimeType);
              return (
                <li key={doc.id}>
                  <div className={cn(fileRowClass)}>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => onDownload(doc)}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--light-green)] text-[var(--primary-green)]">
                        <Icon size={16} strokeWidth={2} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{doc.name}</span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {doc.size} · {doc.type.toUpperCase()}
                        </span>
                      </span>
                    </button>
                    {onDeleteDocument && (
                      <button
                        type="button"
                        className="btn-icon shrink-0 text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                        aria-label={`Delete ${doc.name}`}
                        onClick={() => onDeleteDocument(doc)}
                      >
                        <Trash2 size={16} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
