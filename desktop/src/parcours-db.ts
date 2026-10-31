import { getDb } from "./db";
import type { Parcours, ParcoursFolder, ParcoursInput, ParcoursSummary } from "./types";

const PARCOURS_COLUMNS =
  "id, name, start_town, distance_km, elevation_m, direction, site_url, folder_id, gpx_data, waypoints_json";

interface ParcoursRow {
  id: number;
  name: string;
  start_town: string;
  distance_km: number;
  elevation_m: number;
  direction: string;
  site_url: string | null;
  folder_id: number | null;
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

interface ParcoursSummaryRow {
  id: number;
  name: string;
  start_town: string;
  distance_km: number;
  elevation_m: number;
  direction: string;
  site_url: string | null;
  folder_id: number | null;
  has_track: number;
  is_drawn: number;
}

/**
 * Liste tous les parcours du catalogue, triés par nom, **sans** le contenu des
 * tracés (lourd) : seuls des indicateurs « a un tracé » / « dessiné » sont
 * calculés côté SQL. Les tracés se chargent à part ({@link listParcoursTracks}).
 */
export async function listParcours(): Promise<ParcoursSummary[]> {
  const db = await getDb();
  const rows = await db.select<ParcoursSummaryRow[]>(
    `SELECT id, name, start_town, distance_km, elevation_m, direction, site_url, folder_id,
            gpx_data IS NOT NULL AS has_track,
            (waypoints_json IS NOT NULL AND length(waypoints_json) > 2) AS is_drawn
     FROM parcours ORDER BY name`
  );
  return rows.map((row) => ({
    ...row,
    direction: row.direction as ParcoursSummary["direction"],
    has_track: row.has_track === 1,
    is_drawn: row.is_drawn === 1,
  }));
}

/** Contenu GPX des parcours demandés (uniquement ceux qui ont un tracé). */
export async function listParcoursTracks(ids: number[]): Promise<{ id: number; gpx_data: string }[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(", ");
  return db.select<{ id: number; gpx_data: string }[]>(
    `SELECT id, gpx_data FROM parcours WHERE gpx_data IS NOT NULL AND id IN (${placeholders})`,
    ids
  );
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
    `INSERT INTO parcours (name, start_town, distance_km, elevation_m, direction, site_url, folder_id, gpx_data, waypoints_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.start_town,
      input.distance_km,
      input.elevation_m,
      input.direction,
      input.site_url,
      input.folder_id,
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
     SET name = ?, start_town = ?, distance_km = ?, elevation_m = ?, direction = ?, site_url = ?, folder_id = ?, gpx_data = ?, waypoints_json = ?
     WHERE id = ?`,
    [
      input.name,
      input.start_town,
      input.distance_km,
      input.elevation_m,
      input.direction,
      input.site_url,
      input.folder_id,
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

/** Levée quand on crée ou renomme un dossier avec un nom déjà utilisé. */
export class FolderAlreadyExistsError extends Error {}

/** Liste les dossiers de parcours, triés par nom. */
export async function listFolders(): Promise<ParcoursFolder[]> {
  const db = await getDb();
  return db.select<ParcoursFolder[]>("SELECT id, name FROM parcours_folders ORDER BY name COLLATE NOCASE");
}

/** Crée un dossier et retourne son identifiant. */
export async function addFolder(name: string): Promise<number> {
  const db = await getDb();
  try {
    const result = await db.execute("INSERT INTO parcours_folders (name) VALUES (?)", [name]);
    return result.lastInsertId as number;
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new FolderAlreadyExistsError("Un dossier porte déjà ce nom.");
    throw err;
  }
}

/** Renomme un dossier. */
export async function renameFolder(id: number, name: string): Promise<void> {
  const db = await getDb();
  try {
    await db.execute("UPDATE parcours_folders SET name = ? WHERE id = ?", [name, id]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new FolderAlreadyExistsError("Un dossier porte déjà ce nom.");
    throw err;
  }
}

/** Supprime un dossier ; ses parcours ne sont pas supprimés, ils redeviennent « non classés ». */
export async function deleteFolder(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE parcours SET folder_id = NULL WHERE folder_id = ?", [id]);
  await db.execute("DELETE FROM parcours_folders WHERE id = ?", [id]);
}

/** Range un parcours dans un dossier (`null` = non classé). */
export async function setParcoursFolder(parcoursId: number, folderId: number | null): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE parcours SET folder_id = ? WHERE id = ?", [folderId, parcoursId]);
}
