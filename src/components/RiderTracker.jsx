/**
 * RiderTracker.jsx
 * Panel untuk RIDER (Pesepeda)
 * Fitur: Start/Stop GPS tracking, statistik real-time, Battery Mode, Wake Lock, SOS button
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import MaterialIcon from './MaterialIcon';
import { engine, TRANSMISSION_INTERVAL } from '../utils/realtimeEngine';
import { offlineQueue } from '../utils/offlineQueue';
import { isOffCourse } from '../utils/gpxParser';
import BackgroundGPSGuideModal from './BackgroundGPSGuideModal';
import SOSButton from './SOSButton';

const RIDER_COLORS = [
  '#00c6ff', '#4ade80', '#fbbf24', '#f97316',
  '#a78bfa', '#f472b6', '#38bdf8', '#fb923c',
];

export default function RiderTracker({ route, riderId, riderName, onRiderChange }) {
  const [isTracking, setIsTracking]       = useState(false);
  const [batteryMode, setBatteryMode]     = useState('normal'); // high / normal / saver
  const [wakeLockOn, setWakeLockOn]       = useState(false);
  const [gpsStatus, setGpsStatus]         = useState('idle'); // idle / searching / good / weak / no-signal / retrying
  const [accuracy, setAccuracy]           = useState(null);
  const [isSOS, setIsSOS]                 = useState(false);
  const [offlineCount, setOfflineCount]   = useState(0);
  const [isOnline, setIsOnline]           = useState(navigator.onLine);
  const [gpsRetryCount, setGpsRetryCount] = useState(0);
  const [metrics, setMetrics]             = useState({
    speed: 0, distance: 0, ele: 0, distanceToFinish: null,
  });
  const [offCourseAlert, setOffCourseAlert] = useState(false);
  const [bib, setBib]                     = useState('');
  const [pin, setPin]                     = useState('');
  const [name, setName]                   = useState(riderName || '');
  const [authError, setAuthError]         = useState('');
  const [hasRegistered, setHasRegistered] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  const riderIdRef = useRef(riderId || `rider_${Date.now()}`);
  const colorRef   = useRef(RIDER_COLORS[Math.floor(Math.random() * RIDER_COLORS.length)]);
  const metricsIntervalRef = useRef(null);

  // ── Init: subscribe ke engine events ─────────────
  useEffect(() => {
    const unsubMove = engine.on('rider:moved', (rider) => {
      if (rider.id !== riderIdRef.current) return;
      setMetrics({
        speed: rider.speed || 0,
        distance: rider.distanceTraveled || 0,
        ele: rider.ele || 0,
        distanceToFinish: rider.distanceToFinish,
      });
      setOffCourseAlert(rider.isOffCourse || false);
    });

    const unsubGPS = engine.on('gps:update', ({ accuracy: acc }) => {
      setAccuracy(acc);
      // Threshold akurasi sesuai filter engine (150m)
      if (acc <= 20)       setGpsStatus('good');
      else if (acc <= 50)  setGpsStatus('weak');
      else if (acc <= 150) setGpsStatus('weak');   // 50-150m: masih diterima tapi ditandai lemah
      else                 setGpsStatus('no-signal'); // >150m: ditolak engine
    });

    const unsubGPSErr = engine.on('gps:error', () => {
      setGpsStatus('retrying');
      setGpsRetryCount((c) => c + 1);
    });

    const unsubWL = engine.on('wakelock:active', () => setWakeLockOn(true));
    const unsubWLR = engine.on('wakelock:released', () => setWakeLockOn(false));

    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    // Cek offline queue count setiap 5 detik
    const queueInterval = setInterval(async () => {
      const count = await offlineQueue.pendingCount();
      setOfflineCount(count);
    }, 5000);

    // Restore pendaftaran & status tracking dari localStorage
    try {
      const savedBib  = localStorage.getItem('cyclotrack_auth_bib');
      const savedName = localStorage.getItem('cyclotrack_rider_name');
      const savedId   = localStorage.getItem('cyclotrack_rider_id');
      if (savedBib && savedName && savedId) {
        setBib(savedBib);
        setName(savedName);
        riderIdRef.current = savedId;
        setHasRegistered(true);

        // Daftarkan ke engine jika belum terdaftar
        engine.addRider(savedId, savedName, colorRef.current, true, savedBib);
        onRiderChange?.({ id: savedId, name: savedName, color: colorRef.current, bib: savedBib });

        // Jika GPS watcher sedang berjalan di engine, atur status tracking
        if (engine._geoWatchId !== null) {
          setIsTracking(true);
          setGpsStatus('good');
        }
      }
    } catch (e) {}

    const unsubRemoved = engine.on('rider:removed', (removedId) => {
      if (removedId === riderIdRef.current) {
        setIsTracking(false);
        setGpsStatus('idle');
        engine.stopLiveGPS();
        engine.releaseWakeLock();
        try {
          localStorage.removeItem('cyclotrack_auth_bib');
          localStorage.removeItem('cyclotrack_auth_pin');
          localStorage.removeItem('cyclotrack_rider_name');
          localStorage.removeItem('cyclotrack_rider_id');
          localStorage.removeItem('cyclotrack_device_id');
        } catch (e) {}
        setHasRegistered(false);
      }
    });

    const unsubCleared = engine.on('riders:cleared', () => {
      setIsTracking(false);
      setGpsStatus('idle');
      engine.stopLiveGPS();
      engine.releaseWakeLock();
      try {
        localStorage.removeItem('cyclotrack_rider_name');
        localStorage.removeItem('cyclotrack_rider_id');
        localStorage.removeItem('cyclotrack_device_id');
      } catch (e) {}
      setHasRegistered(false);
    });

    return () => {
      unsubMove(); unsubGPS(); unsubGPSErr(); unsubWL(); unsubWLR(); unsubRemoved(); unsubCleared();
      clearInterval(queueInterval);
    };
  }, [onRiderChange]);

  // ── Login / Register rider dengan BIB & PIN ────────
  const handleLogin = useCallback(() => {
    setAuthError('');
    const bibStr = bib.trim();
    const pinStr = pin.trim();

    if (!bibStr) {
      setAuthError('Silakan masukkan Nomor Dada (BIB)');
      return;
    }

    // Validasi ke master list peserta resmi di engine
    const res = engine.validateParticipant(bibStr, pinStr);
    if (!res.valid) {
      setAuthError(res.error);
      return;
    }

    const participantName = res.participant ? res.participant.name : (name.trim() || `Rider #${bibStr}`);
    const participantColor = res.participant ? res.participant.color : colorRef.current;
    const id = `rider_bib_${bibStr}`;

    riderIdRef.current = id;
    colorRef.current = participantColor;
    setName(participantName);

    engine.addRider(id, participantName, participantColor, true, bibStr);
    onRiderChange?.({ id, name: participantName, color: participantColor, bib: bibStr });
    setHasRegistered(true);

    try {
      localStorage.setItem('cyclotrack_auth_bib', bibStr);
      localStorage.setItem('cyclotrack_auth_pin', pinStr);
      localStorage.setItem('cyclotrack_rider_name', participantName);
      localStorage.setItem('cyclotrack_rider_id', id);
    } catch (e) {}
  }, [bib, pin, name, onRiderChange]);

  // ── Start/Stop Tracking ───────────────────────────
  const handleStartTracking = useCallback(async () => {
    if (!hasRegistered) handleLogin();
    
    setIsTracking(true);
    setGpsStatus('searching');
    setGpsRetryCount(0);

    // Broadcast ke semua perangkat bahwa rider aktif kembali
    engine.resumeRiderTracking(riderIdRef.current);

    // [Optimasi 2] WakeLock aktif di SEMUA mode — mencegah browser suspend GPS
    // Di mode saver, WakeLock tetap diaktifkan karena browser suspend adalah masalah utama
    await engine.requestWakeLock();

    engine.startLiveGPS(riderIdRef.current, batteryMode);
  }, [hasRegistered, batteryMode, handleLogin]);

  const handleStopTracking = useCallback(() => {
    setIsTracking(false);
    setGpsStatus('idle');
    engine.stopLiveGPS();
    engine.releaseWakeLock();
    setWakeLockOn(false);
    // Broadcast ke semua perangkat bahwa rider ini berhenti tracking
    engine.pauseRiderTracking(riderIdRef.current);
  }, []);

  // ── SOS Handlers ─────────────────────────────────
  const handleTriggerSOS = useCallback(() => {
    engine.triggerSOS(riderIdRef.current);
    setIsSOS(true);
  }, []);

  const handleCancelSOS = useCallback(() => {
    engine.cancelSOS(riderIdRef.current);
    setIsSOS(false);
  }, []);

  // ── GPS Signal Indicator ────────────────────────
  const gpsLabel = {
    idle:        'GPS Standby',
    searching:   'Mencari Sinyal...',
    good:        `GPS Bagus (±${accuracy ? Math.round(accuracy) : '?'}m)`,
    weak:        `GPS Lemah (±${accuracy ? Math.round(accuracy) : '?'}m)`,
    'no-signal': 'Sinyal Ditolak (Akurasi Buruk)',
    retrying:    `Koneksi GPS Terputus — Retry #${gpsRetryCount}...`,
  };

  // ── Render: Form Login BIB & PIN ──────────────────
  if (!hasRegistered) {
    return (
      <div className="panel-body" style={{ justifyContent: 'center', gap: 'var(--space-4)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 'var(--space-2)' }}>🏅</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-1)' }}>
            Otentikasi Peserta
          </h3>
          <p className="text-secondary" style={{ fontSize: 'var(--text-xs)' }}>
            Masukkan Nomor Dada (BIB) & PIN yang diberikan Panitia
          </p>
        </div>

        {authError && (
          <div style={{
            padding: 'var(--space-3)',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--clr-danger)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--clr-danger)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            lineHeight: 1.5,
          }}>
            ⚠️ {authError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div>
            <label className="label" htmlFor="rider-bib-input">Nomor Dada (BIB)</label>
            <input
              id="rider-bib-input"
              className="input"
              type="text"
              placeholder="Contoh: 101"
              value={bib}
              onChange={(e) => setBib(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              autoFocus
            />
          </div>

          <div>
            <label className="label" htmlFor="rider-pin-input">PIN Peserta (4-Digit)</label>
            <input
              id="rider-pin-input"
              className="input"
              type="password"
              maxLength={6}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
        </div>

        <button
          id="register-rider-btn"
          className="btn btn-primary btn-lg w-full"
          onClick={handleLogin}
          disabled={!bib.trim()}
        >
          Masuk & Mulai Live Tracking →
        </button>

        <div style={{
          padding: 'var(--space-3)',
          background: 'var(--clr-bg-elevated)',
          borderRadius: 'var(--radius-md)',
          fontSize: '11px',
          color: 'var(--clr-text-muted)',
          lineHeight: 1.5,
        }}>
          💡 <strong>Belum menerima Nomor Dada & PIN?</strong> Hubungi Panitia Event di meja pendaftaran untuk mendapatkan Nomor Dada resmi Anda.
        </div>

        <button
          onClick={() => setShowGuideModal(true)}
          style={{
            width: '100%',
            padding: 'var(--space-2) var(--space-3)',
            background: 'rgba(75, 139, 59, 0.1)',
            border: '1px solid rgba(75, 139, 59, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--clr-brand)',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <MaterialIcon name="battery_charging_full" size={16} />
          <span>Tips GPS Layar Mati (Kantong Jersey)</span>
        </button>

        {/* Modal Panduan GPS Background (Login View) */}
        <BackgroundGPSGuideModal
          isOpen={showGuideModal}
          onClose={() => setShowGuideModal(false)}
        />
      </div>
    );
  }

  // ── Render: Tracker Panel ─────────────────────────
  return (
    <div className="panel-body">
      {/* Header Rider Registered Info */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--space-2) var(--space-3)',
        background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--clr-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: colorRef.current }} />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--clr-brand)' }}>
            {bib ? `BIB #${bib} — ${name}` : name}
          </span>
        </div>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--clr-text-muted)', fontSize: '10px', cursor: 'pointer', fontWeight: 600 }}
          onClick={() => {
            if (isTracking) {
              if (!window.confirm('Tracking GPS sedang berjalan. Apakah Anda yakin ingin keluar?')) return;
              handleStopTracking();
            }
            const oldId = riderIdRef.current;
            if (oldId) {
              engine.removeRider(oldId, true);
            }
            try {
              localStorage.removeItem('cyclotrack_auth_bib');
              localStorage.removeItem('cyclotrack_auth_pin');
              localStorage.removeItem('cyclotrack_rider_name');
              localStorage.removeItem('cyclotrack_rider_id');
              localStorage.removeItem('cyclotrack_device_id');
            } catch (e) {}
            setHasRegistered(false);
          }}
        >
          ✏️ Keluar / Ganti BIB
        </button>
      </div>

      {/* GPS Status Bar */}
      <div className={`gps-signal ${
        gpsStatus === 'good'     ? 'good'      :
        gpsStatus === 'weak'     ? 'weak'      :
        gpsStatus === 'retrying' ? 'no-signal' :
        gpsStatus === 'idle'     ? ''          : 'no-signal'
      }`}>
        <span>
          {gpsStatus === 'good'     ? '📡' :
           gpsStatus === 'searching'? '🔄' :
           gpsStatus === 'weak'     ? '📶' :
           gpsStatus === 'retrying' ? '⏳' : '❌'}
        </span>
        <span style={{ fontSize: 'var(--text-xs)' }}>{gpsLabel[gpsStatus]}</span>
        {!isOnline && (
          <span style={{ marginLeft: 'auto', color: 'var(--clr-warning)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
            OFFLINE
          </span>
        )}
      </div>

      {/* Tombol Tips Background GPS */}
      <button
        onClick={() => setShowGuideModal(true)}
        style={{
          width: '100%',
          padding: 'var(--space-2) var(--space-3)',
          background: 'rgba(75, 139, 59, 0.1)',
          border: '1px solid rgba(75, 139, 59, 0.3)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--clr-brand)',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginBottom: 'var(--space-4)',
        }}
      >
        <MaterialIcon name="battery_charging_full" size={16} />
        <span>Tips GPS Layar Mati (Kantong Jersey)</span>
      </button>

      {/* Off-Course Alert */}
      {offCourseAlert && (
        <div style={{
          padding: 'var(--space-3)',
          background: 'rgba(249,115,22,0.12)',
          border: '1px solid rgba(249,115,22,0.4)',
          borderRadius: 'var(--radius-md)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          animation: 'fade-in 0.3s ease',
        }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--clr-status-offcourse)' }}>
              OFF-COURSE!
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)' }}>
              Anda telah keluar dari jalur rute event
            </div>
          </div>
        </div>
      )}

      {/* Offline Queue Notice */}
      {offlineCount > 0 && (
        <div style={{
          padding: 'var(--space-3)',
          background: 'rgba(251,191,36,0.1)',
          border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
          color: 'var(--clr-warning)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        }}>
          <span>📦</span>
          <span>{offlineCount} titik GPS tersimpan offline — akan dikirim saat online</span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Kecepatan</div>
          <div className="metric-value" style={{ fontSize: 'var(--text-2xl)' }}>
            {metrics.speed.toFixed(1)}
          </div>
          <div className="metric-unit">km/h</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Jarak</div>
          <div className="metric-value" style={{ fontSize: 'var(--text-2xl)' }}>
            {metrics.distance.toFixed(2)}
          </div>
          <div className="metric-unit">km</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Elevasi</div>
          <div className="metric-value" style={{ fontSize: 'var(--text-2xl)', color: 'var(--clr-accent)' }}>
            {Math.round(metrics.ele)}
          </div>
          <div className="metric-unit">meter</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Sisa Jarak</div>
          <div className="metric-value" style={{ fontSize: 'var(--text-2xl)', color: 'var(--clr-warning)' }}>
            {metrics.distanceToFinish != null ? metrics.distanceToFinish.toFixed(1) : '—'}
          </div>
          <div className="metric-unit">km ke Finish</div>
        </div>
      </div>

      {/* Progress Bar ke Finish */}
      {route && metrics.distanceToFinish != null && (
        <div>
          <div className="flex justify-between" style={{ marginBottom: 'var(--space-1)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)' }}>
              Progress Rute
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {route.stats.totalDistance > 0
                ? `${Math.min(100, ((metrics.distance / route.stats.totalDistance) * 100)).toFixed(0)}%`
                : '—'}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${route.stats.totalDistance > 0
                  ? Math.min(100, (metrics.distance / route.stats.totalDistance) * 100)
                  : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="divider" />

      {/* Settings: Battery Mode & Wake Lock */}
      <div>
        <div className="label" style={{ marginBottom: 'var(--space-3)' }}>Mode Penggunaan</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {[
            { key: 'high',   label: 'High Precision', desc: 'Update 3 detik, layar tetap menyala', icon: 'bolt' },
            { key: 'normal', label: 'Standard',        desc: 'Update 8 detik — Rekomendasi', icon: 'check_circle' },
            { key: 'saver',  label: 'Battery Saver',   desc: 'Update 20 detik, hemat data seluler', icon: 'battery_saver' },
          ].map(({ key, label, desc, icon }) => (
            <button
              key={key}
              id={`battery-mode-${key}`}
              onClick={() => !isTracking && setBatteryMode(key)}
              disabled={isTracking}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                background: batteryMode === key ? 'var(--clr-brand-dim)' : 'var(--clr-bg-elevated)',
                border: `1px solid ${batteryMode === key ? 'var(--clr-brand)' : 'var(--clr-border)'}`,
                borderRadius: 'var(--radius-md)',
                cursor: isTracking ? 'not-allowed' : 'pointer',
                opacity: isTracking ? 0.6 : 1,
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
              }}
            >
              <MaterialIcon name={icon} size={20} color={batteryMode === key ? 'var(--clr-brand)' : 'var(--clr-text-secondary)'} />
              <div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: batteryMode === key ? 'var(--clr-brand)' : 'var(--clr-text-primary)' }}>
                  {label}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)' }}>{desc}</div>
              </div>
              {batteryMode === key && (
                <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--clr-brand)', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Start / Stop Tracking Button */}
      <button
        id={isTracking ? 'stop-tracking-btn' : 'start-tracking-btn'}
        className={`btn btn-lg w-full ${isTracking ? 'btn-danger' : 'btn-success'}`}
        onClick={isTracking ? handleStopTracking : handleStartTracking}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        {isTracking ? (
          <>
            <MaterialIcon name="stop" size={20} />
            <span>STOP TRACKING</span>
          </>
        ) : (
          <>
            <MaterialIcon name="sensors" size={20} />
            <span>MULAI LIVE TRACKING</span>
          </>
        )}
      </button>

      {/* Status indicator saat tracking */}
      {isTracking && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
          fontSize: 'var(--text-xs)', color: 'var(--clr-accent)',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--clr-accent)',
            animation: 'sos-active-pulse 1.5s ease-in-out infinite',
          }} />
          LIVE — Posisi GPS sedang dipancarkan
          {wakeLockOn && <span style={{ color: 'var(--clr-brand)', marginLeft: 'var(--space-2)' }}>🔆 Layar Terkunci</span>}
        </div>
      )}

      {/* SOS Emergency Module */}
      {hasRegistered && (
        <>
          <div className="divider" />
          <SOSButton
            isSOS={isSOS}
            onTriggerSOS={handleTriggerSOS}
            onCancelSOS={handleCancelSOS}
            riderName={name}
            bib={bib}
          />
        </>
      )}

      {/* Rider Info Footer */}
      <div style={{
        padding: 'var(--space-3)',
        background: 'var(--clr-bg-elevated)',
        borderRadius: 'var(--radius-md)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: colorRef.current + '22',
          border: `2px solid ${colorRef.current}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--text-xs)', fontWeight: 700, color: colorRef.current,
          flexShrink: 0,
        }}>
          {name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)' }}>
            ID: {riderIdRef.current.slice(-8)}
          </div>
        </div>
        <button
          id="change-name-btn"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => { handleStopTracking(); setHasRegistered(false); }}
          title="Ganti nama"
        >
          Ganti
        </button>
      </div>
    </div>
  );
}
