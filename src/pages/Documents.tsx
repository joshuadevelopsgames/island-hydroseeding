import { Search, Upload, ShieldAlert, ChevronRight, FolderPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AlertDialog from '../components/AlertDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DocumentFolderBrowser } from '../components/documents/DocumentFolderBrowser';
import { useAuth } from '../context/AuthContext';
import { userCanAccessPath } from '../lib/permissions';
import type { DocFolder, DocRecord } from '../lib/documentsTypes';
import { ensureDefaultFolder, loadDocumentsRepo, saveDocumentsRepo } from '../lib/documentsRepo';

/** Keep uploads modest — localStorage + JSON sync have practical size limits */
const MAX_FILE_BYTES = Math.floor(2.5 * 1024 * 1024);

const DOC_FILE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.zip,.7z';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function stripExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  if (i <= 0) return filename;
  return filename.slice(0, i);
}

function extensionFromName(filename: string): string {
  const i = filename.lastIndexOf('.');
  if (i <= 0) return 'file';
  return filename.slice(i + 1).toLowerCase() || 'file';
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function safeDownloadName(doc: DocRecord): string {
  if (doc.storedFileName?.trim()) return doc.storedFileName.replace(/[/\\?%*:|"<>]/g, '-');
  const ext = doc.type && doc.type !== 'file' ? `.${doc.type}` : '';
  const base = doc.name.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 120);
  return `${base}${ext}`;
}

/** Flatten folders for parent picker (depth-first, indented labels). */
function folderOptionsFlat(folders: DocFolder[]): { id: string | null; label: string }[] {
  const sorted = [...folders].sort((a, b) => a.name.localeCompare(b.name));
  const out: { id: string | null; label: string }[] = [{ id: null, label: 'Top level' }];

  const walk = (parentId: string | null, depth: number) => {
    const kids = sorted.filter((f) => f.parentId === parentId);
    kids.sort((a, b) => a.name.localeCompare(b.name));
    for (const k of kids) {
      const pad = depth > 0 ? `${'·'.repeat(depth)} ` : '';
      out.push({ id: k.id, label: `${pad}${k.name}` });
      walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function folderNameById(folders: DocFolder[], id: string): string {
  return folders.find((f) => f.id === id)?.name ?? 'General';
}

export default function Documents() {
  const { currentUser } = useAuth();
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickedSummary, setPickedSummary] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  /** `null` = library root (list top-level folders). Set when opening a folder to show its files. */
  const [browseFolderId, setBrowseFolderId] = useState<string | null>(null);
  const [uploadFolderId, setUploadFolderId] = useState('');

  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameFolder, setRenameFolder] = useState<DocFolder | null>(null);
  const [renameName, setRenameName] = useState('');
  const [folderToDelete, setFolderToDelete] = useState<DocFolder | null>(null);
  const [docToDelete, setDocToDelete] = useState<DocRecord | null>(null);

  const persist = useCallback((nextFolders: DocFolder[], nextDocs: DocRecord[]) => {
    saveDocumentsRepo({ folders: nextFolders, documents: nextDocs });
    setFolders(nextFolders);
    setDocuments(nextDocs);
  }, []);

  const syncPickedFromInput = useCallback(() => {
    const inp = fileInputRef.current;
    const f = inp?.files?.[0];
    setPickedSummary(f ? `${f.name} · ${formatBytes(f.size)}` : null);
  }, []);

  const assignPickedFile = useCallback(
    (file: File | undefined) => {
      if (!file || !fileInputRef.current) return;
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      syncPickedFromInput();
    },
    [syncPickedFromInput]
  );

  useEffect(() => {
    if (!isAdding) return;
    setPickedSummary(null);
    setDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isAdding]);

  useEffect(() => {
    const loaded = ensureDefaultFolder(loadDocumentsRepo());
    setFolders(loaded.folders);
    setDocuments(loaded.documents);
  }, []);

  const parentOptions = useMemo(() => folderOptionsFlat(folders), [folders]);

  const defaultUploadFolderId = browseFolderId ?? folders[0]?.id ?? '';

  useEffect(() => {
    if (browseFolderId && !folders.some((f) => f.id === browseFolderId)) {
      setBrowseFolderId(null);
    }
  }, [browseFolderId, folders]);

  useEffect(() => {
    setNewFolderParentId(browseFolderId);
  }, [browseFolderId]);

  useEffect(() => {
    if (isAdding) {
      setUploadFolderId(defaultUploadFolderId || folders[0]?.id || '');
    }
  }, [isAdding, defaultUploadFolderId, folders]);

  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) {
      setAlert({ title: 'Name required', message: 'Enter a folder name.' });
      return;
    }
    if (newFolderParentId) {
      const parentExists = folders.some((f) => f.id === newFolderParentId);
      if (!parentExists) {
        setAlert({ title: 'Invalid parent', message: 'Pick a valid parent folder.' });
        return;
      }
    }
    const id = crypto.randomUUID?.() ?? `f-${Math.random().toString(36).slice(2, 11)}`;
    const next: DocFolder[] = [...folders, { id, name, parentId: newFolderParentId }];
    persist(next, documents);
    setNewFolderName('');
    setNewFolderParentId(null);
    setCreateFolderOpen(false);
  };

  const submitRenameFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameFolder) return;
    const name = renameName.trim();
    if (!name) {
      setAlert({ title: 'Name required', message: 'Enter a folder name.' });
      return;
    }
    const id = renameFolder.id;
    const nextFolders = folders.map((f) => (f.id === id ? { ...f, name } : f));
    const nextDocs = documents.map((d) =>
      d.folderId === id ? { ...d, category: name } : d
    );
    persist(nextFolders, nextDocs);
    setRenameFolder(null);
  };

  const confirmDeleteFolder = useCallback(() => {
    if (!folderToDelete) return;
    const id = folderToDelete.id;
    const hasChildFolders = folders.some((f) => f.parentId === id);
    const hasDocs = documents.some((d) => d.folderId === id);
    if (hasChildFolders || hasDocs) {
      setAlert({
        title: 'Folder not empty',
        message: 'Remove or move files and subfolders before deleting this folder.',
      });
      setFolderToDelete(null);
      return;
    }
    persist(
      folders.filter((f) => f.id !== id),
      documents
    );
    if (browseFolderId === id) {
      const gone = folders.find((f) => f.id === id);
      setBrowseFolderId(gone?.parentId ?? null);
    }
    setFolderToDelete(null);
  }, [folderToDelete, folders, documents, persist, browseFolderId]);

  useEffect(() => {
    if (renameFolder) setRenameName(renameFolder.name);
  }, [renameFolder]);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const file = formData.get('file');

    if (!(file instanceof File) || file.size === 0) {
      setAlert({ title: 'Choose a file', message: 'Select a document to upload (PDF, Office, images, zip, etc.).' });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setAlert({
        title: 'File too large',
        message: `Each file must be at most ${formatBytes(MAX_FILE_BYTES)} so it fits in browser storage and sync.`,
      });
      return;
    }

    setUploadBusy(true);
    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataURL(file);
    } catch {
      setUploadBusy(false);
      setAlert({ title: 'Could not read file', message: 'Try again or pick a different file.' });
      return;
    }

    const titleInput = (formData.get('name') as string).trim();
    const ext = extensionFromName(file.name);
    const mime = file.type || '';

    let folderId = uploadFolderId.trim() || String(formData.get('folderId') || '').trim();
    if (!folderId) folderId = defaultUploadFolderId;
    if (!folderId) {
      setUploadBusy(false);
      setAlert({ title: 'No folder', message: 'Create a folder first, then upload.' });
      return;
    }

    const fname = folderNameById(folders, folderId);

    const row: DocRecord = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11),
      name: titleInput || stripExtension(file.name) || 'Document',
      category: fname,
      size: formatBytes(file.size),
      type: ext,
      dataUrl,
      storedFileName: file.name,
      mimeType: mime || undefined,
      folderId,
    };

    const next = [row, ...documents];
    try {
      saveDocumentsRepo({ folders, documents: next });
      setDocuments(next);
    } catch {
      setUploadBusy(false);
      setAlert({
        title: 'Storage full',
        message:
          'Saving failed (often quota exceeded). Remove other documents or use a smaller file. Very large files may need cloud storage later.',
      });
      return;
    }

    setUploadBusy(false);
    setIsAdding(false);
    setPickedSummary(null);
    form.reset();
  };

  const downloadDoc = useCallback(
    (doc: DocRecord) => {
      if (!doc.dataUrl) {
        setAlert({
          title: 'No file attached',
          message: 'This entry is metadata only. Re-add it with a file upload, or replace it from the source.',
        });
        return;
      }
      const a = document.createElement('a');
      a.href = doc.dataUrl;
      a.download = safeDownloadName(doc);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    []
  );

  const requestDeleteDocument = useCallback((doc: DocRecord) => {
    setDocToDelete(doc);
  }, []);

  const confirmDeleteDocument = useCallback(() => {
    if (!docToDelete) return;
    const id = docToDelete.id;
    persist(
      folders,
      documents.filter((d) => d.id !== id)
    );
    setDocToDelete(null);
  }, [docToDelete, documents, folders, persist]);

  return (
    <div className="documents-page">
      <AlertDialog
        open={alert !== null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onClose={() => setAlert(null)}
      />

      <ConfirmDialog
        open={docToDelete !== null}
        title="Delete this document?"
        message={
          docToDelete
            ? `Remove “${docToDelete.name}” from your library? The file will be removed from this device’s storage. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteDocument}
        onCancel={() => setDocToDelete(null)}
      />

      <ConfirmDialog
        open={folderToDelete !== null}
        title="Delete this folder?"
        message={
          folderToDelete
            ? `Delete “${folderToDelete.name}”? This only works if the folder is empty (no files and no subfolders).`
            : ''
        }
        confirmLabel="Delete folder"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteFolder}
        onCancel={() => setFolderToDelete(null)}
      />

      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Create folder</DialogTitle>
            <DialogDescription>Add a folder, optionally nested inside another.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddFolder} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-folder-name-dlg">Name</Label>
              <Input
                id="new-folder-name-dlg"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. SDS, Safety manuals"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-folder-parent-dlg">Nest inside</Label>
              <select
                id="new-folder-parent-dlg"
                className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-3 text-sm"
                value={newFolderParentId ?? ''}
                onChange={(e) => setNewFolderParentId(e.target.value === '' ? null : e.target.value)}
              >
                {parentOptions.map((o) => (
                  <option key={o.id ?? 'root'} value={o.id ?? ''}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateFolderOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create folder</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameFolder !== null}
        onOpenChange={(open) => {
          if (!open) setRenameFolder(null);
        }}
      >
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <form onSubmit={submitRenameFolder}>
            <DialogHeader>
              <DialogTitle>Rename folder</DialogTitle>
              <DialogDescription>Change how this folder appears in your library.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="rename-folder-input">Name</Label>
              <Input
                id="rename-folder-input"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="Folder name"
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setRenameFolder(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="space-y-6 mb-8">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="mb-2">Documents &amp; Safety Manual</h1>
            <p className="text-secondary mb-0" style={{ maxWidth: '42rem' }}>
              Open a folder to see its files, or add documents when needed (max {formatBytes(MAX_FILE_BYTES)} per file).
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary page-toolbar__cta"
            onClick={() => setIsAdding(!isAdding)}
          >
            {isAdding ? 'Cancel' : 'Add document'}
          </button>
        </div>

        {currentUser && userCanAccessPath('/flha', currentUser) && (
          <div className="card documents-flha-callout">
            <Link to="/flha" className="documents-flha-callout__link">
              <span className="documents-flha-callout__icon" aria-hidden>
                <ShieldAlert size={22} strokeWidth={2} />
              </span>
              <span className="documents-flha-callout__text">
                <span className="documents-flha-callout__title">FLHA Forms</span>
                <span className="documents-flha-callout__desc">Field Level Hazard Assessment — log and review FLHAs.</span>
              </span>
              <ChevronRight className="documents-flha-callout__chevron" size={20} aria-hidden />
            </Link>
          </div>
        )}

        {isAdding && (
          <div className="card">
          <h3 className="mb-4 flex items-center gap-2">
            <Upload size={20} aria-hidden /> Upload a document
          </h3>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div>
              <label htmlFor="doc-file">File *</label>
              <div
                className={`doc-file-dropzone${dragActive ? ' doc-file-dropzone--active' : ''}${
                  pickedSummary ? ' doc-file-dropzone--has-file' : ''
                }`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) assignPickedFile(f);
                }}
              >
                <input
                  ref={fileInputRef}
                  id="doc-file"
                  name="file"
                  type="file"
                  required
                  className="sr-only"
                  accept={DOC_FILE_ACCEPT}
                  aria-describedby="doc-file-hint"
                  onChange={syncPickedFromInput}
                />
                <div className="doc-file-dropzone__body">
                  <div className="doc-file-dropzone__icon-wrap" aria-hidden>
                    <Upload size={22} strokeWidth={2} />
                  </div>
                  <div className="doc-file-dropzone__main">
                    <div className="doc-file-dropzone__actions">
                      <button
                        type="button"
                        className="btn btn-secondary doc-file-dropzone__browse"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Browse files
                      </button>
                      <span className="doc-file-dropzone__or">or drag &amp; drop here</span>
                    </div>
                    <p id="doc-file-hint" className="doc-file-dropzone__hint text-sm text-muted">
                      {pickedSummary ?? 'PDF, Office, images, zip — max ' + formatBytes(MAX_FILE_BYTES) + ' · type & size detected automatically'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div>
                <label htmlFor="doc-title">Title</label>
                <input id="doc-title" name="name" placeholder="Defaults to file name" />
              </div>
              <div>
                <label htmlFor="doc-folder">Folder *</label>
                <select
                  id="doc-folder"
                  name="folderId"
                  value={uploadFolderId}
                  onChange={(e) => setUploadFolderId(e.target.value)}
                  required
                >
                  {folders.length === 0 ? (
                    <option value="">Create a folder below first</option>
                  ) : (
                    parentOptions
                      .filter((o) => o.id !== null)
                      .map((o) => (
                        <option key={o.id!} value={o.id!}>
                          {o.label}
                        </option>
                      ))
                  )}
                </select>
                <p className="text-xs text-muted mt-1">Defaults to the folder you have open in the library when possible.</p>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={uploadBusy || folders.length === 0}>
              {uploadBusy ? 'Saving…' : 'Save document'}
            </button>
          </form>
          </div>
        )}
      </div>

      <div className="card min-w-0 overflow-visible p-0">
        <div className="flex flex-row flex-wrap items-center gap-3 border-b border-[var(--border-color)] px-6 py-4 sm:gap-4">
          <div className="documents-library-search min-w-0 flex-1 basis-[min(100%,24rem)] max-w-full sm:max-w-xl">
            <Search size={18} className="documents-library-search__icon shrink-0" aria-hidden />
            <input
              type="search"
              placeholder="Search folders & files…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search documents"
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary inline-flex items-center gap-2"
              onClick={() => {
                setNewFolderParentId(browseFolderId);
                setNewFolderName('');
                setCreateFolderOpen(true);
              }}
            >
              <FolderPlus size={16} aria-hidden />
              Create folder
            </button>
            <span className="badge badge-gray shrink-0">{documents.length} files</span>
          </div>
        </div>

        <div className="relative overflow-visible px-6 py-5">
          <DocumentFolderBrowser
            folders={folders}
            documents={documents}
            searchQuery={searchTerm}
            browseFolderId={browseFolderId}
            onBrowseFolder={setBrowseFolderId}
            onNavigateFromSearch={() => setSearchTerm('')}
            onDownload={downloadDoc}
            onDeleteDocument={requestDeleteDocument}
            onRenameFolder={(f) => setRenameFolder(f)}
            onDeleteFolder={(f) => setFolderToDelete(f)}
          />
        </div>
      </div>
    </div>
  );
}
