/**
 * One living world per folder.
 * Desktop Chromium uses the File System Access API. Other browsers use the
 * origin private file system, then IndexedDB. Export and import always work.
 */

const PREF_DB = 'ada-hood-folder';
const FILE_DB = 'ada-hood-files';
const WORLD_FILE = 'world.json';
export const REPORTS_DIR = '09 Reports';

export interface WorldStore {
  kind: 'directory' | 'opfs' | 'indexeddb';
  label: string;
  read(name: string): Promise<string | null>;
  write(name: string, body: string): Promise<void>;
  writeReport(filename: string, body: string): Promise<void>;
  exists(name: string): Promise<boolean>;
}

interface DirHandle {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

interface FileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

let current: WorldStore | null = null;
let cityOnFile = false;

export function livingCityOnFile(): boolean {
  return cityOnFile;
}

export async function refreshCityOnFile(): Promise<boolean> {
  const store = activeWorldStore();
  cityOnFile = !!store && await store.exists('world.json');
  return cityOnFile;
}

export function activeWorldStore(): WorldStore | null {
  return current;
}

export function attachWorldStore(store: WorldStore | null): void {
  current = store;
}

export function directoryPickerAvailable(): boolean {
  return typeof window !== 'undefined' && typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export async function pickDirectory(): Promise<WorldStore> {
  const show = (window as { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirHandle> }).showDirectoryPicker;
  if (!show) throw new Error('This browser cannot pick a folder. Use private storage instead.');
  const handle = await show({ mode: 'readwrite' });
  await rememberHandle(handle);
  const store = directoryStore(handle);
  attachWorldStore(store);
  return store;
}

export async function usePrivateStorage(): Promise<WorldStore> {
  const store = (await opfsStore()) ?? (await idbStore());
  if (store.kind === 'directory') throw new Error('Private storage should not be a folder.');
  await rememberKind(store.kind);
  attachWorldStore(store);
  return store;
}

/** Restore the last choice. A folder still needs a click if permission lapsed. */
export async function resumeWorldStore(): Promise<WorldStore | 'needs-gesture' | null> {
  const pref = await readPref();
  if (!pref) return null;
  if (pref.kind === 'directory' && pref.handle) {
    const permission = await pref.handle.queryPermission?.({ mode: 'readwrite' });
    if (permission === 'granted') {
      const store = directoryStore(pref.handle);
      attachWorldStore(store);
      return store;
    }
    return 'needs-gesture';
  }
  if (pref.kind === 'opfs' || pref.kind === 'indexeddb') return usePrivateStorage();
  return null;
}

export async function resumeDirectoryAfterGesture(): Promise<WorldStore | null> {
  const pref = await readPref();
  if (!pref?.handle) return null;
  const permission = await pref.handle.requestPermission?.({ mode: 'readwrite' });
  if (permission !== 'granted') return null;
  const store = directoryStore(pref.handle);
  attachWorldStore(store);
  return store;
}

export function downloadText(filename: string, body: string): void {
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportWorldFile(): Promise<void> {
  const store = activeWorldStore();
  if (!store) throw new Error('Choose where the city lives before exporting it.');
  const body = await store.read(WORLD_FILE);
  if (!body) throw new Error('This folder does not have a city yet.');
  downloadText('world.json', body);
}

export async function importWorldFile(file: File): Promise<void> {
  const store = activeWorldStore();
  if (!store) throw new Error('Choose where the city lives before importing one.');
  const body = await file.text();
  await store.write(WORLD_FILE, body);
}

function directoryStore(handle: DirHandle): WorldStore {
  return {
    kind: 'directory',
    label: handle.name || 'Folder',
    read: (name) => readNamed(handle, name),
    write: (name, body) => writeNamed(handle, name, body),
    writeReport: (filename, body) => writeIn(handle, REPORTS_DIR, filename, body),
    exists: (name) => fileExists(handle, name),
  };
}

async function opfsStore(): Promise<WorldStore | null> {
  const root = navigator.storage?.getDirectory ? await navigator.storage.getDirectory() : null;
  if (!root) return null;
  const handle = await (root as unknown as DirHandle).getDirectoryHandle('ada-hood-world', { create: true });
  return {
    kind: 'opfs',
    label: 'This browser (private)',
    read: (name) => readNamed(handle, name),
    write: (name, body) => writeNamed(handle, name, body),
    writeReport: (filename, body) => writeIn(handle, REPORTS_DIR, filename, body),
    exists: (name) => fileExists(handle, name),
  };
}

async function idbStore(): Promise<WorldStore> {
  return {
    kind: 'indexeddb',
    label: 'This browser (saved files)',
    read: (name) => idbGet(name),
    write: (name, body) => idbPut(name, body),
    writeReport: (filename, body) => idbPut(`${REPORTS_DIR}/${filename}`, body),
    exists: async (name) => (await idbGet(name)) != null,
  };
}

async function fileExists(dir: DirHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function readNamed(dir: DirHandle, name: string): Promise<string | null> {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    return await file.text();
  } catch {
    return null;
  }
}

async function writeNamed(dir: DirHandle, name: string, body: string): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writer = await handle.createWritable();
  await writer.write(body);
  await writer.close();
}

async function writeIn(dir: DirHandle, folder: string, name: string, body: string): Promise<void> {
  const sub = await dir.getDirectoryHandle(folder, { create: true });
  await writeNamed(sub, name, body);
}

function openDb(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb(FILE_DB, 1, (database) => {
    if (!database.objectStoreNames.contains('files')) database.createObjectStore('files');
  });
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction('files', 'readonly').objectStore('files').get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPut(key: string, body: string): Promise<void> {
  const db = await openDb(FILE_DB, 1, (database) => {
    if (!database.objectStoreNames.contains('files')) database.createObjectStore('files');
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(body, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

interface Pref {
  kind: WorldStore['kind'];
  handle?: DirHandle;
}

async function prefDb(): Promise<IDBDatabase> {
  return openDb(PREF_DB, 1, (database) => {
    if (!database.objectStoreNames.contains('pref')) database.createObjectStore('pref');
  });
}

async function readPref(): Promise<Pref | null> {
  try {
    const db = await prefDb();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction('pref', 'readonly').objectStore('pref').get('current');
        req.onsuccess = () => resolve((req.result as Pref | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function writePref(pref: Pref): Promise<void> {
  const db = await prefDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pref', 'readwrite');
      tx.objectStore('pref').put(pref, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function rememberHandle(handle: DirHandle): Promise<void> {
  await writePref({ kind: 'directory', handle });
}

async function rememberKind(kind: 'opfs' | 'indexeddb'): Promise<void> {
  await writePref({ kind });
}

/** Parse JSON off the main thread. Falls back to the main thread if workers are missing. */
export function parseWorldText(text: string): Promise<unknown> {
  if (typeof Worker === 'undefined') return Promise.resolve(JSON.parse(text));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worldIO.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(JSON.parse(text));
      return;
    }
    const finish = (run: () => void) => {
      worker.terminate();
      run();
    };
    worker.onmessage = (event: MessageEvent<{ world?: unknown; error?: string }>) => {
      finish(() => {
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.world);
      });
    };
    worker.onerror = () => finish(() => {
      try { resolve(JSON.parse(text)); } catch (error) { reject(error); }
    });
    worker.postMessage({ text });
  });
}
