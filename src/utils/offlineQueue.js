/**
 * offlineQueue.js
 * Buffer GPS data saat koneksi internet terputus (blank spot)
 * Menyimpan ke IndexedDB dan sync ulang saat koneksi kembali
 */

const DB_NAME = 'cyclotrack_offline';
const DB_VERSION = 1;
const STORE_NAME = 'gps_queue';

class OfflineQueue {
  constructor() {
    this.db = null;
    this.isOnline = navigator.onLine;
    this.flushCallbacks = [];
    this._initDB();
    this._listenConnectivity();
  }

  /** Inisialisasi IndexedDB */
  async _initDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('riderId', 'riderId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  }

  /** Monitor status koneksi internet */
  _listenConnectivity() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('[OfflineQueue] Koneksi kembali. Mengirim data antrian...');
      this._flushQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('[OfflineQueue] Koneksi terputus. Mode offline aktif.');
    });
  }

  /**
   * Tambahkan titik GPS ke antrian
   * @param {object} point - { riderId, lat, lon, ele, speed, accuracy, heading }
   */
  async enqueue(point) {
    await this._ensureDB();
    const entry = {
      ...point,
      timestamp: Date.now(),
      synced: false,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(entry);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Ambil semua data yang belum ter-sync
   */
  async getPending() {
    await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.filter((r) => !r.synced));
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Jumlah data pending di antrian
   */
  async pendingCount() {
    const pending = await this.getPending();
    return pending.length;
  }

  /**
   * Tandai data sebagai sudah ter-sync
   */
  async markSynced(ids) {
    await this._ensureDB();
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) {
          req.result.synced = true;
          store.put(req.result);
        }
      };
    }
  }

  /**
   * Hapus data yang sudah di-sync (membersihkan antrian)
   */
  async clearSynced() {
    await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const synced = req.result.filter((r) => r.synced);
        synced.forEach((r) => store.delete(r.id));
        resolve(synced.length);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Daftarkan callback yang dipanggil saat flush (sync online)
   * @param {Function} callback - fn(pendingPoints)
   */
  onFlush(callback) {
    this.flushCallbacks.push(callback);
  }

  /**
   * Kirim semua data pending ke server (dipanggil saat online)
   */
  async _flushQueue() {
    const pending = await this.getPending();
    if (pending.length === 0) return;

    console.log(`[OfflineQueue] Mengirim ${pending.length} titik GPS tersimpan...`);
    
    for (const cb of this.flushCallbacks) {
      try {
        await cb(pending);
        await this.markSynced(pending.map((p) => p.id));
        await this.clearSynced();
        console.log(`[OfflineQueue] Berhasil sync ${pending.length} titik GPS.`);
      } catch (err) {
        console.error('[OfflineQueue] Gagal sync:', err);
      }
    }
  }

  /** Pastikan DB sudah siap */
  async _ensureDB() {
    if (!this.db) {
      await this._initDB();
    }
  }

  /** Status ringkas untuk ditampilkan di UI */
  get status() {
    return {
      isOnline: this.isOnline,
    };
  }
}

// Singleton instance
export const offlineQueue = new OfflineQueue();
export default offlineQueue;
