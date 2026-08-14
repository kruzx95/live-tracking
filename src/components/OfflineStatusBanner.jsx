/**
 * OfflineStatusBanner.jsx
 * Indikator real-time status koneksi internet & antrian GPS offline.
 *
 * Tampil sebagai:
 * - Bar merah di ATAS layar saat offline: "⚠️ Offline — 12 titik GPS tersimpan"
 * - Badge hijau kecil di pojok saat baru kembali online: "✅ Synced 12 titik GPS"
 * - Tidak tampil sama sekali saat online & antrian kosong
 */

import { useState, useEffect, useRef } from 'react';
import MaterialIcon from './MaterialIcon';
import offlineQueue from '../utils/offlineQueue';

export default function OfflineStatusBanner() {
  const [isOnline, setIsOnline]         = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncedCount, setSyncedCount]   = useState(0);
  const [showSyncedMsg, setShowSyncedMsg] = useState(false);
  const syncTimerRef = useRef(null);

  // Poll antrian pending setiap 3 detik saat offline
  useEffect(() => {
    let pollInterval = null;

    const updatePending = async () => {
      const count = await offlineQueue.pendingCount();
      setPendingCount(count);
    };

    const handleOnline = async () => {
      setIsOnline(true);
      const prev = await offlineQueue.pendingCount();
      if (prev > 0) {
        setSyncedCount(prev);
        setShowSyncedMsg(true);
        // Sembunyikan pesan "Synced" setelah 4 detik
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => {
          setShowSyncedMsg(false);
          setSyncedCount(0);
        }, 4000);
      }
      setPendingCount(0);
      if (pollInterval) clearInterval(pollInterval);
    };

    const handleOffline = () => {
      setIsOnline(false);
      updatePending();
      // Mulai poll setiap 3 detik saat offline
      pollInterval = setInterval(updatePending, 3000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cek kondisi awal
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (pollInterval) clearInterval(pollInterval);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  // ─── OFFLINE BANNER (full-width, di atas layar) ───────────────
  if (!isOnline) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: 'linear-gradient(90deg, #7f1d1d, #991b1b)',
          borderBottom: '1px solid #ef4444',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          boxShadow: '0 4px 20px rgba(239,68,68,0.4)',
          animation: 'slideDown 0.3s ease',
        }}
      >
        {/* Pulsing dot */}
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#fca5a5',
          animation: 'sos-active-pulse 1.2s ease-in-out infinite',
          flexShrink: 0,
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fecaca', fontSize: 13, fontWeight: 700, letterSpacing: '0.01em' }}>
          <MaterialIcon name="cloud_off" size={18} color="#fca5a5" />
          <span>Tidak Ada Koneksi Internet</span>
        </div>

        {pendingCount > 0 && (
          <>
            <span style={{
              color: '#fca5a5',
              fontSize: 12,
              opacity: 0.8,
            }}>
              —
            </span>
            <span style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 20,
              padding: '2px 10px',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <MaterialIcon name="sensors" size={14} color="#fff" />
              <span>{pendingCount} titik GPS tersimpan</span>
            </span>
          </>
        )}

        {pendingCount === 0 && (
          <span style={{ color: '#fca5a5', fontSize: 12, opacity: 0.75 }}>
            Data GPS akan disimpan otomatis
          </span>
        )}
      </div>
    );
  }

  // ─── SYNC SUCCESS TOAST (pojok kanan atas, 4 detik) ──────────
  if (showSyncedMsg && syncedCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 9999,
          background: 'linear-gradient(135deg, rgba(22,101,52,0.97), rgba(20,83,45,0.97))',
          border: '1px solid #4ade80',
          borderRadius: 12,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 4px 20px rgba(74,222,128,0.3)',
          animation: 'slideDown 0.3s ease',
          maxWidth: 280,
        }}
      >
        <MaterialIcon name="cloud_done" size={24} color="#86efac" />
        <div>
          <div style={{ color: '#86efac', fontSize: 13, fontWeight: 700 }}>
            Koneksi Pulih!
          </div>
          <div style={{ color: '#4ade80', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {syncedCount} titik GPS berhasil dikirim
          </div>
        </div>
      </div>
    );
  }

  return null;
}
