/**
 * BackgroundGPSGuideModal.jsx
 * Modal Panduan Optimasi GPS HP saat Layar Terkunci / Dimasukkan Kantong Jersey
 */

import { useState, useEffect } from 'react';

export default function BackgroundGPSGuideModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('android'); // 'android', 'samsung', 'xiaomi', 'ios'
  const [batteryLevel, setBatteryLevel] = useState(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      navigator.getBattery().then((battery) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      }).catch(() => {});
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 14, 23, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        animation: 'fade-in 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: '90vh',
          background: 'var(--clr-bg-surface)',
          border: '1px solid var(--clr-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xl)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          animation: 'pop-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tombol Tutup */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14, right: 14,
            background: 'var(--clr-bg-elevated)',
            border: 'none',
            color: 'var(--clr-text-secondary)',
            width: 32, height: 32,
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Tutup Modal"
        >
          ✖
        </button>

        {/* Header Modal */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
          <div style={{ fontSize: '28px', marginBottom: '4px' }}>🔋🚴</div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--clr-text-primary)' }}>
            Tips GPS Layar Mati (Kantong Jersey)
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-secondary)', marginTop: '2px' }}>
            Agar lacak lokasi tetap akurat & tidak mati saat layar HP dikunci
          </div>
        </div>

        {/* Battery Info Banner (jika didukung) */}
        {batteryLevel !== null && (
          <div
            style={{
              padding: 'var(--space-3)',
              background: batteryLevel < 20 ? 'rgba(239,68,68,0.15)' : 'rgba(74,222,128,0.12)',
              border: `1px solid ${batteryLevel < 20 ? '#ef4444' : '#4ade80'}44`,
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 'var(--text-xs)',
            }}
          >
            <span style={{ fontWeight: 600 }}>🔋 Status Baterai HP Anda:</span>
            <span style={{ fontWeight: 800, color: batteryLevel < 20 ? '#ef4444' : '#4ade80', fontFamily: 'var(--font-mono)' }}>
              {batteryLevel}%
            </span>
          </div>
        )}

        {/* Highlight Penting */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgba(0, 114, 255, 0.1)',
            borderLeft: '4px solid var(--clr-brand)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            color: 'var(--clr-text-primary)',
            marginBottom: 'var(--space-4)',
            lineHeight: 1.5,
          }}
        >
          💡 <b>Fitur Wake Lock Otomatis</b> di CycloTrack berusaha menjaga layar tetap aktif. Namun agar aman saat ditaruh di kantong jersey, pastikan Penghemat Baterai tidak mematikan browser Chrome/Safari Anda.
        </div>

        {/* Tab Merk HP */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 'var(--space-4)' }}>
          {[
            { id: 'android', label: 'Android' },
            { id: 'xiaomi',  label: 'Xiaomi' },
            { id: 'samsung', label: 'Samsung' },
            { id: 'ios',     label: 'iPhone' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px var(--space-2)',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeTab === tab.id ? 'var(--clr-brand)' : 'var(--clr-bg-elevated)',
                color: activeTab === tab.id ? '#ffffff' : 'var(--clr-text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Konten Langkah Per Merk HP */}
        <div style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--clr-text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-5)' }}>
          {activeTab === 'android' && (
            <ol style={{ paddingLeft: 'var(--space-4)', margin: 0 }}>
              <li style={{ marginBottom: 6 }}>Buka <b>Pengaturan HP</b> ⚙️ &gt; <b>Aplikasi</b> &gt; <b>Chrome</b>.</li>
              <li style={{ marginBottom: 6 }}>Pilih <b>Baterai</b> / <b>Penghemat Baterai</b>.</li>
              <li style={{ marginBottom: 6 }}>Ubah ke <b>"Tidak Ada Pembatasan" (Unrestricted)</b>.</li>
              <li>Biarkan tab browser tetap terbuka di latar belakang.</li>
            </ol>
          )}

          {activeTab === 'xiaomi' && (
            <ol style={{ paddingLeft: 'var(--space-4)', margin: 0 }}>
              <li style={{ marginBottom: 6 }}>Tekan lama ikon browser Chrome &gt; <b>Info Aplikasi</b>.</li>
              <li style={{ marginBottom: 6 }}>Pilih <b>Penghemat Baterai</b>.</li>
              <li style={{ marginBottom: 6 }}>Ubah dari "Hemat Baterai" menjadi <b>"Tidak Ada Pembatasan"</b>.</li>
              <li>Kunci aplikasi Chrome di layar recent apps (Ikon Gembok).</li>
            </ol>
          )}

          {activeTab === 'samsung' && (
            <ol style={{ paddingLeft: 'var(--space-4)', margin: 0 }}>
              <li style={{ marginBottom: 6 }}>Buka <b>Pengaturan</b> &gt; <b>Aplikasi</b> &gt; <b>Chrome</b>.</li>
              <li style={{ marginBottom: 6 }}>Pilih <b>Baterai</b>.</li>
              <li style={{ marginBottom: 6 }}>Pilih opsi <b>"Tidak Dibatasi" (Unrestricted)</b>.</li>
              <li>Matikan opsi <b>"Putus Koneksi Saat Layar Mati"</b> jika ada.</li>
            </ol>
          )}

          {activeTab === 'ios' && (
            <ol style={{ paddingLeft: 'var(--space-4)', margin: 0 }}>
              <li style={{ marginBottom: 6 }}>Buka <b>Pengaturan iPhone</b> ⚙️ &gt; <b>Safari</b>.</li>
              <li style={{ marginBottom: 6 }}>Pastikan <b>Lokasi</b> diatur ke <b>"Saat Menggunakan"</b> atau <b>"Selalu"</b>.</li>
              <li style={{ marginBottom: 6 }}>Hindari menyalakan mode <b>Low Power Mode (Baterai Kuning)</b> saat gowes.</li>
              <li>Pastikan tab CycloTrack di Safari tetap menjadi tab aktif.</li>
            </ol>
          )}
        </div>

        {/* Tombol Tutup / Mengerti */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'linear-gradient(135deg, #0072ff, #00c6ff)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0, 198, 255, 0.3)',
          }}
        >
          ✅ Saya Mengerti, Siap Gowes!
        </button>
      </div>
    </div>
  );
}
