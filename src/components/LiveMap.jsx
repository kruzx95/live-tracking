/**
 * LiveMap.jsx
 * Komponen peta Leaflet interaktif untuk live tracking event sepeda
 * Menampilkan: rute GPX, marker rider (dots), checkpoints, trail path
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
  start: { emoji: '🚩', color: '#4ade80' },
  finish: { emoji: '🏁', color: '#00c6ff' },
  checkpoint: { emoji: '📍', color: '#fbbf24' },
  water: { emoji: '💧', color: '#38bdf8' },
  store: { emoji: '🏪', color: '#a78bfa' },
};

function createWaypointIcon(type) {
  const cfg = WAYPOINT_ICONS[type] || WAYPOINT_ICONS.checkpoint;
  return L.divIcon({
    className: '',
    html: `
      <div style="
        display:flex; align-items:center; justify-content:center;
        width:32px; height:32px;
        background: rgba(13,17,23,0.9);
        border: 2px solid ${cfg.color};
        border-radius: 50%;
        font-size: 15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.6), 0 0 8px ${cfg.color}44;
        cursor: pointer;
      ">${cfg.emoji}</div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
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
            position:absolute; inset:-8px;
            border-radius:50%;
            background: rgba(255,45,85,0.25);
            animation: ping-ring 1.2s ease-out infinite;
          "></div>
          <div style="
            position:absolute; inset:-4px;
            border-radius:50%;
            background: rgba(255,45,85,0.15);
            animation: ping-ring 1.2s ease-out 0.3s infinite;
          "></div>
        ` : ''}
        <div style="
          width: 38px; height: 38px;
          background: rgba(13,17,23,0.92);
          border: 2.5px solid ${dotColor};
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Inter', sans-serif;
          font-size: 12px; font-weight: 700;
          color: ${dotColor};
          box-shadow: 0 2px 12px rgba(0,0,0,0.7), 0 0 ${isSOS ? '16px' : '8px'} ${dotColor}66;
          position: relative; z-index: 1;
          ${isFinished ? 'opacity: 0.75;' : ''}
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
      <div style="font-size:13px; font-weight:700; color:#e6edf3; margin-bottom:6px;">${rider.name}</div>
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
  const markersRef = useRef(new Map());   // riderId -> L.Marker
  const trailsRef  = useRef(new Map());   // riderId -> L.Polyline
  const routeLayerRef = useRef(null);
  const waypointLayersRef = useRef([]);
  const focusedRef = useRef(null);

  // ── Init Leaflet Map ─────────────────────────────
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;

    const map = L.map(mapRef.current, {
      center: [-7.2575, 112.7521], // Default: Surabaya
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    // OSM tile layer dengan styling dark
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright" style="color:#00c6ff">OpenStreetMap</a>',
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);

    // Tambahkan CSS animasi untuk SOS ping ke head
    if (!document.getElementById('leaflet-custom-css')) {
      const style = document.createElement('style');
      style.id = 'leaflet-custom-css';
      style.textContent = `
        @keyframes ping-ring {
          0%   { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    mapInstanceRef.current = map;
    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ── Render Rute GPX ──────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Hapus layer rute lama
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }
    waypointLayersRef.current.forEach((l) => l.remove());
    waypointLayersRef.current = [];

    if (!route?.trackPoints?.length) return;

    // Gambar polyline rute
    const latLngs = route.trackPoints.map((pt) => [pt.lat, pt.lon]);

    // Garis shadow (efek tebal)
    L.polyline(latLngs, {
      color: 'rgba(0, 198, 255, 0.12)',
      weight: 12,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(map);

    // Garis utama rute
    const routeLine = L.polyline(latLngs, {
      color: '#00c6ff',
      weight: 3.5,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    routeLayerRef.current = routeLine;

    // Render waypoints (checkpoint, water station, dll)
    route.waypoints?.forEach((wpt) => {
      const marker = L.marker([wpt.lat, wpt.lon], {
        icon: createWaypointIcon(wpt.type),
        zIndexOffset: 100,
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family:'Inter',sans-serif; padding:4px;">
          <div style="font-size:12px; font-weight:700; color:#e6edf3;">${wpt.name}</div>
          ${wpt.desc ? `<div style="font-size:11px; color:#8b949e; margin-top:2px;">${wpt.desc}</div>` : ''}
          <div style="font-size:10px; color:#484f58; margin-top:4px; text-transform:uppercase; letter-spacing:0.06em;">${wpt.type}</div>
        </div>
      `);

      waypointLayersRef.current.push(marker);
    });

    // Fit map ke bounding box rute
    if (route.bounds) {
      map.fitBounds(route.bounds, { padding: [40, 40] });
    }
  }, [route]);

  // ── Render Rider Markers & Trails ────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentIds = new Set(riders.map((r) => r.id));

    // Hapus marker rider yang sudah tidak ada
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

      // ── Trail Path ─────────────────────────────
      if (rider.path?.length > 1) {
        if (trailsRef.current.has(rider.id)) {
          trailsRef.current.get(rider.id).setLatLngs(rider.path);
        } else {
          const trail = L.polyline(rider.path, {
            color: rider.color || '#00c6ff',
            weight: 2,
            opacity: 0.4,
            dashArray: '4, 6',
            lineCap: 'round',
            interactive: false,
          }).addTo(map);
          trailsRef.current.set(rider.id, trail);
        }
      }

      // ── Rider Marker ───────────────────────────
      if (markersRef.current.has(rider.id)) {
        const marker = markersRef.current.get(rider.id);
        marker.setLatLng([rider.lat, rider.lon]);
        marker.setIcon(createRiderIcon(rider));
        // Update popup content
        if (marker.isPopupOpen()) {
          marker.setPopupContent(createRiderPopup(rider));
        }
      } else {
        const marker = L.marker([rider.lat, rider.lon], {
          icon: createRiderIcon(rider),
          zIndexOffset: 1000,
        }).addTo(map);

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
    <div
      id="live-map"
      ref={mapRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
