import type { GpxPoint } from "./gpx";
import { reportOrsQuota } from "./ors-quota";

/** Profils vélo proposés par l'API Directions d'OpenRouteService. */
export type CyclingProfile = "cycling-regular" | "cycling-road" | "cycling-mountain" | "cycling-electric";

export const CYCLING_PROFILES: { value: CyclingProfile; label: string }[] = [
  { value: "cycling-regular", label: "Vélo (standard)" },
  { value: "cycling-road", label: "Vélo de route" },
  { value: "cycling-mountain", label: "VTT" },
  { value: "cycling-electric", label: "Vélo électrique" },
];

/** Levée quand l'appel à l'API OpenRouteService échoue (clé invalide, quota dépassé, itinéraire introuvable, réseau...). */
export class OrsError extends Error {}

/**
 * `api.openrouteservice.org` est dépréciée au profit de `api.heigit.org` —
 * la migration n'est pas qu'un changement de domaine, le chemin change aussi
 * (`/openrouteservice/v2/...` et non `/v2/...`). Voir
 * https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912
 */
const ORS_BASE_URL = "https://api.heigit.org/openrouteservice/v2";

/**
 * Le géocodage n'est pas un endpoint "openrouteservice" (contrairement à
 * Directions) mais un service Pelias à part entière de l'API publique HeiGIT,
 * donc pas sous `/openrouteservice/` — confirmé en sondant l'API en direct
 * (`.../pelias/v1/reverse` répond 401 "Authorization field missing" sans clé,
 * là où toute autre variante sous `/openrouteservice/` ou `/geocode/` renvoie
 * un 404 nginx générique).
 */
const ORS_GEOCODE_BASE_URL = "https://api.heigit.org/pelias/v1";

/**
 * Calcule un itinéraire cycliste réel (collé au réseau routier/cyclable)
 * passant par les points fournis, via l'API Directions d'OpenRouteService.
 *
 * @param apiKey    Clé API personnelle OpenRouteService (voir Options).
 * @param waypoints Points de passage, dans l'ordre, au moins deux.
 * @param profile   Profil de déplacement (défaut : vélo standard).
 * @returns Les points du tracé calculé (avec altitude si disponible), prêts
 * à être sérialisés en GPX via {@link "./gpx".buildGpxXml}.
 * @throws {OrsError}
 */
export async function computeCyclingRoute(
  apiKey: string,
  waypoints: { lat: number; lon: number }[],
  profile: CyclingProfile = "cycling-regular"
): Promise<GpxPoint[]> {
  if (waypoints.length < 2) {
    throw new OrsError("Il faut au moins deux points pour calculer un itinéraire.");
  }

  let response: Response;
  try {
    response = await fetch(`${ORS_BASE_URL}/directions/${profile}/geojson`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: waypoints.map((w) => [w.lon, w.lat]),
        elevation: true,
      }),
    });
  } catch {
    throw new OrsError("Impossible de contacter OpenRouteService. Vérifiez votre connexion internet.");
  }

  reportOrsQuota(response.headers);

  if (!response.ok) {
    let message = `Erreur OpenRouteService (${response.status}).`;
    if (response.status === 401 || response.status === 403) {
      message = "Clé API OpenRouteService invalide, ou quota journalier dépassé.";
    }
    try {
      const body = await response.json();
      if (typeof body?.error?.message === "string") {
        message = body.error.message;
      } else if (typeof body?.error === "string") {
        message = body.error;
      }
    } catch {
      // Corps de réponse non exploitable : on garde le message générique ci-dessus.
    }
    throw new OrsError(message);
  }

  const data = await response.json();
  const coords: [number, number, number?][] | undefined = data?.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length === 0) {
    throw new OrsError("Aucun itinéraire trouvé entre ces points.");
  }

  return coords.map(([lon, lat, ele]) => ({ lat, lon, ele: ele ?? null }));
}

/**
 * Tente de déterminer la commune correspondant à un point (typiquement le
 * premier point d'un tracé), via le géocodage inversé (Pelias) d'OpenRouteService.
 *
 * @returns Le nom de la commune trouvée, ou `null` si rien d'exploitable n'a
 * été trouvé à proximité. Contrairement à {@link computeCyclingRoute}, une
 * erreur réseau/API ne fait pas planter l'appelant : elle est convertie en
 * `null` pour que ce soit une simple suggestion, jamais bloquante.
 */
export async function reverseGeocodeTown(apiKey: string, lat: number, lon: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      "point.lon": String(lon),
      "point.lat": String(lat),
      size: "1",
    });
    const response = await fetch(`${ORS_GEOCODE_BASE_URL}/reverse?${params.toString()}`, {
      headers: { Authorization: apiKey },
    });
    reportOrsQuota(response.headers);
    if (!response.ok) return null;

    const data = await response.json();
    const properties = data?.features?.[0]?.properties;
    if (!properties) return null;
    return properties.locality ?? properties.localadmin ?? properties.county ?? properties.name ?? null;
  } catch {
    return null;
  }
}
