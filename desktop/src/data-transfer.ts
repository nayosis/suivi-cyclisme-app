import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import * as db from "./db";
import { DEFAULT_BIKE_COLOR } from "./types";

/**
 * Version du **format** d'export JSON (indépendante du numéro de version de
 * l'application). À incrémenter uniquement quand la structure du fichier
 * exporté change (ex. ajout d'un futur suivi d'entretien vélo), pour que
 * l'import puisse détecter un fichier plus récent que ce que sait lire la
 * version actuellement installée et le signaler plutôt qu'échouer en silence.
 */
const CURRENT_FORMAT_VERSION = 1;

interface ExportedBike {
  name: string;
  color: string;
}

interface ExportedRide {
  date: string;
  name: string;
  duration_minutes: number;
  distance_km: number;
  elevation_m: number;
  comment: string | null;
  bike_name: string;
}

interface ExportPayload {
  version: number;
  exported_at: string;
  bikes: ExportedBike[];
  rides: ExportedRide[];
}

export interface ImportSummary {
  bikesAdded: number;
  ridesAdded: number;
  ridesSkipped: number;
  /** Numéro de version du format lu dans le fichier importé. */
  sourceVersion: number;
  /**
   * `true` si le fichier importé a été produit par une version du format
   * plus récente que celle que cette version de l'application sait lire
   * ({@link CURRENT_FORMAT_VERSION}). L'import se poursuit quand même sur les
   * champs connus (vélos/sorties), mais des données plus récentes (ex. futur
   * entretien vélo) peuvent avoir été ignorées.
   */
  newerFormatDetected: boolean;
}

/**
 * Construit le contenu JSON (texte formaté) de l'export complet : tous les
 * vélos et toutes les sorties enregistrés. Les sorties référencent leur vélo
 * par son **nom** plutôt que par son identifiant interne, pour que le fichier
 * reste ré-importable tel quel dans une autre base de données.
 */
export async function buildExportPayload(): Promise<string> {
  const [bikes, rides] = await Promise.all([db.listBikes(), db.listRides()]);
  const payload: ExportPayload = {
    version: CURRENT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    bikes: bikes.map((b) => ({ name: b.name, color: b.color })),
    rides: rides.map((r) => ({
      date: r.date,
      name: r.name,
      duration_minutes: r.duration_minutes,
      distance_km: r.distance_km,
      elevation_m: r.elevation_m,
      comment: r.comment,
      bike_name: r.bike_name,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Ouvre la boîte de dialogue native « Enregistrer sous » puis écrit l'export
 * JSON complet (vélos + sorties) dans le fichier choisi.
 *
 * @returns `true` si le fichier a été écrit, `false` si l'utilisateur a
 * annulé la boîte de dialogue.
 */
export async function exportToFile(): Promise<boolean> {
  const defaultName = `suivi-cyclisme-export-${new Date().toISOString().slice(0, 10)}.json`;
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return false;
  const json = await buildExportPayload();
  await writeTextFile(path, json);
  return true;
}

/** Vérifie qu'une valeur ressemble à une sortie exportée valide. */
function isValidExportedRide(value: unknown): value is ExportedRide {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.date === "string" &&
    typeof r.name === "string" &&
    typeof r.duration_minutes === "number" &&
    typeof r.distance_km === "number" &&
    typeof r.elevation_m === "number" &&
    typeof r.bike_name === "string"
  );
}

/**
 * Importe un export JSON en le **fusionnant** avec les données existantes
 * (aucune donnée existante n'est jamais supprimée ou écrasée) :
 * - un vélo du fichier est retrouvé par son nom s'il existe déjà, sinon créé
 *   (sa couleur n'est utilisée que pour la création, jamais réappliquée sur
 *   un vélo déjà présent) ;
 * - une sortie déjà présente (même date + nom + distance + vélo) est
 *   considérée comme un doublon et ignorée, ce qui rend l'import sûr à
 *   relancer plusieurs fois sur le même fichier ;
 * - si le fichier vient d'une version du format plus récente que celle
 *   connue de cette version de l'app ({@link CURRENT_FORMAT_VERSION}), les
 *   champs reconnus (vélos/sorties) sont quand même importés, et
 *   `newerFormatDetected` prévient l'appelant que d'autres données ont pu
 *   être ignorées.
 */
export async function importFromPayload(json: string): Promise<ImportSummary> {
  const parsed = JSON.parse(json) as Partial<ExportPayload>;
  if (!Array.isArray(parsed.bikes) || !Array.isArray(parsed.rides)) {
    throw new Error("Fichier invalide : ce n'est pas un export Suivi Cyclisme.");
  }

  const sourceVersion = typeof parsed.version === "number" ? parsed.version : 1;
  const summary: ImportSummary = {
    bikesAdded: 0,
    ridesAdded: 0,
    ridesSkipped: 0,
    sourceVersion,
    newerFormatDetected: sourceVersion > CURRENT_FORMAT_VERSION,
  };

  const existingBikes = await db.listBikes();
  const bikeIdByName = new Map(existingBikes.map((b) => [b.name, b.id]));

  for (const bike of parsed.bikes) {
    if (!bike?.name || bikeIdByName.has(bike.name)) continue;
    const id = await db.addBike(bike.name, bike.color ?? DEFAULT_BIKE_COLOR);
    bikeIdByName.set(bike.name, id);
    summary.bikesAdded++;
  }

  const existingRides = await db.listRides();
  const rideKey = (r: { date: string; name: string; distance_km: number; bike_name: string }) =>
    `${r.date}|${r.name}|${r.distance_km}|${r.bike_name}`;
  const existingKeys = new Set(existingRides.map(rideKey));

  for (const ride of parsed.rides) {
    if (!isValidExportedRide(ride)) {
      summary.ridesSkipped++;
      continue;
    }
    const bikeId = bikeIdByName.get(ride.bike_name);
    if (!bikeId) {
      summary.ridesSkipped++;
      continue;
    }
    const key = rideKey(ride);
    if (existingKeys.has(key)) {
      summary.ridesSkipped++;
      continue;
    }
    await db.addRide({
      date: ride.date,
      name: ride.name,
      duration_minutes: ride.duration_minutes,
      distance_km: ride.distance_km,
      elevation_m: ride.elevation_m,
      comment: ride.comment ?? null,
      bike_id: bikeId,
    });
    existingKeys.add(key);
    summary.ridesAdded++;
  }

  return summary;
}

/**
 * Ouvre la boîte de dialogue native « Ouvrir » pour choisir un fichier JSON,
 * puis lance l'import (voir {@link importFromPayload}).
 *
 * @returns le résumé de l'import, ou `null` si l'utilisateur a annulé la
 * boîte de dialogue.
 */
export async function importFromFile(): Promise<ImportSummary | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return null;
  const json = await readTextFile(path);
  return importFromPayload(json);
}
