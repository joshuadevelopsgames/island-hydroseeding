/**
 * IndexedDB-backed photo store for inspection photos.
 *
 * Inspection photos can easily exceed iOS Safari's ~5 MB localStorage quota
 * when serialized as base64 dataURL strings inside the workspace JSON. We keep
 * the photos themselves out of localStorage by storing each photo under a
 * random ID in IndexedDB, and only persist the IDs in the inspection log.
 */

const DB_NAME = 'ih_photos_v1';
const STORE = 'photos';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('indexeddb-unavailable'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb-open'));
  });
  return dbPromise;
}

function newPhotoId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function savePhoto(dataUrl: string): Promise<string> {
  const db = await openDb();
  const id = newPhotoId();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(dataUrl, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexeddb-write'));
    tx.onabort = () => reject(tx.error ?? new Error('indexeddb-abort'));
  });
  return id;
}

export async function loadPhoto(id: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('indexeddb-read'));
    });
  } catch {
    return null;
  }
}

export async function loadPhotos(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (ids.length === 0) return out;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      let pending = ids.length;
      ids.forEach((id) => {
        const req = store.get(id);
        req.onsuccess = () => {
          const v = req.result as string | undefined;
          if (typeof v === 'string') out[id] = v;
          if (--pending === 0) resolve();
        };
        req.onerror = () => reject(req.error ?? new Error('indexeddb-read'));
      });
      if (ids.length === 0) resolve();
    });
    return out;
  } catch {
    return out;
  }
}

export async function deletePhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexeddb-delete'));
    });
  } catch {
    /* ignore */
  }
}
