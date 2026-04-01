export type DocFolder = {
  id: string;
  name: string;
  /** `null` = top level under library root */
  parentId: string | null;
};

export type DocRecord = {
  id: string;
  name: string;
  /** Legacy display; mirrored from folder name when possible */
  category: string;
  size: string;
  type: string;
  dataUrl?: string;
  storedFileName?: string;
  mimeType?: string;
  /** Folder this file belongs to */
  folderId: string;
};

export type DocumentsRepoState = {
  folders: DocFolder[];
  documents: DocRecord[];
};
