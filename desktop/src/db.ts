import Database from "@tauri-apps/plugin-sql";
import { DEFAULT_BIKE_COLOR } from "./types";
import type { Bike, BreakdownRow, Ride, RideInput, Totals } from "./types";

let dbPromise: Promise<Database> | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bikes (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '${DEFAULT_BIKE_COLOR}'
);

CREATE TABLE IF NOT EXISTS rides (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT NOT NULL,
    name             TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    distance_km      REAL NOT NULL,
    elevation_m      INTEGER NOT NULL,
    comment          TEXT,
    bike_id          INTEGER NOT NULL REFERENCES bikes(id)
);
`;

/**
 * Ouvre (une seule fois, puis met en cache) la connexion à la base SQLite et
 * s'assure que le schéma est à jour. Toutes les fonctions de ce fichier
 * passent par ici — c'est le seul point d'entrée vers la base de données.
 */
async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.load("sqlite:suivi_cyclisme.db");
      for (const stmt of SCHEMA.split(";")) {
        const trimmed = stmt.trim();
        if (trimmed) await db.execute(trimmed);
      }
      // Migration : les bases créées avant l'ajout de la couleur n'ont pas cette colonne.
      const columns = await db.select<{ name: string }[]>("PRAGMA table_info(bikes)");
      if (!columns.some((c) => c.name === "color")) {
        await db.execute(
          `ALTER TABLE bikes ADD COLUMN color TEXT NOT NULL DEFAULT '${DEFAULT_BIKE_COLOR}'`
        );
      }
      return db;
    })();
  }
  return dbPromise;
}

/** Levée quand on essaie de créer/renommer un vélo avec un nom déjà utilisé. */
export class BikeAlreadyExistsError extends Error {}
/** Levée quand on essaie de supprimer un vélo qui a encore des sorties enregistrées. */
export class BikeInUseError extends Error {}

/** Liste tous les vélos, triés par nom. */
export async function listBikes(): Promise<Bike[]> {
  const db = await getDb();
  return db.select<Bike[]>("SELECT id, name, color FROM bikes ORDER BY name");
}

/**
 * Crée un nouveau vélo.
 *
 * @param name  Nom du vélo (doit être unique).
 * @param color Couleur associée (hex), utilisée dans les tuiles et graphiques.
 * @returns l'identifiant du vélo créé.
 * @throws {BikeAlreadyExistsError} si un vélo porte déjà ce nom.
 */
export async function addBike(name: string, color: string): Promise<number> {
  const db = await getDb();
  const existing = await db.select<Bike[]>("SELECT id FROM bikes WHERE name = ?", [name]);
  if (existing.length > 0) throw new BikeAlreadyExistsError(name);
  const result = await db.execute("INSERT INTO bikes (name, color) VALUES (?, ?)", [name, color]);
  return result.lastInsertId as number;
}

/**
 * Renomme un vélo et/ou change sa couleur.
 *
 * @throws {BikeAlreadyExistsError} si un autre vélo porte déjà le nouveau nom.
 */
export async function updateBike(id: number, name: string, color: string): Promise<void> {
  const db = await getDb();
  const existing = await db.select<Bike[]>("SELECT id FROM bikes WHERE name = ? AND id != ?", [name, id]);
  if (existing.length > 0) throw new BikeAlreadyExistsError(name);
  await db.execute("UPDATE bikes SET name = ?, color = ? WHERE id = ?", [name, color, id]);
}

/**
 * Supprime un vélo.
 *
 * @throws {BikeInUseError} si des sorties référencent encore ce vélo — il
 * faut d'abord les réassigner ou les supprimer pour éviter de perdre le lien
 * vélo/sortie dans l'historique.
 */
export async function deleteBike(id: number): Promise<void> {
  const db = await getDb();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM rides WHERE bike_id = ?",
    [id]
  );
  if (count > 0) throw new BikeInUseError(String(id));
  await db.execute("DELETE FROM bikes WHERE id = ?", [id]);
}

/** Liste toutes les sorties (avec le nom du vélo joint), les plus récentes en premier. */
export async function listRides(): Promise<Ride[]> {
  const db = await getDb();
  return db.select<Ride[]>(
    `SELECT rides.id, rides.date, rides.name, rides.duration_minutes,
            rides.distance_km, rides.elevation_m, rides.comment,
            rides.bike_id, bikes.name AS bike_name
     FROM rides
     JOIN bikes ON bikes.id = rides.bike_id
     ORDER BY rides.date DESC, rides.id DESC`
  );
}

/** Enregistre une nouvelle sortie et retourne son identifiant. */
export async function addRide(input: RideInput): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO rides (date, name, duration_minutes, distance_km, elevation_m, comment, bike_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.date, input.name, input.duration_minutes, input.distance_km, input.elevation_m, input.comment, input.bike_id]
  );
  return result.lastInsertId as number;
}

/** Met à jour tous les champs d'une sortie existante. */
export async function updateRide(id: number, input: RideInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE rides
     SET date = ?, name = ?, duration_minutes = ?, distance_km = ?,
         elevation_m = ?, comment = ?, bike_id = ?
     WHERE id = ?`,
    [input.date, input.name, input.duration_minutes, input.distance_km, input.elevation_m, input.comment, input.bike_id, id]
  );
}

/** Supprime une sortie. */
export async function deleteRide(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM rides WHERE id = ?", [id]);
}

/** Calcule les totaux (distance, dénivelé, nombre de sorties, durée) toutes sorties confondues. */
export async function getTotals(): Promise<Totals> {
  const db = await getDb();
  const [row] = await db.select<Totals[]>(
    `SELECT COALESCE(SUM(distance_km), 0) as distance_km,
            COALESCE(SUM(elevation_m), 0) as elevation_m,
            COUNT(*) as ride_count,
            COALESCE(SUM(duration_minutes), 0) as duration_minutes
     FROM rides`
  );
  return row;
}

/**
 * Calcule les totaux (distance, dénivelé, nombre de sorties, durée) groupés
 * par vélo, triés par distance décroissante. N'inclut que les vélos ayant au
 * moins une sortie enregistrée.
 */
export async function getByBike(): Promise<(BreakdownRow & { duration_minutes: number; color: string })[]> {
  const db = await getDb();
  return db.select<(BreakdownRow & { duration_minutes: number; color: string })[]>(
    `SELECT bikes.name AS label,
            bikes.color AS color,
            COALESCE(SUM(rides.distance_km), 0) as distance_km,
            COALESCE(SUM(rides.elevation_m), 0) as elevation_m,
            COUNT(*) as ride_count,
            COALESCE(SUM(rides.duration_minutes), 0) as duration_minutes
     FROM rides
     JOIN bikes ON bikes.id = rides.bike_id
     GROUP BY bikes.name, bikes.color
     ORDER BY distance_km DESC`
  );
}

export interface YearBikeRow {
  year: string;
  bike_name: string;
  distance_km: number;
  elevation_m: number;
}

/**
 * Calcule la distance et le dénivelé groupés par année ET par vélo (utilisé
 * pour le graphique en barres empilées "Par année" du dashboard).
 */
export async function getByYearAndBike(): Promise<YearBikeRow[]> {
  const db = await getDb();
  return db.select<YearBikeRow[]>(
    `SELECT substr(rides.date, 1, 4) AS year,
            bikes.name AS bike_name,
            COALESCE(SUM(rides.distance_km), 0) as distance_km,
            COALESCE(SUM(rides.elevation_m), 0) as elevation_m
     FROM rides
     JOIN bikes ON bikes.id = rides.bike_id
     GROUP BY year, bike_name
     ORDER BY year`
  );
}

/**
 * Calcule les totaux pour un mois donné.
 *
 * @param ym Mois au format `AAAA-MM` (ex. `"2026-07"`).
 */
export async function getStatsForMonth(ym: string): Promise<Totals> {
  const db = await getDb();
  const [row] = await db.select<Totals[]>(
    `SELECT COALESCE(SUM(distance_km), 0) as distance_km,
            COALESCE(SUM(elevation_m), 0) as elevation_m,
            COUNT(*) as ride_count,
            COALESCE(SUM(duration_minutes), 0) as duration_minutes
     FROM rides
     WHERE substr(date, 1, 7) = ?`,
    [ym]
  );
  return row;
}

/**
 * Calcule les totaux d'un mois donné, groupés par vélo (utilisé pour le
 * détail par vélo affiché sous chaque carte "Derniers mois" du dashboard).
 *
 * @param ym Mois au format `AAAA-MM` (ex. `"2026-07"`).
 */
export async function getStatsForMonthByBike(
  ym: string
): Promise<(BreakdownRow & { color: string })[]> {
  const db = await getDb();
  return db.select<(BreakdownRow & { color: string })[]>(
    `SELECT bikes.name AS label,
            bikes.color AS color,
            COALESCE(SUM(rides.distance_km), 0) as distance_km,
            COALESCE(SUM(rides.elevation_m), 0) as elevation_m,
            COUNT(*) as ride_count
     FROM rides
     JOIN bikes ON bikes.id = rides.bike_id
     WHERE substr(rides.date, 1, 7) = ?
     GROUP BY bikes.name, bikes.color
     ORDER BY distance_km DESC`,
    [ym]
  );
}

export interface DayValue {
  date: string;
  distance_km: number;
  ride_count: number;
}

/**
 * Calcule la distance parcourue par jour sur une année donnée (utilisé pour
 * le calendrier d'activité du dashboard).
 */
export async function getDailyDistanceForYear(year: number): Promise<DayValue[]> {
  const db = await getDb();
  return db.select<DayValue[]>(
    `SELECT date,
            COALESCE(SUM(distance_km), 0) as distance_km,
            COUNT(*) as ride_count
     FROM rides
     WHERE substr(date, 1, 4) = ?
     GROUP BY date`,
    [String(year)]
  );
}

/**
 * Liste, du plus récent au plus ancien, tous les mois (`AAAA-MM`) contenant
 * au moins une sortie. Utilisé pour peupler le sélecteur de mois de l'écran
 * Sorties.
 */
export async function getMonthsWithRides(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ ym: string }[]>(
    `SELECT DISTINCT substr(date, 1, 7) as ym FROM rides ORDER BY ym DESC`
  );
  return rows.map((r) => r.ym);
}
