/**
 * MainApp.jsx
 * Aplikasi utama setelah role dipilih — semua hooks aman di sini (tidak ada early return sebelum hooks)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bicycle, Eye, GearSix, MapPin, Rows, SquaresFour, Lightning } from '@phosphor-icons/react';
import LiveMap from './LiveMap';
import RiderTracker from './RiderTracker';
import SpectatorDashboard from './SpectatorDashboard';
import ReplayControls from './ReplayControls';
import CycloTrackLogo from './CycloTrackLogo';
import QRCodeModal from './QRCodeModal';
import { engine } from '../utils/realtimeEngine';
import { parseGPX, generateDemoRoute } from '../utils/gpxParser';

// ── Constants ─────────────────────────────────────────
const MODES = {
  RIDER:     'rider',
  SPECTATOR: 'spectator',
  ORGANISER: 'organiser',
};

const ROLE_DEFAULT_MODE = {
  rider:     MODES.RIDER,
  spectator: MODES.SPECTATOR,
  admin:     MODES.ORGANISER,
};

const ROLE_BADGE = {
  rider:     { label: 'Peserta',  color: '#2E3A24', bg: 'rgba(46,58,36,0.1)',    emoji: '🚴' },
  spectator: { label: 'Penonton', color: '#4B8B3B', bg: 'rgba(75,139,59,0.1)',   emoji: '👁️' },
  admin:     { label: 'Admin',    color: '#D97706', bg: 'rgba(217,119,6,0.1)',   emoji: '⚙️' },
};

const ALL_TABS = [
  { key: MODES.RIDER,     label: 'Rider',     shortLabel: 'Rider',  id: 'tab-rider',     roles: ['rider', 'admin'],                icon: Bicycle },
  { key: MODES.SPECTATOR, label: 'Spectator', shortLabel: 'Live',   id: 'tab-spectator', roles: ['rider', 'spectator', 'admin'],   icon: Eye },
  { key: MODES.ORGANISER, label: 'Admin',     shortLabel: 'Admin',  id: 'tab-organiser', roles: ['admin'],                         icon: GearSix },
];

const DEMO_RIDERS = [
  { id: 'sim_001', name: 'Budi Santoso',   color: '#00c6ff', speed: 28, startProgress: 0.0 },
  { id: 'sim_002', name: 'Rina Wulandari', color: '#4ade80', speed: 24, startProgress: 0.05 },
  { id: 'sim_003', name: 'Agus Prawoto',   color: '#fbbf24', speed: 22, startProgress: 0.08 },
  { id: 'sim_004', name: 'Siti Rahayu',    color: '#a78bfa', speed: 26, startProgress: 0.02 },
  { id: 'sim_005', name: 'Dedi Kurniawan', color: '#f472b6', speed: 20, startProgress: 0.12 },
];

// ── Toast System ──────────────────────────────────────
let toastId = 0;

function Toast({ toasts, onRemove }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => onRemove(t.id)}>
          <span>{t.icon}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ── MainApp Component ─────────────────────────────────
export default function MainApp({ userRole, onChangeRole }) {
  // ── ALL HOOKS MUST BE AT THE TOP — NO EARLY RETURNS BEFORE THIS POINT ──
  const [mode, setMode]               = useState(ROLE_DEFAULT_MODE[userRole] || MODES.SPECTATOR);
  const [mobileViewMode, setMobileView] = useState('split'); // 'map', 'panel', 'split'
  const [riders, setRiders]           = useState([]);
  const [route, setRoute]             = useState(null);
  const [focusedRiderId, setFocused]  = useState(null);
  const [toasts, setToasts]           = useState([]);
  const [gpxLoading, setGpxLoading]   = useState(false);
  const [routeName, setRouteName]     = useState('');
  const [myRiderId, setMyRiderId]     = useState(null);
  const [isSyncConnected, setIsSyncConnected] = useState(engine.isSyncConnected);
  const [officialParticipants, setOfficialParticipants] = useState(engine.getParticipantsArray());
  const [inputBib, setInputBib]       = useState('');
  const [inputName, setInputName]     = useState('');
  const [inputPin, setInputPin]       = useState('1234');
  const [showQRModal, setShowQRModal] = useState(false);
  const [changePinOld, setChangePinOld]         = useState('');
  const [changePinNew, setChangePinNew]         = useState('');
  const [changePinConfirm, setChangePinConfirm] = useState('');
  const [pinChangeError, setPinChangeError]     = useState('');
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);
  const fileInputRef = useRef(null);

  const lastNotifiedRouteRef = useRef(null);

  // ── Toast helpers (dengan deduplikasi pesan) ─────
  const addToast = useCallback((message, type = 'info', icon = 'ℹ️') => {
    setToasts((prev) => {
      if (prev.some((t) => t.message === message)) return prev;
      const id = ++toastId;
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
      return [...prev, { id, message, type, icon }];
    });
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Subscribe ke engine events ────────────────────
  useEffect(() => {
    const unsubRiders = engine.on('riders:updated', (updated) => setRiders([...updated]));
    const unsubSOS    = engine.on('rider:sos', (rider) => addToast(`🆘 ${rider.name} membutuhkan bantuan!`, 'error', '🆘'));
    const unsubRoute  = engine.on('route:loaded', (r) => {
      setRoute(r);
      setRouteName(r.name);
      try { localStorage.setItem('cyclotrack_cached_route', JSON.stringify(r)); } catch (e) {}

      // Tampilkan notifikasi HANYA jika rute yang diterima benar-benar rute baru
      const routeKey = `${r.name}_${r.stats?.totalDistance}_${r.trackPoints?.length}`;
      if (lastNotifiedRouteRef.current !== routeKey) {
        lastNotifiedRouteRef.current = routeKey;
        addToast(`🔔 Rute Event Diterima: "${r.name}" (${r.stats?.totalDistance} km)`, 'success', '📍');
      }
    });
    const unsubSyncC  = engine.on('sync:connected', () => setIsSyncConnected(true));
    const unsubSyncD  = engine.on('sync:disconnected', () => setIsSyncConnected(false));
    const unsubPart   = engine.on('participants:updated', (list) => setOfficialParticipants([...list]));
    const unsubCP     = engine.on('checkpoint:passed', ({ rider, checkpoint }) => {
      addToast(`🚩 ${rider.name} baru saja melewati Checkpoint ${checkpoint.name} (${checkpoint.time})!`, 'info', '🏁');
    });
    return () => { unsubRiders(); unsubSOS(); unsubRoute(); unsubSyncC(); unsubSyncD(); unsubPart(); unsubCP(); };
  }, [addToast]);

  const [isSimRunning, setSimRunning] = useState(() => {
    try {
      return localStorage.getItem('cyclotrack_sim_running') === 'true';
    } catch (e) {
      return false;
    }
  });

  // ── Load rute tersimpan (offline-first) & Auto-Resume Simulator ────
  useEffect(() => {
    let activeRoute = null;
    try {
      const saved = localStorage.getItem('cyclotrack_cached_route');
      if (saved) {
        activeRoute = JSON.parse(saved);
      }
    } catch (e) {}

    if (!activeRoute) {
      activeRoute = generateDemoRoute();
    }

    setRoute(activeRoute);
    setRouteName(activeRoute.name);
    engine.setRoute(activeRoute, false);

    // Auto-Resume simulator jika sebelumnya aktif sebelum refresh!
    try {
      const simWasRunning = localStorage.getItem('cyclotrack_sim_running') === 'true';
      if (simWasRunning) {
        DEMO_RIDERS.forEach((dr) => {
          engine.addRider(dr.id, dr.name, dr.color);
          engine.startSimulator(dr.id, dr.speed, dr.startProgress);
        });
        setSimRunning(true);
      }
    } catch (e) {}
  }, []);

  // ── GPX File Upload ───────────────────────────────
  const handleGPXFile = useCallback(async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.gpx')) {
      addToast('File harus berformat .gpx atau .GPX', 'error', '❌');
      return;
    }
    setGpxLoading(true);
    try {
      const parsed = await parseGPX(file);
      setRoute(parsed);
      setRouteName(parsed.name);
      engine.setRoute(parsed);

      addToast(`Rute "${parsed.name}" (${parsed.stats.totalDistance} km) berhasil diupload & siap disimulasikan!`, 'success', '📍');

      // Jika simulator sedang aktif saat GPX di-upload, restart simulator pada rute GPX baru ini
      if (isSimRunning) {
        engine.stopAllSimulators();
        riders.forEach((r) => engine.removeRider(r.id));
        DEMO_RIDERS.forEach((dr) => {
          engine.addRider(dr.id, dr.name, dr.color);
          engine.startSimulator(dr.id, dr.speed, dr.startProgress);
        });
        addToast(`Simulator diperbarui ke rute "${parsed.name}"`, 'info', '🚀');
      }
    } catch (err) {
      addToast(`Gagal membaca file GPX: ${err.message}`, 'error', '❌');
    } finally {
      setGpxLoading(false);
    }
  }, [addToast, isSimRunning, riders]);

  const handleDropzoneDrop = useCallback((e) => {
    e.preventDefault();
    handleGPXFile(e.dataTransfer.files[0]);
  }, [handleGPXFile]);

  const handleFileInput = useCallback((e) => {
    handleGPXFile(e.target.files[0]);
  }, [handleGPXFile]);

  // ── Demo Route ────────────────────────────────────
  const handleLoadDemoRoute = useCallback(() => {
    const demo = generateDemoRoute({ lat: -7.2575, lon: 112.7521 }, 8, 300);
    setRoute(demo);
    setRouteName(demo.name);
    engine.setRoute(demo);
  }, []);

  // ── Simulator ─────────────────────────────────────
  const handleStartSimulator = useCallback(() => {
    if (!route) { addToast('Load rute GPX terlebih dahulu!', 'warning', '⚠️'); return; }
    engine.setRoute(route); // Pastikan rute di engine selalu tersinkronisasi
    engine.stopAllSimulators();
    riders.forEach((r) => engine.removeRider(r.id));
    DEMO_RIDERS.forEach((dr) => {
      engine.addRider(dr.id, dr.name, dr.color);
      engine.startSimulator(dr.id, dr.speed, dr.startProgress);
    });
    setSimRunning(true);
    try { localStorage.setItem('cyclotrack_sim_running', 'true'); } catch (e) {}
    addToast(`Simulator dimulai dengan ${DEMO_RIDERS.length} rider`, 'success', '🚀');
  }, [route, riders, addToast]);

  const handleStopSimulator = useCallback(() => {
    engine.stopAllSimulators();
    DEMO_RIDERS.forEach((dr) => engine.removeRider(dr.id));
    setSimRunning(false);
    try { localStorage.setItem('cyclotrack_sim_running', 'false'); } catch (e) {}
    addToast('Simulator dihentikan', 'info', '⏹');
  }, [addToast]);

  // ── Rider & Focus ─────────────────────────────────
  const handleRiderChange = useCallback(({ id }) => setMyRiderId(id), []);
  const handleFocusRider  = useCallback((riderId) => setFocused(riderId), []);

  // ── Ganti Role (Keluar) ───────────────────────────
  const handleChangeRole = useCallback(() => {
    if (window.confirm('Keluar dan kembali ke halaman pemilihan peran?')) {
      engine.stopAllSimulators();
      engine.stopLiveGPS();
      onChangeRole();
    }
  }, [onChangeRole]);

  // ── Replay Frame Callback ─────────────────────────
  const handleReplayFrameUpdate = useCallback(({ riders: replayRiders, route: replayRoute }) => {
    if (replayRiders) setRiders([...replayRiders]);
    if (replayRoute) {
      setRoute(replayRoute);
      setRouteName(replayRoute.name);
    }
  }, []);

  // ── Switch Mobile View ────────────────────────────
  const handleSwitchMobileView = useCallback((vMode) => {
    setMobileView(vMode);
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 150);
  }, []);

  // ── Computed values ───────────────────────────────
  const allowedTabs = ALL_TABS.filter((tab) => tab.roles.includes(userRole));
  const roleBadge   = ROLE_BADGE[userRole];

  // ── Render ────────────────────────────────────────
  return (
    <>
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-logo">
          <CycloTrackLogo size={32} />
          <span>Cyclo<span className="brand">Track</span></span>
        </div>

        {/* Route indicator — hidden on medium/mobile screens */}
        {routeName && (
          <div className="topbar-route-pill" title={`Rute Aktif: ${routeName}`}>
            <span style={{ flexShrink: 0 }}>📍</span>
            <div className="route-name-container">
              <span className="route-name-text">{routeName} &nbsp; • &nbsp; {routeName} &nbsp; • &nbsp;</span>
            </div>
          </div>
        )}

        <div className="topbar-spacer" />

        {/* Right side actions group */}
        <div className="topbar-actions">
          {/* Live / Sync indicator */}
          <div
            className={`topbar-sync-badge ${isSyncConnected ? 'connected' : 'connecting'}`}
            title={isSyncConnected ? 'Terhubung ke server sinkronisasi real-time lintas HP' : 'Mencoba terhubung ke server...'}
          >
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isSyncConnected ? 'var(--clr-accent)' : 'var(--clr-warning)',
              animation: 'sos-active-pulse 1.5s ease-in-out infinite',
              flexShrink: 0,
            }} />
            <span className="topbar-sync-text">{isSyncConnected ? '⚡ Realtime Sync' : '🔄 Connecting...'}</span>
          </div>

          {/* Tombol QR Code & Bagikan Link */}
          <button
            className="topbar-share-btn"
            onClick={() => setShowQRModal(true)}
            title="Tampilkan QR Code & Bagikan Link Live Event"
          >
            <span>📱</span>
            <span className="share-label">Bagikan</span>
          </button>

          {/* Role Badge Button */}
          <button
            id="role-badge"
            className="topbar-role-btn"
            onClick={handleChangeRole}
            title="Klik untuk keluar / ganti peran"
            style={{
              background: roleBadge.bg,
              border: `1px solid ${roleBadge.color}44`,
              color: roleBadge.color,
            }}
          >
            <span>{roleBadge.emoji}</span>
            <span className="role-label">{roleBadge.label}</span>
          </button>

          {/* Mode Navigation Tabs */}
          <nav className="topbar-mode-tabs" aria-label="Mode navigasi">
            {allowedTabs.map(({ key, label, shortLabel, id, icon: TabIcon }) => (
              <button
                key={key} id={id}
                className={`mode-tab ${mode === key ? 'active' : ''}`}
                onClick={() => setMode(key)}
              >
                <TabIcon size={14} weight="bold" />
                <span className="tab-full-label">{label}</span>
                <span className="tab-short-label">{shortLabel}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <main className={`app-layout mobile-view-${mobileViewMode}`}>
        {/* Peta — selalu visible */}
        <div className="map-area">
          <LiveMap
            riders={riders}
            route={route}
            focusedRiderId={focusedRiderId}
            onRiderClick={handleFocusRider}
          />

          {/* Overlay: Bottom Left (Rider Count stacked above Simulator Badge) */}
          <div className="map-overlay map-overlay-bl" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
            {/* Rider count card */}
            {riders.length > 0 && (() => {
              const onMapCount  = riders.filter((r) => r.lat !== null && r.lon !== null).length;
              const activeCount = riders.filter((r) => (r.status === 'active' || r.status === 'offcourse') && r.lat !== null).length;
              const waitingGps  = riders.filter((r) => r.lat === null || r.lon === null).length;
              return (
                <div className="card-glass" style={{ padding: 'var(--space-2) var(--space-3)', minWidth: 120, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid var(--clr-border-glow)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--clr-text-secondary)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--clr-accent)', boxShadow: '0 0 6px var(--clr-accent)' }} />
                    Rider di Peta
                  </div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--clr-brand)', lineHeight: 1 }}>
                    {activeCount}
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-secondary)', fontWeight: 600, marginLeft: 2 }}>
                      /{onMapCount} terlihat
                    </span>
                  </div>
                  {waitingGps > 0 && (
                    <div style={{ fontSize: '9px', color: 'var(--clr-warning)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⏳</span>
                      {waitingGps} rider menunggu GPS
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Simulator badge */}
            {isSimRunning && (
              <div className="card-glass" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', borderColor: 'rgba(251,191,36,0.5)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--clr-warning)', animation: 'sos-active-pulse 1.5s ease-in-out infinite' }} />
                <span style={{ fontSize: '10px', color: 'var(--clr-warning)', fontWeight: 800, letterSpacing: '0.04em' }}>SIMULATOR AKTIF</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Side Panel ── */}
        <aside className="side-panel">
          <div className="panel-header">
            <h3>
              {mode === MODES.RIDER     && <span style={{ display:'flex', alignItems:'center', gap:6 }}><Bicycle size={14} weight="bold" /> Rider Panel</span>}
              {mode === MODES.SPECTATOR && <span style={{ display:'flex', alignItems:'center', gap:6 }}><Eye size={14} weight="bold" /> Live Leaderboard</span>}
              {mode === MODES.ORGANISER && <span style={{ display:'flex', alignItems:'center', gap:6 }}><GearSix size={14} weight="bold" /> Panel Admin</span>}
            </h3>
            {mode === MODES.SPECTATOR && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', fontFamily: 'var(--font-mono)' }}>
                {riders.length} rider
              </span>
            )}
          </div>

          {/* Mode: RIDER */}
          {mode === MODES.RIDER && (
            <RiderTracker
              route={route}
              riderId={myRiderId}
              riderName=""
              onRiderChange={handleRiderChange}
            />
          )}

          {/* Mode: SPECTATOR */}
          {mode === MODES.SPECTATOR && (
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <SpectatorDashboard
                riders={riders}
                route={route}
                focusedRiderId={focusedRiderId}
                onFocusRider={handleFocusRider}
                onShareLink={() => setShowQRModal(true)}
              />
            </div>
          )}

          {/* Mode: ORGANISER (Admin only) */}
          {mode === MODES.ORGANISER && (
            <div className="panel-body">
              {/* Tombol QR & Share Admin */}
              <button
                onClick={() => setShowQRModal(true)}
                className="btn btn-primary btn-block"
                style={{
                  marginBottom: 'var(--space-4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontWeight: 800,
                }}
              >
                📱 QR Code &amp; Bagikan Link Live Event
              </button>

              {/* Event Replay Player & Recording */}
              <ReplayControls onReplayFrameUpdate={handleReplayFrameUpdate} />
              <div className="divider" />

              {/* GPX Upload */}
              <div>
                <div className="label">Rute Event (File .gpx)</div>
                <div
                  className={`dropzone ${gpxLoading ? 'drag-over' : ''}`}
                  onDrop={handleDropzoneDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  id="gpx-dropzone"
                >
                  <div className="dropzone-icon">{gpxLoading ? '⏳' : '📂'}</div>
                  <div style={{ fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    {gpxLoading ? 'Memproses file GPX...' : 'Upload File GPX'}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)' }}>
                    Drag & drop atau klik untuk pilih file .gpx dari RideWithGPS / Garmin / Strava
                  </div>
                </div>
                <input ref={fileInputRef} id="gpx-file-input" type="file" accept=".gpx" style={{ display: 'none' }} onChange={handleFileInput} />
                <button id="load-demo-route-btn" className="btn btn-ghost w-full" style={{ marginTop: 'var(--space-2)' }} onClick={handleLoadDemoRoute}>
                  🗺️ Gunakan Demo Route (Loop 10km)
                </button>
              </div>

              {/* Route Stats */}
              {route && (
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span>📍</span> {route.name}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    {[
                      { label: 'Jarak Total', value: `${route.stats.totalDistance} km`, icon: '📏' },
                      { label: 'Elevasi +',   value: `${route.stats.totalElevGain} m`,  icon: '⛰️' },
                      { label: 'Titik GPS',   value: route.stats.pointCount.toLocaleString(), icon: '📡' },
                      { label: 'Checkpoint',  value: `${route.waypoints?.length || 0} titik`, icon: '🏁' },
                    ].map(({ label, value, icon }) => (
                      <div key={label} style={{ background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2) var(--space-3)' }}>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', marginBottom: '2px' }}>{icon} {label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--clr-brand)' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="divider" />

              {/* Simulator */}
              <div>
                <div className="label">Simulator Multi-Rider</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', marginBottom: 'var(--space-3)', lineHeight: 1.6 }}>
                  Jalankan {DEMO_RIDERS.length} rider simulasi di sepanjang rute GPX untuk menguji sistem tanpa harus gowes ke luar.
                </div>

                {/* Rider list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  {DEMO_RIDERS.map((dr) => {
                    const active = riders.find((r) => r.id === dr.id);
                    return (
                      <div key={dr.id} style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                        padding: 'var(--space-2) var(--space-3)',
                        background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${active ? dr.color + '44' : 'var(--clr-border)'}`,
                      }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: dr.color + '22', border: `2px solid ${dr.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: dr.color, flexShrink: 0 }}>
                          {dr.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{dr.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--clr-text-muted)' }}>{dr.speed} km/h</div>
                        </div>
                        {active && (
                          <div style={{ fontSize: '10px', color: 'var(--clr-accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {active.distanceTraveled?.toFixed(1)} km
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isSimRunning ? (
                  <button id="stop-simulator-btn" className="btn btn-danger w-full" onClick={handleStopSimulator}>⏹ Stop Simulator</button>
                ) : (
                  <button id="start-simulator-btn" className="btn btn-success w-full" onClick={handleStartSimulator} disabled={!route}>
                    🚀 Mulai Simulator ({DEMO_RIDERS.length} Rider)
                  </button>
                )}
              </div>

              <div className="divider" />

              {/* Kelola Peserta / Delete Riders */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <div className="label">Kelola Peserta ({riders.length})</div>
                  {riders.length > 0 && (
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--clr-danger)', fontSize: 'var(--text-xs)', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => {
                        if (window.confirm('Bersihkan semua peserta dari leaderboard?')) {
                          engine.clearAllRiders(true);
                          addToast('Semua peserta telah dibersihkan', 'info', '🧹');
                        }
                      }}
                    >
                      🧹 Bersihkan Semua
                    </button>
                  )}
                </div>

                {riders.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', textAlign: 'center', padding: 'var(--space-3)', background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    Belum ada peserta terdaftar.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 180, overflowY: 'auto' }}>
                    {riders.map((r) => (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: 'var(--space-2) var(--space-3)',
                        background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--clr-border)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{r.name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--clr-text-muted)', fontFamily: 'var(--font-mono)' }}>
                            ({r.distanceTraveled?.toFixed(1)} km)
                          </span>
                        </div>
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--clr-danger)', fontSize: '11px', cursor: 'pointer', padding: '2px 6px' }}
                          onClick={() => {
                            engine.removeRider(r.id);
                            addToast(`Peserta "${r.name}" dihapus`, 'info', '🗑️');
                          }}
                          title="Hapus peserta dari leaderboard"
                        >
                          🗑️ Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="divider" />

              {/* Master List Peserta Resmi (BIB & PIN) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  <div className="label" style={{ marginBottom: 0 }}>Master Peserta Resmi ({officialParticipants.length})</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {officialParticipants.length > 0 && (
                      <button
                        id="copy-all-participants-btn"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '11px', color: 'var(--clr-brand)', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => {
                          const text = officialParticipants
                            .map((p, idx) => `${idx + 1}. BIB #${p.bib} | Nama: ${p.name} | PIN: ${p.pin}`)
                            .join('\n');
                          const header = `📋 DAFTAR PESERTA RESMI CYCLOTRACK (${officialParticipants.length} Peserta):\n\n`;
                          const fullText = header + text;
                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(fullText).then(() => {
                              addToast(`${officialParticipants.length} peserta berhasil disalin!`, 'success', '📋');
                            }).catch(() => {
                              // Fallback jika API clipboard gagal
                              const textarea = document.createElement('textarea');
                              textarea.value = fullText;
                              document.body.appendChild(textarea);
                              textarea.select();
                              document.execCommand('copy');
                              document.body.removeChild(textarea);
                              addToast(`${officialParticipants.length} peserta berhasil disalin!`, 'success', '📋');
                            });
                          } else {
                            const textarea = document.createElement('textarea');
                            textarea.value = fullText;
                            document.body.appendChild(textarea);
                            textarea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textarea);
                            addToast(`${officialParticipants.length} peserta berhasil disalin!`, 'success', '📋');
                          }
                        }}
                        title="Salin seluruh daftar peserta (BIB, Nama, PIN) ke clipboard"
                      >
                        📋 Salin Semua List
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '11px', color: 'var(--clr-accent)' }}
                      onClick={() => {
                        const demoList = [
                          { bib: '101', name: 'Budi Santoso', pin: '1234', color: '#00c6ff' },
                          { bib: '102', name: 'Siti Rahayu', pin: '1234', color: '#4ade80' },
                          { bib: '103', name: 'Dedi Kurniawan', pin: '1234', color: '#fbbf24' },
                          { bib: '104', name: 'Agus Prawoto', pin: '1234', color: '#a78bfa' },
                          { bib: '105', name: 'Rina Wulandari', pin: '1234', color: '#f472b6' },
                        ];
                        engine.setParticipants(demoList, true);
                        addToast('Daftar BIB 101–105 berhasil di-generate!', 'success', '⚡');
                      }}
                    >
                      ⚡ Auto BIB 101–105
                    </button>
                  </div>
                </div>

                {/* Form Tambah BIB Baru */}
                <div style={{
                  padding: 'var(--space-3)',
                  background: 'var(--clr-bg-elevated)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--clr-border)',
                  marginBottom: 'var(--space-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--clr-brand)' }}>➕ Tambah Peserta Baru</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 'var(--space-2)' }}>
                    <input
                      className="input"
                      style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                      placeholder="BIB (101)"
                      value={inputBib}
                      onChange={(e) => setInputBib(e.target.value)}
                    />
                    <input
                      className="input"
                      style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                      placeholder="Nama Peserta"
                      value={inputName}
                      onChange={(e) => setInputName(e.target.value)}
                    />
                    <input
                      className="input"
                      style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                      placeholder="PIN (1234)"
                      value={inputPin}
                      onChange={(e) => setInputPin(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-primary btn-sm w-full"
                    disabled={!inputBib.trim() || !inputName.trim()}
                    onClick={() => {
                      const targetBib = inputBib.trim();
                      const targetName = inputName.trim();
                      const targetPin = inputPin.trim() || '1234';
                      const existingIndex = officialParticipants.findIndex((p) => String(p.bib) === targetBib);

                      let newList;
                      if (existingIndex >= 0) {
                        newList = [...officialParticipants];
                        newList[existingIndex] = {
                          ...newList[existingIndex],
                          name: targetName,
                          pin: targetPin,
                        };
                        addToast(`Data peserta BIB #${targetBib} diperbarui!`, 'info', '✏️');
                      } else {
                        newList = [
                          ...officialParticipants,
                          { bib: targetBib, name: targetName, pin: targetPin, color: '#00c6ff' },
                        ];
                        addToast(`Peserta BIB #${targetBib} ditambahkan`, 'success', '✅');
                      }

                      engine.setParticipants(newList, true);
                      setInputBib('');
                      setInputName('');
                    }}
                  >
                    Simpan Peserta Resmi
                  </button>
                </div>

                {/* List Peserta Terdaftar */}
                {officialParticipants.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', textAlign: 'center', padding: 'var(--space-3)', background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    Belum ada master peserta resmi. Klik <strong>Auto BIB 101–105</strong> untuk membuat sampel cepat.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 180, overflowY: 'auto' }}>
                    {officialParticipants.map((p) => (
                      <div key={p.bib} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: 'var(--space-2) var(--space-3)',
                        background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--clr-border)',
                      }}>
                        <div>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--clr-brand)' }}>
                            BIB #{p.bib} — {p.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--clr-text-muted)' }}>
                            PIN: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--clr-accent)' }}>{p.pin}</strong>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            style={{ background: 'none', border: 'none', color: 'var(--clr-text-muted)', fontSize: '11px', cursor: 'pointer' }}
                            onClick={() => {
                              navigator.clipboard?.writeText(`BIB #${p.bib} | Nama: ${p.name} | PIN: ${p.pin}`);
                              addToast(`Kredensial BIB #${p.bib} disalin!`, 'info', '📋');
                            }}
                            title="Salin kredensial peserta"
                          >
                            📋
                          </button>
                          <button
                            style={{ background: 'none', border: 'none', color: 'var(--clr-danger)', fontSize: '11px', cursor: 'pointer' }}
                            onClick={() => {
                              const filtered = officialParticipants.filter((item) => item.bib !== p.bib);
                              engine.setParticipants(filtered, true);
                              addToast(`BIB #${p.bib} dihapus dari master list`, 'info', '🗑️');
                            }}
                            title="Hapus dari master list"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="divider" />

              {/* Ganti PIN Admin */}
              <div>
                <div className="label">🔐 Ganti PIN Admin</div>
                <div style={{
                  padding: 'var(--space-3)',
                  background: 'var(--clr-bg-elevated)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--clr-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}>
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    style={{ fontSize: 'var(--text-xs)', padding: '6px 10px' }}
                    placeholder="PIN Lama"
                    value={changePinOld}
                    onChange={(e) => { setChangePinOld(e.target.value); setPinChangeError(''); setPinChangeSuccess(false); }}
                  />
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    style={{ fontSize: 'var(--text-xs)', padding: '6px 10px' }}
                    placeholder="PIN Baru (4-6 digit)"
                    value={changePinNew}
                    onChange={(e) => { setChangePinNew(e.target.value); setPinChangeError(''); setPinChangeSuccess(false); }}
                  />
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    style={{ fontSize: 'var(--text-xs)', padding: '6px 10px' }}
                    placeholder="Konfirmasi PIN Baru"
                    value={changePinConfirm}
                    onChange={(e) => { setChangePinConfirm(e.target.value); setPinChangeError(''); setPinChangeSuccess(false); }}
                  />

                  {pinChangeError && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-danger)', fontWeight: 600 }}>
                      ⚠️ {pinChangeError}
                    </div>
                  )}
                  {pinChangeSuccess && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-accent)', fontWeight: 600 }}>
                      ✅ PIN Admin berhasil diubah!
                    </div>
                  )}

                  <button
                    className="btn btn-primary btn-sm w-full"
                    disabled={!changePinOld || !changePinNew || !changePinConfirm}
                    onClick={() => {
                      const currentPin = localStorage.getItem('cyclotrack_admin_pin') || '1234';
                      if (changePinOld !== currentPin) {
                        setPinChangeError('PIN lama salah!');
                        return;
                      }
                      if (changePinNew.length < 4) {
                        setPinChangeError('PIN baru minimal 4 digit.');
                        return;
                      }
                      if (changePinNew !== changePinConfirm) {
                        setPinChangeError('Konfirmasi PIN tidak cocok.');
                        return;
                      }
                      engine.setAdminPin(changePinNew);
                      setPinChangeSuccess(true);
                      setPinChangeError('');
                      setChangePinOld('');
                      setChangePinNew('');
                      setChangePinConfirm('');
                      addToast('PIN Admin berhasil diubah & disinkronkan ke semua perangkat!', 'success', '🔐');
                    }}
                  >
                    🔐 Simpan PIN Baru
                  </button>
                </div>
              </div>

              <div className="divider" />

              {/* Invite Riders */}
              <div>
                <div className="label">Undang Rider</div>
                <div style={{ padding: 'var(--space-4)', background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>📲</div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Bagikan URL Aplikasi</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--clr-brand)', wordBreak: 'break-all', padding: 'var(--space-2)', background: 'var(--clr-brand-dim)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)' }}>
                    {window.location.origin}
                  </div>
                  <button id="copy-url-btn" className="btn btn-ghost btn-sm" onClick={() => {
                    navigator.clipboard?.writeText(window.location.origin);
                    addToast('URL disalin ke clipboard!', 'success', '✅');
                  }}>
                    📋 Salin URL
                  </button>
                </div>
              </div>

            </div>
          )}
        </aside>
      </main>

      {/* ── Mobile Navigation Bar Bottom ── */}
      <nav className="mobile-bottom-bar" aria-label="Tampilan Mobile">
        {/* Tombol 1: Peta */}
        <button
          id="btn-mobile-view-map"
          className={`mobile-view-btn ${mobileViewMode === 'map' ? 'active' : ''}`}
          onClick={() => handleSwitchMobileView('map')}
        >
          <span className="nav-icon"><MapPin size={20} weight="duotone" /></span>
          <span>Peta</span>
        </button>

        {/* Tombol 2: Split (tengah — prominent) */}
        <button
          id="btn-mobile-view-split"
          className={`mobile-view-btn nav-center ${mobileViewMode === 'split' ? 'active' : ''}`}
          onClick={() => handleSwitchMobileView('split')}
        >
          <span className="nav-icon"><Lightning size={22} weight="duotone" /></span>
          <span>Split</span>
        </button>

        {/* Tombol 3: Panel */}
        <button
          id="btn-mobile-view-panel"
          className={`mobile-view-btn ${mobileViewMode === 'panel' ? 'active' : ''}`}
          onClick={() => handleSwitchMobileView('panel')}
        >
          <span className="nav-icon">
            {mode === MODES.ORGANISER ? <GearSix size={20} weight="duotone" /> : mode === MODES.RIDER ? <Bicycle size={20} weight="duotone" /> : <Rows size={20} weight="duotone" />}
          </span>
          <span>
            {mode === MODES.ORGANISER ? 'Admin' : mode === MODES.RIDER ? 'Rider' : 'Board'}
          </span>
        </button>
      </nav>

      {/* Modal QR Code & Quick Share */}
      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        eventUrl="https://cyclo-trackv1.vercel.app"
        routeName={routeName}
        onToast={addToast}
      />
    </>
  );
}
