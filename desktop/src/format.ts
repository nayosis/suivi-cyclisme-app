/**
 * Formate un nombre à la française (espace comme séparateur de milliers,
 * virgule comme séparateur décimal). Ex. `formatNumber(1234.5, 1)` → `"1 234,5"`.
 */
export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Formate une durée en minutes au format `"1h35"`. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Formate une date ISO (`AAAA-MM-JJ`) au format français `JJ/MM/AAAA`. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** Formate un mois `AAAA-MM` en toutes lettres, ex. `"2026-07"` → `"Juillet 2026"`. */
export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

/** Retourne le mois courant au format `AAAA-MM`, d'après la date du jour. */
export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Décale un mois `AAAA-MM` de `delta` mois (positif ou négatif).
 * Ex. `addMonths("2026-01", -1)` → `"2025-12"`.
 */
export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Calcule et formate la vitesse moyenne (km/h) d'une sortie. */
export function formatSpeed(distanceKm: number, durationMinutes: number): string {
  if (durationMinutes <= 0) return "–";
  const kmh = distanceKm / (durationMinutes / 60);
  return `${formatNumber(kmh, 1)} km/h`;
}

/**
 * Extrait un message lisible d'une erreur attrapée dans un `catch`.
 *
 * Les commandes Tauri rejettent souvent avec une simple **chaîne** plutôt
 * qu'une véritable instance `Error` — un `err instanceof Error ? err.message
 * : "erreur inconnue"` masque alors silencieusement le vrai message. Cette
 * fonction couvre aussi ce cas pour ne jamais perdre l'information utile au
 * diagnostic.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Erreur inconnue.";
  }
}
