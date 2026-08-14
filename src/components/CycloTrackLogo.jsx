/**
 * CycloTrackLogo.jsx
 * Logo dengan ikon sepeda SVG — light theme teal
 */

export default function CycloTrackLogo({ size = 32 }) {
  const padding = Math.round(size * 0.16);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: 'linear-gradient(135deg, #2E3A24, #4B8B3B)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(75, 139, 59, 0.4)',
        padding: padding,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="100%"
        height="100%"
      >
        {/* Rear wheel */}
        <circle cx="5.5" cy="17.5" r="3.5" />
        {/* Front wheel */}
        <circle cx="18.5" cy="17.5" r="3.5" />
        {/* Frame */}
        <path d="M5.5 17.5L10 9l5 8.5" />
        <path d="M10 9h5.5l3 8.5" />
        {/* Handlebar */}
        <path d="M15.5 9h3" />
        {/* Seat post */}
        <path d="M10 9l-1.5-3h3" />
      </svg>
    </div>
  );
}

