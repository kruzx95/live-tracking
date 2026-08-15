/**
 * SOSButton.jsx
 * Modul Tombol Darurat (SOS) untuk Pesepeda / Rider
 *
 * Fitur:
 * 1. Hold-to-Activate (Tahan 2 Detik): Mencegah tombol terpencet tidak sengaja saat gowes.
 * 2. Visual Progress Indicator: Bar pengisi otomatis saat tombol ditahan.
 * 3. Haptic Feedback: Getaran smartphone saat menahan dan saat SOS aktif.
 * 4. Tap Modal Fallback: Jika di-tap biasa, muncul modal konfirmasi darurat yang elegan.
 * 5. Active Emergency Banner: Tampilan status siaga darurat saat SOS aktif, lengkap dengan tombol pembatalan.
 * 6. 100% Responsif & Anti-clipping di semua ukuran layar smartphone.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import MaterialIcon from './MaterialIcon';

const HOLD_DURATION_MS = 2000; // Tahan 2 detik untuk aktivasi

export default function SOSButton({
  isSOS,
  onTriggerSOS,
  onCancelSOS,
  riderName = '',
  bib = '',
}) {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0 to 100
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const holdStartTimeRef = useRef(null);
  const animFrameRef = useRef(null);
  const pressStartTimeRef = useRef(0);

  // ── Hold-to-Activate Logic ────────────────────────
  const startHold = useCallback(() => {
    // Cegah context menu / text selection di mobile
    if (isSOS) return;
    
    pressStartTimeRef.current = Date.now();
    holdStartTimeRef.current = Date.now();
    setIsHolding(true);
    setHoldProgress(0);

    // Haptic feedback awal
    if (navigator.vibrate) {
      try { navigator.vibrate(40); } catch (err) {}
    }

    const updateProgress = () => {
      const elapsed = Date.now() - holdStartTimeRef.current;
      const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        // SOS Berhasil Terpicu via Hold!
        setIsHolding(false);
        setHoldProgress(0);
        holdStartTimeRef.current = null;
        
        if (navigator.vibrate) {
          try { navigator.vibrate([200, 100, 200, 100, 400]); } catch (err) {}
        }
        
        onTriggerSOS?.();
      } else {
        animFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    animFrameRef.current = requestAnimationFrame(updateProgress);
  }, [isSOS, onTriggerSOS]);

  const stopHold = useCallback(() => {
    if (!isHolding) return;

    const pressDuration = Date.now() - pressStartTimeRef.current;
    setIsHolding(false);
    setHoldProgress(0);
    holdStartTimeRef.current = null;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Jika di-tap biasa (< 350ms), buka modal konfirmasi darurat
    if (pressDuration < 350 && !isSOS) {
      setShowConfirmModal(true);
    }
  }, [isHolding, isSOS]);

  // Cleanup animasi saat unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // ── Handler Konfirmasi Modal ──────────────────────
  const handleConfirmSOSFromModal = () => {
    setShowConfirmModal(false);
    if (navigator.vibrate) {
      try { navigator.vibrate([200, 100, 200, 100, 400]); } catch (err) {}
    }
    onTriggerSOS?.();
  };

  const handleCancelSOSFromModal = () => {
    setShowCancelModal(false);
    onCancelSOS?.();
  };

  return (
    <div style={{
      background: isSOS ? 'rgba(220, 38, 38, 0.12)' : 'var(--clr-bg-elevated)',
      border: `1px solid ${isSOS ? 'var(--clr-danger)' : 'rgba(220, 38, 38, 0.25)'}`,
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3)',
      transition: 'all var(--transition-base)',
      animation: isSOS ? 'sos-idle-pulse 2s ease-in-out infinite' : 'none',
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
          color: 'var(--clr-danger)',
          fontSize: 'var(--text-xs)',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          <MaterialIcon name="emergency" size={16} color="var(--clr-danger)" />
          <span>Tombol Darurat (SOS)</span>
        </div>

        {isSOS && (
          <span style={{
            background: 'var(--clr-danger)',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            animation: 'badge-sos-blink 1s step-end infinite',
          }}>
            AKTIF
          </span>
        )}
      </div>

      {/* State A: SOS Sedang Aktif */}
      {isSOS ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{
            background: 'rgba(220, 38, 38, 0.18)',
            border: '1px solid rgba(220, 38, 38, 0.4)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-2) var(--space-3)',
            fontSize: '11px',
            color: '#fca5a5',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}>
            <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>🚨</span>
            <div>
              <strong style={{ color: '#fff', display: 'block' }}>Panitia Telah Diberitahu!</strong>
              Sinyal darurat Anda disiarkan secara prioritas. Tetap berada di lokasi aman.
            </div>
          </div>

          <button
            id="cancel-sos-btn"
            onClick={() => setShowCancelModal(true)}
            style={{
              width: '100%',
              padding: 'var(--space-3)',
              background: 'var(--clr-bg-surface)',
              border: '1px solid var(--clr-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--clr-text-primary)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all var(--transition-fast)',
            }}
          >
            <MaterialIcon name="check_circle" size={16} color="var(--clr-brand)" />
            <span>Batalkan Status SOS (Sudah Aman)</span>
          </button>
        </div>
      ) : (
        /* State B: SOS Standby (Hold to Trigger) */
        <div>
          <button
            id="sos-btn"
            type="button"
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: '100%',
              minHeight: '48px',
              padding: 'var(--space-3) var(--space-4)',
              background: 'linear-gradient(135deg, #b91c1c, #dc2626)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: '#fff',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
              boxShadow: isHolding
                ? '0 0 20px rgba(220, 38, 38, 0.8)'
                : '0 4px 16px rgba(220, 38, 38, 0.35)',
              transform: isHolding ? 'scale(0.98)' : 'scale(1)',
              transition: 'transform 0.1s ease, box-shadow 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {/* Fill Progress Bar saat ditahan */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${holdProgress}%`,
                background: 'rgba(255, 255, 255, 0.3)',
                transition: isHolding ? 'none' : 'width 0.2s ease',
                pointerEvents: 'none',
              }}
            />

            <MaterialIcon
              name="emergency"
              size={20}
              color="#fff"
              style={{
                flexShrink: 0,
                animation: isHolding ? 'sos-active-pulse 0.5s infinite' : 'none',
              }}
            />

            <span style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textAlign: 'center',
              lineHeight: 1.2,
              position: 'relative',
              zIndex: 1,
            }}>
              {isHolding
                ? `TAHAN UNTUK KIRIM SOS (${Math.ceil((HOLD_DURATION_MS * (1 - holdProgress / 100)) / 1000)}s)...`
                : 'KIRIM SOS — BUTUH BANTUAN'}
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
            <span>Tahan tombol <strong>2 detik</strong> atau tap untuk konfirmasi</span>
          </div>
        </div>
      )}

      {/* ── Modal Konfirmasi Kirim SOS (Saat Tap Biasa) ──── */}
      {showConfirmModal && (
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
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              background: 'var(--clr-bg-surface)',
              border: '1.5px solid var(--clr-danger)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              boxShadow: '0 12px 40px rgba(220, 38, 38, 0.35)',
              textAlign: 'center',
              animation: 'pop-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(220, 38, 38, 0.15)',
              border: '2px solid var(--clr-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--space-3)',
              color: 'var(--clr-danger)',
            }}>
              <MaterialIcon name="emergency" size={28} />
            </div>

            <h3 style={{
              fontSize: 'var(--text-lg)',
              fontFamily: 'var(--font-display)',
              marginBottom: 'var(--space-2)',
              color: 'var(--clr-text-primary)',
            }}>
              Konfirmasi Panggilan Darurat
            </h3>

            <p style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--clr-text-secondary)',
              lineHeight: 1.5,
              marginBottom: 'var(--space-4)',
            }}>
              Sinyal darurat atas nama <strong>{riderName || `Peserta #${bib}`}</strong> beserta koordinat lokasi GPS Anda akan <strong>langsung disiarkan ke Panitia Event</strong>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <button
                id="modal-confirm-sos-btn"
                className="btn btn-danger btn-lg w-full"
                onClick={handleConfirmSOSFromModal}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: 800,
                }}
              >
                <MaterialIcon name="emergency" size={20} />
                <span>YA, KIRIM SOS SEKARANG</span>
              </button>

              <button
                className="btn btn-ghost w-full"
                onClick={() => setShowConfirmModal(false)}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Konfirmasi Batalkan SOS ─────────────── */}
      {showCancelModal && (
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
          onClick={() => setShowCancelModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              background: 'var(--clr-bg-surface)',
              border: '1px solid var(--clr-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              boxShadow: 'var(--shadow-xl)',
              textAlign: 'center',
              animation: 'pop-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(75, 139, 59, 0.15)',
              border: '2px solid var(--clr-brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--space-3)',
              color: 'var(--clr-brand)',
            }}>
              <MaterialIcon name="check_circle" size={26} />
            </div>

            <h3 style={{
              fontSize: 'var(--text-md)',
              fontFamily: 'var(--font-display)',
              marginBottom: 'var(--space-2)',
            }}>
              Batalkan Status Darurat?
            </h3>

            <p style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--clr-text-secondary)',
              lineHeight: 1.5,
              marginBottom: 'var(--space-4)',
            }}>
              Panitia akan diberitahu bahwa kondisi Anda telah aman dan live tracking akan kembali ke status normal.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <button
                id="modal-confirm-cancel-sos-btn"
                className="btn btn-primary btn-lg w-full"
                onClick={handleCancelSOSFromModal}
                style={{ fontWeight: 700 }}
              >
                Ya, Kondisi Sudah Aman
              </button>

              <button
                className="btn btn-ghost w-full"
                onClick={() => setShowCancelModal(false)}
              >
                Kembali (Tetap SOS)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
