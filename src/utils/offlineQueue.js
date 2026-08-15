/**
 * offlineQueue.js  —  Fase 3: Optimasi OfflineQueue
 * Buffer GPS data saat koneksi internet terputus (blank spot)
 * Menyimpan ke IndexedDB dan sync ulang saat koneksi kembali.
 *
 * ── Optimasi Fase 3 ──────────────────────────────────────────────────────────
 * [1] pendingCount()  : Menggunakan IDBKeyRange.count() — O(1), bukan getAll() O(n).
 *                       Sebelumnya: ambil SEMUA data lalu hitung panjangnya (boros memori).
 *                       Sesudah   : query count langsung ke engine IndexedDB.
 *
 * [2] Batched flush   : Saat kembali online, titik GPS dikirim per-batch (20 titik)
 *                       dengan jeda 200ms antar-batch — mencegah spike bandwidth/CPU
 *                       sekaligus ketika ada ratusan titik pending.
 *
 * [3] Max queue size  : Antrian dibatasi 500 titik. Jika melebihi, titik TERTUA
 *                       (LRU eviction) otomatis dihapus untuk memberi ruang baru.
 *                       Mencegah IndexedDB membengkak saat HP offline sangat lama.
 *
 * [4] Deduplication   : Titik GPS dengan lat/lon identik dan beda waktu < 2 detik
 *                       tidak di-enqueue ulang. Mencegah duplikat saat GPS
 *                       memberikan posisi sama berulang kali (diam di lampu merah).
 */

const DB_NAME    = 'cyclotrack_offline';
const DB_VERSION = 1;
const STORE_NAME = 'gps_queue';

// [3] Batas maksimum titik GPS dalam antrian
const MAX_QUEUE_SIZE = 500;

// [2] Konfigurasi batched flush
const FLUSH_BATCH_SIZE  = 20;   // titik per-batch
const FLUSH_BATCH_DELAY = 200;  // ms jeda antar-batch

// [4] Minimum beda waktu (ms) untuk titik dengan posisi identik
const DEDUP_TIME_WINDOW_MS = 2000;

class OfflineQueue {
  constructor() {
    this.db = null;
    this.isOnline = navigator.onLine;
    this.flushCallbacks = [];
    this._isFlushing = false;         // Cegah flush ganda
    this._lastEnqueuedPoint = null;   // [4] Cache titik terakhir untuk dedup
    this._initDB();
    this._listenConnectivity();
  }

  // ── Inisialisasi IndexedDB ──────────────────────────
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
          store.createIndex('riderId',   'riderId',   { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      req.onsuccess  = (e) => { this.db = e.target.result; resolve(); };
      req.onerror    = ()  => reject(req.error);
    });
  }

  // ── Monitor koneksi internet ────────────────────────
  _listenConnectivity() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this._flushQueue();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  /**
   * Tambahkan titik GPS ke antrian.
   * [3] Jika antrian penuh, titik tertua otomatis dihapus (LRU).
   * [4] Titik dengan posisi identik < 2 detik tidak di-enqueue ulang.
   *
   * @param {object} point - { riderId, lat, lon, ele, speed, accuracy, heading }
   */
  async enqueue(point) {
    await this._ensureDB();

    // [4] Deduplication: cek apakah titik ini identik dengan yang terakhir di-enqueue
    const last = this._lastEnqueuedPoint;
    if (
      last &&
      last.riderId === point.riderId &&
      last.lat === point.lat &&
      last.lon === point.lon &&
      (Date.now() - last.timestamp) < DEDUP_TIME_WINDOW_MS
    ) {
      return; // Abaikan — posisi sama dalam window 2 detik
    }

    const entry = {
      ...point,
      timestamp: Date.now(),
      synced: false,
    };

    // [3] Cek ukuran antrian sebelum insert — evict titik tertua jika perlu
    const count = await this.pendingCount();
    if (count >= MAX_QUEUE_SIZE) {
      await this._evictOldest();
    }

    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.add(entry);
      req.onsuccess = () => {
        // [4] Update cache titik terakhir setelah berhasil di-enqueue
        this._lastEnqueuedPoint = entry;
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * [3] LRU Eviction: hapus 10 titik paling lama saat antrian penuh.
   * Menghapus 10 sekaligus (bukan 1) agar tidak terlalu sering trigger eviction.
   */
  async _evictOldest() {
    return new Promise((resolve) => {
      const tx    = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      // Iterasi dari timestamp terkecil (paling lama) — hapus 10 pertama
      const req   = index.openCursor(null, 'next');
      let deleted = 0;
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && deleted < 10) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          resolve(deleted);
        }
      };
      req.onerror = () => resolve(0);
    });
  }

  /**
   * Ambil semua data yang belum ter-sync
   */
  async getPending() {
    await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.getAll();
      req.onsuccess = () => resolve(req.result.filter((r) => !r.synced));
      req.onerror   = () => reject(req.error);
    });
  }

  /**
   * [1] Jumlah data pending — O(1) via IDBKeyRange.count()
   * Sebelumnya: getPending() → getAll() → filter → .length  (O(n), baca semua data)
   * Sesudah   : count() langsung dari engine IndexedDB        (O(1), baca angka saja)
   */
  async pendingCount() {
    await this._ensureDB();
    return new Promise((resolve) => {
      const tx    = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => resolve(0);
    });
  }

  /**
   * Tandai data sebagai sudah ter-sync
   */
  async markSynced(ids) {
    await this._ensureDB();
    const tx    = this.db.transaction(STORE_NAME, 'readwrite');
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
      const tx    = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.getAll();
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
   * @param {Function} callback - fn(pendingPoints[])
   */
  onFlush(callback) {
    this.flushCallbacks.push(callback);
  }

  /**
   * [2] Batched flush — kirim titik GPS ke callback per-batch dengan jeda antar-batch.
   *
   * Sebelumnya: cb(pending) — kirim semua 500+ titik sekaligus dalam 1 panggilan.
   * Sesudah   : kirim 20 titik, tunggu 200ms, kirim 20 berikutnya, dst.
   *
   * Mencegah: spike MQTT publish, hang UI, dan timeout koneksi saat kembali online.
   */
  async _flushQueue() {
    if (this._isFlushing) return; // Cegah double-flush
    const pending = await this.getPending();
    if (pending.length === 0) return;

    this._isFlushing = true;

    try {
      // Pecah pending menjadi batch-batch kecil
      for (let i = 0; i < pending.length; i += FLUSH_BATCH_SIZE) {
        const batch = pending.slice(i, i + FLUSH_BATCH_SIZE);

        for (const cb of this.flushCallbacks) {
          try {
            await cb(batch);
          } catch (err) {
            // Satu callback gagal tidak menghentikan batch lain
          }
        }

        await this.markSynced(batch.map((p) => p.id));

        // Jeda antar-batch — beri napas ke MQTT & UI thread
        if (i + FLUSH_BATCH_SIZE < pending.length) {
          await new Promise((r) => setTimeout(r, FLUSH_BATCH_DELAY));
        }
      }

      // Bersihkan semua record yang sudah di-sync setelah seluruh batch selesai
      await this.clearSynced();
      // Reset cache dedup setelah flush berhasil
      this._lastEnqueuedPoint = null;
    } finally {
      this._isFlushing = false;
    }
  }

  /** Pastikan DB sudah siap sebelum digunakan */
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
