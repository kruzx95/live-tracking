/**
 * RoleGate.jsx
 * Halaman pemilihan role saat pertama kali buka aplikasi
 * Rider langsung masuk, Admin harus input PIN rahasia
 */

import { useState } from 'react';

const ADMIN_PIN = '1234'; // Ganti PIN ini sesuai kebutuhan komunitas Anda

export default function RoleGate({ onSelectRole }) {
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinShake, setPinShake] = useState(false);

  const handleAdminSubmit = (e) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
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
      background: 'var(--clr-bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-6)',
      gap: 'var(--space-8)',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Background glow effect */}
      <div style={{
        position: 'absolute',
        top: '20%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(0,198,255,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Logo & App Name */}
      <div style={{ textAlign: 'center', animation: 'fade-in 0.6s ease' }}>
        <div style={{
          width: 72, height: 72,
          background: 'linear-gradient(135deg, #0072ff, #00c6ff)',
          borderRadius: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2.4rem',
          margin: '0 auto var(--space-4)',
          boxShadow: '0 0 40px rgba(0,198,255,0.3)',
        }}>
          🚴
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-3xl)',
          fontWeight: 800,
          margin: 0,
          color: 'var(--clr-text-primary)',
        }}>
          Cyclo<span style={{ color: 'var(--clr-brand)' }}>Track</span>
        </h1>
        <p style={{
          color: 'var(--clr-text-muted)',
          fontSize: 'var(--text-sm)',
          marginTop: 'var(--space-2)',
        }}>
          Live GPS Tracking untuk Event Sepeda Komunitas
        </p>
      </div>

      {/* Role Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 'var(--space-4)',
        width: '100%',
        maxWidth: 560,
        animation: 'fade-in 0.7s ease 0.1s both',
      }}>

        {/* Card: Rider */}
        <button
          id="role-rider-btn"
          onClick={() => onSelectRole('rider')}
          style={{
            background: 'var(--clr-bg-card)',
            border: '1px solid var(--clr-border)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-8) var(--space-6)',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.25s ease',
            color: 'inherit',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-3)',
            position: 'relative',
            overflow: 'hidden',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(74,222,128,0.5)';
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 40px rgba(74,222,128,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--clr-border)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            width: 64, height: 64,
            background: 'rgba(74,222,128,0.12)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem',
            border: '1px solid rgba(74,222,128,0.25)',
          }}>
            🚴
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--clr-accent)', marginBottom: 4 }}>
              Saya Peserta
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.6 }}>
              Pancarkan lokasi GPS Anda secara live selama event berlangsung
            </div>
          </div>
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--clr-accent)',
            fontWeight: 700,
            padding: '4px var(--space-4)',
            background: 'rgba(74,222,128,0.1)',
            borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(74,222,128,0.3)',
          }}>
            Langsung Masuk →
          </div>
        </button>

        {/* Card: Spectator */}
        <button
          id="role-spectator-btn"
          onClick={() => onSelectRole('spectator')}
          style={{
            background: 'var(--clr-bg-card)',
            border: '1px solid var(--clr-border)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-8) var(--space-6)',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.25s ease',
            color: 'inherit',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,198,255,0.5)';
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,198,255,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--clr-border)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            width: 64, height: 64,
            background: 'rgba(0,198,255,0.1)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem',
            border: '1px solid rgba(0,198,255,0.25)',
          }}>
            👁️
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--clr-brand)', marginBottom: 4 }}>
              Saya Penonton
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.6 }}>
              Pantau posisi seluruh rider di peta secara real-time
            </div>
          </div>
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--clr-brand)',
            fontWeight: 700,
            padding: '4px var(--space-4)',
            background: 'rgba(0,198,255,0.08)',
            borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(0,198,255,0.3)',
          }}>
            Buka Live Map →
          </div>
        </button>
      </div>

      {/* Admin entry — subtle link */}
      <button
        id="role-admin-btn"
        onClick={() => setShowPinModal(true)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--clr-text-muted)',
          fontSize: 'var(--text-xs)',
          cursor: 'pointer',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          opacity: 0.6,
          transition: 'opacity 0.2s ease',
          animation: 'fade-in 0.8s ease 0.2s both',
          fontFamily: 'var(--font-body)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
      >
        🔐 Masuk sebagai Admin / Panitia
      </button>

      {/* PIN Modal */}
      {showPinModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000,
          padding: 'var(--space-6)',
          animation: 'fade-in 0.2s ease',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowPinModal(false); setPin(''); setPinError(false); } }}
        >
          <div style={{
            background: 'var(--clr-bg-card)',
            border: `1px solid ${pinError ? 'rgba(244,63,94,0.5)' : 'var(--clr-border)'}`,
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-8)',
            width: '100%',
            maxWidth: 360,
            textAlign: 'center',
            animation: pinShake ? 'shake 0.4s ease' : 'fade-in 0.3s ease',
            transition: 'border-color 0.2s ease',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>🔐</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>
              Admin / Panitia
            </h2>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-6)' }}>
              Masukkan PIN khusus panitia untuk mengakses panel admin
            </p>

            <form onSubmit={handleAdminSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <input
                id="admin-pin-input"
                className="input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="PIN Panitia"
                value={pin}
                onChange={(e) => { setPin(e.target.value); setPinError(false); }}
                autoFocus
                style={{
                  textAlign: 'center',
                  fontSize: 'var(--text-xl)',
                  letterSpacing: '0.4em',
                  fontFamily: 'var(--font-mono)',
                  borderColor: pinError ? 'rgba(244,63,94,0.6)' : undefined,
                }}
              />
              {pinError && (
                <div style={{ color: 'var(--clr-danger)', fontSize: 'var(--text-xs)', animation: 'fade-in 0.2s ease' }}>
                  ❌ PIN salah. Coba lagi.
                </div>
              )}
              <button id="admin-pin-submit" type="submit" className="btn btn-primary btn-lg" disabled={!pin}>
                Masuk sebagai Admin →
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setShowPinModal(false); setPin(''); setPinError(false); }}
              >
                Batal
              </button>
            </form>
          </div>
        </div>
      )}

      {/* App version */}
      <div style={{ position: 'absolute', bottom: 16, fontSize: '10px', color: 'var(--clr-text-muted)', opacity: 0.4 }}>
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
