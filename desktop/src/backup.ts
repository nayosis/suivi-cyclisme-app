import { open, save } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import { closeDb, getDb } from "./db";
import { getCurrentDatabaseFilename } from "./database-registry";

/** Extension des fichiers de sauvegarde : une copie complète de la base SQLite active. */
export const BACKUP_EXTENSION = "suivi-backup";

const TEMP_FILENAME = "backup-temp.tmp";

/** Supprime un fichier du dossier de données s'il existe (copie temporaire, journaux SQLite résiduels). */
async function removeIfExists(path: string): Promise<void> {
  if (await exists(path)) await remove(path);
}

/**
 * Écrit dans `destination` une copie cohérente de la base active. `VACUUM INTO`
 * produit un fichier SQLite complet et compact même si l'application est en
 * train d'écrire, ce qu'une simple copie du fichier ne garantit pas.
 */
async function writeDatabaseCopy(destination: string): Promise<void> {
  await removeIfExists(destination);
  const db = await getDb();
  await db.execute("VACUUM INTO ?", [destination]);
}

/**
 * Ouvre « Enregistrer sous » puis sauvegarde **toute la base active** (vélos,
 * sorties, entretien, pièces, parcours et tracés GPX) dans un seul fichier.
 *
 * @returns `true` si la sauvegarde a été écrite, `false` si l'utilisateur a annulé.
 */
export async function backupToFile(): Promise<boolean> {
  const defaultName = `Suivi-Cyclisme-${new Date().toISOString().slice(0, 10)}.${BACKUP_EXTENSION}`;
  const destination = await save({
    defaultPath: defaultName,
    filters: [{ name: "Sauvegarde Suivi Cyclisme", extensions: [BACKUP_EXTENSION] }],
  });
  if (!destination) return false;

  // La copie passe par le dossier de données (SQLite y écrit directement), puis est déposée à l'endroit choisi.
  const temp = await join(await appDataDir(), TEMP_FILENAME);
  try {
    await writeDatabaseCopy(temp);
    await copyFile(temp, destination);
  } finally {
    await removeIfExists(temp);
  }
  return true;
}

/** Vérifie qu'un fichier de la base de données ressemble à une base Suivi Cyclisme. */
async function isSuiviCyclismeDatabase(filename: string): Promise<boolean> {
  let database: Database | null = null;
  try {
    database = await Database.load(`sqlite:${filename}`);
    const tables = await database.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('bikes', 'rides')"
    );
    return tables.length === 2;
  } catch {
    return false;
  } finally {
    if (database) {
      try {
        await database.close();
      } catch {
        // connexion abandonnée de toute façon
      }
    }
  }
}

export interface RestoreResult {
  /** Chemin de la copie de sécurité de la base telle qu'elle était avant la restauration. */
  safetyCopyPath: string;
}

/**
 * Choisit un fichier de sauvegarde. `null` si l'utilisateur annule.
 * Le fichier n'est pas encore appliqué : voir {@link restoreFromFile}.
 */
export async function pickBackupFile(): Promise<string | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: "Sauvegarde Suivi Cyclisme", extensions: [BACKUP_EXTENSION] }],
  });
  return !path || Array.isArray(path) ? null : path;
}

/**
 * Remplace la base active par le contenu du fichier de sauvegarde. Avant tout,
 * l'état actuel est copié à côté (extension `.bak`, ignorée par la recherche de
 * bases) pour que la restauration reste annulable à la main.
 *
 * @throws {Error} si le fichier n'est pas une sauvegarde Suivi Cyclisme (rien n'est alors modifié).
 */
export async function restoreFromFile(backupPath: string): Promise<RestoreResult> {
  const filename = getCurrentDatabaseFilename();
  if (!filename) throw new Error("Aucune base de données active à restaurer.");
  const dir = await appDataDir();
  const activePath = await join(dir, filename);
  const tempPath = await join(dir, TEMP_FILENAME);

  // 1. Contrôle du fichier sur une copie : on ne touche pas à la base active tant qu'il n'est pas validé.
  await copyFile(backupPath, tempPath);
  try {
    if (!(await isSuiviCyclismeDatabase(TEMP_FILENAME))) {
      throw new Error("Ce fichier n'est pas une sauvegarde Suivi Cyclisme valide.");
    }

    // 2. Copie de sécurité de l'état actuel.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safetyCopyPath = await join(dir, `${filename}.avant-restauration-${stamp}.bak`);
    await writeDatabaseCopy(safetyCopyPath);

    // 3. Remplacement : connexion fermée, journaux résiduels retirés, puis copie.
    await closeDb();
    await removeIfExists(`${activePath}-wal`);
    await removeIfExists(`${activePath}-shm`);
    await copyFile(tempPath, activePath);
    return { safetyCopyPath };
  } finally {
    await removeIfExists(tempPath);
  }
}
