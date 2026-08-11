/**
 * SpectatorDashboard.jsx
 * Panel untuk PANITIA & PENONTON (Dotwatcher)
 * Fitur: Leaderboard, filter status, focus rider, SOS alert notif
 */

import { useState, useMemo } from 'react';
import { RIDER_STATUS } from '../utils/realtimeEngine';

const STATUS_ORDER = [
  RIDER_STATUS.SOS,
  RIDER_STATUS.ACTIVE,
  RIDER_STATUS.OFFCOURSE,
  RIDER_STATUS.STOPPED,
  RIDER_STATUS.FINISHED,
  RIDER_STATUS.DNF,
];

const STATUS_CONFIG = {
  [RIDER_STATUS.ACTIVE]:    { label: 'Aktif',      emoji: '🟢', badge: 'badge-active' },
  [RIDER_STATUS.STOPPED]:   { label: 'Berhenti',   emoji: '🟡', badge: 'badge-stopped' },
  [RIDER_STATUS.OFFCOURSE]: { label: 'Off-Course', emoji: '🟠', badge: 'badge-offcourse' },
  [RIDER_STATUS.SOS]:       { label: 'SOS',        emoji: '🔴', badge: 'badge-sos' },
  [RIDER_STATUS.FINISHED]:  { label: 'Finish',     emoji: '✅', badge: 'badge-active' },
  [RIDER_STATUS.DNF]:       { label: 'DNF',        emoji: '⚫', badge: 'badge-dnf' },
};

function formatDuration(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

function formatLastSeen(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Baru saja';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m lalu`;
  return `${Math.floor(diff / 3600000)}j lalu`;
}

export default function SpectatorDashboard({ riders = [], route = null, focusedRiderId = null, onFocusRider, onShareLink }) {
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery]   = useState('');

  // Hitung statistik ringkas
  const stats = useMemo(() => ({
    total:     riders.length,
    active:    riders.filter((r) => r.status === RIDER_STATUS.ACTIVE).length,
    offcourse: riders.filter((r) => r.status === RIDER_STATUS.OFFCOURSE).length,
    sos:       riders.filter((r) => r.status === RIDER_STATUS.SOS).length,
    finished:  riders.filter((r) => r.status === RIDER_STATUS.FINISHED).length,
    dnf:       riders.filter((r) => r.status === RIDER_STATUS.DNF).length,
  }), [riders]);

  // Filter & sort riders
  const filteredRiders = useMemo(() => {
    let list = [...riders];

    // Filter status
    if (filterStatus !== 'all') {
      list = list.filter((r) => r.status === filterStatus);
    }

    // Filter search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => r.name?.toLowerCase().includes(q));
    }

    // Sort: SOS dulu, lalu by distance descending
    list.sort((a, b) => {
      const oa = STATUS_ORDER.indexOf(a.status);
      const ob = STATUS_ORDER.indexOf(b.status);
      if (oa !== ob) return oa - ob;
      return b.distanceTraveled - a.distanceTraveled;
    });

    return list;
  }, [riders, filterStatus, searchQuery]);

  const sosRiders = riders.filter((r) => r.status === RIDER_STATUS.SOS);

  return (
    <div className="panel-body" style={{ padding: 0, gap: 0 }}>

      {/* Tombol Quick Share Penonton */}
      {onShareLink && (
        <div style={{ padding: 'var(--space-3) var(--space-5) 0' }}>
          <button
            onClick={onShareLink}
            style={{
              width: '100%',
              padding: 'var(--space-2) var(--space-4)',
              background: 'linear-gradient(135deg, rgba(0, 114, 255, 0.15), rgba(0, 198, 255, 0.15))',
              border: '1px solid rgba(0, 198, 255, 0.4)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--clr-brand)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.2s ease',
            }}
          >
            📱 Bagikan Link Live Event & QR Code
          </button>
        </div>
      )}

      {/* SOS Alert Banner */}
      {sosRiders.length > 0 && (
        <div style={{
          padding: 'var(--space-3) var(--space-5)',
          background: 'rgba(255,45,85,0.12)',
          borderBottom: '2px solid rgba(255,45,85,0.4)',
          animation: 'connecting-blink 1s ease-in-out infinite',
        }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--clr-sos)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            🆘 DARURAT!
            <span style={{ fontWeight: 500, fontSize: 'var(--text-xs)', color: 'var(--clr-text-primary)' }}>
              {sosRiders.map((r) => r.name).join(', ')} membutuhkan bantuan!
            </span>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div style={{
        padding: 'var(--space-4) var(--space-5)',
        borderBottom: '1px solid var(--clr-border)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
          {[
            { label: 'Total Rider', value: stats.total, color: 'var(--clr-text-secondary)' },
            { label: 'Aktif',       value: stats.active,    color: 'var(--clr-status-active)' },
            { label: 'Finish',      value: stats.finished,  color: 'var(--clr-brand)' },
            { label: 'Off-Course',  value: stats.offcourse, color: 'var(--clr-status-offcourse)' },
            { label: 'SOS',         value: stats.sos,       color: 'var(--clr-status-sos)' },
            { label: 'DNF',         value: stats.dnf,       color: 'var(--clr-status-dnf)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: 'var(--clr-bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-2) var(--space-3)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>
                {value}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{
        padding: 'var(--space-3) var(--space-5)',
        borderBottom: '1px solid var(--clr-border)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
      }}>
        <input
          id="rider-search-input"
          className="input"
          type="text"
          placeholder="🔍 Cari nama rider..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-3)' }}
        />

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          {[
            { key: 'all',                    label: `Semua (${stats.total})` },
            { key: RIDER_STATUS.ACTIVE,      label: `Aktif (${stats.active})` },
            { key: RIDER_STATUS.OFFCOURSE,   label: `Off-Course (${stats.offcourse})` },
            { key: RIDER_STATUS.SOS,         label: `SOS (${stats.sos})` },
            { key: RIDER_STATUS.FINISHED,    label: `Finish (${stats.finished})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              id={`filter-${key}`}
              className={`btn btn-sm ${filterStatus === key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterStatus(key)}
              style={{ padding: '2px var(--space-3)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-4)' }}>
        {filteredRiders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--clr-text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>
              {riders.length === 0 ? '🚴' : '🔍'}
            </div>
            <div style={{ fontSize: 'var(--text-sm)' }}>
              {riders.length === 0
                ? 'Belum ada rider terdaftar.\nJalankan Simulator atau minta rider untuk join.'
                : 'Tidak ada rider yang cocok dengan filter.'}
            </div>
          </div>
        ) : (
          <div className="leaderboard-list">
            {filteredRiders.map((rider, index) => {
              const cfg = STATUS_CONFIG[rider.status] || STATUS_CONFIG[RIDER_STATUS.ACTIVE];
              const isFocused = focusedRiderId === rider.id;
              const progressPct = route?.stats?.totalDistance > 0
                ? Math.min(100, (rider.distanceTraveled / route.stats.totalDistance) * 100)
                : 0;

              return (
                <div
                  key={rider.id}
                  id={`rider-row-${rider.id}`}
                  className={`rider-row ${isFocused ? 'focused' : ''}`}
                  onClick={() => onFocusRider?.(isFocused ? null : rider.id)}
                  title={isFocused ? 'Klik untuk lepas fokus' : 'Klik untuk fokus pada rider ini di peta'}
                >
                  {/* Rank */}
                  <div className="rider-rank">
                    {rider.status === RIDER_STATUS.SOS ? '🆘' :
                     rider.status === RIDER_STATUS.FINISHED ? '🏁' :
                     `#${index + 1}`}
                  </div>

                  {/* Dot avatar */}
                  <div style={{
                    width: 32, height: 28, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                    background: rider.color + '22',
                    border: `1.5px solid ${rider.color || 'var(--clr-brand)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: rider.bib ? '9px' : '10px', fontWeight: 800, color: rider.color || 'var(--clr-brand)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {rider.bib ? `#${rider.bib}` : (rider.name?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?')}
                  </div>

                  {/* Rider info */}
                  <div className="rider-info">
                    <div className="rider-name">
                      {rider.bib && (
                        <span style={{ color: 'var(--clr-brand)', marginRight: 6, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                          #{rider.bib}
                        </span>
                      )}
                      {rider.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: '2px' }}>
                      {/* Progress bar mini */}
                      {route && (
                        <div style={{ flex: 1, height: 3, background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${progressPct}%`,
                            height: '100%',
                            background: `linear-gradient(90deg, ${rider.color || '#0072ff'}, ${rider.color || '#00c6ff'})`,
                            borderRadius: 'var(--radius-full)',
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                      )}
                      <span className="rider-stats">{rider.distanceTraveled?.toFixed(1) || '0.0'} km</span>
                    </div>
                    <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className={`badge ${cfg.badge}`} style={{ fontSize: '9px' }}>
                        {cfg.emoji} {cfg.label}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--clr-text-muted)' }}>
                        {rider.speed?.toFixed(1) || '0.0'} km/h
                      </span>
                    </div>

                    {/* Checkpoint Passed Badges */}
                    {rider.checkpointsPassed && Object.keys(rider.checkpointsPassed).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {Object.entries(rider.checkpointsPassed).map(([cpName, cpTime]) => (
                          <span
                            key={cpName}
                            style={{
                              background: 'rgba(0, 229, 255, 0.12)',
                              border: '1px solid rgba(0, 229, 255, 0.35)',
                              color: '#00e5ff',
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              fontFamily: 'var(--font-mono)',
                            }}
                            title={`Lolos ${cpName} pada pukul ${cpTime}`}
                          >
                            🚩 {cpName.split(' ')[0]} {cpTime}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Speed */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="rider-speed">
                      {rider.speed ? rider.speed.toFixed(0) : '0'}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--clr-text-muted)', textTransform: 'uppercase' }}>km/h</div>
                  </div>

                  {/* Focus indicator */}
                  {isFocused && (
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--clr-brand)', flexShrink: 0,
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Route Info Footer */}
      {route && (
        <div style={{
          padding: 'var(--space-3) var(--space-5)',
          borderTop: '1px solid var(--clr-border)',
          background: 'var(--clr-bg-elevated)',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-2)',
        }}>
          {[
            { label: 'Jarak Total', value: `${route.stats.totalDistance} km` },
            { label: 'Elevasi +', value: `${route.stats.totalElevGain} m` },
            { label: 'Titik GPS', value: route.stats.pointCount.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--clr-brand)', fontFamily: 'var(--font-mono)' }}>
                {value}
              </div>
              <div style={{ fontSize: '9px', color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
