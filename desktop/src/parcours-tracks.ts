import type { LatLngTuple } from "leaflet";
import { extractPositions } from "./gpx";
import { listParcoursTracks } from "./parcours-db";

/** Nombre maximal de points gardés par tracé sur la vue d'ensemble : au-delà, la précision n'est plus visible et la carte ralentit. */
const MAX_POINTS_PER_ROUTE = 400;

/** Positions déjà lues, par parcours : un changement de filtre ne relit ni la base ni les fichiers GPX. */
const cache = new Map<number, LatLngTuple[]>();

/** Vide le cache (parcours modifié, base changée ou restaurée). */
export function clearTrackCache(): void {
  cache.clear();
}

/**
 * Positions allégées des tracés demandés. Seuls les tracés absents du cache
 * sont lus en base, puis analysés ; les parcours sans tracé sont ignorés.
 */
export async function loadTrackPositions(ids: number[]): Promise<Map<number, LatLngTuple[]>> {
  const result = new Map<number, LatLngTuple[]>();
  const missing: number[] = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit) result.set(id, hit);
    else missing.push(id);
  }
  if (missing.length > 0) {
    for (const row of await listParcoursTracks(missing)) {
      const positions = extractPositions(row.gpx_data, MAX_POINTS_PER_ROUTE) as LatLngTuple[];
      cache.set(row.id, positions);
      result.set(row.id, positions);
    }
  }
  return result;
}
