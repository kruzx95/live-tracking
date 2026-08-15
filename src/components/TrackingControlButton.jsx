/**
 * TrackingControlButton.jsx
 * Modul Kontrol Live Tracking (Mulai / Hentikan GPS) untuk Pesepeda / Rider
 *
 * Desain diseragamkan dengan SOSButton.jsx:
 * 1. Card Container bertema Emerald Forest dengan border & status badge.
 * 2. Tombol Utama Berkualitas Tinggi dengan gradient, ikon Material Icons, dan haptic feedback.
 * 3. Modal Konfirmasi Penghentian (Stop Tracking): Mencegah tracking terhenti tidak sengaja saat gowes.
 * 4. Status Siaga Real-Time: Menampilkan mode baterai & status WakeLock layar.
 * 5. 100% Responsif & Anti-clipping di semua ukuran layar smartphone.
 */

import { useState } from 'react';
import MaterialIcon from './MaterialIcon';

export default function TrackingControlButton({
  isTracking,
  batteryMode = 'normal',
  wakeLockOn = false,
  onStartTracking,
  onStopTracking,
}) {
  const [showStopConfirmModal, setShowStopConfirmModal] = useState(false);

  const handleStart = () => {
    if (navigator.vibrate) {
      try { navigator.vibrate([40]); } catch (err) {}
    }
    onStartTracking?.();
  };

  const handleConfirmStop = () => {
    setShowStopConfirmModal(false);
    if (navigator.vibrate) {
      try { navigator.vibrate([60]); } catch (err) {}
    }
    onStopTracking?.();
  };

  const modeLabels = {
    high: 'High Precision (3s)',
    normal: 'Standard (8s)',
    saver: 'Battery Saver (20s)',
  };

  return (
    <div style={{
      background: isTracking ? 'rgba(75, 139, 59, 0.1)' : 'var(--clr-bg-elevated)',
      border: `1px solid ${isTracking ? 'var(--clr-brand)' : 'rgba(75, 139, 59, 0.25)'}`,
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3)',
      transition: 'all var(--transition-base)',
      boxShadow: isTracking ? '0 0 20px rgba(75, 139, 59, 0.15)' : 'none',
    }}>
      {/* Header Label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-2)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: 'var(--clr-brand)',
          fontSize: 'var(--text-xs)',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          <MaterialIcon name="sensors" size={16} color="var(--clr-brand)" />
          <span>Kontrol Live Tracking</span>
        </div>

        {isTracking ? (
          <span style={{
            background: 'var(--clr-brand)',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <span style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#fff',
              animation: 'sos-dot-blink 1s step-end infinite',
            }} />
            LIVE
          </span>
        ) : (
          <span style={{
            background: 'rgba(255, 255, 255, 0.08)',
            color: 'var(--clr-text-muted)',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
          }}>
            STANDBY
          </span>
        )}
      </div>

      {/* State A: Tracking Sedang Berjalan (LIVE) */}
      {isTracking ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {/* Active Info Badge */}
          <div style={{
            background: 'rgba(75, 139, 59, 0.15)',
            border: '1px solid rgba(75, 139, 59, 0.35)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-2) var(--space-3)',
            fontSize: '11px',
            color: 'var(--clr-text-brand)',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--clr-brand)',
                animation: 'sos-active-pulse 1.5s ease-in-out infinite',
              }} />
              <span>Mode: <strong>{modeLabels[batteryMode] || batteryMode}</strong></span>
            </div>

            {wakeLockOn && (
              <span style={{
                fontSize: '10px',
                color: 'var(--clr-brand)',
                background: 'rgba(75, 139, 59, 0.2)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
              }}>
                🔆 Layar Aktif
              </span>
            )}
          </div>

          {/* Stop Tracking Button */}
          <button
            id="stop-tracking-btn"
            type="button"
            onClick={() => setShowStopConfirmModal(true)}
            style={{
              width: '100%',
              minHeight: '46px',
              padding: 'var(--space-2) var(--space-4)',
              background: 'var(--clr-bg-surface)',
              border: '1px solid rgba(220, 38, 38, 0.4)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--clr-danger)',
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              letterSpacing: '0.03em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all var(--transition-fast)',
            }}
          >
            <MaterialIcon name="pause_circle" size={18} color="var(--clr-danger)" />
            <span>HENTIKAN TRACKING (JEDA / SELESAI)</span>
          </button>
        </div>
      ) : (
        /* State B: Tracking Inactive (Standby to Start) */
        <div>
          <button
            id="start-tracking-btn"
            type="button"
            onClick={handleStart}
            style={{
              width: '100%',
              minHeight: '48px',
              padding: 'var(--space-3) var(--space-4)',
              background: 'linear-gradient(135deg, #2e5a27, #4b8b3b)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: '#fff',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
              boxShadow: '0 4px 16px rgba(75, 139, 59, 0.35)',
              transition: 'transform 0.1s ease, box-shadow 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <MaterialIcon name="sensors" size={20} color="#fff" />
            <span style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textAlign: 'center',
              lineHeight: 1.2,
            }}>
              MULAI LIVE TRACKING
            </span>
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            marginTop: '6px',
            fontSize: '11px',
            color: 'var(--clr-text-muted)',
            textAlign: 'center',
          }}>
            <span>💡</span>
            <span>Posisi GPS Anda akan disiarkan real-time ke Leaderboard & Peta</span>
          </div>
        </div>
      )}

      {/* ── Modal Konfirmasi Penghentian Tracking ──── */}
      {showStopConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(10, 14, 23, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
            animation: 'fade-in 0.2s ease',
          }}
          onClick={() => setShowStopConfirmModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              background: 'var(--clr-bg-surface)',
              border: '1.5px solid var(--clr-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              boxShadow: 'var(--shadow-xl)',
              textAlign: 'center',
              animation: 'pop-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'rgba(217, 119, 6, 0.15)',
              border: '2px solid var(--clr-warning)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--space-3)',
              color: 'var(--clr-warning)',
            }}>
              <MaterialIcon name="pause_circle" size={28} />
            </div>

            <h3 style={{
              fontSize: 'var(--text-md)',
              fontFamily: 'var(--font-display)',
              marginBottom: 'var(--space-2)',
              color: 'var(--clr-text-primary)',
            }}>
              Hentikan Live Tracking?
            </h3>

            <p style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--clr-text-secondary)',
              lineHeight: 1.5,
              marginBottom: 'var(--space-4)',
            }}>
              Pemancaran posisi GPS Anda akan dijeda di peta penonton dan leaderboard. Anda dapat melanjutkannya kembali kapan saja.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <button
                id="modal-confirm-stop-btn"
                className="btn btn-danger btn-lg w-full"
                onClick={handleConfirmStop}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: 800,
                }}
              >
                <MaterialIcon name="stop" size={18} />
                <span>YA, HENTIKAN TRACKING</span>
              </button>

              <button
                className="btn btn-ghost w-full"
                onClick={() => setShowStopConfirmModal(false)}
              >
                Batal (Tetap Lanjutkan)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
