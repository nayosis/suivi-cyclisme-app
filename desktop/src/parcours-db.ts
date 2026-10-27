import { getDb } from "./db";
import type { Parcours, ParcoursInput } from "./types";

const PARCOURS_COLUMNS =
  "id, name, start_town, distance_km, elevation_m, direction, site_url, gpx_data, waypoints_json";

interface ParcoursRow {
  id: number;
  name: string;
  start_town: string;
  distance_km: number;
  elevation_m: number;
  direction: string;
  site_url: string | null;
  gpx_data: string | null;
  waypoints_json: string | null;
}

/** Convertit une ligne SQL brute en `Parcours` (désérialise les points de passage). */
function mapRow(row: ParcoursRow): Parcours {
  const { waypoints_json, ...rest } = row;
  return {
    ...rest,
    direction: row.direction as Parcours["direction"],
    waypoints: waypoints_json ? JSON.parse(waypoints_json) : null,
  };
}

/** Liste tous les parcours du catalogue, triés par nom. */
export async function listParcours(): Promise<Parcours[]> {
  const db = await getDb();
  const rows = await db.select<ParcoursRow[]>(`SELECT ${PARCOURS_COLUMNS} FROM parcours ORDER BY name`);
  return rows.map(mapRow);
}

/** Récupère un parcours par son identifiant, ou `null` s'il n'existe pas (ou plus). */
export async function getParcoursById(id: number): Promise<Parcours | null> {
  const db = await getDb();
  const rows = await db.select<ParcoursRow[]>(`SELECT ${PARCOURS_COLUMNS} FROM parcours WHERE id = ?`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Crée un nouveau parcours et retourne son identifiant. */
export async function addParcours(input: ParcoursInput): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO parcours (name, start_town, distance_km, elevation_m, direction, site_url, gpx_data, waypoints_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.start_town,
      input.distance_km,
      input.elevation_m,
      input.direction,
      input.site_url,
      input.gpx_data,
      input.waypoints ? JSON.stringify(input.waypoints) : null,
    ]
  );
  return result.lastInsertId as number;
}

/** Met à jour tous les champs d'un parcours existant. */
export async function updateParcours(id: number, input: ParcoursInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE parcours
     SET name = ?, start_town = ?, distance_km = ?, elevation_m = ?, direction = ?, site_url = ?, gpx_data = ?, waypoints_json = ?
     WHERE id = ?`,
    [
      input.name,
      input.start_town,
      input.distance_km,
      input.elevation_m,
      input.direction,
      input.site_url,
      input.gpx_data,
      input.waypoints ? JSON.stringify(input.waypoints) : null,
      id,
    ]
  );
}

/** Supprime un parcours du catalogue. */
export async function deleteParcours(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM parcours WHERE id = ?", [id]);
}
