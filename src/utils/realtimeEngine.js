/**
 * realtimeEngine.js
 * Manager real-time GPS — dua mode:
 * 1. LIVE MODE   : Terima posisi dari GPS HP peserta nyata (via BroadcastChannel / localStorage shared)
 * 2. SIMULATOR   : Gerakkan rider simulasi di sepanjang GPX trackPoints secara otomatis (testing indoor)
 *
 * Arsitektur: Event-driven (pubsub sederhana) — komponen React subscribe ke update posisi
 */

import { haversineDistance, estimateDistanceTraveled, isOffCourse as checkOffCourse } from './gpxParser';

// ── Event Emitter ringan ─────────────────────────────
class EventEmitter {
  constructor() { this._listeners = {}; }
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this._listeners[event] = (this._listeners[event] || []).filter((l) => l !== fn);
  }
  emit(event, data) {
    (this._listeners[event] || []).forEach((fn) => fn(data));
  }
}

// ── Constants ────────────────────────────────────────
export const RIDER_STATUS = {
  ACTIVE:     'active',
  STOPPED:    'stopped',
  OFFCOURSE:  'offcourse',
  SOS:        'sos',
  FINISHED:   'finished',
  DNF:        'dnf',
};

export const TRANSMISSION_INTERVAL = {
  HIGH:   3000,  // ms — High precision mode
  NORMAL: 8000,  // ms — Standard mode
  SAVER:  20000, // ms — Battery saver mode
};

// ── Realtime Engine ──────────────────────────────────
class RealtimeEngine extends EventEmitter {
  constructor() {
    super();
    this.riders   = new Map(); // riderId -> RiderState
    this.route    = null;      // RouteData dari gpxParser
    this._simTimers = new Map();
    this._channel = null;
    this._wakeLock = null;
    this._geoWatchId = null;
  }

  // ── Route ─────────────────────────────────────────
  setRoute(routeData) {
    this.route = routeData;
    this.emit('route:loaded', routeData);
  }

  // ── Rider State Management ─────────────────────────
  addRider(id, name, color = '#00c6ff') {
    const rider = {
      id,
      name,
      color,
      lat: null,
      lon: null,
      ele: 0,
      speed: 0,
      heading: 0,
      accuracy: 0,
      distanceTraveled: 0,
      distanceToFinish: 0,
      status: RIDER_STATUS.ACTIVE,
      lastSeen: null,
      isOffCourse: false,
      isSOS: false,
      path: [], // history koordinat untuk trail line
    };
    this.riders.set(id, rider);
    this.emit('riders:updated', this._getRidersArray());
    return rider;
  }

  getRider(id) { return this.riders.get(id); }

  updateRiderPosition(id, { lat, lon, ele = 0, speed = 0, heading = 0, accuracy = 0 }) {
    const rider = this.riders.get(id);
    if (!rider) return;

    // Hitung estimasi jarak tempuh ke titik GPX terdekat
    let distanceTraveled = rider.distanceTraveled;
    let isOffCourse = false;

    if (this.route?.trackPoints?.length > 0) {
      // Hitung akumulasi jarak berdasarkan pergerakan dari posisi sebelumnya
      if (rider.lat !== null) {
        const delta = haversineDistance(rider.lat, rider.lon, lat, lon);
        distanceTraveled = parseFloat((rider.distanceTraveled + delta).toFixed(3));
      }

      // Off-course check: jarak min ke rute > 200m
      const minDistToRoute = Math.min(
        ...this.route.trackPoints
          .filter((_, i) => i % 5 === 0) // sample tiap 5 titik untuk performa
          .map((pt) => haversineDistance(lat, lon, pt.lat, pt.lon))
      );
      isOffCourse = minDistToRoute > 0.2; // 200m
    }

    // Estimasi jarak ke finish
    const distanceToFinish = this.route
      ? Math.max(0, this.route.stats.totalDistance - distanceTraveled)
      : 0;

    // Update status otomatis
    let status = rider.isSOS ? RIDER_STATUS.SOS : RIDER_STATUS.ACTIVE;
    if (isOffCourse && !rider.isSOS) status = RIDER_STATUS.OFFCOURSE;

    // Tambahkan ke trail path (simpan max 500 titik terakhir)
    const path = [...rider.path, [lat, lon]];
    if (path.length > 500) path.shift();

    const updated = {
      ...rider,
      lat, lon, ele, speed, heading, accuracy,
      distanceTraveled,
      distanceToFinish,
      isOffCourse,
      status,
      lastSeen: Date.now(),
      path,
    };

    this.riders.set(id, updated);
    this.emit('rider:moved', updated);
    this.emit('riders:updated', this._getRidersArray());
  }

  triggerSOS(id) {
    const rider = this.riders.get(id);
    if (!rider) return;
    const updated = { ...rider, isSOS: true, status: RIDER_STATUS.SOS };
    this.riders.set(id, updated);
    this.emit('rider:sos', updated);
    this.emit('riders:updated', this._getRidersArray());
  }

  cancelSOS(id) {
    const rider = this.riders.get(id);
    if (!rider) return;
    const updated = { ...rider, isSOS: false, status: RIDER_STATUS.ACTIVE };
    this.riders.set(id, updated);
    this.emit('rider:sos_cancelled', updated);
    this.emit('riders:updated', this._getRidersArray());
  }

  removeRider(id) {
    this._stopSimulator(id);
    this.riders.delete(id);
    this.emit('riders:updated', this._getRidersArray());
  }

  _getRidersArray() {
    return Array.from(this.riders.values()).sort(
      (a, b) => b.distanceTraveled - a.distanceTraveled
    );
  }

  // ── SIMULATOR MODE ────────────────────────────────
  /**
   * Jalankan rider simulasi di sepanjang rute GPX
   * @param {string} riderId
   * @param {number} speedKmh - Kecepatan simulasi (default 25 km/h)
   * @param {number} startProgress - Mulai dari progress 0.0–1.0
   */
  startSimulator(riderId, speedKmh = 25, startProgress = 0) {
    if (!this.route?.trackPoints?.length) {
      console.warn('[Simulator] Belum ada rute GPX. Load rute dulu.');
      return;
    }

    if (this._simTimers.has(riderId)) {
      this._stopSimulator(riderId);
    }

    const trackPoints = this.route.trackPoints;
    const totalPoints = trackPoints.length;

    // Hitung index awal berdasarkan startProgress
    let currentIndex = Math.floor(startProgress * totalPoints);

    // Interval update setiap 1 detik
    // Simulasi kecepatan: jarak per interval = speedKmh / 3600 km per detik
    const metersPerSecond = (speedKmh * 1000) / 3600;
    const UPDATE_INTERVAL = 1000; // ms
    const metersPerUpdate = metersPerSecond * (UPDATE_INTERVAL / 1000);

    // Akumulasi sisa jarak antar titik
    let overflow = 0;

    const timer = setInterval(() => {
      if (currentIndex >= totalPoints - 1) {
        // Selesai — tandai finished
        const rider = this.riders.get(riderId);
        if (rider) {
          const updated = { ...rider, status: RIDER_STATUS.FINISHED };
          this.riders.set(riderId, updated);
          this.emit('riders:updated', this._getRidersArray());
        }
        this._stopSimulator(riderId);
        return;
      }

      // Gerak maju di sepanjang track
      let moved = metersPerUpdate + overflow;
      overflow = 0;

      while (moved > 0 && currentIndex < totalPoints - 1) {
        const curr = trackPoints[currentIndex];
        const next = trackPoints[currentIndex + 1];
        const segDist = haversineDistance(curr.lat, curr.lon, next.lat, next.lon) * 1000; // m

        if (moved >= segDist) {
          moved -= segDist;
          currentIndex++;
        } else {
          // Interpolasi posisi di tengah segmen
          const t = moved / segDist;
          const lat = curr.lat + t * (next.lat - curr.lat);
          const lon = curr.lon + t * (next.lon - curr.lon);
          const ele = curr.ele + t * (next.ele - curr.ele);
          
          // Hitung heading
          const heading = Math.atan2(next.lon - curr.lon, next.lat - curr.lat) * (180 / Math.PI);

          // Tambahkan noise kecil supaya berasa natural
          const jitter = () => (Math.random() - 0.5) * 0.00005;

          this.updateRiderPosition(riderId, {
            lat: lat + jitter(),
            lon: lon + jitter(),
            ele: Math.round(ele),
            speed: speedKmh + (Math.random() - 0.5) * 4,
            heading,
            accuracy: 5,
          });

          overflow = 0;
          break;
        }
      }

      if (currentIndex >= totalPoints - 1) {
        this.updateRiderPosition(riderId, trackPoints[totalPoints - 1]);
      }

    }, UPDATE_INTERVAL);

    this._simTimers.set(riderId, timer);
    console.log(`[Simulator] Rider "${riderId}" dimulai @ ${speedKmh} km/h`);
  }

  _stopSimulator(riderId) {
    const timer = this._simTimers.get(riderId);
    if (timer) {
      clearInterval(timer);
      this._simTimers.delete(riderId);
    }
  }

  stopAllSimulators() {
    this._simTimers.forEach((_, riderId) => this._stopSimulator(riderId));
  }

  // ── LIVE GPS (HP Rider nyata) ─────────────────────
  /**
   * Mulai memancarkan posisi GPS HP ke engine
   * @param {string} riderId
   * @param {'high'|'normal'|'saver'} mode - Mode interval update
   */
  startLiveGPS(riderId, mode = 'normal') {
    if (!('geolocation' in navigator)) {
      this.emit('error', 'GPS tidak tersedia di perangkat ini.');
      return;
    }

    const interval = TRANSMISSION_INTERVAL[mode.toUpperCase()] || TRANSMISSION_INTERVAL.NORMAL;

    // Clear watcher lama
    if (this._geoWatchId !== null) {
      navigator.geolocation.clearWatch(this._geoWatchId);
    }

    this._geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, altitude, speed, heading, accuracy } = pos.coords;
        this.updateRiderPosition(riderId, {
          lat: latitude,
          lon: longitude,
          ele: altitude || 0,
          speed: speed ? speed * 3.6 : 0, // m/s → km/h
          heading: heading || 0,
          accuracy: accuracy || 0,
        });
        this.emit('gps:update', { lat: latitude, lon: longitude, accuracy });
      },
      (err) => {
        console.error('[LiveGPS] Error:', err);
        this.emit('gps:error', err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: Math.min(interval, 5000),
      }
    );

    console.log(`[LiveGPS] Rider "${riderId}" mulai tracking (mode: ${mode})`);
  }

  stopLiveGPS() {
    if (this._geoWatchId !== null) {
      navigator.geolocation.clearWatch(this._geoWatchId);
      this._geoWatchId = null;
    }
  }

  // ── Wake Lock ─────────────────────────────────────
  async requestWakeLock() {
    if (!('wakeLock' in navigator)) return false;
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      this._wakeLock.addEventListener('release', () => {
        this.emit('wakelock:released');
      });
      this.emit('wakelock:active');
      return true;
    } catch (err) {
      console.warn('[WakeLock]', err);
      return false;
    }
  }

  releaseWakeLock() {
    if (this._wakeLock) {
      this._wakeLock.release();
      this._wakeLock = null;
    }
  }

  // ── Cleanup ───────────────────────────────────────
  destroy() {
    this.stopAllSimulators();
    this.stopLiveGPS();
    this.releaseWakeLock();
    this.riders.clear();
    this._listeners = {};
  }
}

// Singleton instance
export const engine = new RealtimeEngine();
export default engine;
