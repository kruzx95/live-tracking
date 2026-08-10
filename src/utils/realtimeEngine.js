/**
 * realtimeEngine.js
 * Manager real-time GPS dengan dukungan SINKRONISASI LINTAS HP / DESKTOP (Cross-Device Sync).
 *
 * Menggunakan 2 Jalur Real-time:
 * 1. BroadcastChannel API : Sinkronisasi instan antar-tab/browser di perangkat yang sama.
 * 2. MQTT over WebSockets   : Sinkronisasi instan antar-HP & Laptop berbeda di internet via broker wss://.
 *
 * Bebas biaya, 0 konfigurasi backend, 100% otomatis tersambung saat dibuka!
 */

import mqtt from 'mqtt';
import { haversineDistance } from './gpxParser';
import offlineQueue from './offlineQueue';
import replayEngine from './replayEngine';

// ── Event Emitter ────────────────────────────────────
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

// Topik MQTT global untuk event komunitas
const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_TOPIC  = 'cyclotrack/event_community/v1';
const BC_CHANNEL  = 'cyclotrack_broadcast_v1';

// ── Realtime Engine ──────────────────────────────────
class RealtimeEngine extends EventEmitter {
  constructor() {
    super();
    this.riders     = new Map(); // riderId -> RiderState
    this.route      = null;      // RouteData dari gpxParser
    this._simTimers = new Map();
    this._deletedRiderIds = new Set();
    this._wakeLock  = null;
    this._geoWatchId = null;
    this.isSyncConnected = false;
    this._clientId = `cyclotrack_${Math.random().toString(36).substring(2, 10)}`;

    // 1. Inisialisasi BroadcastChannel lokal
    this._initBroadcastChannel();

    // 2. Inisialisasi MQTT Global Internet Sync
    this._initMqtt();

    // 3. Listen ke OfflineQueue Flush
    offlineQueue.onFlush((pendingPoints) => {
      pendingPoints.forEach((pt) => {
        this.updateRiderPosition(pt.riderId, pt, true);
      });
    });
  }

  // ── 1. Local BroadcastChannel ─────────────────────
  _initBroadcastChannel() {
    if ('BroadcastChannel' in window) {
      try {
        this._bc = new BroadcastChannel(BC_CHANNEL);
        this._bc.onmessage = (e) => this._handleIncomingMessage(e.data, 'local');
      } catch (err) {
        console.warn('[RealtimeEngine] BroadcastChannel error:', err);
      }
    }
  }

  // ── 2. MQTT Global Internet Relay ─────────────────
  _initMqtt() {
    try {
      this._mqttClient = mqtt.connect(MQTT_BROKER, {
        clientId: this._clientId,
        keepalive: 30,
        reconnectPeriod: 3000,
        clean: true,
      });

      this._mqttClient.on('connect', () => {
        this.isSyncConnected = true;
        console.log('[RealtimeEngine] Connected to Global MQTT Sync Broker!');
        this.emit('sync:connected');
        this._mqttClient.subscribe(MQTT_TOPIC, (err) => {
          if (err) console.error('[RealtimeEngine] MQTT subscribe failed:', err);
        });

        // Minta rute aktif jika kita baru bergabung
        this._publishMessage({ type: 'REQUEST_SYNC' });
      });

      this._mqttClient.on('message', (topic, payload) => {
        try {
          const message = JSON.parse(payload.toString());
          this._handleIncomingMessage(message, 'remote');
        } catch (e) {
          // ignore non-json
        }
      });

      this._mqttClient.on('disconnect', () => {
        this.isSyncConnected = false;
        this.emit('sync:disconnected');
      });

      this._mqttClient.on('error', (err) => {
        console.warn('[RealtimeEngine] MQTT error:', err);
      });
    } catch (err) {
      console.warn('[RealtimeEngine] Could not initialize MQTT client:', err);
    }
  }

  // ── Publish Message ke Lintas Perangkat ───────────
  _publishMessage(data) {
    const payloadWithSender = {
      ...data,
      senderId: this._clientId,
    };
    const jsonStr = JSON.stringify(payloadWithSender);

    // Broadcast ke tab lokal
    if (this._bc) {
      try { this._bc.postMessage(payloadWithSender); } catch (e) {}
    }

    // Publish ke MQTT Broker untuk HP/Desktop lain di internet
    if (this._mqttClient && this.isSyncConnected) {
      try { this._mqttClient.publish(MQTT_TOPIC, jsonStr); } catch (e) {}
    }
  }

  // ── Handle Incoming Messages ──────────────────────
  _handleIncomingMessage(data, origin) {
    if (!data || !data.type) return;

    // Abaikan gema (echo) pesan yang dipublikasikan oleh tab/perangkat ini sendiri
    if (data.senderId && data.senderId === this._clientId) {
      return;
    }

    switch (data.type) {
      case 'ROUTE_UPDATE':
        if (data.route) {
          this.route = data.route;
          this.emit('route:loaded', data.route);
        }
        break;

      case 'RIDER_UPDATE':
        if (data.rider) {
          const r = data.rider;
          this._applyRiderState(r);
        }
        break;

      case 'RIDER_SOS':
        if (data.riderId) {
          const rider = this.riders.get(data.riderId);
          if (rider) {
            const updated = { ...rider, isSOS: data.isSOS, status: data.isSOS ? RIDER_STATUS.SOS : RIDER_STATUS.ACTIVE };
            this.riders.set(data.riderId, updated);
            if (data.isSOS) this.emit('rider:sos', updated);
            else this.emit('rider:sos_cancelled', updated);
            this.emit('riders:updated', this._getRidersArray());
          }
        }
        break;

      case 'RIDER_REMOVE':
        if (data.riderId) {
          this._deletedRiderIds.add(data.riderId);
          this.riders.delete(data.riderId);
          if (this._simTimers.has(data.riderId)) {
            clearInterval(this._simTimers.get(data.riderId));
            this._simTimers.delete(data.riderId);
          }
          this.emit('riders:updated', this._getRidersArray());
        }
        break;

      case 'REQUEST_SYNC':
        // Jika kita punya rute, bagikan rute ke pengguna yang baru join
        if (this.route) {
          this._publishMessage({ type: 'ROUTE_UPDATE', route: this.route });
        }
        // Dan bagikan data rider kita jika ada
        this.riders.forEach((rider) => {
          this._publishMessage({ type: 'RIDER_UPDATE', rider });
        });
        break;

      default:
        break;
    }
  }

  _applyRiderState(remoteRider) {
    // Jika rider ini telah dihapus oleh admin/user, abaikan update ghost
    if (this._deletedRiderIds.has(remoteRider.id)) {
      return;
    }

    // Jika rider ini sedang disimulasikan oleh perangkat ini, abaikan update dari remote
    if (this._simTimers.has(remoteRider.id)) {
      return;
    }

    const existing = this.riders.get(remoteRider.id);

    // Gabungkan path history
    let path = remoteRider.path || [];
    if (existing?.path?.length) {
      path = [...existing.path];
      if (remoteRider.lat != null && remoteRider.lon != null) {
        const lastPt = path[path.length - 1];
        if (!lastPt || lastPt[0] !== remoteRider.lat || lastPt[1] !== remoteRider.lon) {
          path.push([remoteRider.lat, remoteRider.lon]);
          if (path.length > 500) path.shift();
        }
      }
    }

    const updated = {
      ...existing,
      ...remoteRider,
      path,
      lastSeen: Date.now(),
    };

    this.riders.set(remoteRider.id, updated);
    this.emit('rider:moved', updated);
    this.emit('riders:updated', this._getRidersArray());

    // Rekam frame jika mode perekaman aktif
    if (replayEngine.isRecording) {
      replayEngine.recordFrame(updated);
    }
  }

  // ── Route Management ──────────────────────────────
  /**
   * Set rute GPX aktif dan otomatis pancarkan ke seluruh HP rider/penonton lain
   */
  setRoute(routeData, broadcast = true) {
    if (!routeData || !routeData.trackPoints || routeData.trackPoints.length === 0) return;

    // Pre-calculate cumulative distance (meter) untuk setiap titik rute
    const points = routeData.trackPoints;
    const cumDists = [0];
    let totalMeters = 0;
    for (let i = 1; i < points.length; i++) {
      const dKm = haversineDistance(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
      totalMeters += dKm * 1000;
      cumDists.push(totalMeters);
    }
    this._routeCumDists = cumDists;
    this._routeTotalMeters = totalMeters;

    this.route = routeData;
    this.emit('route:loaded', routeData);

    if (broadcast) {
      this._publishMessage({
        type: 'ROUTE_UPDATE',
        route: routeData,
        timestamp: Date.now(),
      });
    }
  }

  // ── Rider Management ──────────────────────────────
  addRider(id, name, color = '#00c6ff', broadcast = true) {
    this._deletedRiderIds.delete(id); // Izinkan pendaftaran baru dengan ID ini jika sebelumnya dihapus
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
      lastSeen: Date.now(),
      isOffCourse: false,
      isSOS: false,
      path: [],
    };
    this.riders.set(id, rider);
    this.emit('riders:updated', this._getRidersArray());

    if (broadcast) {
      this._publishMessage({ type: 'RIDER_UPDATE', rider });
    }
    return rider;
  }

  getRider(id) { return this.riders.get(id); }

  updateRiderPosition(id, { lat, lon, ele = 0, speed = 0, heading = 0, accuracy = 0 }, broadcast = true) {
    const rider = this.riders.get(id);
    if (!rider) return;

    let distanceTraveled = rider.distanceTraveled;
    let isOffCourse = false;

    if (this.route?.trackPoints?.length > 0) {
      if (rider.lat !== null) {
        const delta = haversineDistance(rider.lat, rider.lon, lat, lon);
        distanceTraveled = parseFloat((rider.distanceTraveled + delta).toFixed(3));
      }

      // Deteksi off-course: periksa jarak ke titik rute terdekat tanpa loncat titik (sample 100 max)
      const sampleStep = Math.max(1, Math.floor(this.route.trackPoints.length / 100));
      let minDistToRoute = Infinity;
      for (let i = 0; i < this.route.trackPoints.length; i += sampleStep) {
        const pt = this.route.trackPoints[i];
        const d = haversineDistance(lat, lon, pt.lat, pt.lon);
        if (d < minDistToRoute) minDistToRoute = d;
      }
      isOffCourse = minDistToRoute > 0.2; // 200 meter dari rute
    }

    const distanceToFinish = this.route
      ? Math.max(0, this.route.stats.totalDistance - distanceTraveled)
      : 0;

    let status = rider.isSOS ? RIDER_STATUS.SOS : RIDER_STATUS.ACTIVE;
    if (isOffCourse && !rider.isSOS) status = RIDER_STATUS.OFFCOURSE;

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

    // Broadcast ke perangkat lain
    if (broadcast) {
      if (navigator.onLine) {
        this._publishMessage({ type: 'RIDER_UPDATE', rider: updated });
      } else {
        // Jika offline, enqueue ke IndexDB buffer
        offlineQueue.enqueue({ riderId: id, lat, lon, ele, speed, accuracy, heading });
      }
    }
  }

  triggerSOS(id) {
    const rider = this.riders.get(id);
    if (!rider) return;
    const updated = { ...rider, isSOS: true, status: RIDER_STATUS.SOS };
    this.riders.set(id, updated);
    this.emit('rider:sos', updated);
    this.emit('riders:updated', this._getRidersArray());

    this._publishMessage({ type: 'RIDER_SOS', riderId: id, isSOS: true });
  }

  cancelSOS(id) {
    const rider = this.riders.get(id);
    if (!rider) return;
    const updated = { ...rider, isSOS: false, status: RIDER_STATUS.ACTIVE };
    this.riders.set(id, updated);
    this.emit('rider:sos_cancelled', updated);
    this.emit('riders:updated', this._getRidersArray());

    this._publishMessage({ type: 'RIDER_SOS', riderId: id, isSOS: false });
  }

  removeRider(id, broadcast = true) {
    this._stopSimulator(id);
    this._deletedRiderIds.add(id);
    this.riders.delete(id);
    this.emit('riders:updated', this._getRidersArray());

    if (broadcast) {
      this._publishMessage({ type: 'RIDER_REMOVE', riderId: id });
    }
  }

  _getRidersArray() {
    return Array.from(this.riders.values()).sort(
      (a, b) => b.distanceTraveled - a.distanceTraveled
    );
  }

  // ── Simulator Mode ────────────────────────────────
  startSimulator(riderId, speedKmh = 25, startProgress = 0) {
    if (!this.route?.trackPoints?.length || !this._routeCumDists) return;

    if (this._simTimers.has(riderId)) {
      this._stopSimulator(riderId);
    }

    const points = this.route.trackPoints;
    const cumDists = this._routeCumDists;
    const totalMeters = this._routeTotalMeters || cumDists[cumDists.length - 1];

    let currentMeters = startProgress * totalMeters;
    const metersPerSecond = (speedKmh * 1000) / 3600;
    const UPDATE_INTERVAL = 1000; // update setiap 1 detik

    const timer = setInterval(() => {
      currentMeters += metersPerSecond;

      if (currentMeters >= totalMeters) {
        const rider = this.riders.get(riderId);
        if (rider) {
          const lastPt = points[points.length - 1];
          this.updateRiderPosition(riderId, {
            lat: lastPt.lat,
            lon: lastPt.lon,
            ele: lastPt.ele,
            speed: 0,
            heading: 0,
            accuracy: 5,
          }, true);
          const updated = { ...this.riders.get(riderId), status: RIDER_STATUS.FINISHED };
          this.riders.set(riderId, updated);
          this.emit('riders:updated', this._getRidersArray());
        }
        this._stopSimulator(riderId);
        return;
      }

      // Cari segmen rute [i, i+1] tempat rider berada saat ini
      let idx = 0;
      while (idx < cumDists.length - 2 && cumDists[idx + 1] <= currentMeters) {
        idx++;
      }

      const curr = points[idx];
      const next = points[idx + 1] || curr;
      const segStartMeters = cumDists[idx];
      const segEndMeters = cumDists[idx + 1] || (segStartMeters + 1);
      const segLen = segEndMeters - segStartMeters;

      const t = segLen > 0 ? Math.min(1, Math.max(0, (currentMeters - segStartMeters) / segLen)) : 0;

      const lat = curr.lat + t * (next.lat - curr.lat);
      const lon = curr.lon + t * (next.lon - curr.lon);
      const ele = curr.ele + t * (next.ele - curr.ele);
      const heading = Math.atan2(next.lon - curr.lon, next.lat - curr.lat) * (180 / Math.PI);

      this.updateRiderPosition(riderId, {
        lat,
        lon,
        ele: Math.round(ele),
        speed: speedKmh + (Math.random() - 0.5) * 3,
        heading,
        accuracy: 5,
      }, true);
    }, UPDATE_INTERVAL);

    this._simTimers.set(riderId, timer);
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

  // ── Live GPS Watcher ──────────────────────────────
  startLiveGPS(riderId, mode = 'normal') {
    if (!('geolocation' in navigator)) {
      this.emit('error', 'GPS tidak tersedia di perangkat ini.');
      return;
    }

    const interval = TRANSMISSION_INTERVAL[mode.toUpperCase()] || TRANSMISSION_INTERVAL.NORMAL;

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
          speed: speed ? speed * 3.6 : 0,
          heading: heading || 0,
          accuracy: accuracy || 0,
        }, true);
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
      this._wakeLock.addEventListener('release', () => this.emit('wakelock:released'));
      this.emit('wakelock:active');
      return true;
    } catch (err) {
      return false;
    }
  }

  releaseWakeLock() {
    if (this._wakeLock) {
      this._wakeLock.release();
      this._wakeLock = null;
    }
  }
}

export const engine = new RealtimeEngine();
export default engine;
