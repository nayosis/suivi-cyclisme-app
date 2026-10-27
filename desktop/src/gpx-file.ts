import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { parseGpx } from "./gpx";

/**
 * Ouvre la boîte de dialogue native de choix de fichier filtrée sur les
 * `.gpx`, lit et valide le fichier choisi. Partagé entre `GpxUploadField`
 * (remplacement d'un tracé existant) et l'écran de choix à la création d'un
 * parcours.
 *
 * @returns le contenu XML brut, ou `null` si l'utilisateur a annulé la sélection.
 * @throws {Error} si le fichier n'est pas un GPX exploitable.
 */
export async function pickGpxFile(): Promise<string | null> {
  const path = await open({ multiple: false, filters: [{ name: "GPX", extensions: ["gpx"] }] });
  if (!path || Array.isArray(path)) return null;
  const xml = await readTextFile(path);
  parseGpx(xml); // valide le fichier avant de le retenir
  return xml;
}
