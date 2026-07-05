// Server-side mirror of shared/src/lib/geo.ts — KEEP IN SYNC (api can't
// import @amixos/shared; see supabaseFetch.ts for the convention).

// Neutral geographic helpers shared across features (weather storm-focus,
// crew finder, etc.). Kept dependency-free so any layer can import it without
// pulling in feature-specific code.

export interface LatLng {
  lat: number;
  lng: number;
}

// Great-circle ("as the crow flies") distance in MILES between two points.
export function haversineMiles(a: LatLng, b: LatLng): number {
  const R_MI = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(x));
}
