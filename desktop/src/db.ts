import Database from "@tauri-apps/plugin-sql";
import { DEFAULT_BIKE_COLOR } from "./types";
import type { Bike, BreakdownRow, Ride, RideInput, Totals } from "./types";
import { getCurrentDatabaseFilename } from "./database-registry";

let dbPromise: Promise<Database> | null = null;
/** Nom de fichier pour lequel `dbPromise` a été ouverte (détecte un changement de base active). */
let loadedFilename: string | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bikes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE,
    color         TEXT NOT NULL DEFAULT '${DEFAULT_BIKE_COLOR}',
    purchase_date TEXT,
    purchase_km   REAL NOT NULL DEFAULT 0
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

-- Catalogue des emplacements du velo (partage par tous les velos), positionnes
-- sur le schema affiche dans l'onglet Entretien. mandatory = un exemplaire est
-- automatiquement cree pour chaque velo (existant ou futur) des que cet
-- emplacement existe.
CREATE TABLE IF NOT EXISTS bike_part_defs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL UNIQUE,
    x         REAL NOT NULL,
    y         REAL NOT NULL,
    mandatory INTEGER NOT NULL DEFAULT 0
);

-- Un exemplaire physique de piece. N'a pas d'emplacement fixe : celui-ci est
-- porte par chaque periode de montage (part_mounts), pour permettre de
-- deplacer un meme exemplaire d'un emplacement a un autre au fil du temps
-- (ex. un pneu passe de la roue avant a la roue arriere).
CREATE TABLE IF NOT EXISTS part_instances (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    purchase_cost REAL,
    purchase_date TEXT,
    retired_date  TEXT
);

-- Etiquette libre (libelle + couleur) pour filtrer les pieces, ex. "Route",
-- "Occasion", "Shimano". Independante des emplacements.
CREATE TABLE IF NOT EXISTS part_tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '${DEFAULT_BIKE_COLOR}'
);

CREATE TABLE IF NOT EXISTS part_instance_tags (
    part_instance_id INTEGER NOT NULL REFERENCES part_instances(id),
    tag_id           INTEGER NOT NULL REFERENCES part_tags(id),
    PRIMARY KEY (part_instance_id, tag_id)
);

CREATE TABLE IF NOT EXISTS maintenances (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    bike_id INTEGER NOT NULL REFERENCES bikes(id),
    date    TEXT NOT NULL,
    comment TEXT,
    cost    REAL
);

-- Une periode de montage d'un exemplaire de piece sur un emplacement d'un
-- velo. unmounted_at NULL = encore monte aujourd'hui. Chaque bout
-- (pose/depose) est rattache a la maintenance qui l'a declenche,
-- independamment l'un de l'autre. NULL si la pose/depose est directe
-- (ex. instanciation automatique d'une piece d'origine, sans maintenance).
CREATE TABLE IF NOT EXISTS part_mounts (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    part_instance_id          INTEGER NOT NULL REFERENCES part_instances(id),
    bike_id                   INTEGER NOT NULL REFERENCES bikes(id),
    bike_part_def_id          INTEGER NOT NULL REFERENCES bike_part_defs(id),
    mounted_at                TEXT NOT NULL,
    unmounted_at              TEXT,
    mounted_by_maintenance_id INTEGER REFERENCES maintenances(id),
    removed_by_maintenance_id INTEGER REFERENCES maintenances(id)
);
`;

/**
 * Ouvre (et met en cache) la connexion vers la base SQLite **actuellement
 * sélectionnée** (voir `database-registry.ts`) et s'assure que son schéma
 * est à jour. C'est le seul point d'entrée vers la base de données — les
 * autres modules de données (ex. `maintenance-db.ts`) l'utilisent aussi
 * plutôt que de gérer leur propre connexion.
 *
 * Si la base active a changé depuis le dernier appel (l'utilisateur a basculé
 * vers une autre base dans les Options), l'ancienne connexion est fermée et
 * la nouvelle base est chargée à la place.
 */
export async function getDb(): Promise<Database> {
  const filename = getCurrentDatabaseFilename();
  if (!filename) {
    throw new Error("Aucune base de données sélectionnée.");
  }
  if (dbPromise && loadedFilename === filename) {
    return dbPromise;
  }

  const previousPromise = dbPromise;
  loadedFilename = filename;
  dbPromise = (async () => {
    if (previousPromise) {
      try {
        const previous = await previousPromise;
        await previous.close();
      } catch {
        // La connexion précédente n'est peut-être déjà plus valide : sans impact.
      }
    }
    const db = await Database.load(`sqlite:${filename}`);
    async function applySchema() {
      // Les commentaires SQL (`-- ...`) sont retirés ligne à ligne avant de
      // découper sur `;` : un `;` qui apparaîtrait dans le texte d'un
      // commentaire (ponctuation française "mot ; mot") couperait sinon une
      // instruction en deux au mauvais endroit.
      const withoutComments = SCHEMA.split("\n")
        .map((line) => (line.trim().startsWith("--") ? "" : line))
        .join("\n");
      for (const stmt of withoutComments.split(";")) {
        const trimmed = stmt.trim();
        if (trimmed) await db.execute(trimmed);
      }
    }
    await applySchema();
    // Migration : les bases créées avant l'ajout de la couleur n'ont pas cette colonne.
    const columns = await db.select<{ name: string }[]>("PRAGMA table_info(bikes)");
    if (!columns.some((c) => c.name === "color")) {
      await db.execute(
        `ALTER TABLE bikes ADD COLUMN color TEXT NOT NULL DEFAULT '${DEFAULT_BIKE_COLOR}'`
      );
    }
    // Migration : ajout de la date d'acquisition du vélo. La fonctionnalité
    // maintenance est encore expérimentale, donc on profite de cette montée
    // de version pour repartir d'un catalogue d'emplacements propre plutôt
    // que d'écrire une migration de données pour des données de test.
    if (!columns.some((c) => c.name === "purchase_date")) {
      await db.execute("ALTER TABLE bikes ADD COLUMN purchase_date TEXT");
      for (const table of ["part_mounts", "maintenances", "part_instances", "part_types", "bike_part_defs"]) {
        await db.execute(`DROP TABLE IF EXISTS ${table}`);
      }
      await applySchema();
    }
    // Migration : les bases créées avant l'ajout du kilométrage à l'achat n'ont pas cette colonne.
    if (!columns.some((c) => c.name === "purchase_km")) {
      await db.execute("ALTER TABLE bikes ADD COLUMN purchase_km REAL NOT NULL DEFAULT 0");
    }
    return db;
  })();
  return dbPromise;
}

/** Levée quand on essaie de créer/renommer un vélo avec un nom déjà utilisé. */
export class BikeAlreadyExistsError extends Error {}
/** Levée quand on essaie de supprimer un vélo qui a encore des sorties enregistrées. */
export class BikeInUseError extends Error {}

/** Liste tous les vélos, triés par nom. */
export async function listBikes(): Promise<Bike[]> {
  const db = await getDb();
  return db.select<Bike[]>("SELECT id, name, color, purchase_date, purchase_km FROM bikes ORDER BY name");
}

/**
 * Crée un nouveau vélo.
 *
 * @param name         Nom du vélo (doit être unique).
 * @param color        Couleur associée (hex), utilisée dans les tuiles et graphiques.
 * @param purchaseDate Date d'acquisition (sert de date de montage par défaut à ses pièces d'origine).
 * @param purchaseKm   Kilométrage du vélo à l'achat (un vélo d'occasion ne part pas forcément de 0).
 * @returns l'identifiant du vélo créé.
 * @throws {BikeAlreadyExistsError} si un vélo porte déjà ce nom.
 */
export async function addBike(
  name: string,
  color: string,
  purchaseDate: string,
  purchaseKm: number
): Promise<number> {
  const db = await getDb();
  const existing = await db.select<Bike[]>("SELECT id FROM bikes WHERE name = ?", [name]);
  if (existing.length > 0) throw new BikeAlreadyExistsError(name);
  const result = await db.execute(
    "INSERT INTO bikes (name, color, purchase_date, purchase_km) VALUES (?, ?, ?, ?)",
    [name, color, purchaseDate, purchaseKm]
  );
  return result.lastInsertId as number;
}

/**
 * Renomme un vélo et/ou change sa couleur, sa date d'acquisition et/ou son kilométrage à l'achat.
 *
 * @throws {BikeAlreadyExistsError} si un autre vélo porte déjà le nouveau nom.
 */
export async function updateBike(
  id: number,
  name: string,
  color: string,
  purchaseDate: string,
  purchaseKm: number
): Promise<void> {
  const db = await getDb();
  const existing = await db.select<Bike[]>("SELECT id FROM bikes WHERE name = ? AND id != ?", [name, id]);
  if (existing.length > 0) throw new BikeAlreadyExistsError(name);
  await db.execute("UPDATE bikes SET name = ?, color = ?, purchase_date = ?, purchase_km = ? WHERE id = ?", [
    name,
    color,
    purchaseDate,
    purchaseKm,
    id,
  ]);
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
            rides.bike_id, bikes.name AS bike_name, bikes.color AS bike_color
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

/**
 * Supprime **définitivement** toutes les sorties puis tous les vélos —
 * remet l'application dans son état initial (base vide).
 *
 * Irréversible : à n'appeler qu'après confirmation explicite de
 * l'utilisateur et sauvegarde préalable (voir
 * {@link "./data-transfer".exportBackupToDownloads}).
 */
export async function deleteAllData(): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM rides");
  await database.execute("DELETE FROM bikes");
}
