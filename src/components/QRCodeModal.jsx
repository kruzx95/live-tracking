/**
 * QRCodeModal.jsx
 * Modal untuk menampilkan QR Code Live Event, Tombol Salin Link, dan Bagikan ke WhatsApp
 */

import { useState } from 'react';

export default function QRCodeModal({ isOpen, onClose, eventUrl, routeName, onToast }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const targetUrl = eventUrl || window.location.href;
  const shareText = `🚴 Live Tracking Event Sepeda${routeName ? `: "${routeName}"` : ''}! Pantau posisi seluruh peserta secara real-time di peta:\n${targetUrl}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      onToast?.('Link Live Event berhasil disalin!', 'success', '📋');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      onToast?.('Gagal menyalin link', 'error', '❌');
    }
  };

  const handleShareWA = () => {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, '_blank');
  };

  // Google Chart API QR Generator untuk kejelasan tinggi
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(targetUrl)}&color=00e5ff&bgcolor=0d1117&margin=1`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 14, 23, 0.82)',
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
          maxWidth: 380,
          background: 'var(--clr-bg-surface)',
          border: '1px solid var(--clr-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xl)',
          position: 'relative',
          textAlign: 'center',
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
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--clr-text-primary)', marginBottom: 'var(--space-1)' }}>
          📱 Bagikan Live Event
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-5)' }}>
          Scan QR Code atau bagikan link ke penonton & peserta
        </div>

        {/* QR Code Container */}
        <div
          style={{
            width: 220, height: 220,
            margin: '0 auto var(--space-5)',
            padding: 'var(--space-3)',
            background: '#0d1117',
            border: '2px solid var(--clr-brand)',
            borderRadius: 'var(--radius-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(0, 229, 255, 0.25)',
          }}
        >
          <img
            src={qrImageUrl}
            alt="Live Event QR Code"
            style={{ width: '100%', height: '100%', borderRadius: '4px', display: 'block' }}
          />
        </div>

        {/* Box URL */}
        <div
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--clr-brand)',
            background: 'var(--clr-brand-dim)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 'var(--space-5)',
            wordBreak: 'break-all',
            border: '1px solid rgba(0, 198, 255, 0.2)',
          }}
        >
          {targetUrl}
        </div>

        {/* Tombol Aksi */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <button
            onClick={handleCopyLink}
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--clr-border)',
              background: copied ? 'rgba(74, 222, 128, 0.2)' : 'var(--clr-bg-elevated)',
              color: copied ? '#4ade80' : 'var(--clr-text-primary)',
              fontWeight: 700,
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.2s ease',
            }}
          >
            {copied ? '✅ Tersalin!' : '📋 Salin Link'}
          </button>

          <button
            onClick={handleShareWA}
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: '#25D366',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)',
            }}
          >
            💬 WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
