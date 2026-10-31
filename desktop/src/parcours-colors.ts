import type { ParcoursSummary } from "./types";

/** Palette cyclique pour distinguer visuellement les tracés qui se chevauchent sur la carte. */
export const PARCOURS_ROUTE_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

/**
 * Attribue une couleur stable à chaque parcours ayant un tracé (GPX), triés
 * par identifiant. L'affectation ne dépend donc jamais des filtres actifs ni
 * de l'ordre d'affichage courant — un parcours garde la même couleur sur la
 * carte et dans le tableau, quels que soient les filtres.
 */
export function buildParcoursColorMap(parcoursList: ParcoursSummary[]): Map<number, string> {
  const withTrack = parcoursList
    .filter((p) => p.has_track)
    .slice()
    .sort((a, b) => a.id - b.id);
  const colorById = new Map<number, string>();
  withTrack.forEach((p, i) => colorById.set(p.id, PARCOURS_ROUTE_COLORS[i % PARCOURS_ROUTE_COLORS.length]));
  return colorById;
}
