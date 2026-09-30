export interface LatLng {
  latitude: number;
  longitude: number;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distancia en metros (fórmula de haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pathLength(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1], points[i]);
  return total;
}

/**
 * Reduce una ruta a lo esencial (Douglas-Peucker aproximado en metros) para
 * dibujar recorridos largos sin saturar el mapa.
 */
export function simplify<T extends LatLng>(points: T[], toleranceMeters = 8): T[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularMeters(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceMeters) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function perpendicularMeters(p: LatLng, a: LatLng, b: LatLng): number {
  // Proyección equirectangular local: suficiente para tramos cortos.
  const k = Math.cos(rad(a.latitude));
  const ax = a.longitude * k, ay = a.latitude;
  const bx = b.longitude * k, by = b.latitude;
  const px = p.longitude * k, py = p.latitude;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy) * (Math.PI / 180) * R;
}

export function regionFor(points: LatLng[], padding = 1.4) {
  if (!points.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.005, (maxLat - minLat) * padding),
    longitudeDelta: Math.max(0.005, (maxLng - minLng) * padding),
  };
}

export function directionsUrl(p: LatLng, label = 'Ubicación'): { ios: string; android: string } {
  const q = `${p.latitude},${p.longitude}`;
  return {
    ios: `maps:?q=${encodeURIComponent(label)}&ll=${q}`,
    android: `geo:${q}?q=${q}(${encodeURIComponent(label)})`,
  };
}

export const mapsWebLink = (p: LatLng) => `https://maps.google.com/?q=${p.latitude},${p.longitude}`;
