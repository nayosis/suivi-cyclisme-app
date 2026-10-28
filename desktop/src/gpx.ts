/** Un point de tracé GPX. */
export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number | null;
}

/**
 * Extrait les points de tracé d'un fichier GPX (balises `trkpt`, ou `rtept`
 * si le fichier ne contient qu'un itinéraire plutôt qu'une trace enregistrée).
 * Analyse minimale volontaire : on ne s'intéresse qu'à la géométrie
 * (latitude/longitude/altitude), pas aux métadonnées GPX (nom, dates, etc.).
 *
 * @throws {Error} si le XML est invalide ou ne contient aucun point exploitable.
 */
export function parseGpx(xml: string): GpxPoint[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Fichier GPX invalide (XML mal formé).");
  }

  let nodes = Array.from(doc.getElementsByTagName("trkpt"));
  if (nodes.length === 0) {
    nodes = Array.from(doc.getElementsByTagName("rtept"));
  }

  const points = nodes
    .map((el): GpxPoint => {
      const lat = parseFloat(el.getAttribute("lat") ?? "");
      const lon = parseFloat(el.getAttribute("lon") ?? "");
      const eleText = el.getElementsByTagName("ele")[0]?.textContent;
      const ele = eleText ? parseFloat(eleText) : NaN;
      return { lat, lon, ele: Number.isFinite(ele) ? ele : null };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (points.length === 0) {
    throw new Error("Aucun point de tracé (trkpt/rtept) trouvé dans ce fichier GPX.");
  }
  return points;
}

/** Métadonnées d'un GPX exporté depuis OpenRunner. */
export interface OpenRunnerOrigin {
  /** Libellé du parcours, sans le suffixe d'identifiant. */
  name: string;
  /** Lien public de la fiche du parcours. */
  url: string;
}

/**
 * Détecte un GPX exporté par OpenRunner et en tire le libellé et le lien de la
 * fiche. OpenRunner nomme la trace `<libellé>-<identifiant>` (ex.
 * « Condat N- Compains - Murol - Besse-25274923 »).
 *
 * @returns `null` si le fichier ne vient pas d'OpenRunner ou si le nom n'a pas ce format.
 */
export function extractOpenRunnerOrigin(xml: string): OpenRunnerOrigin | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const creator = doc.documentElement.getAttribute("creator") ?? "";
  if (!/openrunner/i.test(creator)) return null;
  const trackName = doc.getElementsByTagName("trk")[0]?.getElementsByTagName("name")[0]?.textContent ?? "";
  const match = /^(.*\S)\s*-(\d{4,})$/.exec(trackName.trim());
  if (!match) return null;
  return { name: match[1], url: `https://www.openrunner.com/route-details/${match[2]}` };
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance à vol d'oiseau (km) entre deux points GPS (formule de haversine). */
function haversineKm(a: GpxPoint, b: GpxPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Distance totale (km) d'un tracé : somme des distances entre points consécutifs. */
export function computeDistanceKm(points: GpxPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

/** Cap initial (0–360°, 0 = nord, 90 = est) pour aller du point `a` au point `b`. */
function bearingDeg(a: GpxPoint, b: GpxPoint): number {
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Les 8 codes de direction, dans l'ordre des secteurs de 45° à partir du nord (même ordre que `DIRECTIONS`). */
const SECTOR_CODES = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;

/** Secteur de 45° (code de `DIRECTIONS`) contenant le cap `deg`. */
export function bearingToDirection(deg: number): (typeof SECTOR_CODES)[number] {
  return SECTOR_CODES[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Direction de la première moitié d'un tracé (« l'aller »). */
export interface OutboundDirection {
  /** Cap en degrés (0 = nord, 90 = est) du départ vers le point situé à mi-distance. */
  bearing: number;
  /**
   * Fiabilité entre 0 et 1 : distance en ligne droite divisée par la longueur de
   * la demi-trace. Proche de 1 = l'aller file droit ; faible = tracé sinueux ou
   * en boucle, le cap moyen est alors peu représentatif.
   */
  straightness: number;
}

/**
 * Direction de l'aller : cap entre le départ et le point situé à la moitié de la
 * distance du tracé. Sert à retrouver les parcours dont on affronte le vent
 * dans la première moitié de la sortie.
 *
 * @returns `null` si le tracé est trop court ou sans étendue exploitable.
 */
export function computeOutboundDirection(points: GpxPoint[]): OutboundDirection | null {
  if (points.length < 2) return null;
  const total = computeDistanceKm(points);
  if (total <= 0) return null;

  const half = total / 2;
  let cumulative = 0;
  let mid = points.length - 1;
  for (let i = 1; i < points.length; i++) {
    cumulative += haversineKm(points[i - 1], points[i]);
    if (cumulative >= half) {
      mid = i;
      break;
    }
  }

  const chord = haversineKm(points[0], points[mid]);
  if (chord <= 0) return null;
  return { bearing: bearingDeg(points[0], points[mid]), straightness: Math.min(1, chord / cumulative) };
}

/**
 * Lisse l'altitude par moyenne glissante avant de calculer le dénivelé, pour
 * atténuer le bruit GPS/baromètre qui gonflerait sinon fortement une somme
 * brute des écarts positifs (chaque micro-oscillation compterait comme une
 * montée).
 */
function smoothElevations(points: GpxPoint[], windowSize = 5): (number | null)[] {
  const half = Math.floor(windowSize / 2);
  return points.map((_, i) => {
    const window = points
      .slice(Math.max(0, i - half), Math.min(points.length, i + half + 1))
      .map((p) => p.ele)
      .filter((e): e is number => e != null);
    if (window.length === 0) return null;
    return window.reduce((sum, e) => sum + e, 0) / window.length;
  });
}

/** Dénivelé positif total (m) d'un tracé, calculé sur l'altitude lissée. */
export function computeElevationGainM(points: GpxPoint[]): number {
  const smoothed = smoothElevations(points);
  let gain = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const prev = smoothed[i - 1];
    const curr = smoothed[i];
    if (prev != null && curr != null && curr > prev) {
      gain += curr - prev;
    }
  }
  return Math.round(gain);
}

/** Une balise kilométrique le long d'un tracé : sa distance depuis le départ et sa position interpolée. */
export interface DistanceMarker {
  km: number;
  lat: number;
  lon: number;
}

/**
 * Choisit un pas "rond" entre deux balises kilométriques, visant environ
 * 4 balises sur le tracé quelle que soit sa longueur : arrondi au km près en
 * dessous de 40 km affichés (pas < 10), au multiple de 5 km entre 40 et
 * 400 km affichés, au multiple de 25 km au-delà. Ex. 107 km → pas de 25 km
 * (25/50/75/100) ; 19 km → pas de 4 km (4/8/12/16).
 */
export function computeDistanceMarkerStep(distanceKm: number): number {
  const raw = distanceKm / 4;
  if (raw < 10) return Math.floor(raw);
  if (raw < 100) return Math.floor(raw / 5) * 5;
  return Math.floor(raw / 25) * 25;
}

/**
 * Balises régulières (voir {@link computeDistanceMarkerStep}) placées sur le
 * tracé, en interpolant leur position entre les deux points GPX qui
 * encadrent chaque distance cible.
 */
export function computeDistanceMarkers(points: GpxPoint[]): DistanceMarker[] {
  const total = computeDistanceKm(points);
  const step = computeDistanceMarkerStep(total);
  if (step <= 0 || points.length < 2) return [];

  const markers: DistanceMarker[] = [];
  let cumulative = 0;
  let nextTarget = step;

  for (let i = 1; i < points.length && nextTarget < total; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const segmentKm = haversineKm(prev, curr);
    while (nextTarget < total && cumulative + segmentKm >= nextTarget) {
      const ratio = segmentKm === 0 ? 0 : (nextTarget - cumulative) / segmentKm;
      markers.push({
        km: nextTarget,
        lat: prev.lat + (curr.lat - prev.lat) * ratio,
        lon: prev.lon + (curr.lon - prev.lon) * ratio,
      });
      nextTarget += step;
    }
    cumulative += segmentKm;
  }
  return markers;
}

export interface GpxStats {
  distanceKm: number;
  elevationGainM: number;
}

/** Calcule distance et dénivelé positif d'un tracé en une fois. */
export function computeGpxStats(points: GpxPoint[]): GpxStats {
  return { distanceKm: computeDistanceKm(points), elevationGainM: computeElevationGainM(points) };
}

/**
 * Sérialise une liste de points en un document GPX minimal (une seule trace,
 * un seul segment) — symétrique de {@link parseGpx}. Utilisé pour stocker un
 * itinéraire calculé (ex. via OpenRouteService) dans la même colonne
 * `gpx_data` qu'un fichier importé, afin que tout le reste du pipeline
 * (affichage, calculs) le traite de façon identique.
 */
export function buildGpxXml(points: GpxPoint[]): string {
  const trkpts = points
    .map((p) => {
      const ele = p.ele != null ? `<ele>${p.ele}</ele>` : "";
      return `<trkpt lat="${p.lat}" lon="${p.lon}">${ele}</trkpt>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Suivi Cyclisme"><trk><trkseg>${trkpts}</trkseg></trk></gpx>`;
}
