/** Uploaded files are kept in IndexedDB (localStorage is too small for them). */
const DB_NAME = 'ec-files';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const putFile = (key: string, file: Blob) => tx('readwrite', s => s.put(file, key));
export const getFile = (key: string) => tx<Blob | undefined>('readonly', s => s.get(key) as IDBRequest<Blob | undefined>);
export const deleteFile = (key: string) => tx('readwrite', s => s.delete(key));
export const clearFiles = () => tx('readwrite', s => s.clear());
