/**
 * replayEngine.js
 * Engine Perekaman & Replay Event Sepeda (Event Recording & Playback System)
 *
 * Fitur:
 * 1. RECORDING : Otomatis merekam pergerakan seluruh rider & event (SOS, finish) selama event berlangsung.
 * 2. PLAYBACK  : Memutar ulang event dengan kontrol Play, Pause, Timeline Seek, & Kecepatan (1x, 2x, 5x, 10x, 20x).
 * 3. EXPORT    : Unduh hasil rekaman event dalam file JSON (e.g. `cyclotrack-event-2026-08-10.json`).
 * 4. IMPORT    : Unggah file rekaman JSON kapan saja untuk menonton ulang race lama bersama komunitas.
 */

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

class ReplayEngine extends EventEmitter {
  constructor() {
    super();
    this.isRecording  = false;
    this.isPlaying    = false;
    this.recordedData = null; // { route, startTime, durationMs, frames: [ { relTime, riderId, ... } ] }
    this.activeFrames = [];
    this.recordingStartTime = null;
    this.playbackTimeMs = 0;
    this.speedMultiplier = 5; // Default 5x fast forward
    this._playbackTimer = null;
    this._recordedRoute = null;
  }

  // ── 1. RECORDING SYSTEM ─────────────────────────────
  startRecording(route = null) {
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    this._recordedRoute = route;
    this.activeFrames = [];
    console.log('[ReplayEngine] 🔴 Event Recording Dimulai');
    this.emit('recording:started');
  }

  recordFrame(riderData) {
    if (!this.isRecording || !this.recordingStartTime) return;
    if (riderData.lat === null || riderData.lon === null) return;

    const relTime = Date.now() - this.recordingStartTime;
    const frame = {
      relTime,
      riderId:          riderData.id,
      name:             riderData.name,
      color:            riderData.color,
      lat:              riderData.lat,
      lon:              riderData.lon,
      ele:              riderData.ele || 0,
      speed:            riderData.speed || 0,
      distanceTraveled: riderData.distanceTraveled || 0,
      status:           riderData.status || 'active',
      isSOS:            !!riderData.isSOS,
      isOffCourse:      !!riderData.isOffCourse,
    };

    this.activeFrames.push(frame);
    this.emit('recording:frame', frame);
  }

  stopRecording() {
    if (!this.isRecording) return null;
    this.isRecording = false;
    const durationMs = this.activeFrames.length > 0
      ? this.activeFrames[this.activeFrames.length - 1].relTime
      : 0;

    this.recordedData = {
      version: '1.0',
      title: this._recordedRoute?.name || 'Event Live Tracking',
      recordedAt: new Date().toISOString(),
      durationMs,
      route: this._recordedRoute,
      frames: this.activeFrames,
    };

    console.log(`[ReplayEngine] ⏹ Event Recording Selesai: ${this.activeFrames.length} frame (${(durationMs / 1000).toFixed(1)}s)`);
    this.emit('recording:stopped', this.recordedData);

    // Simpan otomatis ke localStorage sebagai rekaman event terakhir
    try {
      localStorage.setItem('cyclotrack_last_replay', JSON.stringify(this.recordedData));
    } catch (e) {
      console.warn('[ReplayEngine] Gagal menyimpan rekaman ke localStorage:', e);
    }

    return this.recordedData;
  }

  // ── 2. EXPORT & IMPORT ──────────────────────────────
  exportJSON() {
    const data = this.recordedData || this.loadSavedSession();
    if (!data) return false;

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `cyclotrack-replay-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return true;
  }

  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!parsed.frames || !Array.isArray(parsed.frames)) {
            throw new Error('Format file replay tidak valid.');
          }
          this.recordedData = parsed;
          this.playbackTimeMs = 0;
          this.emit('replay:loaded', parsed);
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  loadSavedSession() {
    try {
      const saved = localStorage.getItem('cyclotrack_last_replay');
      if (saved) {
        this.recordedData = JSON.parse(saved);
        return this.recordedData;
      }
    } catch (e) {}
    return null;
  }

  // ── 3. PLAYBACK CONTROLLER ──────────────────────────
  startPlayback(recordedSession = null) {
    const data = recordedSession || this.recordedData || this.loadSavedSession();
    if (!data || !data.frames || data.frames.length === 0) return false;

    this.recordedData = data;
    this.isPlaying = true;
    this.playbackTimeMs = 0;
    this._startPlaybackLoop();
    this.emit('playback:started', data);
    return true;
  }

  pausePlayback() {
    this.isPlaying = false;
    if (this._playbackTimer) {
      clearInterval(this._playbackTimer);
      this._playbackTimer = null;
    }
    this.emit('playback:paused');
  }

  resumePlayback() {
    if (!this.recordedData || this.isPlaying) return;
    this.isPlaying = true;
    this._startPlaybackLoop();
    this.emit('playback:resumed');
  }

  stopPlayback() {
    this.pausePlayback();
    this.playbackTimeMs = 0;
    this.emit('playback:stopped');
  }

  setSpeed(multiplier) {
    this.speedMultiplier = multiplier;
    this.emit('playback:speed', multiplier);
  }

  seekProgress(progressFraction) { // 0.0 sampai 1.0
    if (!this.recordedData || !this.recordedData.durationMs) return;
    const targetMs = Math.floor(progressFraction * this.recordedData.durationMs);
    this.playbackTimeMs = targetMs;

    // Render frame snapshot terkini pada timestamp tersebut
    this._renderFrameAtTime(targetMs);
    this.emit('playback:tick', {
      timeMs: targetMs,
      durationMs: this.recordedData.durationMs,
      progress: progressFraction,
    });
  }

  _startPlaybackLoop() {
    if (this._playbackTimer) clearInterval(this._playbackTimer);

    const TICK_INTERVAL = 100; // update tiap 100ms
    this._playbackTimer = setInterval(() => {
      if (!this.isPlaying || !this.recordedData) return;

      this.playbackTimeMs += TICK_INTERVAL * this.speedMultiplier;

      if (this.playbackTimeMs >= this.recordedData.durationMs) {
        this.playbackTimeMs = this.recordedData.durationMs;
        this._renderFrameAtTime(this.playbackTimeMs);
        this.pausePlayback();
        this.emit('playback:finished');
        return;
      }

      this._renderFrameAtTime(this.playbackTimeMs);
      this.emit('playback:tick', {
        timeMs: this.playbackTimeMs,
        durationMs: this.recordedData.durationMs,
        progress: this.playbackTimeMs / this.recordedData.durationMs,
      });
    }, TICK_INTERVAL);
  }

  _renderFrameAtTime(targetTimeMs) {
    if (!this.recordedData?.frames) return;

    // Kumpulkan keadaan rider paling mutakhir hingga targetTimeMs
    const riderStates = new Map();
    for (const f of this.recordedData.frames) {
      if (f.relTime > targetTimeMs) break;
      riderStates.set(f.riderId, f);
    }

    const ridersArray = Array.from(riderStates.values()).map((f) => ({
      id: f.riderId,
      name: f.name,
      color: f.color,
      lat: f.lat,
      lon: f.lon,
      ele: f.ele,
      speed: f.speed,
      distanceTraveled: f.distanceTraveled,
      status: f.status,
      isSOS: f.isSOS,
      isOffCourse: f.isOffCourse,
      lastSeen: Date.now(),
    }));

    this.emit('playback:frame_update', {
      riders: ridersArray,
      route: this.recordedData.route,
    });
  }
}

export const replayEngine = new ReplayEngine();
export default replayEngine;
