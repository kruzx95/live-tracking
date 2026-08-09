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
    this._wakeLock  = null;
    this._geoWatchId = null;
    this.isSyncConnected = false;

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
        clientId: `cyclotrack_${Math.random().toString(16).substring(2, 10)}`,
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
    const jsonStr = JSON.stringify(data);

    // Broadcast ke tab lokal
    if (this._bc) {
      try { this._bc.postMessage(data); } catch (e) {}
    }

    // Publish ke MQTT Broker untuk HP/Desktop lain di internet
    if (this._mqttClient && this.isSyncConnected) {
      try { this._mqttClient.publish(MQTT_TOPIC, jsonStr); } catch (e) {}
    }
  }

  // ── Handle Incoming Messages ──────────────────────
  _handleIncomingMessage(data, origin) {
    if (!data || !data.type) return;

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
  }

  // ── Route Management ──────────────────────────────
  /**
   * Set rute GPX aktif dan otomatis pancarkan ke seluruh HP rider/penonton lain
   */
  setRoute(routeData, broadcast = true) {
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

      const minDistToRoute = Math.min(
        ...this.route.trackPoints
          .filter((_, i) => i % 5 === 0)
          .map((pt) => haversineDistance(lat, lon, pt.lat, pt.lon))
      );
      isOffCourse = minDistToRoute > 0.2; // 200m
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

  // ── Simulator Mode ────────────────────────────────
  startSimulator(riderId, speedKmh = 25, startProgress = 0) {
    if (!this.route?.trackPoints?.length) return;

    if (this._simTimers.has(riderId)) {
      this._stopSimulator(riderId);
    }

    const trackPoints = this.route.trackPoints;
    const totalPoints = trackPoints.length;
    let currentIndex = Math.floor(startProgress * totalPoints);

    const metersPerSecond = (speedKmh * 1000) / 3600;
    const UPDATE_INTERVAL = 1000;
    const metersPerUpdate = metersPerSecond * (UPDATE_INTERVAL / 1000);
    let overflow = 0;

    const timer = setInterval(() => {
      if (currentIndex >= totalPoints - 1) {
        const rider = this.riders.get(riderId);
        if (rider) {
          const updated = { ...rider, status: RIDER_STATUS.FINISHED };
          this.riders.set(riderId, updated);
          this.emit('riders:updated', this._getRidersArray());
        }
        this._stopSimulator(riderId);
        return;
      }

      let moved = metersPerUpdate + overflow;
      overflow = 0;

      while (moved > 0 && currentIndex < totalPoints - 1) {
        const curr = trackPoints[currentIndex];
        const next = trackPoints[currentIndex + 1];
        const segDist = haversineDistance(curr.lat, curr.lon, next.lat, next.lon) * 1000;

        if (moved >= segDist) {
          moved -= segDist;
          currentIndex++;
        } else {
          const t = moved / segDist;
          const lat = curr.lat + t * (next.lat - curr.lat);
          const lon = curr.lon + t * (next.lon - curr.lon);
          const ele = curr.ele + t * (next.ele - curr.ele);
          const heading = Math.atan2(next.lon - curr.lon, next.lat - curr.lat) * (180 / Math.PI);
          const jitter = () => (Math.random() - 0.5) * 0.00005;

          this.updateRiderPosition(riderId, {
            lat: lat + jitter(),
            lon: lon + jitter(),
            ele: Math.round(ele),
            speed: speedKmh + (Math.random() - 0.5) * 4,
            heading,
            accuracy: 5,
          }, true);

          overflow = 0;
          break;
        }
      }
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
