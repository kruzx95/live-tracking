/**
 * CycloTrackLogo.jsx
 * Logo Inisial Sementara "CT"
 */

export default function CycloTrackLogo({ size = 32 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: 'linear-gradient(135deg, #161b22, #0d1117)',
        border: '1.5px solid #00c6ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: 900,
        fontSize: Math.round(size * 0.45),
        color: '#00e5ff',
        letterSpacing: '-0.05em',
        userSelect: 'none',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0, 198, 255, 0.25)',
      }}
    >
      CT
    </div>
  );
}
