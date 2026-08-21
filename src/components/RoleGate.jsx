/**
 * RoleGate.jsx
 * Halaman pemilihan role saat pertama kali buka aplikasi
 * Desain 3-Kartu yang sangat mudah dijangkau di layar HP maupun Desktop:
 * 1. 🚴 Saya Peserta
 * 2. 👁️ Saya Penonton
 * 3. 🔐 Panitia / Admin (Dilindungi PIN)
 */

import { useState, useEffect } from 'react';
import MaterialIcon from './MaterialIcon';
import PWAInstallBanner from './PWAInstallBanner';
import CycloTrackLogo from './CycloTrackLogo';
import { engine } from '../utils/realtimeEngine';

// PIN admin disimpan di localStorage — default '1234' jika belum pernah diubah
function getAdminPin() {
  try {
    return localStorage.getItem('cyclotrack_admin_pin') || '1234';
  } catch (e) {
    return '1234';
  }
}

export default function RoleGate({ onSelectRole }) {
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin]                   = useState('');
  const [pinError, setPinError]         = useState(false);
  const [pinShake, setPinShake]         = useState(false);
  const [currentAdminPin, setCurrentAdminPin] = useState(() => getAdminPin());

  // Listen sync PIN real-time via MQTT lintas HP/device
  useEffect(() => {
    const unsub = engine.on('admin_pin:updated', (newPin) => {
      setCurrentAdminPin(newPin);
    });
    return () => unsub();
  }, []);

  const handleAdminSubmit = (e) => {
    e.preventDefault();
    const validPin = currentAdminPin || getAdminPin();
    if (pin === validPin) {
      onSelectRole('admin');
    } else {
      setPinError(true);
      setPinShake(true);
      setPin('');
      setTimeout(() => {
        setPinError(false);
        setPinShake(false);
      }, 700);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      width: '100%',
      background: 'var(--clr-bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-5) var(--space-4) var(--space-8)',
      position: 'relative',
      overflowY: 'auto',
      boxSizing: 'border-box',
    }}>

      {/* Background glow effect */}
      <div style={{
        position: 'absolute',
        top: '15%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(75,139,59,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Header / Logo */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)', animation: 'fade-in 0.5s ease' }}>
        <div style={{ margin: '0 auto var(--space-3)', display: 'flex', justifyContent: 'center' }}>
          <CycloTrackLogo size={72} />
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)',
          fontWeight: 800,
          margin: 0,
          color: 'var(--clr-text-primary)',
          letterSpacing: '-0.02em',
        }}>
          Cyclo<span style={{ color: 'var(--clr-brand)' }}>Track</span>
        </h1>
        <p style={{
          color: 'var(--clr-text-muted)',
          fontSize: 'var(--text-xs)',
          marginTop: 'var(--space-1)',
        }}>
          Live GPS Tracking Event Sepeda Komunitas
        </p>

        {/* Event Route Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-3)',
          padding: '6px 14px',
          background: 'rgba(75, 139, 59, 0.15)',
          border: '1px solid var(--clr-brand)',
          borderRadius: 'var(--radius-full)',
          fontSize: 'var(--text-xs)',
          color: 'var(--clr-brand)',
          fontWeight: 700,
        }}>
          <span>📍</span> Rute Resmi: <strong>Gravel Ride (32.24 km)</strong>
        </div>
      </div>

      {/* Grid 3-Kartu Peran — Didesain sangat mudah ditekan di HP */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        width: '100%',
        maxWidth: 420,
        animation: 'fade-in 0.6s ease 0.1s both',
      }}>

        {/* Card 1: PESERTA */}
        <button
          id="role-rider-btn"
          onClick={() => onSelectRole('rider')}
          style={{
            background: 'var(--clr-bg-card)',
            border: '1px solid rgba(46,58,36,0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4) var(--space-5)',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            width: '100%',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{
            width: 48, height: 48,
            background: 'rgba(46,58,36,0.1)',
            borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(46,58,36,0.25)',
            flexShrink: 0,
            color: '#2E3A24',
          }}>
            <MaterialIcon name="directions_bike" size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-md)', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--clr-accent)', marginBottom: 2 }}>
              Saya Peserta
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.4 }}>
              Pancarkan lokasi GPS HP Anda secara live saat gowes
            </div>
          </div>
          <div style={{
            fontSize: 'var(--text-xs)', color: 'var(--clr-accent)', fontWeight: 700,
            padding: '6px 12px', background: 'rgba(46,58,36,0.08)', borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(46,58,36,0.25)', flexShrink: 0,
          }}>
            Masuk →
          </div>
        </button>

        {/* Card 2: PENONTON */}
        <button
          id="role-spectator-btn"
          onClick={() => onSelectRole('spectator')}
          style={{
            background: 'var(--clr-bg-card)',
            border: '1px solid rgba(75,139,59,0.35)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4) var(--space-5)',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            width: '100%',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{
            width: 48, height: 48,
            background: 'rgba(75,139,59,0.1)',
            borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(75,139,59,0.25)',
            flexShrink: 0,
            color: '#4B8B3B',
          }}>
            <MaterialIcon name="visibility" size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-md)', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--clr-brand)', marginBottom: 2 }}>
              Saya Penonton
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.4 }}>
              Pantau pergerakan seluruh rider di peta real-time
            </div>
          </div>
          <div style={{
            fontSize: 'var(--text-xs)', color: 'var(--clr-brand)', fontWeight: 700,
            padding: '6px 12px', background: 'rgba(75,139,59,0.1)', borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(75,139,59,0.25)', flexShrink: 0,
          }}>
            Peta →
          </div>
        </button>

        {/* Card 3: PANITIA / ADMIN (PROMINENT ON MOBILE) */}
        <button
          id="role-admin-btn"
          onClick={() => setShowPinModal(true)}
          style={{
            background: 'var(--clr-bg-card)',
            border: '1px solid rgba(217,119,6,0.35)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4) var(--space-5)',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            width: '100%',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{
            width: 48, height: 48,
            background: 'rgba(217,119,6,0.1)',
            borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(217,119,6,0.3)',
            flexShrink: 0,
            color: '#D97706',
          }}>
            <MaterialIcon name="admin_panel_settings" size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-md)', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--clr-warning)', marginBottom: 2 }}>
              Panitia / Admin
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.4 }}>
              Upload rute GPX event &amp; jalankan simulator rider
            </div>
          </div>
          <div style={{
            fontSize: 'var(--text-xs)', color: 'var(--clr-warning)', fontWeight: 700,
            padding: '6px 12px', background: 'rgba(217,119,6,0.08)', borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(217,119,6,0.3)', flexShrink: 0,
          }}>
            Masuk 🔐
          </div>
        </button>

        {/* PWA Install Banner */}
        <PWAInstallBanner />

      </div>

      {/* PIN Modal (Dioptimalkan untuk HP) */}
      {showPinModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000,
          padding: 'var(--space-4)',
          animation: 'fade-in 0.2s ease',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowPinModal(false); setPin(''); setPinError(false); } }}
        >
          <div style={{
            background: 'var(--clr-bg-card)',
            border: `1px solid ${pinError ? 'rgba(244,63,94,0.6)' : 'var(--clr-border)'}`,
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6) var(--space-5)',
            width: '100%',
            maxWidth: 340,
            textAlign: 'center',
            animation: pinShake ? 'shake 0.4s ease' : 'fade-in 0.3s ease',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-2)' }}>
              <MaterialIcon name="admin_panel_settings" size={44} color="#D97706" />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 800, marginBottom: 4 }}>
              Akses Admin / Panitia
            </h2>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-5)' }}>
              Masukkan PIN panitia untuk membuka Panel Admin
            </p>

            <form onSubmit={handleAdminSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <input
                id="admin-pin-input"
                className="input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder={currentAdminPin !== '1234' ? 'Masukkan PIN Admin' : 'PIN (Default: 1234)'}
                value={pin}
                onChange={(e) => { setPin(e.target.value); setPinError(false); }}
                autoFocus
                style={{
                  textAlign: 'center',
                  fontSize: 'var(--text-xl)',
                  letterSpacing: '0.3em',
                  fontFamily: 'var(--font-mono)',
                  borderColor: pinError ? 'rgba(244,63,94,0.6)' : undefined,
                  height: 48,
                }}
              />
              {pinError && (
                <div style={{ color: 'var(--clr-danger)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                  ❌ PIN salah.{currentAdminPin === '1234' && ' (Default: 1234)'} Coba lagi.
                </div>
              )}
              <button
                id="admin-pin-submit"
                type="submit"
                className="btn btn-primary btn-lg w-full"
                disabled={!pin}
                style={{ height: 48, fontSize: 'var(--text-sm)' }}
              >
                MASUK ADMIN →
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full"
                onClick={() => { setShowPinModal(false); setPin(''); setPinError(false); }}
                style={{ minHeight: 40, fontSize: 'var(--text-xs)' }}
              >
                Batal
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer info */}
      <div style={{ marginTop: 'var(--space-6)', fontSize: '11px', color: 'var(--clr-text-muted)', opacity: 0.5 }}>
        CycloTrack v1.0 • Community Event Tracker
      </div>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
