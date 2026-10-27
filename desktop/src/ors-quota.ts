const STORAGE_KEY = "suivi-cyclisme-ors-quota";

export interface OrsQuota {
  /** Nombre de requêtes restantes sur le quota journalier, si l'en-tête est présent. */
  remaining: number | null;
  /** Taille totale du quota journalier, si l'en-tête est présent. */
  limit: number | null;
  /** Instant de réinitialisation du quota (timestamp Unix, secondes UTC), si l'en-tête est présent. */
  resetAt: number | null;
  /** Horodatage local (ms) de la dernière observation, pour dater l'information affichée. */
  observedAt: number;
}

function load(): OrsQuota | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OrsQuota) : null;
  } catch {
    return null;
  }
}

let quota: OrsQuota | null = load();
const listeners = new Set<() => void>();

/**
 * Extrait les en-têtes `X-Ratelimit-*` d'une réponse OpenRouteService/HeiGIT
 * (Directions ou Geocoder) et met à jour le quota connu. Sans effet si aucun
 * de ces en-têtes n'est présent sur la réponse (endpoint qui ne les fournit
 * pas, ou requête n'ayant jamais atteint le serveur).
 */
export function reportOrsQuota(headers: Headers): void {
  const remaining = headers.get("x-ratelimit-remaining");
  const limit = headers.get("x-ratelimit-limit");
  const resetAt = headers.get("x-ratelimit-reset");
  if (remaining === null && limit === null && resetAt === null) return;

  quota = {
    remaining: remaining !== null ? Number(remaining) : null,
    limit: limit !== null ? Number(limit) : null,
    resetAt: resetAt !== null ? Number(resetAt) : null,
    observedAt: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quota));
  } catch {
    // Stockage indisponible : le quota reste connu en mémoire pour cette session.
  }
  listeners.forEach((listener) => listener());
}

export function getOrsQuota(): OrsQuota | null {
  return quota;
}

export function subscribeOrsQuota(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Met en forme le quota pour affichage (Options, info-bulle de la nav) : une
 * ligne par information disponible. Les en-têtes ne sont pas garanties par
 * tous les endpoints ORS/HeiGIT, donc chaque ligne est conditionnelle.
 */
export function formatOrsQuota(quota: OrsQuota | null): string[] {
  if (!quota) {
    return ["Quota OpenRouteService inconnu — sera affiché après le premier appel à l'API."];
  }

  const lines: string[] = [];
  if (quota.remaining !== null && quota.limit !== null) {
    lines.push(`${quota.remaining} / ${quota.limit} requêtes restantes aujourd'hui`);
  } else if (quota.remaining !== null) {
    lines.push(`${quota.remaining} requêtes restantes aujourd'hui`);
  }
  if (quota.resetAt !== null) {
    const reset = new Date(quota.resetAt * 1000);
    lines.push(
      `Réinitialisation : ${reset.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
    );
  }
  if (lines.length === 0) {
    lines.push("Quota non communiqué par l'API pour ce type d'appel.");
  }
  const observed = new Date(quota.observedAt);
  lines.push(
    `Vu au dernier appel (${observed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})`
  );
  return lines;
}
