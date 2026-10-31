import { DIRECTIONS } from "./types";
import type { Direction } from "./types";

/**
 * Compatibilité d'un parcours avec le vent du jour. On cherche à avoir le vent
 * de face à l'aller (première moitié) et dans le dos au retour :
 * - `ideal` : l'aller part vers l'endroit d'où vient le vent (écart de 45° au plus) ;
 * - `cross` : vent de travers ;
 * - `reverse` : vent dans le dos à l'aller, donc de face au retour.
 */
export type WindMatch = "ideal" | "cross" | "reverse";

export const WIND_MATCH_LABEL: Record<WindMatch, string> = {
  ideal: "Idéal",
  cross: "De travers",
  reverse: "Inversé",
};

export const WIND_MATCH_HINT: Record<WindMatch, string> = {
  ideal: "Vent de face à l'aller, dans le dos au retour",
  cross: "Vent de travers",
  reverse: "Vent dans le dos à l'aller, de face au retour",
};

const CODES = DIRECTIONS.map((d) => d.code);

/** `windFrom` : direction d'où vient le vent ; `routeDirection` : direction de l'aller du parcours. */
export function windMatch(routeDirection: Direction, windFrom: Direction): { kind: WindMatch; score: number } {
  const a = CODES.indexOf(routeDirection);
  const b = CODES.indexOf(windFrom);
  const sectors = Math.min((a - b + 8) % 8, (b - a + 8) % 8); // 0 à 4 secteurs de 45°
  if (sectors <= 1) return { kind: "ideal", score: 3 - sectors };
  if (sectors === 2) return { kind: "cross", score: 1 };
  return { kind: "reverse", score: 0 };
}
