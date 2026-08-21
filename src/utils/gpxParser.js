/**
 * gpxParser.js
 * Utility untuk membaca dan mem-parsing file .gpx
 * Mengekstrak: koordinat (lat/lon), elevasi, nama waypoints/checkpoint
 * Menghitung: total jarak, total elevation gain/loss
 */

import officialGravelRoute from './officialGravelRoute.json';

/**
 * Haversine formula — menghitung jarak antara dua koordinat GPS (km)
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius bumi km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Parse file .gpx dan kembalikan data rute terstruktur
 * @param {File|string} input - File object atau XML string
 * @returns {Promise<RouteData>}
 */
export async function parseGPX(input) {
  let xmlString;

  if (input instanceof File) {
    xmlString = await input.text();
  } else {
    xmlString = input;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('File GPX tidak valid atau rusak.');
  }

  // Ambil nama rute
  const routeName =
    doc.querySelector('metadata > name')?.textContent ||
    doc.querySelector('trk > name')?.textContent ||
    'Rute Event';

  // Ekstrak track points dari <trkpt> atau <rtept>
  const trackPoints = [];
  const trkpts = doc.querySelectorAll('trkpt, rtept');

  trkpts.forEach((pt) => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const ele = parseFloat(pt.querySelector('ele')?.textContent || '0');
    const timeStr = pt.querySelector('time')?.textContent;
    const time = timeStr ? new Date(timeStr).getTime() : null;

    if (!isNaN(lat) && !isNaN(lon)) {
      trackPoints.push({ lat, lon, ele, time });
    }
  });

  // Ekstrak waypoints (checkpoints, water stations, dll dari <wpt>)
  const waypoints = [];
  const wpts = doc.querySelectorAll('wpt');

  wpts.forEach((wpt) => {
    const lat = parseFloat(wpt.getAttribute('lat'));
    const lon = parseFloat(wpt.getAttribute('lon'));
    const name = wpt.querySelector('name')?.textContent || 'Checkpoint';
    const desc = wpt.querySelector('desc')?.textContent || '';
    const sym  = wpt.querySelector('sym')?.textContent?.toLowerCase() || '';

    // Tentukan tipe waypoint dari nama / simbol
    let type = 'checkpoint';
    if (sym.includes('flag') || name.toLowerCase().includes('start')) type = 'start';
    else if (sym.includes('finish') || name.toLowerCase().includes('finish')) type = 'finish';
    else if (name.toLowerCase().includes('indomaret') || name.toLowerCase().includes('alfamart') || name.toLowerCase().includes('minimarket')) type = 'store';
    else if (name.toLowerCase().includes('water') || name.toLowerCase().includes('air') || name.toLowerCase().includes('ws')) type = 'water';
    else if (name.toLowerCase().includes('cp') || name.toLowerCase().includes('checkpoint')) type = 'checkpoint';

    if (!isNaN(lat) && !isNaN(lon)) {
      waypoints.push({ lat, lon, name, desc, type });
    }
  });

  // Hitung total jarak & elevasi
  let totalDistance = 0; // km
  let totalElevGain = 0; // meter
  let totalElevLoss = 0; // meter
  let minEle = Infinity;
  let maxEle = -Infinity;

  for (let i = 1; i < trackPoints.length; i++) {
    const prev = trackPoints[i - 1];
    const curr = trackPoints[i];

    totalDistance += haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);

    const dEle = curr.ele - prev.ele;
    if (dEle > 0) totalElevGain += dEle;
    else          totalElevLoss += Math.abs(dEle);

    if (curr.ele < minEle) minEle = curr.ele;
    if (curr.ele > maxEle) maxEle = curr.ele;
  }

  // Buat elevation profile (sample setiap ~50 titik agar ringan)
  const sampleRate = Math.max(1, Math.floor(trackPoints.length / 100));
  const elevationProfile = trackPoints
    .filter((_, i) => i % sampleRate === 0)
    .map((pt, i) => ({
      distance: parseFloat((i * sampleRate * (totalDistance / trackPoints.length)).toFixed(2)),
      ele: Math.round(pt.ele),
    }));

  // Bounding box untuk auto-fit peta
  const lats = trackPoints.map((p) => p.lat);
  const lons = trackPoints.map((p) => p.lon);
  const bounds = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];

  // Koordinat start & finish
  const startPoint = trackPoints[0] || null;
  const finishPoint = trackPoints[trackPoints.length - 1] || null;

  return {
    name: routeName,
    trackPoints,       // Array koordinat lengkap [{lat, lon, ele, time}]
    waypoints,         // Checkpoints, water stations, dll
    stats: {
      totalDistance: parseFloat(totalDistance.toFixed(2)), // km
      totalElevGain: Math.round(totalElevGain),            // m
      totalElevLoss: Math.round(totalElevLoss),            // m
      minEle: Math.round(minEle === Infinity ? 0 : minEle),
      maxEle: Math.round(maxEle === -Infinity ? 0 : maxEle),
      pointCount: trackPoints.length,
    },
    elevationProfile,
    bounds,
    startPoint,
    finishPoint,
  };
}

/**
 * Hitung jarak rider dari start berdasarkan posisi GPS saat ini
 * dengan mencocokkan ke track point terdekat (nearest-point matching)
 * @param {object} riderPos - { lat, lon }
 * @param {Array}  trackPoints - Array dari parseGPX
 * @returns {number} Jarak tempuh estimasi (km)
 */
export function estimateDistanceTraveled(riderPos, trackPoints) {
  if (!trackPoints || trackPoints.length === 0) return 0;

  let minDist = Infinity;
  let nearestIdx = 0;

  for (let i = 0; i < trackPoints.length; i++) {
    const d = haversineDistance(riderPos.lat, riderPos.lon, trackPoints[i].lat, trackPoints[i].lon);
    if (d < minDist) {
      minDist = d;
      nearestIdx = i;
    }
  }

  // Hitung akumulasi jarak sampai nearest index
  let dist = 0;
  for (let i = 1; i <= nearestIdx; i++) {
    dist += haversineDistance(
      trackPoints[i - 1].lat, trackPoints[i - 1].lon,
      trackPoints[i].lat, trackPoints[i].lon
    );
  }

  return parseFloat(dist.toFixed(2));
}

/**
 * Cek apakah rider sedang off-course
 * @param {object} riderPos - { lat, lon }
 * @param {Array}  trackPoints
 * @param {number} thresholdKm - Batas toleransi jarak dari rute (default 0.15 km = 150m)
 * @returns {boolean}
 */
export function isOffCourse(riderPos, trackPoints, thresholdKm = 0.15) {
  if (!trackPoints || trackPoints.length === 0) return false;

  const minDist = Math.min(
    ...trackPoints.map((pt) =>
      haversineDistance(riderPos.lat, riderPos.lon, pt.lat, pt.lon)
    )
  );

  return minDist > thresholdKm;
}

/**
 * Convert trackPoints ke format LatLng array untuk Leaflet Polyline
 * @param {Array} trackPoints
 * @returns {Array} [[lat, lon], ...]
 */
export function trackToLatLngs(trackPoints) {
  return trackPoints.map((pt) => [pt.lat, pt.lon]);
}

/**
 * Rute Resmi Event: Gravel Ride (32.24 km)
 */
export function getDefaultEventRoute() {
  return JSON.parse(JSON.stringify(officialGravelRoute));
}

/**
 * Demo / Default Route
 */
export function generateDemoRoute() {
  return getDefaultEventRoute();
}