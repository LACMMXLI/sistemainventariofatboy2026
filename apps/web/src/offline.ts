export type CountDraft = {
  id: string;
  countId: string;
  lineId: string;
  countedQuantity: string;
  version: number;
  clientMutationId: string;
  createdAt: number;
};

const DB_NAME = "fatboy-inventory";
const STORE = "count-drafts";

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export const saveDraft = (draft: CountDraft) => transaction("readwrite", (store) => store.put(draft));
export const removeDraft = (id: string) => transaction("readwrite", (store) => store.delete(id));
export const listDrafts = () => transaction<CountDraft[]>("readonly", (store) => store.getAll());

