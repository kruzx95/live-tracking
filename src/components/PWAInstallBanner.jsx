/**
 * PWAInstallBanner.jsx
 * Banner & Tombol Install PWA (Add to Home Screen)
 * Mendukung Android (beforeinstallprompt) & iOS Safari (Petunjuk Tambah ke Layar Utama)
 */

import { useState, useEffect } from 'react';
import { DeviceMobile, DownloadSimple, ArrowSquareOut } from '@phosphor-icons/react';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS]                   = useState(false);
  const [isStandalone, setIsStandalone]     = useState(false);
  const [showIOSGuide, setShowIOSGuide]     = useState(false);

  useEffect(() => {
    // Deteksi jika sudah berjalan dalam mode standalone (aplikasi ter-install)
    const isStandaloneApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsStandalone(isStandaloneApp);

    // Deteksi perangkat iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Capture prompt event di Android / Chrome
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  // Jika sudah ter-install sebagai app standalone, tidak perlu tampilkan banner install
  if (isStandalone) return null;

  return (
    <>
      {/* Button Banner Install */}
      {(deferredPrompt || isIOS) && (
        <div style={{
          width: '100%',
          maxWidth: 420,
          background: 'rgba(75,139,59,0.08)',
          border: '1px solid var(--clr-border-glow)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-3) var(--space-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          boxShadow: '0 2px 12px rgba(75,139,59,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{
              width: 40, height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #2E3A24, #4B8B3B)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(75,139,59,0.3)',
            }}>
              <DeviceMobile size={22} weight="duotone" color="white" />
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--clr-brand)' }}>
                Install Aplikasi CycloTrack
              </div>
              <div style={{ fontSize: '11px', color: 'var(--clr-text-muted)' }}>
                Akses cepat di layar HP tanpa buka browser
              </div>
            </div>
          </div>

          <button
            onClick={handleInstallClick}
            className="btn btn-primary btn-sm"
            style={{
              padding: '6px 14px',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            id="pwa-install-btn"
          >
            <DownloadSimple size={14} weight="bold" /> Install
          </button>
        </div>
      )}

      {/* Guide Modal khusus iOS */}
      {showIOSGuide && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--space-4)',
          }}
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            style={{
              background: 'var(--clr-bg-card)',
              border: '1px solid var(--clr-border)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-6)',
              maxWidth: 320,
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
          <div style={{
            width: 56, height: 56,
            margin: '0 auto var(--space-3)',
            borderRadius: 14,
            background: 'linear-gradient(135deg, #2E3A24, #4B8B3B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(75,139,59,0.3)',
          }}>
            <DeviceMobile size={30} weight="duotone" color="white" />
          </div>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
              Cara Install di iPhone / iPad
            </h3>
            <ol style={{ textAlign: 'left', fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.8, paddingLeft: 20, marginBottom: 'var(--space-4)' }}>
              <li>Buka aplikasi di browser <b>Safari</b></li>
              <li>Tekan tombol **Share** ⎕↑ di bagian bawah layar</li>
              <li>Gulir ke bawah lalu pilih <b>"Add to Home Screen ➕"</b></li>
            </ol>
            <button className="btn btn-primary w-full" onClick={() => setShowIOSGuide(false)}>
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
