import { BaseDirectory, exists, readDir } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";

const REGISTRY_KEY = "suivi-cyclisme-db-registry";
const CURRENT_KEY = "suivi-cyclisme-current-db";
const LEGACY_FILENAME = "suivi_cyclisme.db";
const LEGACY_DISPLAY_NAME = "Suivi Cyclisme";

export interface DatabaseEntry {
  /** Nom affiché à l'utilisateur, choisi librement. */
  name: string;
  /** Nom du fichier SQLite réel sur le disque (identifiant stable, unique). */
  filename: string;
}

function readRegistry(): DatabaseEntry[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeRegistry(entries: DatabaseEntry[]): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(entries));
}

/** Liste toutes les bases de données connues (créées via l'application). */
export function listDatabases(): DatabaseEntry[] {
  return readRegistry();
}

/** Nom de fichier de la base actuellement sélectionnée, ou `null` si aucune. */
export function getCurrentDatabaseFilename(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}

/** Entrée complète (nom affiché + fichier) de la base actuellement sélectionnée. */
export function getCurrentDatabase(): DatabaseEntry | null {
  const filename = getCurrentDatabaseFilename();
  if (!filename) return null;
  return readRegistry().find((e) => e.filename === filename) ?? null;
}

function sanitizeBaseName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .slice(0, 80);
  return cleaned || "base";
}

/** Choisit un nom de fichier `<nom>.db` non déjà utilisé par une autre base. */
function uniqueFilename(name: string, existing: DatabaseEntry[]): string {
  const base = sanitizeBaseName(name);
  const used = new Set(existing.map((e) => e.filename));
  let filename = `${base}.db`;
  let suffix = 2;
  while (used.has(filename)) {
    filename = `${base}-${suffix}.db`;
    suffix++;
  }
  return filename;
}

/**
 * Crée une nouvelle base de données (l'ajoute au registre) et la sélectionne
 * immédiatement comme base active. Le fichier SQLite lui-même n'est créé
 * qu'au premier accès (voir `db.ts`).
 *
 * @throws si le nom est vide ou déjà utilisé par une autre base.
 */
export function createDatabase(name: string): DatabaseEntry {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Le nom de la base de données est obligatoire.");
  const existingEntries = readRegistry();
  if (existingEntries.some((e) => e.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("Une base de données porte déjà ce nom.");
  }
  const entry: DatabaseEntry = { name: trimmed, filename: uniqueFilename(trimmed, existingEntries) };
  writeRegistry([...existingEntries, entry]);
  localStorage.setItem(CURRENT_KEY, entry.filename);
  return entry;
}

/** Bascule sur une base de données déjà connue du registre. */
export function switchDatabase(filename: string): void {
  const known = readRegistry().some((e) => e.filename === filename);
  if (!known) throw new Error("Base de données introuvable.");
  localStorage.setItem(CURRENT_KEY, filename);
}

/**
 * Migration silencieuse : si une base créée avant l'introduction du choix du
 * nom existe déjà sur le disque (fichier historique `suivi_cyclisme.db`), on
 * l'enregistre sous un nom par défaut **sans jamais changer son nom de
 * fichier réel**, pour ne pas perdre l'accès aux données déjà présentes.
 * Ne fait rien si une base est déjà sélectionnée.
 */
export async function migrateLegacyDatabaseIfNeeded(): Promise<void> {
  if (getCurrentDatabaseFilename()) return;
  const legacyExists = await exists(LEGACY_FILENAME, { baseDir: BaseDirectory.AppData });
  if (!legacyExists) return;
  const entry: DatabaseEntry = { name: LEGACY_DISPLAY_NAME, filename: LEGACY_FILENAME };
  writeRegistry([entry]);
  localStorage.setItem(CURRENT_KEY, entry.filename);
}

export interface ScanResult {
  /** Bases trouvées sur le disque, pas encore connues du registre, et ajoutées. */
  added: DatabaseEntry[];
  /** Fichiers .db trouvés mais dont le schéma ne correspond pas à Suivi Cyclisme (ignorés). */
  invalid: string[];
  /** Bases du registre dont le fichier n'existe plus sur le disque, retirées. */
  removed: DatabaseEntry[];
  /** Renseigné si la base active a disparu et qu'on a basculé sur une autre base restante. */
  switchedTo: DatabaseEntry | null;
  /** `true` si la base active a disparu et qu'aucune autre base ne restait pour prendre le relais. */
  currentCleared: boolean;
}

/** Vérifie qu'un fichier .db a bien les tables attendues (`bikes`, `rides`). */
async function isValidSuiviCyclismeDb(filename: string): Promise<boolean> {
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
        // rien à faire : la connexion est de toute façon abandonnée
      }
    }
  }
}

/**
 * Scanne le dossier de données de l'application :
 * - ajoute les fichiers `.db` présents sur le disque mais pas encore connus
 *   du registre (ex. copiés manuellement), après vérification de leur schéma ;
 * - retire du registre les bases qui y figurent mais dont le fichier a
 *   disparu (supprimé manuellement en dehors de l'application) ;
 * - si la base active a disparu, bascule automatiquement sur une base
 *   restante s'il y en a une, sinon efface la sélection active.
 */
export async function scanForDatabases(): Promise<ScanResult> {
  // On passe le chemin absolu résolu plutôt que "." + baseDir : Tauri joint
  // littéralement "." au chemin (`$APPDATA/.`), ce qui ne correspond pas au
  // motif de portée `$APPDATA/**` déclaré dans les capabilities et est donc
  // refusé ("forbidden path").
  const dir = await appDataDir();
  const dirEntries = await readDir(dir);
  const filenamesOnDisk = new Set(
    dirEntries.filter((e) => e.isFile && e.name.toLowerCase().endsWith(".db")).map((e) => e.name)
  );

  const registry = readRegistry();

  const removed = registry.filter((e) => !filenamesOnDisk.has(e.filename));
  const survivors = registry.filter((e) => filenamesOnDisk.has(e.filename));

  const knownFilenames = new Set(survivors.map((e) => e.filename));
  const added: DatabaseEntry[] = [];
  const invalid: string[] = [];

  for (const filename of filenamesOnDisk) {
    if (knownFilenames.has(filename)) continue;
    if (await isValidSuiviCyclismeDb(filename)) {
      added.push({ name: filename.replace(/\.db$/i, ""), filename });
    } else {
      invalid.push(filename);
    }
  }

  const finalRegistry = [...survivors, ...added];
  writeRegistry(finalRegistry);

  let switchedTo: DatabaseEntry | null = null;
  let currentCleared = false;
  const currentFilename = getCurrentDatabaseFilename();
  const currentStillPresent = finalRegistry.some((e) => e.filename === currentFilename);
  if (currentFilename && !currentStillPresent) {
    if (finalRegistry.length > 0) {
      switchedTo = finalRegistry[0];
      localStorage.setItem(CURRENT_KEY, switchedTo.filename);
    } else {
      localStorage.removeItem(CURRENT_KEY);
      currentCleared = true;
    }
  }

  return { added, invalid, removed, switchedTo, currentCleared };
}
