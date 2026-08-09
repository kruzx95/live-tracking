/**
 * MainApp.jsx
 * Aplikasi utama setelah role dipilih — semua hooks aman di sini (tidak ada early return sebelum hooks)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import LiveMap from './LiveMap';
import RiderTracker from './RiderTracker';
import SpectatorDashboard from './SpectatorDashboard';
import ReplayControls from './ReplayControls';
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
  rider:     { label: 'Peserta',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)', emoji: '🚴' },
  spectator: { label: 'Penonton', color: '#00c6ff', bg: 'rgba(0,198,255,0.1)',   emoji: '👁️' },
  admin:     { label: 'Admin',    color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', emoji: '⚙️' },
};

const ALL_TABS = [
  { key: MODES.RIDER,     label: '🚴 Rider',     id: 'tab-rider',     roles: ['rider', 'admin'] },
  { key: MODES.SPECTATOR, label: '👁 Spectator', id: 'tab-spectator', roles: ['rider', 'spectator', 'admin'] },
  { key: MODES.ORGANISER, label: '⚙️ Admin',     id: 'tab-organiser', roles: ['admin'] },
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
  const [isSimRunning, setSimRunning] = useState(false);
  const [gpxLoading, setGpxLoading]   = useState(false);
  const [routeName, setRouteName]     = useState('');
  const [myRiderId, setMyRiderId]     = useState(null);
  const [isSyncConnected, setIsSyncConnected] = useState(engine.isSyncConnected);
  const fileInputRef = useRef(null);

  // ── Toast helpers ─────────────────────────────────
  const addToast = useCallback((message, type = 'info', icon = 'ℹ️') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, icon }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
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
      addToast(`✅ Rute "${r.name}" terhubung ke seluruh HP rider (${r.stats.totalDistance} km)`, 'success', '📍');
    });
    const unsubSyncC  = engine.on('sync:connected', () => setIsSyncConnected(true));
    const unsubSyncD  = engine.on('sync:disconnected', () => setIsSyncConnected(false));
    return () => { unsubRiders(); unsubSOS(); unsubRoute(); unsubSyncC(); unsubSyncD(); };
  }, [addToast]);

  // ── Load demo route saat pertama kali ────────────
  useEffect(() => {
    const demo = generateDemoRoute({ lat: -7.2575, lon: 112.7521 }, 8, 300);
    setRoute(demo);
    setRouteName(demo.name);
    engine.setRoute(demo);
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
    } catch (err) {
      addToast(`Gagal membaca file GPX: ${err.message}`, 'error', '❌');
    } finally {
      setGpxLoading(false);
    }
  }, [addToast]);

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
    engine.stopAllSimulators();
    riders.forEach((r) => engine.removeRider(r.id));
    DEMO_RIDERS.forEach((dr) => {
      engine.addRider(dr.id, dr.name, dr.color);
      engine.startSimulator(dr.id, dr.speed, dr.startProgress);
    });
    setSimRunning(true);
    addToast(`Simulator dimulai dengan ${DEMO_RIDERS.length} rider`, 'success', '🚀');
  }, [route, riders, addToast]);

  const handleStopSimulator = useCallback(() => {
    engine.stopAllSimulators();
    DEMO_RIDERS.forEach((dr) => engine.removeRider(dr.id));
    setSimRunning(false);
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
          <div className="logo-icon">🚴</div>
          <span>Cyclo<span className="brand">Track</span></span>
        </div>

        {/* Route indicator */}
        {routeName && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '4px var(--space-3)',
            background: 'var(--clr-brand-dim)',
            border: '1px solid var(--clr-border-glow)',
            borderRadius: 'var(--radius-full)',
            fontSize: 'var(--text-xs)', color: 'var(--clr-brand)', fontWeight: 600,
            maxWidth: 150, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            📍 {routeName}
          </div>
        )}

        <div className="topbar-spacer" />

        {/* Live / Sync indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 8px',
            background: isSyncConnected ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)',
            border: `1px solid ${isSyncConnected ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}`,
            borderRadius: 'var(--radius-full)',
            color: isSyncConnected ? 'var(--clr-accent)' : 'var(--clr-warning)',
            fontWeight: 600,
          }}
            title={isSyncConnected ? 'Terhubung ke server sinkronisasi real-time lintas HP' : 'Mencoba terhubung ke server...'}
          >
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isSyncConnected ? 'var(--clr-accent)' : 'var(--clr-warning)',
              animation: 'sos-active-pulse 1.5s ease-in-out infinite',
            }} />
            <span>{isSyncConnected ? '⚡ Realtime Sync' : '🔄 Connecting...'}</span>
          </div>
        </div>

        {/* Role Badge */}
        <button
          id="role-badge"
          onClick={handleChangeRole}
          title="Klik untuk keluar / ganti peran"
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
            padding: '3px var(--space-3)',
            background: roleBadge.bg,
            border: `1px solid ${roleBadge.color}44`,
            borderRadius: 'var(--radius-full)',
            fontSize: 'var(--text-xs)', fontWeight: 700, color: roleBadge.color,
            cursor: 'pointer', flexShrink: 0,
            fontFamily: 'var(--font-body)',
          }}
        >
          {roleBadge.emoji} {roleBadge.label}
        </button>

        {/* Mode Tabs — filtered by role & responsive for mobile */}
        <nav className="topbar-mode-tabs" aria-label="Mode navigasi">
          {allowedTabs.map(({ key, label, id }) => (
            <button
              key={key} id={id}
              className={`mode-tab ${mode === key ? 'active' : ''}`}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
        </nav>
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

          {/* Overlay: Rider count */}
          {riders.length > 0 && (
            <div className="map-overlay map-overlay-tl">
              <div className="card-glass" style={{ padding: 'var(--space-3) var(--space-4)', minWidth: 120 }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Rider Online
                </div>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--clr-brand)' }}>
                  {riders.filter((r) => r.status === 'active' || r.status === 'offcourse').length}
                  <span style={{ fontSize: 'var(--text-base)', color: 'var(--clr-text-muted)', fontWeight: 400 }}>
                    /{riders.length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Overlay: Simulator badge */}
          {isSimRunning && (
            <div className="map-overlay map-overlay-bl">
              <div className="card-glass" style={{ padding: 'var(--space-2) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', borderColor: 'rgba(251,191,36,0.4)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--clr-warning)', animation: 'sos-active-pulse 1.5s ease-in-out infinite' }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-warning)', fontWeight: 700 }}>SIMULATOR AKTIF</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Side Panel ── */}
        <aside className="side-panel">
          <div className="panel-header">
            <h3>
              {mode === MODES.RIDER     && '🚴 Rider Panel'}
              {mode === MODES.SPECTATOR && '👁 Live Leaderboard'}
              {mode === MODES.ORGANISER && '⚙️ Panel Admin'}
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
              />
              <div className="divider" />
              <ReplayControls onReplayFrameUpdate={handleReplayFrameUpdate} />
            </div>
          )}

          {/* Mode: ORGANISER (Admin only) */}
          {mode === MODES.ORGANISER && (
            <div className="panel-body">
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
        <button
          id="btn-mobile-view-map"
          className={`mobile-view-btn ${mobileViewMode === 'map' ? 'active' : ''}`}
          onClick={() => handleSwitchMobileView('map')}
        >
          🗺️ Peta Full
        </button>

        <button
          id="btn-mobile-view-split"
          className={`mobile-view-btn ${mobileViewMode === 'split' ? 'active' : ''}`}
          onClick={() => handleSwitchMobileView('split')}
        >
          ⚡ Split 50/50
        </button>

        <button
          id="btn-mobile-view-panel"
          className={`mobile-view-btn ${mobileViewMode === 'panel' ? 'active' : ''}`}
          onClick={() => handleSwitchMobileView('panel')}
        >
          📋 {mode === MODES.ORGANISER ? 'Panel Admin' : mode === MODES.RIDER ? 'Panel Rider' : 'Leaderboard'}
        </button>
      </nav>
    </>
  );
}
