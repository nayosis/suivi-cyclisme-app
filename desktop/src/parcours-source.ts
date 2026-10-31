import type { Parcours, ParcoursSummary } from "./types";

/**
 * D'où vient le tracé d'un parcours :
 * - `drawn` : dessiné dans l'application (points de passage conservés) — la référence, modifiable.
 * - `imported` : fichier GPX externe importé — figé, pas de points de passage.
 * - `none` : aucun tracé (ancien parcours saisi entièrement à la main).
 */
export type ParcoursSource = "drawn" | "imported" | "none";

export function parcoursSource(p: Parcours | ParcoursSummary): ParcoursSource {
  const drawn = "is_drawn" in p ? p.is_drawn : !!p.waypoints && p.waypoints.length > 0;
  const hasTrack = "has_track" in p ? p.has_track : !!p.gpx_data;
  if (drawn) return "drawn";
  if (hasTrack) return "imported";
  return "none";
}

export const PARCOURS_SOURCE_LABEL: Record<ParcoursSource, string> = {
  drawn: "Tracé dans l'application",
  imported: "Fichier GPX importé",
  none: "Aucun tracé",
};
