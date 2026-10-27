import { getDb } from "./db";
import type {
  BikePartDef,
  Maintenance,
  MaintenanceInput,
  PartInstance,
  PartInstanceStats,
  PartMount,
  PartTag,
  SlotMount,
} from "./types";

/** Levée quand on crée/renomme un emplacement avec un nom déjà utilisé. */
export class BikePartDefAlreadyExistsError extends Error {}
/** Levée quand on supprime un emplacement ayant un historique de montage. */
export class BikePartDefInUseError extends Error {}
/** Levée quand on supprime un exemplaire ayant un historique de montage. */
export class PartInstanceInUseError extends Error {}
/** Levée quand on installe un exemplaire déjà monté ailleurs (il faut d'abord le désinstaller). */
export class PartAlreadyMountedError extends Error {}
/** Levée quand on installe une pièce sur un emplacement déjà occupé sur ce vélo. */
export class SlotAlreadyOccupiedError extends Error {}
/** Levée quand on crée/configure un emplacement alors qu'au moins un vélo n'a pas de date d'acquisition. */
export class BikesMissingPurchaseDateError extends Error {}
/** Levée quand on crée/renomme un tag avec un nom déjà utilisé. */
export class PartTagAlreadyExistsError extends Error {}
/**
 * Levée quand une installation ou une désinstallation daterait d'avant un
 * autre événement déjà enregistré sur le même emplacement du même vélo (ou
 * avant la pose de la pièce qu'on désinstalle) — ça inverserait la
 * chronologie de l'emplacement.
 */
export class InvalidMountDateError extends Error {}

/** @throws {BikesMissingPurchaseDateError} si au moins un vélo n'a pas de date d'acquisition renseignée. */
async function assertAllBikesHavePurchaseDate(): Promise<void> {
  const db = await getDb();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM bikes WHERE purchase_date IS NULL"
  );
  if (count > 0) throw new BikesMissingPurchaseDateError();
}

// ---------- Emplacements (catalogue partagé, positionnés sur le schéma) ----------

/** Liste tous les emplacements du vélo, triés par nom, avec leurs tags de pièces autorisés. */
export async function listBikePartDefs(): Promise<BikePartDef[]> {
  const db = await getDb();
  const rows = await db.select<{ id: number; name: string; x: number; y: number; mandatory: number }[]>(
    "SELECT id, name, x, y, mandatory FROM bike_part_defs ORDER BY name"
  );
  const tagRows = await db.select<{ bike_part_def_id: number; tag_id: number }[]>(
    "SELECT bike_part_def_id, tag_id FROM bike_part_def_tags"
  );
  const tagIdsByDef = new Map<number, number[]>();
  for (const r of tagRows) {
    const list = tagIdsByDef.get(r.bike_part_def_id) ?? [];
    list.push(r.tag_id);
    tagIdsByDef.set(r.bike_part_def_id, list);
  }
  return rows.map((r) => ({ ...r, mandatory: !!r.mandatory, tagIds: tagIdsByDef.get(r.id) ?? [] }));
}

/** Remplace les tags de pièces autorisés d'un emplacement par `tagIds`. */
async function setBikePartDefTags(defId: number, tagIds: number[]): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM bike_part_def_tags WHERE bike_part_def_id = ?", [defId]);
  for (const tagId of tagIds) {
    await db.execute("INSERT INTO bike_part_def_tags (bike_part_def_id, tag_id) VALUES (?, ?)", [defId, tagId]);
  }
}

/**
 * Crée un nouvel emplacement à la position `(x, y)` (en % du schéma), avec
 * les tags de pièces jugés compatibles (purement indicatif, voir
 * {@link BikePartDef.tagIds}). Si `mandatory` est vrai, un exemplaire
 * "d'origine" est immédiatement créé et installé sur ce nouvel emplacement
 * pour chaque vélo existant.
 * @throws {BikesMissingPurchaseDateError} si au moins un vélo n'a pas de date d'acquisition.
 * @throws {BikePartDefAlreadyExistsError}
 */
export async function addBikePartDef(
  name: string,
  x: number,
  y: number,
  mandatory: boolean,
  tagIds: number[] = []
): Promise<number> {
  await assertAllBikesHavePurchaseDate();
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>("SELECT id FROM bike_part_defs WHERE name = ?", [name]);
  if (existing.length > 0) throw new BikePartDefAlreadyExistsError(name);
  const result = await db.execute(
    "INSERT INTO bike_part_defs (name, x, y, mandatory) VALUES (?, ?, ?, ?)",
    [name, x, y, mandatory ? 1 : 0]
  );
  const defId = result.lastInsertId as number;
  await setBikePartDefTags(defId, tagIds);
  if (mandatory) {
    const bikes = await db.select<{ id: number }[]>("SELECT id FROM bikes");
    for (const bike of bikes) {
      await instantiateOriginalPart(defId, name, bike.id);
    }
  }
  return defId;
}

/**
 * Modifie le nom, la position, le caractère obligatoire et/ou les tags de
 * pièces autorisés d'un emplacement. Si `mandatory` passe de faux à vrai,
 * les vélos n'ayant encore aucun exemplaire à cet emplacement en reçoivent
 * un automatiquement.
 * @throws {BikesMissingPurchaseDateError} si `mandatory` passe à vrai alors qu'au moins un vélo n'a pas de date d'acquisition.
 * @throws {BikePartDefAlreadyExistsError}
 */
export async function updateBikePartDef(
  id: number,
  name: string,
  x: number,
  y: number,
  mandatory: boolean,
  tagIds: number[]
): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM bike_part_defs WHERE name = ? AND id != ?",
    [name, id]
  );
  if (existing.length > 0) throw new BikePartDefAlreadyExistsError(name);
  const [before] = await db.select<{ mandatory: number }[]>(
    "SELECT mandatory FROM bike_part_defs WHERE id = ?",
    [id]
  );
  const becomingMandatory = mandatory && !before?.mandatory;
  if (becomingMandatory) {
    await assertAllBikesHavePurchaseDate();
  }
  await db.execute("UPDATE bike_part_defs SET name = ?, x = ?, y = ?, mandatory = ? WHERE id = ?", [
    name,
    x,
    y,
    mandatory ? 1 : 0,
    id,
  ]);
  await setBikePartDefTags(id, tagIds);
  if (becomingMandatory) {
    await instantiateMandatoryDefForMissingBikes(id, name);
  }
}

/** Supprime un emplacement. @throws {BikePartDefInUseError} s'il a le moindre historique de montage. */
export async function deleteBikePartDef(id: number): Promise<void> {
  const db = await getDb();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM part_mounts WHERE bike_part_def_id = ?",
    [id]
  );
  if (count > 0) throw new BikePartDefInUseError(String(id));
  await db.execute("DELETE FROM bike_part_def_tags WHERE bike_part_def_id = ?", [id]);
  await db.execute("DELETE FROM bike_part_defs WHERE id = ?", [id]);
}

/**
 * Crée et installe directement (sans maintenance) un exemplaire "d'origine"
 * sur un emplacement d'un vélo, daté de la date d'acquisition du vélo. Ne
 * fait rien si ce vélo n'a pas de date d'acquisition renseignée (ne devrait
 * pas arriver en usage normal — {@link assertAllBikesHavePurchaseDate} est
 * censée l'avoir empêché en amont — mais reste sans effet plutôt que
 * d'échouer, par exemple lors d'un import en masse de vélos).
 */
async function instantiateOriginalPart(defId: number, defName: string, bikeId: number): Promise<void> {
  const db = await getDb();
  const [bike] = await db.select<{ name: string; purchase_date: string | null }[]>(
    "SELECT name, purchase_date FROM bikes WHERE id = ?",
    [bikeId]
  );
  if (!bike?.purchase_date) return;
  const result = await db.execute(
    "INSERT INTO part_instances (name, purchase_cost, purchase_date, retired_date) VALUES (?, ?, ?, ?)",
    [`${defName} d'origine (${bike.name})`, null, bike.purchase_date, null]
  );
  await db.execute(
    `INSERT INTO part_mounts (part_instance_id, bike_id, bike_part_def_id, mounted_at, mounted_by_maintenance_id)
     VALUES (?, ?, ?, ?, ?)`,
    [result.lastInsertId, bikeId, defId, bike.purchase_date, null]
  );
}

/** Instancie une pièce d'origine sur `defId` pour chaque vélo qui n'y a encore aucun historique de montage. */
async function instantiateMandatoryDefForMissingBikes(defId: number, defName: string): Promise<void> {
  const db = await getDb();
  const bikes = await db.select<{ id: number }[]>(
    `SELECT id FROM bikes WHERE id NOT IN (SELECT DISTINCT bike_id FROM part_mounts WHERE bike_part_def_id = ?)`,
    [defId]
  );
  for (const bike of bikes) {
    await instantiateOriginalPart(defId, defName, bike.id);
  }
}

/**
 * Instancie une pièce d'origine pour un vélo (typiquement à sa création) sur
 * chaque emplacement obligatoire où il n'a encore aucun historique de
 * montage.
 */
export async function instantiateMandatoryPartsForBike(bikeId: number): Promise<void> {
  const db = await getDb();
  const defs = await db.select<{ id: number; name: string }[]>(
    "SELECT id, name FROM bike_part_defs WHERE mandatory = 1"
  );
  for (const def of defs) {
    const [{ count }] = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM part_mounts WHERE bike_id = ? AND bike_part_def_id = ?",
      [bikeId, def.id]
    );
    if (count === 0) await instantiateOriginalPart(def.id, def.name, bikeId);
  }
}

// ---------- Exemplaires de pièces ----------

const PART_INSTANCE_SELECT = `
  SELECT pi.id, pi.name, pi.purchase_cost, pi.purchase_date, pi.retired_date
  FROM part_instances pi
`;

/** Attache à chaque exemplaire la liste de ses tags. */
async function attachInstanceTags(instances: Omit<PartInstance, "tags">[]): Promise<PartInstance[]> {
  if (instances.length === 0) return [];
  const db = await getDb();
  const tagRows = await db.select<{ part_instance_id: number; id: number; name: string; color: string }[]>(
    `SELECT pit.part_instance_id, pt.id, pt.name, pt.color
     FROM part_instance_tags pit
     JOIN part_tags pt ON pt.id = pit.tag_id
     ORDER BY pt.name`
  );
  const tagsByInstance = new Map<number, PartTag[]>();
  for (const row of tagRows) {
    const list = tagsByInstance.get(row.part_instance_id) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    tagsByInstance.set(row.part_instance_id, list);
  }
  return instances.map((i) => ({ ...i, tags: tagsByInstance.get(i.id) ?? [] }));
}

/** Liste tous les exemplaires de pièces, triés par nom. */
export async function listPartInstances(): Promise<PartInstance[]> {
  const db = await getDb();
  const rows = await db.select<Omit<PartInstance, "tags">[]>(`${PART_INSTANCE_SELECT} ORDER BY pi.name`);
  return attachInstanceTags(rows);
}

/**
 * Liste les exemplaires **disponibles à l'installation** (n'ayant aucune
 * période de montage ouverte actuellement, sur aucun emplacement, et pas mis
 * au rebut).
 */
export async function listAvailablePartInstances(): Promise<PartInstance[]> {
  const db = await getDb();
  const rows = await db.select<Omit<PartInstance, "tags">[]>(
    `${PART_INSTANCE_SELECT}
     WHERE pi.retired_date IS NULL
       AND pi.id NOT IN (SELECT part_instance_id FROM part_mounts WHERE unmounted_at IS NULL)
     ORDER BY pi.name`
  );
  return attachInstanceTags(rows);
}

/** Crée un nouvel exemplaire de pièce (pas encore installé nulle part), avec ses tags éventuels. */
export async function addPartInstance(
  name: string,
  purchaseCost: number | null,
  purchaseDate: string | null,
  retiredDate: string | null,
  tagIds: number[] = []
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO part_instances (name, purchase_cost, purchase_date, retired_date) VALUES (?, ?, ?, ?)",
    [name, purchaseCost, purchaseDate, retiredDate]
  );
  const id = result.lastInsertId as number;
  for (const tagId of tagIds) {
    await db.execute("INSERT INTO part_instance_tags (part_instance_id, tag_id) VALUES (?, ?)", [id, tagId]);
  }
  return id;
}

/** Met à jour le nom, le coût d'achat, les dates et les tags d'un exemplaire. */
export async function updatePartInstance(
  id: number,
  name: string,
  purchaseCost: number | null,
  purchaseDate: string | null,
  retiredDate: string | null,
  tagIds: number[]
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE part_instances SET name = ?, purchase_cost = ?, purchase_date = ?, retired_date = ? WHERE id = ?",
    [name, purchaseCost, purchaseDate, retiredDate, id]
  );
  await db.execute("DELETE FROM part_instance_tags WHERE part_instance_id = ?", [id]);
  for (const tagId of tagIds) {
    await db.execute("INSERT INTO part_instance_tags (part_instance_id, tag_id) VALUES (?, ?)", [id, tagId]);
  }
}

/** Renseigne (ou efface avec `null`) la date de mise au rebut d'un exemplaire, sans toucher aux autres champs. */
export async function setPartInstanceRetiredDate(id: number, retiredDate: string | null): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE part_instances SET retired_date = ? WHERE id = ?", [retiredDate, id]);
}

/** Ajoute ou retire un tag sur un exemplaire, sans toucher à ses autres tags. */
export async function setPartInstanceTag(id: number, tagId: number, on: boolean): Promise<void> {
  const db = await getDb();
  if (on) {
    await db.execute("INSERT OR IGNORE INTO part_instance_tags (part_instance_id, tag_id) VALUES (?, ?)", [id, tagId]);
  } else {
    await db.execute("DELETE FROM part_instance_tags WHERE part_instance_id = ? AND tag_id = ?", [id, tagId]);
  }
}

/**
 * Supprime un exemplaire de pièce.
 * @throws {PartInstanceInUseError} s'il a le moindre historique de montage —
 * il faut préserver l'historique des maintenances plutôt que de le perdre.
 */
export async function deletePartInstance(id: number): Promise<void> {
  const db = await getDb();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM part_mounts WHERE part_instance_id = ?",
    [id]
  );
  if (count > 0) throw new PartInstanceInUseError(String(id));
  await db.execute("DELETE FROM part_instances WHERE id = ?", [id]);
}

// ---------- Tags de pièces ----------

/** Liste tous les tags, triés par nom. */
export async function listPartTags(): Promise<PartTag[]> {
  const db = await getDb();
  return db.select<PartTag[]>("SELECT id, name, color FROM part_tags ORDER BY name");
}

/** Crée un nouveau tag. @throws {PartTagAlreadyExistsError} */
export async function addPartTag(name: string, color: string): Promise<number> {
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>("SELECT id FROM part_tags WHERE name = ?", [name]);
  if (existing.length > 0) throw new PartTagAlreadyExistsError(name);
  const result = await db.execute("INSERT INTO part_tags (name, color) VALUES (?, ?)", [name, color]);
  return result.lastInsertId as number;
}

/** Renomme un tag et/ou change sa couleur. @throws {PartTagAlreadyExistsError} */
export async function updatePartTag(id: number, name: string, color: string): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>("SELECT id FROM part_tags WHERE name = ? AND id != ?", [name, id]);
  if (existing.length > 0) throw new PartTagAlreadyExistsError(name);
  await db.execute("UPDATE part_tags SET name = ?, color = ? WHERE id = ?", [name, color, id]);
}

/** Supprime un tag (et le retire de tous les exemplaires et emplacements qui le portaient). */
export async function deletePartTag(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM part_instance_tags WHERE tag_id = ?", [id]);
  await db.execute("DELETE FROM bike_part_def_tags WHERE tag_id = ?", [id]);
  await db.execute("DELETE FROM part_tags WHERE id = ?", [id]);
}

// ---------- Maintenances ----------

const MAINTENANCE_SELECT = `
  SELECT m.id, m.bike_id, b.name AS bike_name, m.date, m.comment, m.cost
  FROM maintenances m
  JOIN bikes b ON b.id = m.bike_id
`;

/** Liste les maintenances (toutes, ou d'un seul vélo si `bikeId` est fourni), les plus récentes en premier. */
export async function listMaintenances(bikeId?: number): Promise<Maintenance[]> {
  const db = await getDb();
  if (bikeId !== undefined) {
    return db.select<Maintenance[]>(
      `${MAINTENANCE_SELECT} WHERE m.bike_id = ? ORDER BY m.date DESC, m.id DESC`,
      [bikeId]
    );
  }
  return db.select<Maintenance[]>(`${MAINTENANCE_SELECT} ORDER BY m.date DESC, m.id DESC`);
}

/**
 * Kilométrage cumulé du vélo (kilométrage à l'achat + sorties jusqu'à cette
 * date incluse) à la date de chaque maintenance de ce vélo — donne le
 * kilométrage du vélo au moment de l'intervention.
 */
export async function getBikeMileageAtMaintenances(
  bikeId: number
): Promise<{ maintenance_id: number; mileage_km: number }[]> {
  const db = await getDb();
  return db.select<{ maintenance_id: number; mileage_km: number }[]>(
    `SELECT m.id AS maintenance_id,
            b.purchase_km + COALESCE(
              (SELECT SUM(r.distance_km) FROM rides r WHERE r.bike_id = m.bike_id AND r.date <= m.date), 0
            ) AS mileage_km
     FROM maintenances m
     JOIN bikes b ON b.id = m.bike_id
     WHERE m.bike_id = ?`,
    [bikeId]
  );
}

/** Crée un événement de maintenance (sans opération de pièce associée pour l'instant). */
export async function addMaintenance(input: MaintenanceInput): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO maintenances (bike_id, date, comment, cost) VALUES (?, ?, ?, ?)",
    [input.bike_id, input.date, input.comment, input.cost]
  );
  return result.lastInsertId as number;
}

/**
 * Met à jour une maintenance. Si la date ou le vélo change, les périodes de
 * montage qu'elle a déclenchées (posées ou déposées) sont mises à jour en
 * conséquence pour rester cohérentes.
 * @throws {InvalidMountDateError} si la nouvelle date inverserait la chronologie d'un emplacement qu'elle a touché.
 */
export async function updateMaintenance(id: number, input: MaintenanceInput): Promise<void> {
  const db = await getDb();

  const installedMounts = await db.select<{ id: number; bike_part_def_id: number }[]>(
    "SELECT id, bike_part_def_id FROM part_mounts WHERE mounted_by_maintenance_id = ?",
    [id]
  );
  for (const m of installedMounts) {
    await assertChronologicalInstall(input.bike_id, m.bike_part_def_id, input.date, m.id);
  }
  const removedMounts = await db.select<{ mounted_at: string }[]>(
    "SELECT mounted_at FROM part_mounts WHERE removed_by_maintenance_id = ?",
    [id]
  );
  for (const m of removedMounts) {
    if (input.date < m.mounted_at) {
      throw new InvalidMountDateError(
        `La date de dépose (${input.date}) est antérieure à la date de pose de la pièce concernée (${m.mounted_at}).`
      );
    }
  }

  await db.execute("UPDATE maintenances SET bike_id = ?, date = ?, comment = ?, cost = ? WHERE id = ?", [
    input.bike_id,
    input.date,
    input.comment,
    input.cost,
    id,
  ]);
  await db.execute(
    "UPDATE part_mounts SET bike_id = ?, mounted_at = ? WHERE mounted_by_maintenance_id = ?",
    [input.bike_id, input.date, id]
  );
  // Une pièce « retirée et mise au rebut » par cette maintenance suit la nouvelle date.
  await db.execute(
    `UPDATE part_instances SET retired_date = ?
     WHERE retired_date IN (SELECT unmounted_at FROM part_mounts WHERE part_instance_id = part_instances.id AND removed_by_maintenance_id = ?)`,
    [input.date, id]
  );
  await db.execute(
    "UPDATE part_mounts SET unmounted_at = ? WHERE removed_by_maintenance_id = ?",
    [input.date, id]
  );
}

/**
 * Remet en service les pièces qu'une maintenance a retirées **et mises au
 * rebut** : leur date de rebut coïncide avec la date de ce retrait.
 */
async function clearRetirementsScrappedBy(maintenanceId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE part_instances SET retired_date = NULL
     WHERE retired_date IN (SELECT unmounted_at FROM part_mounts WHERE part_instance_id = part_instances.id AND removed_by_maintenance_id = ?)`,
    [maintenanceId]
  );
}

/**
 * Supprime une maintenance et annule ses effets sur les pièces :
 * - les périodes de montage qu'elle a **créées** (installations) sont supprimées ;
 * - les périodes de montage qu'elle a **closes** (désinstallations) sont rouvertes,
 *   et les pièces qu'elle avait mises au rebut redeviennent actives.
 */
export async function deleteMaintenance(id: number): Promise<void> {
  const db = await getDb();
  await clearRetirementsScrappedBy(id);
  await db.execute("DELETE FROM part_mounts WHERE mounted_by_maintenance_id = ?", [id]);
  await db.execute(
    "UPDATE part_mounts SET unmounted_at = ?, removed_by_maintenance_id = ? WHERE removed_by_maintenance_id = ?",
    [null, null, id]
  );
  await db.execute("DELETE FROM maintenances WHERE id = ?", [id]);
}

// ---------- Cohérence chronologique des montages ----------

/**
 * @throws {InvalidMountDateError} si `mountedAt` est antérieur à la pose du
 * montage le plus récent déjà enregistré sur cet emplacement de ce vélo
 * (`excludeMountId` exclu de la comparaison, pour une modification en place).
 */
async function assertChronologicalInstall(
  bikeId: number,
  bikePartDefId: number,
  mountedAt: string,
  excludeMountId?: number
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ mounted_at: string }[]>(
    `SELECT mounted_at FROM part_mounts
     WHERE bike_id = ? AND bike_part_def_id = ? ${excludeMountId != null ? "AND id != ?" : ""}
     ORDER BY mounted_at DESC LIMIT 1`,
    excludeMountId != null ? [bikeId, bikePartDefId, excludeMountId] : [bikeId, bikePartDefId]
  );
  const last = rows[0];
  if (last && mountedAt < last.mounted_at) {
    throw new InvalidMountDateError(
      `La date de pose (${mountedAt}) est antérieure au dernier changement enregistré sur cet emplacement (${last.mounted_at}).`
    );
  }
}

/** @throws {InvalidMountDateError} si `unmountedAt` est antérieur à la pose (`mounted_at`) de ce montage. */
async function assertChronologicalUninstall(partMountId: number, unmountedAt: string): Promise<void> {
  const db = await getDb();
  const [mount] = await db.select<{ mounted_at: string }[]>(
    "SELECT mounted_at FROM part_mounts WHERE id = ?",
    [partMountId]
  );
  if (mount && unmountedAt < mount.mounted_at) {
    throw new InvalidMountDateError(
      `La date de dépose (${unmountedAt}) est antérieure à la date de pose de cette pièce (${mount.mounted_at}).`
    );
  }
}

// ---------- Montages / démontages ----------

const PART_MOUNT_SELECT = `
  SELECT pm.id, pm.part_instance_id, pi.name AS part_instance_name,
         pm.bike_part_def_id, pd.name AS bike_part_def_name,
         pm.bike_id, b.name AS bike_name, pm.mounted_at, pm.unmounted_at,
         pm.mounted_by_maintenance_id, pm.removed_by_maintenance_id,
         pi.retired_date AS part_instance_retired_date
  FROM part_mounts pm
  JOIN part_instances pi ON pi.id = pm.part_instance_id
  JOIN bike_part_defs pd ON pd.id = pm.bike_part_def_id
  JOIN bikes b ON b.id = pm.bike_id
`;

/** Exemplaires actuellement montés sur un vélo donné (candidats à une désinstallation). */
export async function getOpenMountsForBike(bikeId: number): Promise<PartMount[]> {
  const db = await getDb();
  return db.select<PartMount[]>(
    `${PART_MOUNT_SELECT} WHERE pm.bike_id = ? AND pm.unmounted_at IS NULL ORDER BY pd.name`,
    [bikeId]
  );
}

/**
 * Toutes les périodes de montage (ouvertes ou closes) d'un vélo, utilisé
 * pour reconstituer le récapitulatif « avant → après » de chaque
 * maintenance (voir {@link getMaintenanceOperations}, appliqué en masse).
 */
export async function getAllMountsForBike(bikeId: number): Promise<PartMount[]> {
  const db = await getDb();
  return db.select<PartMount[]>(`${PART_MOUNT_SELECT} WHERE pm.bike_id = ? ORDER BY pd.name`, [bikeId]);
}

/**
 * Tout l'historique de montage (ouvert ou clos) d'un exemplaire de pièce
 * donné, du plus ancien au plus récent — utilisé pour reconstituer sa
 * frise chronologique (achat → montages/démontages → mise au rebut).
 */
export async function getMountsForInstance(instanceId: number): Promise<PartMount[]> {
  const db = await getDb();
  return db.select<PartMount[]>(
    `${PART_MOUNT_SELECT} WHERE pm.part_instance_id = ? ORDER BY pm.mounted_at`,
    [instanceId]
  );
}

/** Les installations et désinstallations déclenchées par une maintenance donnée. */
export async function getMaintenanceOperations(
  maintenanceId: number
): Promise<{ installed: PartMount[]; removed: PartMount[] }> {
  const db = await getDb();
  const installed = await db.select<PartMount[]>(
    `${PART_MOUNT_SELECT} WHERE pm.mounted_by_maintenance_id = ? ORDER BY pd.name`,
    [maintenanceId]
  );
  const removed = await db.select<PartMount[]>(
    `${PART_MOUNT_SELECT} WHERE pm.removed_by_maintenance_id = ? ORDER BY pd.name`,
    [maintenanceId]
  );
  return { installed, removed };
}

/**
 * Installe un exemplaire sur un emplacement d'un vélo, dans le cadre d'une
 * maintenance (ou directement si `maintenanceId` vaut `null`).
 * @throws {PartAlreadyMountedError} si cet exemplaire a déjà une période de
 * montage ouverte ailleurs (il faut d'abord le désinstaller).
 * @throws {SlotAlreadyOccupiedError} si cet emplacement est déjà occupé sur ce vélo.
 * @throws {InvalidMountDateError} si `mountedAt` est antérieur au dernier changement enregistré sur cet emplacement.
 */
export async function installPart(
  partInstanceId: number,
  bikeId: number,
  bikePartDefId: number,
  maintenanceId: number | null,
  mountedAt: string
): Promise<number> {
  const db = await getDb();
  const open = await db.select<{ id: number }[]>(
    "SELECT id FROM part_mounts WHERE part_instance_id = ? AND unmounted_at IS NULL",
    [partInstanceId]
  );
  if (open.length > 0) throw new PartAlreadyMountedError(String(partInstanceId));
  const occupied = await db.select<{ id: number }[]>(
    "SELECT id FROM part_mounts WHERE bike_id = ? AND bike_part_def_id = ? AND unmounted_at IS NULL",
    [bikeId, bikePartDefId]
  );
  if (occupied.length > 0) throw new SlotAlreadyOccupiedError(String(bikePartDefId));
  await assertChronologicalInstall(bikeId, bikePartDefId, mountedAt);
  const result = await db.execute(
    `INSERT INTO part_mounts (part_instance_id, bike_id, bike_part_def_id, mounted_at, mounted_by_maintenance_id)
     VALUES (?, ?, ?, ?, ?)`,
    [partInstanceId, bikeId, bikePartDefId, mountedAt, maintenanceId]
  );
  return result.lastInsertId as number;
}

/**
 * Désinstalle (ferme la période de montage ouverte), dans le cadre d'une maintenance ou directement.
 * Avec `scrap`, l'exemplaire est aussi mis au rebut à cette date.
 * @throws {InvalidMountDateError} si `unmountedAt` est antérieur à la pose de ce montage.
 */
export async function uninstallPart(
  partMountId: number,
  maintenanceId: number | null,
  unmountedAt: string,
  scrap = false
): Promise<void> {
  await assertChronologicalUninstall(partMountId, unmountedAt);
  const db = await getDb();
  await db.execute(
    "UPDATE part_mounts SET unmounted_at = ?, removed_by_maintenance_id = ? WHERE id = ? AND unmounted_at IS NULL",
    [unmountedAt, maintenanceId, partMountId]
  );
  if (scrap) {
    await db.execute(
      "UPDATE part_instances SET retired_date = ? WHERE id = (SELECT part_instance_id FROM part_mounts WHERE id = ?)",
      [unmountedAt, partMountId]
    );
  }
}

/** Annule une installation créée par une maintenance (supprime la période de montage). */
export async function removeMountRecord(partMountId: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM part_mounts WHERE id = ?", [partMountId]);
}

/** Annule une désinstallation : rouvre la période de montage (et remet en service la pièce si ce retrait l'avait mise au rebut). */
export async function reopenMount(partMountId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE part_instances SET retired_date = NULL
     WHERE id = (SELECT part_instance_id FROM part_mounts WHERE id = ? AND unmounted_at = part_instances.retired_date)`,
    [partMountId]
  );
  await db.execute(
    "UPDATE part_mounts SET unmounted_at = ?, removed_by_maintenance_id = ? WHERE id = ?",
    [null, null, partMountId]
  );
}

/**
 * Historique de montage d'un **emplacement donné sur un vélo donné** (toutes
 * les pièces qui y sont passées, du plus ancien au plus récent), avec pour
 * chaque période le kilométrage et le dénivelé parcourus par ce vélo
 * (sorties dont la date tombe dans la période de montage).
 */
export async function getSlotHistory(bikeId: number, bikePartDefId: number): Promise<SlotMount[]> {
  const db = await getDb();
  return db.select<SlotMount[]>(
    `SELECT pm.id, pm.part_instance_id, pi.name AS part_instance_name,
            pm.mounted_at, pm.unmounted_at,
            COALESCE(SUM(r.distance_km), 0) AS total_km,
            COALESCE(SUM(r.elevation_m), 0) AS total_elevation_m
     FROM part_mounts pm
     JOIN part_instances pi ON pi.id = pm.part_instance_id
     LEFT JOIN rides r ON r.bike_id = pm.bike_id
       AND r.date >= pm.mounted_at
       AND (pm.unmounted_at IS NULL OR r.date < pm.unmounted_at)
     WHERE pm.bike_id = ? AND pm.bike_part_def_id = ?
     GROUP BY pm.id
     ORDER BY pm.mounted_at`,
    [bikeId, bikePartDefId]
  );
}

// ---------- Statistiques ----------

/**
 * Statistiques cumulées de chaque exemplaire de pièce : kilométrage et
 * dénivelé cumulés sur **toutes** ses périodes de montage (calculés en
 * sommant les sorties du vélo concerné dont la date tombe dans chaque
 * période), plus son emplacement actuel s'il est présentement installé.
 */
export async function getPartInstanceStats(): Promise<PartInstanceStats[]> {
  const db = await getDb();
  const totals = await db.select<
    {
      part_instance_id: number;
      name: string;
      purchase_cost: number | null;
      purchase_date: string | null;
      retired_date: string | null;
      total_km: number;
      total_elevation_m: number;
    }[]
  >(
    `SELECT pi.id AS part_instance_id, pi.name, pi.purchase_cost, pi.purchase_date, pi.retired_date,
            COALESCE(SUM(r.distance_km), 0) AS total_km,
            COALESCE(SUM(r.elevation_m), 0) AS total_elevation_m
     FROM part_instances pi
     LEFT JOIN part_mounts pm ON pm.part_instance_id = pi.id
     LEFT JOIN rides r ON r.bike_id = pm.bike_id
       AND r.date >= pm.mounted_at
       AND (pm.unmounted_at IS NULL OR r.date < pm.unmounted_at)
     GROUP BY pi.id
     ORDER BY pi.name`
  );

  const currentMounts = await db.select<
    {
      part_instance_id: number;
      bike_id: number;
      bike_name: string;
      bike_color: string;
      bike_part_def_id: number;
      bike_part_def_name: string;
      mounted_at: string;
    }[]
  >(
    `SELECT pm.part_instance_id, pm.bike_id, b.name AS bike_name, b.color AS bike_color,
            pm.bike_part_def_id, pd.name AS bike_part_def_name, pm.mounted_at
     FROM part_mounts pm
     JOIN bikes b ON b.id = pm.bike_id
     JOIN bike_part_defs pd ON pd.id = pm.bike_part_def_id
     WHERE pm.unmounted_at IS NULL`
  );
  const mountByInstance = new Map(currentMounts.map((m) => [m.part_instance_id, m]));

  const tagRows = await db.select<{ part_instance_id: number; id: number; name: string; color: string }[]>(
    `SELECT pit.part_instance_id, pt.id, pt.name, pt.color
     FROM part_instance_tags pit
     JOIN part_tags pt ON pt.id = pit.tag_id
     ORDER BY pt.name`
  );
  const tagsByInstance = new Map<number, PartTag[]>();
  for (const row of tagRows) {
    const list = tagsByInstance.get(row.part_instance_id) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    tagsByInstance.set(row.part_instance_id, list);
  }

  return totals.map((t) => {
    const mount = mountByInstance.get(t.part_instance_id);
    return {
      ...t,
      tags: tagsByInstance.get(t.part_instance_id) ?? [],
      currentMount: mount
        ? {
            bike_id: mount.bike_id,
            bike_name: mount.bike_name,
            bike_color: mount.bike_color,
            bike_part_def_id: mount.bike_part_def_id,
            bike_part_def_name: mount.bike_part_def_name,
            mounted_at: mount.mounted_at,
          }
        : null,
    };
  });
}
