/**
 * IndexedDB Video Storage Engine
 * Menyediakan penyimpanan video permanen di sisi klien (Browser Phone & Laptop)
 * Berjalan 100% secara OFFLINE tanpa bergantung pada server disk atau hosting Vercel.
 */

export interface StoredVideoRecord {
  id: string; // Format: `${cleanCountry}_scene_${sceneNumber}`
  country: string;
  sceneNumber: number;
  fileName: string;
  fileSize: string;
  blob: Blob;
  mimeType: string;
  uploadedAt: string;
}

const DB_NAME = 'eduzone_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_scene_videos';

// In-memory cache untuk URL objek blob agar tidak membuat URL ganda
const objectUrlCache = new Map<string, string>();

/**
 * Membuka koneksi ke IndexedDB browser
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB tidak didukung pada lingkungan ini.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('country', 'country', { unique: false });
        store.createIndex('sceneNumber', 'sceneNumber', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Gagal membuka IndexedDB.'));
    };
  });
}

/**
 * Menyimpan video ke IndexedDB browser
 */
export async function saveVideoToIndexedDB(
  country: string,
  sceneNumber: number,
  file: File | Blob,
  fileName: string,
  fileSize?: string
): Promise<{ id: string; objectUrl: string; record: StoredVideoRecord }> {
  const db = await openDB();
  const cleanCountry = country.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const recordId = `${cleanCountry}_scene_${sceneNumber}`;

  const sizeText = fileSize || (file.size ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : 'Ukuran tidak diketahui');

  const record: StoredVideoRecord = {
    id: recordId,
    country: cleanCountry,
    sceneNumber,
    fileName,
    fileSize: sizeText,
    blob: file,
    mimeType: file.type || 'video/mp4',
    uploadedAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const putRequest = store.put(record);

    putRequest.onsuccess = () => {
      // Cabut URL lama jika ada untuk mencegah memory leak
      const oldUrl = objectUrlCache.get(recordId);
      if (oldUrl) {
        URL.revokeObjectURL(oldUrl);
      }

      // Buat Object URL baru yang langsung bisa diputar oleh <video>
      const newObjectUrl = URL.createObjectURL(record.blob);
      objectUrlCache.set(recordId, newObjectUrl);

      resolve({ id: recordId, objectUrl: newObjectUrl, record });
    };

    putRequest.onerror = () => {
      reject(putRequest.error || new Error('Gagal menyimpan video ke IndexedDB.'));
    };
  });
}

/**
 * Mengambil video tersimpan dari IndexedDB berdasarkan negara dan nomor scene
 */
export async function getVideoFromIndexedDB(
  country: string,
  sceneNumber: number
): Promise<{ record: StoredVideoRecord; objectUrl: string } | null> {
  try {
    const db = await openDB();
    const cleanCountry = country.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const recordId = `${cleanCountry}_scene_${sceneNumber}`;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(recordId);

      getRequest.onsuccess = () => {
        const record = getRequest.result as StoredVideoRecord | undefined;
        if (!record || !record.blob) {
          return resolve(null);
        }

        let objectUrl = objectUrlCache.get(recordId);
        if (!objectUrl) {
          objectUrl = URL.createObjectURL(record.blob);
          objectUrlCache.set(recordId, objectUrl);
        }

        resolve({ record, objectUrl });
      };

      getRequest.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('[IndexedDB] Tidak dapat membaca video:', err);
    return null;
  }
}

/**
 * Mengambil seluruh video tersimpan untuk suatu negara
 */
export async function getAllCountryVideosFromIndexedDB(
  country: string
): Promise<Record<number, { record: StoredVideoRecord; objectUrl: string }>> {
  try {
    const db = await openDB();
    const cleanCountry = country.toLowerCase().replace(/[^a-z0-9]/g, '_');

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as StoredVideoRecord[];
        const map: Record<number, { record: StoredVideoRecord; objectUrl: string }> = {};

        for (const item of results) {
          if (item.country === cleanCountry && item.blob) {
            let objectUrl = objectUrlCache.get(item.id);
            if (!objectUrl) {
              objectUrl = URL.createObjectURL(item.blob);
              objectUrlCache.set(item.id, objectUrl);
            }
            map[item.sceneNumber] = { record: item, objectUrl };
          }
        }

        resolve(map);
      };

      request.onerror = () => {
        resolve({});
      };
    });
  } catch {
    return {};
  }
}

/**
 * Menghapus video dari IndexedDB
 */
export async function deleteVideoFromIndexedDB(
  country: string,
  sceneNumber: number
): Promise<boolean> {
  try {
    const db = await openDB();
    const cleanCountry = country.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const recordId = `${cleanCountry}_scene_${sceneNumber}`;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const delRequest = store.delete(recordId);

      delRequest.onsuccess = () => {
        const oldUrl = objectUrlCache.get(recordId);
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
          objectUrlCache.delete(recordId);
        }
        resolve(true);
      };

      delRequest.onerror = () => {
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

/**
 * Menghasilkan kunci unik penyimpanan video
 */
export function buildVideoStorageKey(country: string, sceneNumber: number): string {
  const clean = country.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${clean}_scene_${sceneNumber}`;
}
