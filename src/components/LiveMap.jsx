/**
 * LiveMap.jsx
 * Komponen peta Leaflet interaktif untuk live tracking event sepeda
 * Fitur: Marker Clustering, label nama permanen, spiderfy, auto fit bounds,
 * high-contrast polyline, trail path, waypoint icons, tombol Recenter.
 */

import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RIDER_STATUS } from '../utils/realtimeEngine';

// Fix default icon Leaflet (issue Vite/Webpack)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Waypoint Icons ─────────────────────────────────
const WAYPOINT_ICONS = {
  start: { emoji: '🚩', color: '#4ade80', label: 'Start' },
  finish: { emoji: '🏁', color: '#00c6ff', label: 'Finish' },
  checkpoint: { emoji: '📍', color: '#fbbf24', label: 'CP' },
  water: { emoji: '💧', color: '#38bdf8', label: 'Water' },
  store: { emoji: '🏪', color: '#a78bfa', label: 'Toko' },
};

function createWaypointIcon(type, label = '') {
  const cfg = WAYPOINT_ICONS[type] || WAYPOINT_ICONS.checkpoint;
  const displayLabel = label || cfg.label;

  return L.divIcon({
    className: '',
    html: `
      <div style="
        display:flex; align-items:center; gap:4px;
        padding: 3px 8px;
        background: rgba(13,17,23,0.92);
        border: 2px solid ${cfg.color};
        border-radius: 20px;
        font-family: 'Inter', sans-serif;
        font-size: 11px; font-weight: 700;
        color: #e6edf3;
        box-shadow: 0 2px 10px rgba(0,0,0,0.6), 0 0 10px ${cfg.color}55;
        white-space: nowrap;
        cursor: pointer;
      ">
        <span style="font-size:13px;">${cfg.emoji}</span>
        <span>${displayLabel}</span>
      </div>
    `,
    iconSize: [80, 28],
    iconAnchor: [40, 14],
    popupAnchor: [0, -16],
  });
}

// ── Rider Dot Icons ────────────────────────────────
function createRiderIcon(rider) {
  const statusColors = {
    [RIDER_STATUS.ACTIVE]:    '#4ade80',
    [RIDER_STATUS.STOPPED]:   '#fbbf24',
    [RIDER_STATUS.OFFCOURSE]: '#f97316',
    [RIDER_STATUS.SOS]:       '#ff2d55',
    [RIDER_STATUS.FINISHED]:  '#00c6ff',
    [RIDER_STATUS.DNF]:       '#6b7280',
  };

  const dotColor = statusColors[rider.status] || rider.color || '#00c6ff';
  const isSOS = rider.status === RIDER_STATUS.SOS;
  const isFinished = rider.status === RIDER_STATUS.FINISHED;

  const initials = rider.name
    ? rider.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative; width:38px; height:38px;">
        ${isSOS ? `
          <div style="
            position:absolute; inset:-10px;
            border-radius:50%;
            background: rgba(255,45,85,0.3);
            animation: ping-ring 1.2s ease-out infinite;
          "></div>
          <div style="
            position:absolute; inset:-5px;
            border-radius:50%;
            background: rgba(255,45,85,0.2);
            animation: ping-ring 1.2s ease-out 0.3s infinite;
          "></div>
        ` : ''}
        <div style="
          width: 38px; height: 38px;
          background: rgba(13,17,23,0.94);
          border: 2.5px solid ${dotColor};
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Inter', sans-serif;
          font-size: 12px; font-weight: 700;
          color: ${dotColor};
          box-shadow: 0 3px 12px rgba(0,0,0,0.8), 0 0 ${isSOS ? '18px' : '10px'} ${dotColor}77;
          position: relative; z-index: 1;
          ${isFinished ? 'opacity: 0.8;' : ''}
        ">${initials}</div>
        <div style="
          position:absolute; bottom:-4px; left:50%; transform:translateX(-50%);
          width:0; height:0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid ${dotColor};
        "></div>
      </div>
    `,
    iconSize: [38, 44],
    iconAnchor: [19, 44],
    popupAnchor: [0, -46],
  });
}

// ── Popup Content ──────────────────────────────────
function createRiderPopup(rider) {
  const statusLabel = {
    [RIDER_STATUS.ACTIVE]:    '🟢 Aktif',
    [RIDER_STATUS.STOPPED]:   '🟡 Berhenti',
    [RIDER_STATUS.OFFCOURSE]: '🟠 Off-Course',
    [RIDER_STATUS.SOS]:       '🔴 SOS — DARURAT',
    [RIDER_STATUS.FINISHED]:  '✅ Finish',
    [RIDER_STATUS.DNF]:       '⚫ DNF',
  };

  const lastSeen = rider.lastSeen
    ? new Date(rider.lastSeen).toLocaleTimeString('id-ID')
    : '—';

  return `
    <div style="font-family:'Inter',sans-serif; min-width:180px; padding:4px;">
      <div style="font-size:13px; font-weight:700; color:#e6edf3; margin-bottom:4px;">${rider.name}</div>
      <div style="font-size:11px; color:#8b949e; margin-bottom:8px;">${statusLabel[rider.status] || rider.status}</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px;">
        <div>
          <div style="color:#484f58; font-size:10px; margin-bottom:2px;">KECEPATAN</div>
          <div style="color:#00c6ff; font-weight:700; font-family:'JetBrains Mono',monospace;">${rider.speed ? rider.speed.toFixed(1) : '0.0'} km/h</div>
        </div>
        <div>
          <div style="color:#484f58; font-size:10px; margin-bottom:2px;">JARAK TEMPUH</div>
          <div style="color:#4ade80; font-weight:700; font-family:'JetBrains Mono',monospace;">${rider.distanceTraveled ? rider.distanceTraveled.toFixed(2) : '0.00'} km</div>
        </div>
        <div>
          <div style="color:#484f58; font-size:10px; margin-bottom:2px;">ELEVASI</div>
          <div style="color:#e6edf3; font-weight:600; font-family:'JetBrains Mono',monospace;">${rider.ele || 0} m</div>
        </div>
        <div>
          <div style="color:#484f58; font-size:10px; margin-bottom:2px;">UPDATE</div>
          <div style="color:#8b949e; font-weight:500;">${lastSeen}</div>
        </div>
      </div>
      ${rider.isOffCourse ? '<div style="margin-top:8px; padding:4px 8px; background:rgba(249,115,22,0.15); border-radius:4px; font-size:11px; color:#f97316; font-weight:600;">⚠️ Rider keluar dari rute!</div>' : ''}
      ${rider.isSOS ? '<div style="margin-top:8px; padding:4px 8px; background:rgba(255,45,85,0.2); border-radius:4px; font-size:11px; color:#ff2d55; font-weight:700; text-align:center;">🆘 MEMBUTUHKAN BANTUAN!</div>' : ''}
    </div>
  `;
}

// ── LiveMap Component ──────────────────────────────
export default function LiveMap({ riders = [], route = null, focusedRiderId = null, onRiderClick }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef(new Map());      // riderId -> L.Marker
  const trailsRef  = useRef(new Map());      // riderId -> L.Polyline
  const routeLayerGroupRef = useRef(null);

  // Fit rute ke layar secara presisi
  const fitRouteToBounds = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !route?.trackPoints?.length) return;

    map.invalidateSize();

    if (route.bounds) {
      map.fitBounds(route.bounds, {
        padding: [50, 50],
        maxZoom: 16,
        animate: true,
      });
    }
  }, [route]);

  // ── Init Leaflet Map ─────────────────────────────
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;

    const map = L.map(mapRef.current, {
      center: [-7.2575, 112.7521], // Default center
      zoom: 12,
      zoomControl: false, // Matikan kontrol zoom default di topleft
      attributionControl: true,
    });

    // Tambahkan kontrol zoom manual di pojok kanan bawah agar bebas tabrakan
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Layer grup rute
    routeLayerGroupRef.current = L.layerGroup().addTo(map);

    // Tile Layer: OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright" style="color:#00c6ff">OpenStreetMap</a>',
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);



    // Invalidate size saat window / container resize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapRef.current);

    mapInstanceRef.current = map;

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ── Render Rute GPX ──────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = routeLayerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (!route?.trackPoints?.length) return;

    const latLngs = route.trackPoints.map((pt) => [pt.lat, pt.lon]);

    // 1. Shadow / Glow casing luar (hitam gelap untuk kontras di peta OSM)
    L.polyline(latLngs, {
      color: '#0d1117',
      weight: 8,
      opacity: 0.7,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(layerGroup);

    // 2. Garis utama rute (Neon Cyan / High-visibility)
    L.polyline(latLngs, {
      color: '#00e5ff',
      weight: 4.5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layerGroup);

    // 3. Render Waypoints manual dari GPX <wpt>
    const waypointCoordinates = new Set();
    route.waypoints?.forEach((wpt) => {
      waypointCoordinates.add(`${wpt.lat.toFixed(5)},${wpt.lon.toFixed(5)}`);
      const marker = L.marker([wpt.lat, wpt.lon], {
        icon: createWaypointIcon(wpt.type, wpt.name),
        zIndexOffset: 100,
      }).addTo(layerGroup);

      marker.bindPopup(`
        <div style="font-family:'Inter',sans-serif; padding:4px;">
          <div style="font-size:12px; font-weight:700; color:#e6edf3;">${wpt.name}</div>
          ${wpt.desc ? `<div style="font-size:11px; color:#8b949e; margin-top:2px;">${wpt.desc}</div>` : ''}
          <div style="font-size:10px; color:#484f58; margin-top:4px; text-transform:uppercase; letter-spacing:0.06em;">${wpt.type}</div>
        </div>
      `);
    });

    // 4. Auto-add START & FINISH markers jika tidak ada waypoint manual
    const startPt = route.trackPoints[0];
    const finishPt = route.trackPoints[route.trackPoints.length - 1];

    if (startPt && !waypointCoordinates.has(`${startPt.lat.toFixed(5)},${startPt.lon.toFixed(5)}`)) {
      L.marker([startPt.lat, startPt.lon], {
        icon: createWaypointIcon('start', 'START'),
        zIndexOffset: 200,
      }).addTo(layerGroup).bindPopup('<b>🚩 Titik Start Rute</b>');
    }

    if (finishPt && !waypointCoordinates.has(`${finishPt.lat.toFixed(5)},${finishPt.lon.toFixed(5)}`)) {
      L.marker([finishPt.lat, finishPt.lon], {
        icon: createWaypointIcon('finish', 'FINISH'),
        zIndexOffset: 200,
      }).addTo(layerGroup).bindPopup('<b>🏁 Titik Finish Rute</b>');
    }

    // Auto fit bounds setelah rute dimuat
    setTimeout(() => {
      fitRouteToBounds();
    }, 150);

  }, [route, fitRouteToBounds]);

  // ── Render Rider Markers & Trails ────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentIds = new Set(riders.map((r) => r.id));

    // Hapus marker & trail lama yang tidak ada di list terbaru
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });
    trailsRef.current.forEach((trail, id) => {
      if (!currentIds.has(id)) {
        trail.remove();
        trailsRef.current.delete(id);
      }
    });

    riders.forEach((rider) => {
      if (rider.lat === null || rider.lon === null) return;

      // Trail Path (lintasan jejak)
      if (rider.path?.length > 1) {
        if (trailsRef.current.has(rider.id)) {
          trailsRef.current.get(rider.id).setLatLngs(rider.path);
        } else {
          const trail = L.polyline(rider.path, {
            color: rider.color || '#00c6ff',
            weight: 2.5,
            opacity: 0.5,
            dashArray: '5, 6',
            lineCap: 'round',
            interactive: false,
          }).addTo(map);
          trailsRef.current.set(rider.id, trail);
        }
      }

      // ── Rider Marker ──
      if (markersRef.current.has(rider.id)) {
        // Update marker posisi & icon yang sudah ada
        const marker = markersRef.current.get(rider.id);
        marker.setLatLng([rider.lat, rider.lon]);
        marker.setIcon(createRiderIcon(rider));
        // Update label nama (tooltip permanen)
        const shortName = rider.name ? rider.name.split(' ').slice(0, 2).join(' ') : '?';
        marker.setTooltipContent(shortName);
        if (marker.isPopupOpen()) {
          marker.setPopupContent(createRiderPopup(rider));
        }
      } else {
        // Buat marker baru & langsung tambahkan ke peta
        const marker = L.marker([rider.lat, rider.lon], {
          icon: createRiderIcon(rider),
          zIndexOffset: 1000,
        }).addTo(map);

        // Tooltip permanen: nama rider selalu terlihat tanpa klik
        const shortName = rider.name ? rider.name.split(' ').slice(0, 2).join(' ') : '?';
        marker.bindTooltip(shortName, {
          permanent: true,
          direction: 'bottom',
          offset: [0, 6],
          className: 'rider-name-tooltip',
        });

        // Popup detail: muncul saat diklik
        marker.bindPopup(createRiderPopup(rider), { maxWidth: 240 });
        marker.on('click', () => {
          marker.setPopupContent(createRiderPopup(rider));
          onRiderClick?.(rider.id);
        });

        markersRef.current.set(rider.id, marker);
      }
    });
  }, [riders, onRiderClick]);

  // ── Focus on Rider ────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusedRiderId) return;

    const rider = riders.find((r) => r.id === focusedRiderId);
    if (rider?.lat != null) {
      map.setView([rider.lat, rider.lon], Math.max(map.getZoom(), 15), {
        animate: true,
        duration: 0.8,
      });
    }
  }, [focusedRiderId, riders]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Map Container */}
      <div id="live-map" ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Button Fit Rute Manual (Pojok Kanan Atas) */}
      {route?.trackPoints?.length > 0 && (
        <button
          onClick={fitRouteToBounds}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 400,
            background: 'rgba(13, 17, 23, 0.92)',
            border: '1px solid var(--clr-border)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            color: 'var(--clr-brand)',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backdropFilter: 'blur(8px)',
          }}
          title="Zoom dan pusatkan rute GPX ke layar"
          id="btn-fit-route"
        >
          📍 Fit Rute
        </button>
      )}
    </div>
  );
}
