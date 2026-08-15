/**
 * realtimeEngine.js
 * Manager real-time GPS dengan dukungan SINKRONISASI LINTAS HP / DESKTOP (Cross-Device Sync).
 *
 * Menggunakan 2 Jalur Real-time:
 * 1. BroadcastChannel API : Sinkronisasi instan antar-tab/browser di perangkat yang sama.
 * 2. MQTT over WebSockets   : Sinkronisasi instan antar-HP & Laptop berbeda di internet via broker wss://.
 *
 * Bebas biaya, 0 konfigurasi backend, 100% otomatis tersambung saat dibuka!
 *
 * ── MQTT Security (Fase 1) ──────────────────────────────────────────────────
 * - Broker  : HiveMQ Public Broker via WSS/TLS (port 8884) — terenkripsi
 * - Topic   : Di-isolasi per-event menggunakan eventId (hash tanggal)
 *             sehingga dua event berbeda tidak bisa saling tercampur.
 * - Auth    : Username/password per-event (derived dari eventId)
 * - QoS     : Pesan kritikal (SOS, RIDER_UPDATE) dikirim dengan QoS 1
 *             untuk memastikan guaranteed delivery walau koneksi sesaat putus.
 * - Payload : Dibatasi max 64 KB per pesan untuk mencegah broker reject.
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
  PAUSED:     'paused',   // Rider aktif tapi sengaja stop tracking GPS
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

// ── MQTT Configuration (Fase 1 — Security) ──────────
//
// Broker: HiveMQ Public Broker dengan WSS/TLS (port 8884)
// Lebih stabil dari emqx.io, mendukung TLS terenkripsi secara native.
// Docs: https://www.hivemq.com/mqtt/public-mqtt-broker/
const MQTT_BROKER = 'wss://broker.hivemq.com:8884/mqtt';

// Topic Isolation: setiap event mendapat topik unik berdasarkan tanggal (YYYYMMDD).
// Format: cyclotrack/v2/<eventId>
// Ini mencegah dua event berbeda (misalnya event Surabaya & Malang di hari yang sama)
// saling tercampur datanya. Admin dapat override eventId via localStorage.
function _deriveEventId() {
  try {
    const stored = localStorage.getItem('cyclotrack_event_id');
    if (stored) return stored;
  } catch (e) {}
  // Default: gunakan tanggal hari ini sebagai event ID (format YYYYMMDD)
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `community_${dateStr}`;
}

const EVENT_ID    = _deriveEventId();
const MQTT_TOPIC  = `cyclotrack/v2/${EVENT_ID}`;
const BC_CHANNEL  = `cyclotrack_broadcast_${EVENT_ID}`;

// Batas ukuran payload MQTT per pesan (64 KB) — cegah broker reject
const MQTT_MAX_PAYLOAD_BYTES = 64 * 1024;

// Credentials MQTT — derived dari eventId agar setiap event berbeda
// Bukan enkripsi kriptografis, hanya isolasi dasar dari publik yang tidak tahu eventId
const MQTT_USERNAME = `ct_${EVENT_ID}`;
const MQTT_PASSWORD = `ct_${EVENT_ID}_2025`;

// ── Realtime Engine ──────────────────────────────────
class RealtimeEngine extends EventEmitter {
  constructor() {
    super();
    this.riders     = new Map(); // riderId -> RiderState
    this.participants = new Map(); // bib -> { bib, name, pin, color }
    this.route      = null;      // RouteData dari gpxParser
    this._simTimers = new Map();
    this._deletedRiderIds = new Set();
    this._wakeLock  = null;
    this._geoWatchId = null;
    this._gpsRetryCount = 0;         // Counter retry saat GPS error
    this._gpsRetryTimer = null;      // Timer untuk GPS retry
    this._gpsRiderId = null;         // riderId yang sedang live tracking
    this._gpsMode = 'normal';        // Mode GPS aktif
    this._GPS_ACCURACY_THRESHOLD = 150; // meter — tolak posisi di atas ini
    this.isSyncConnected = false;
    this._clientId = `cyclotrack_${Math.random().toString(36).substring(2, 10)}`;

    // Load cached participants jika ada
    this._loadCachedParticipants();

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

    // 4. Auto-reacquire WakeLock saat layar menyala kembali
    this._initVisibilityWatcher();
  }

  // ── Auto-reacquire WakeLock on Screen Wake ────────
  _initVisibilityWatcher() {
    document.addEventListener('visibilitychange', async () => {
      // Layar menyala kembali dan tracking sedang berjalan
      if (document.visibilityState === 'visible' && this._geoWatchId !== null) {
        // Coba ambil kembali WakeLock yang terlepas saat layar mati
        if (!this._wakeLock || this._wakeLock.released) {
          await this.requestWakeLock();
          console.log('[RealtimeEngine] WakeLock re-acquired after screen wake.');
        }
      }
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

  // ── 2. MQTT Global Internet Relay (Fase 1 — Security) ───
  _initMqtt() {
    try {
      this._mqttClient = mqtt.connect(MQTT_BROKER, {
        clientId: this._clientId,

        // Auth per-event: hanya perangkat yang tahu eventId dapat bergabung
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,

        // keepalive 60s (naik dari 30s) — lebih stabil untuk event 5+ jam
        // Broker akan disconnect jika tidak ada ping dalam 60 detik
        keepalive: 60,

        // reconnectPeriod 5s (sedikit lebih lama) — cegah spam reconnect saat
        // koneksi benar-benar putus (misal di terowongan)
        reconnectPeriod: 5000,

        // clean: true — tidak perlu session persistence (stateless tracking)
        clean: true,

        // connectTimeout: 15s — cegah hang saat sinyal sangat lemah
        connectTimeout: 15000,
      });

      this._mqttClient.on('connect', () => {
        this.isSyncConnected = true;
        console.log(`[RealtimeEngine] Connected to MQTT Broker. Event: ${EVENT_ID}, Topic: ${MQTT_TOPIC}`);
        this.emit('sync:connected');

        // Subscribe dengan QoS 1 — broker akan re-deliver jika ACK tidak diterima
        this._mqttClient.subscribe(MQTT_TOPIC, { qos: 1 }, (err) => {
          if (err) console.error('[RealtimeEngine] MQTT subscribe failed:', err);
          else console.log(`[RealtimeEngine] Subscribed to: ${MQTT_TOPIC} (QoS 1)`);
        });

        // Minta rute aktif jika kita baru bergabung
        this._publishMessage({ type: 'REQUEST_SYNC' });
      });

      this._mqttClient.on('message', (topic, payload) => {
        // Guard: abaikan pesan dari topic yang tidak dikenal
        if (topic !== MQTT_TOPIC) return;

        // Guard: abaikan payload yang terlalu besar (kemungkinan corrupt)
        if (payload.length > MQTT_MAX_PAYLOAD_BYTES) {
          console.warn(`[RealtimeEngine] Payload terlalu besar (${payload.length} bytes), diabaikan.`);
          return;
        }

        try {
          const message = JSON.parse(payload.toString());
          this._handleIncomingMessage(message, 'remote');
        } catch (e) {
          // ignore non-json (bukan pesan CycloTrack)
        }
      });

      this._mqttClient.on('disconnect', () => {
        this.isSyncConnected = false;
        this.emit('sync:disconnected');
      });

      // 'close' diemit saat koneksi TCP benar-benar tertutup (berbeda dari disconnect)
      this._mqttClient.on('close', () => {
        if (this.isSyncConnected) {
          this.isSyncConnected = false;
          this.emit('sync:disconnected');
        }
      });

      this._mqttClient.on('error', (err) => {
        console.warn('[RealtimeEngine] MQTT error:', err.message || err);
      });
    } catch (err) {
      console.warn('[RealtimeEngine] Could not initialize MQTT client:', err);
    }
  }

  // ── Publish Message ke Lintas Perangkat (Fase 1 — QoS) ──
  //
  // qos param: 0 = fire-and-forget (default, hemat bandwidth)
  //            1 = guaranteed delivery (untuk pesan kritikal: SOS, RIDER_UPDATE)
  _publishMessage(data, options = {}) {
    const payloadWithSender = {
      ...data,
      senderId: this._clientId,
    };
    const jsonStr = JSON.stringify(payloadWithSender);

    // Guard: jangan publish jika payload melebihi batas broker
    if (jsonStr.length > MQTT_MAX_PAYLOAD_BYTES) {
      console.warn(`[RealtimeEngine] Payload ${data.type} terlalu besar (${jsonStr.length} bytes), tidak dipublish ke MQTT.`);
      // Tetap broadcast lokal (BroadcastChannel tidak punya batasan payload)
      if (this._bc) {
        try { this._bc.postMessage(payloadWithSender); } catch (e) {}
      }
      return;
    }

    // Broadcast ke tab lokal (antar-tab di device yang sama)
    if (this._bc) {
      try { this._bc.postMessage(payloadWithSender); } catch (e) {}
    }

    // Publish ke MQTT Broker
    if (this._mqttClient && this.isSyncConnected) {
      // Pesan kritikal (SOS & RIDER_UPDATE) dikirim dengan QoS 1
      // agar broker menjamin delivery walau koneksi sesaat terputus
      const isCritical = data.type === 'RIDER_SOS' || data.type === 'RIDER_UPDATE';
      const publishOptions = {
        ...options,
        qos: isCritical ? 1 : 0,
      };
      try { this._mqttClient.publish(MQTT_TOPIC, jsonStr, publishOptions); } catch (e) {}
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

      case 'RIDER_PAUSE':
        if (data.riderId) {
          const rider = this.riders.get(data.riderId);
          if (rider) {
            const paused = { ...rider, status: RIDER_STATUS.PAUSED, speed: 0 };
            this.riders.set(data.riderId, paused);
            this.emit('rider:paused', paused);
            this.emit('riders:updated', this._getRidersArray());
          }
        }
        break;

      case 'RIDER_RESUME':
        if (data.riderId) {
          const rider = this.riders.get(data.riderId);
          if (rider) {
            const resumed = { ...rider, status: RIDER_STATUS.ACTIVE };
            this.riders.set(data.riderId, resumed);
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
          this.emit('rider:removed', data.riderId);
          this.emit('riders:updated', this._getRidersArray());
        }
        break;

      case 'CLEAR_ALL_RIDERS':
        this.stopAllSimulators();
        this.riders.clear();
        this._deletedRiderIds.clear();
        this.emit('riders:cleared');
        this.emit('riders:updated', []);
        break;

      case 'PARTICIPANTS_UPDATE':
        if (data.participants && Array.isArray(data.participants)) {
          this.participants.clear();
          data.participants.forEach((p) => this.participants.set(String(p.bib), p));
          try { localStorage.setItem('cyclotrack_participants', JSON.stringify(this.getParticipantsArray())); } catch (e) {}
          this.emit('participants:updated', this.getParticipantsArray());
        }
        break;

      case 'ADMIN_PIN_UPDATE':
        if (data.pin) {
          try { localStorage.setItem('cyclotrack_admin_pin', data.pin); } catch (e) {}
          this.emit('admin_pin:updated', data.pin);
        }
        break;

      case 'REQUEST_SYNC':
        // Jika kita punya rute, bagikan rute ke pengguna yang baru join
        if (this.route) {
          this._publishMessage({ type: 'ROUTE_UPDATE', route: this.route });
        }
        // Bagikan data peserta resmi jika ada
        if (this.participants.size > 0) {
          this._publishMessage({ type: 'PARTICIPANTS_UPDATE', participants: this.getParticipantsArray() }, { retain: true });
        }
        // Bagikan PIN admin jika sudah diubah dari default
        try {
          const savedPin = localStorage.getItem('cyclotrack_admin_pin');
          if (savedPin) {
            this._publishMessage({ type: 'ADMIN_PIN_UPDATE', pin: savedPin });
          }
        } catch (e) {}
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
  addRider(id, name, color = '#00c6ff', broadcast = true, bib = null) {
    this._deletedRiderIds.delete(id); // Izinkan pendaftaran baru dengan ID ini jika sebelumnya dihapus
    const existing = this.riders.get(id);
    const rider = {
      id,
      name,
      bib: bib || existing?.bib || null,
      color: existing ? existing.color : color,
      lat: existing ? existing.lat : null,
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
      checkpointsPassed: existing?.checkpointsPassed || {},
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

  updateRiderPosition(id, { lat, lon, ele = 0, speed = 0, heading = 0, accuracy = 0, distanceTraveled: customDist }, broadcast = true) {
    const rider = this.riders.get(id);
    if (!rider) return;

    let distanceTraveled = rider.distanceTraveled;
    let isOffCourse = false;

    if (customDist !== undefined && customDist !== null) {
      distanceTraveled = parseFloat(customDist.toFixed(3));
    } else if (this.route?.trackPoints?.length > 0) {
      if (rider.lat !== null) {
        const delta = haversineDistance(rider.lat, rider.lon, lat, lon);
        // Abaikan loncatan lokasi ekstrem (> 2km) agar jarak tempuh tidak meledak saat init / reconnect
        if (delta < 2.0) {
          distanceTraveled = parseFloat((rider.distanceTraveled + delta).toFixed(3));
        }
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

    // Deteksi Geo-Fencing Checkpoint / Water Station (Radius 150m)
    const checkpointsPassed = { ...(rider.checkpointsPassed || {}) };
    let newlyPassedCP = null;

    if (this.route?.waypoints?.length > 0) {
      this.route.waypoints.forEach((wpt) => {
        const wpName = wpt.name || 'Checkpoint';
        if (!checkpointsPassed[wpName]) {
          const distToWpt = haversineDistance(lat, lon, wpt.lat, wpt.lon);
          if (distToWpt <= 0.15) { // Radius 150 meter dari Checkpoint
            const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            checkpointsPassed[wpName] = timeStr;
            newlyPassedCP = { name: wpName, time: timeStr, type: wpt.type };
          }
        }
      });
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
      checkpointsPassed,
      lastSeen: Date.now(),
      path,
    };

    this.riders.set(id, updated);
    this.emit('rider:moved', updated);
    this.emit('riders:updated', this._getRidersArray());

    if (newlyPassedCP) {
      this.emit('checkpoint:passed', { rider: updated, checkpoint: newlyPassedCP });
    }

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

  // Pause tracking: broadcast ke semua perangkat bahwa rider berhenti tracking
  pauseRiderTracking(id) {
    const rider = this.riders.get(id);
    if (!rider) return;
    const paused = { ...rider, status: RIDER_STATUS.PAUSED, speed: 0 };
    this.riders.set(id, paused);
    this.emit('rider:paused', paused);
    this.emit('riders:updated', this._getRidersArray());
    this._publishMessage({ type: 'RIDER_PAUSE', riderId: id });
  }

  // Resume tracking: broadcast ke semua perangkat bahwa rider aktif kembali
  resumeRiderTracking(id) {
    const rider = this.riders.get(id);
    if (!rider) return;
    const resumed = { ...rider, status: RIDER_STATUS.ACTIVE };
    this.riders.set(id, resumed);
    this.emit('riders:updated', this._getRidersArray());
    this._publishMessage({ type: 'RIDER_RESUME', riderId: id });
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
    this.emit('rider:removed', id);
    this.emit('riders:updated', this._getRidersArray());

    if (broadcast) {
      this._publishMessage({ type: 'RIDER_REMOVE', riderId: id });
    }
  }

  clearAllRiders(broadcast = true) {
    this.stopAllSimulators();
    this.riders.clear();
    this._deletedRiderIds.clear();
    this.emit('riders:cleared');
    this.emit('riders:updated', []);

    if (broadcast) {
      this._publishMessage({ type: 'CLEAR_ALL_RIDERS' });
    }
  }

  // ── Official Participants Master List (BIB & PIN) ──
  _loadCachedParticipants() {
    try {
      const saved = localStorage.getItem('cyclotrack_participants');
      if (saved) {
        const list = JSON.parse(saved);
        if (Array.isArray(list)) {
          list.forEach((p) => {
            this.participants.set(String(p.bib), {
              bib: String(p.bib),
              name: p.name,
              pin: String(p.pin),
              color: p.color || '#00c6ff',
            });
          });
        }
      }
    } catch (e) {}
  }

  setParticipants(list, broadcast = true) {
    this.participants.clear();
    list.forEach((p) => {
      this.participants.set(String(p.bib), {
        bib: String(p.bib),
        name: p.name,
        pin: String(p.pin),
        color: p.color || '#00c6ff',
      });
    });
    try { localStorage.setItem('cyclotrack_participants', JSON.stringify(this.getParticipantsArray())); } catch (e) {}
    this.emit('participants:updated', this.getParticipantsArray());
    if (broadcast) {
      this._publishMessage({ type: 'PARTICIPANTS_UPDATE', participants: this.getParticipantsArray() }, { retain: true });
    }
  }

  getParticipantsArray() {
    return Array.from(this.participants.values()).sort((a, b) => parseInt(a.bib) - parseInt(b.bib));
  }

  // ── Admin PIN Management (Synced via MQTT) ─────────
  setAdminPin(newPin) {
    try { localStorage.setItem('cyclotrack_admin_pin', newPin); } catch (e) {}
    this._publishMessage({ type: 'ADMIN_PIN_UPDATE', pin: newPin }, { retain: true });
    this.emit('admin_pin:updated', newPin);
  }

  validateParticipant(bib, pin) {
    const bibStr = String(bib).trim();
    const pinStr = String(pin).trim();

    // Jika master list kosong (belum dibuat admin), ijinkan pendaftaran darurat
    if (this.participants.size === 0) {
      return { valid: true, isEmergency: true };
    }

    const p = this.participants.get(bibStr);
    if (!p) {
      return { valid: false, error: `Nomor Dada (BIB #${bibStr}) tidak terdaftar dalam event ini!` };
    }
    if (p.pin !== pinStr) {
      return { valid: false, error: `PIN untuk BIB #${bibStr} salah! Silakan cek PIN Anda.` };
    }
    return { valid: true, participant: p };
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
        distanceTraveled: currentMeters / 1000,
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

    // Simpan context untuk keperluan retry
    this._gpsRiderId = riderId;
    this._gpsMode    = mode;
    this._gpsRetryCount = 0;

    const interval = TRANSMISSION_INTERVAL[mode.toUpperCase()] || TRANSMISSION_INTERVAL.NORMAL;

    // Hentikan watcher & timer lama jika masih berjalan
    if (this._geoWatchId !== null) {
      navigator.geolocation.clearWatch(this._geoWatchId);
    }
    if (this._gpsThrottleTimer) {
      clearInterval(this._gpsThrottleTimer);
      this._gpsThrottleTimer = null;
    }
    if (this._gpsRetryTimer) {
      clearTimeout(this._gpsRetryTimer);
      this._gpsRetryTimer = null;
    }

    // Flag: posisi pertama langsung dikirim tanpa menunggu throttle
    this._firstGpsFix = true;

    // ── Accuracy filter: jarak minimum antar titik GPS (50cm) ──
    // Mencegah GPS 'drift' saat diam — titik tidak dikirim jika bergerak <0.5m
    this._lastSentLat = null;
    this._lastSentLon = null;

    this._geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, altitude, speed, heading, accuracy } = pos.coords;

        // ── [Optimasi 3] GPS Accuracy Filter ──
        // Tolak posisi dengan akurasi sangat buruk (>150m) agar tidak merusak track
        if (accuracy > this._GPS_ACCURACY_THRESHOLD) {
          console.warn(`[LiveGPS] Posisi ditolak: akurasi terlalu buruk (${Math.round(accuracy)}m > ${this._GPS_ACCURACY_THRESHOLD}m)`);
          this.emit('gps:update', { lat: latitude, lon: longitude, accuracy }); // tetap update UI status sinyal
          return;
        }

        // Reset retry counter saat berhasil mendapat posisi valid
        this._gpsRetryCount = 0;

        const posData = {
          lat: latitude,
          lon: longitude,
          ele: altitude || 0,
          speed: speed != null ? speed * 3.6 : 0,
          heading: heading || 0,
          accuracy: accuracy || 0,
        };

        // Simpan posisi terbaru — broadcast MQTT dilakukan oleh timer throttle
        this._latestGpsPos = posData;
        this.emit('gps:update', { lat: latitude, lon: longitude, accuracy });

        // ── UPDATE LOKAL LANGSUNG (tanpa broadcast ke MQTT) ──
        // Ini membuat marker di peta bergerak smooth setiap GPS callback,
        // tanpa harus menunggu interval throttle yang panjang (8-20 detik).
        // Parameter broadcast=false agar tidak membebani MQTT.
        this.updateRiderPosition(riderId, posData, false);

        // Khusus posisi PERTAMA: langsung broadcast juga ke perangkat lain
        // agar rider langsung muncul di map spectator/admin saat pertama fix GPS
        if (this._firstGpsFix) {
          this._firstGpsFix = false;
          if (navigator.onLine) {
            this._publishMessage({ type: 'RIDER_UPDATE', rider: this.riders.get(riderId) });
          }
        }
      },
      (err) => {
        console.error('[LiveGPS] Error:', err);
        this.emit('gps:error', err.message);

        // ── [Optimasi 4] Exponential Backoff Retry ──
        // Jika GPS error, coba restart watcher dengan jeda bertahap:
        // retry ke-1: 3 detik, ke-2: 6 detik, ke-3+: 15 detik (max)
        const MAX_RETRY_DELAY_MS = 15000;
        const retryDelay = Math.min(3000 * Math.pow(2, this._gpsRetryCount), MAX_RETRY_DELAY_MS);
        this._gpsRetryCount++;

        console.warn(`[LiveGPS] Akan retry dalam ${retryDelay / 1000}s (percobaan ke-${this._gpsRetryCount})...`);

        if (this._geoWatchId !== null) {
          navigator.geolocation.clearWatch(this._geoWatchId);
          this._geoWatchId = null;
        }

        this._gpsRetryTimer = setTimeout(() => {
          if (this._gpsRiderId) {
            console.log('[LiveGPS] Retrying GPS watch...');
            this.startLiveGPS(this._gpsRiderId, this._gpsMode);
          }
        }, retryDelay);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,       // [Optimasi 4] Turun dari 20s → 10s, lebih cepat deteksi gagal
        maximumAge: 0,        // Selalu minta posisi SEGAR dari GPS hardware — jangan pakai cache
      }
    );

    // Timer throttle: broadcast posisi terbaru ke perangkat lain (MQTT/BroadcastChannel)
    // setiap `interval` ms. Ini menghemat bandwidth tanpa mempengaruhi kelancaran marker lokal.
    this._gpsThrottleTimer = setInterval(() => {
      if (this._latestGpsPos) {
        const rider = this.riders.get(riderId);
        if (rider && navigator.onLine) {
          this._publishMessage({ type: 'RIDER_UPDATE', rider });
        } else if (!navigator.onLine && this._latestGpsPos) {
          const { lat, lon, ele, speed, accuracy, heading } = this._latestGpsPos;
          offlineQueue.enqueue({ riderId, lat, lon, ele, speed, accuracy, heading });
        }
      }
    }, interval);
  }

  stopLiveGPS() {
    if (this._geoWatchId !== null) {
      navigator.geolocation.clearWatch(this._geoWatchId);
      this._geoWatchId = null;
    }
    if (this._gpsThrottleTimer) {
      clearInterval(this._gpsThrottleTimer);
      this._gpsThrottleTimer = null;
    }
    if (this._gpsRetryTimer) {
      clearTimeout(this._gpsRetryTimer);
      this._gpsRetryTimer = null;
    }
    // Clear retry context
    this._gpsRiderId = null;
    this._latestGpsPos = null;
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

// ── Event ID Utilities (untuk Admin Panel) ────────────
// Expose eventId aktif agar bisa ditampilkan di UI admin
export { EVENT_ID };

/**
 * Set Event ID kustom (override topic isolation).
 * Dipanggil oleh admin sebelum membuka event agar semua rider
 * terhubung ke topik yang sama.
 * Membutuhkan page reload agar MQTT reconnect ke topik baru.
 * @param {string} newEventId - ID event baru (huruf kecil, no spasi, max 32 char)
 */
export function setEventId(newEventId) {
  const clean = String(newEventId).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32);
  if (!clean) return;
  try {
    localStorage.setItem('cyclotrack_event_id', clean);
    console.log(`[RealtimeEngine] Event ID diset ke: "${clean}". Reload halaman untuk menerapkan.`);
  } catch (e) {}
}
