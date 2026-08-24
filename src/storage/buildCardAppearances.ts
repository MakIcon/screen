import type { BuildCardAppearance } from "../components/builds/BuildCardSettingsPopup";

export const LEGACY_BUILD_CARD_APPEARANCES_KEY = "screenlauncher-build-card-backgrounds";

const DATABASE_NAME = "screenlauncher-build-card-appearances";
const DATABASE_VERSION = 1;
const STORE_NAME = "settings";
const APPEARANCES_RECORD_KEY = "appearances";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }

  if (databasePromise) return databasePromise;

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked"));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });

  databasePromise = pending;
  return pending;
}

function transactionCompleted(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
  });
}

export async function readBuildCardAppearances(): Promise<
  Record<string, BuildCardAppearance> | undefined
> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const request = transaction.objectStore(STORE_NAME).get(APPEARANCES_RECORD_KEY);

  return new Promise((resolve, reject) => {
    request.onsuccess = () =>
      resolve(request.result as Record<string, BuildCardAppearance> | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read card appearances"));
  });
}

export async function writeBuildCardAppearances(
  appearances: Record<string, BuildCardAppearance>,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(appearances, APPEARANCES_RECORD_KEY);
  await transactionCompleted(transaction);
}
