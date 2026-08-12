/**
 * screenRecorder.js
 * Utility perekam video layar peta real-time (Screen Video Recorder)
 * Menggunakan MediaRecorder & getDisplayMedia bawaan browser tanpa library eksternal.
 */

class ScreenRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.stream = null;
    this.isRecordingVideo = false;
    this.startTime = 0;
    this.timerInterval = null;
    this.elapsedMs = 0;
    this.listeners = new Map();
  }

  // ── Event Emitter Sederhana ─────────────────────────
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
    return () => {
      const arr = this.listeners.get(event) || [];
      this.listeners.set(event, arr.filter((cb) => cb !== callback));
    };
  }

  emit(event, data) {
    const arr = this.listeners.get(event) || [];
    arr.forEach((cb) => cb(data));
  }

  // ── Mulai Perekaman Video Layar ────────────────────
  async startScreenRecording() {
    if (this.isRecordingVideo) return;

    try {
      // Prompt user untuk memilih tab/layar yang akan direkam
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      // Tentukan format video terbaik yang didukung browser
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4';
      }

      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
        videoBitsPerSecond: 3000000, // 3 Mbps untuk kualitas HD tajam
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      // Handler saat perekaman dihentikan oleh user (misal lewat bar browser 'Stop Sharing')
      this.mediaRecorder.onstop = () => {
        this._finalizeRecording();
      };

      // Handle jika user menghentikan sharing dari UI browser bawaan
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (this.isRecordingVideo) {
            this.stopScreenRecording();
          }
        };
      }

      this.mediaRecorder.start(1000); // Kumpulkan chunk setiap 1 detik
      this.isRecordingVideo = true;
      this.startTime = Date.now();
      this.elapsedMs = 0;

      this.timerInterval = setInterval(() => {
        this.elapsedMs = Date.now() - this.startTime;
        this.emit('video:tick', { elapsedMs: this.elapsedMs });
      }, 500);

      this.emit('video:started', { mimeType });
      return true;
    } catch (err) {
      console.warn('Screen recording dibatalkan atau tidak didukung:', err);
      this.emit('video:error', err);
      return false;
    }
  }

  // ── Hentikan Perekaman Video & Download File ──────
  stopScreenRecording() {
    if (!this.isRecordingVideo) return;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  _finalizeRecording() {
    this.isRecordingVideo = false;

    if (this.recordedChunks.length > 0) {
      const mimeType = this.mediaRecorder?.mimeType || 'video/webm';
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      const url = URL.createObjectURL(blob);

      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `CycloTrack_Live_Video_${dateStr}_${Date.now().toString().slice(-4)}.${ext}`;

      // Trigger download otomatis
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 10000);

      this.emit('video:completed', { filename, url, durationMs: this.elapsedMs });
    } else {
      this.emit('video:stopped');
    }
  }
}

export const screenRecorder = new ScreenRecorder();
export default screenRecorder;
