import { useEffect, useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { getVersion } from "@tauri-apps/api/app";
import { appDataDir, join } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { exportToFile, importFromFile } from "../data-transfer";
import { useTheme, type ThemeMode } from "../theme-context";
import { useHeatmapColor } from "../heatmap-color-context";
import { useOrsApiKey, useOrsQuota } from "../ors-context";
import { formatOrsQuota } from "../ors-quota";
import { errorMessage } from "../format";
import { ResetDataModal } from "../components/ResetDataModal";
import { CreateDatabaseModal } from "../components/CreateDatabaseModal";
import { RefreshIcon } from "../components/RefreshIcon";
import {
  createDatabase,
  getCurrentDatabaseFilename,
  listDatabases,
  scanForDatabases,
  switchDatabase,
  type DatabaseEntry,
} from "../database-registry";
import { invalidateEverything } from "../query-client";
import { rootRoute } from "../routes/root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/options",
  component: OptionsPage,
});

const THEME_LABELS: Record<ThemeMode, string> = {
  system: "Système",
  light: "Clair",
  dark: "Sombre",
};

/** Couleur d'accent par défaut de chaque thème (voir theme.css) — sert de valeur affichée dans le sélecteur tant qu'aucune couleur personnalisée n'est choisie. */
const ACCENT_FALLBACK = { light: "#2a78d6", dark: "#3987e5" };

interface StatusMessage {
  type: "success" | "warning" | "error";
  text: string;
}

function StatusText({ message }: { message: StatusMessage | null }) {
  if (!message) return null;
  return <div className={`${message.type}-text`}>{message.text}</div>;
}

function OptionsPage() {
  const { mode, setMode, resolvedDark } = useTheme();
  const { color: heatmapColor, setColor: setHeatmapColor } = useHeatmapColor();
  const heatmapColorValue = heatmapColor ?? (resolvedDark ? ACCENT_FALLBACK.dark : ACCENT_FALLBACK.light);
  const { apiKey: orsApiKey, setApiKey: setOrsApiKey } = useOrsApiKey();
  const orsQuota = useOrsQuota();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [dataMessage, setDataMessage] = useState<StatusMessage | null>(null);
  const [dbMessage, setDbMessage] = useState<StatusMessage | null>(null);
  const [resetMessage, setResetMessage] = useState<StatusMessage | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [createDbModalOpen, setCreateDbModalOpen] = useState(false);
  const [databases, setDatabases] = useState<DatabaseEntry[]>([]);
  const [currentDbFilename, setCurrentDbFilename] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    setDatabases(listDatabases());
    setCurrentDbFilename(getCurrentDatabaseFilename());
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      setAppVersion("Mode dev");
    } else {
      getVersion().then(setAppVersion);
    }
  }, []);

  async function handleExport() {
    setBusy("export");
    setDataMessage(null);
    try {
      const done = await exportToFile();
      if (done) setDataMessage({ type: "success", text: "Export réalisé avec succès." });
    } catch (err) {
      setDataMessage({ type: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setBusy("import");
    setDataMessage(null);
    try {
      const summary = await importFromFile();
      if (summary) {
        const warning = summary.newerFormatDetected
          ? " Ce fichier vient d'une version plus récente de l'application : certaines données ont pu être ignorées."
          : "";
        setDataMessage({
          type: summary.newerFormatDetected ? "warning" : "success",
          text: `Import terminé : ${summary.bikesAdded} vélo(s) ajouté(s), ${summary.ridesAdded} sortie(s) ajoutée(s), ${summary.ridesSkipped} ignorée(s) (déjà présentes).${warning}`,
        });
        await invalidateEverything();
      }
    } catch (err) {
      setDataMessage({ type: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  function handleSwitchDatabase(filename: string) {
    if (filename === currentDbFilename) return;
    switchDatabase(filename);
    setCurrentDbFilename(filename);
    setDbMessage(null);
    invalidateEverything();
  }

  async function handleOpenDataFolder() {
    setDbMessage(null);
    try {
      const target = currentDbFilename ? await join(await appDataDir(), currentDbFilename) : await appDataDir();
      await revealItemInDir(target);
    } catch (err) {
      setDbMessage({ type: "error", text: errorMessage(err) });
    }
  }

  async function handleScan() {
    setScanning(true);
    setDbMessage(null);
    try {
      const { added, invalid, removed, switchedTo, currentCleared } = await scanForDatabases();
      setDatabases(listDatabases());

      const parts: string[] = [];
      parts.push(
        added.length > 0
          ? `${added.length} base(s) trouvée(s) et ajoutée(s) : ${added.map((d) => d.name).join(", ")}.`
          : "Aucune nouvelle base trouvée."
      );
      if (removed.length > 0) {
        parts.push(
          `${removed.length} base(s) retirée(s) (fichier introuvable) : ${removed.map((d) => d.name).join(", ")}.`
        );
      }
      if (invalid.length > 0) {
        parts.push(`${invalid.length} fichier(s) ignoré(s) (schéma non reconnu) : ${invalid.join(", ")}.`);
      }
      if (switchedTo) {
        parts.push(`La base active a disparu : bascule automatique sur « ${switchedTo.name} ».`);
        setCurrentDbFilename(switchedTo.filename);
        await invalidateEverything();
      } else if (currentCleared) {
        parts.push(
          "La base active a disparu et aucune autre base n'est disponible : redémarrez l'application pour en créer une nouvelle."
        );
        setCurrentDbFilename(null);
      }

      const hasWarning = removed.length > 0 || invalid.length > 0 || switchedTo || currentCleared;
      setDbMessage({ type: hasWarning ? "warning" : "success", text: parts.join(" ") });
    } catch (err) {
      setDbMessage({ type: "error", text: errorMessage(err) });
    } finally {
      setScanning(false);
    }
  }

  return (
    <div>
      <div className="section-title">Apparence</div>
      <div className="card options-card">
        <div className="options-row">
          <div>
            <div className="options-row__label">Thème</div>
            <div className="options-row__hint">Choisissez l'apparence de l'application.</div>
          </div>
          <div className="segmented">
            {(Object.keys(THEME_LABELS) as ThemeMode[]).map((m) => (
              <button
                key={m}
                className={`segmented__option ${mode === m ? "active" : ""}`}
                onClick={() => setMode(m)}
              >
                {THEME_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="options-row">
          <div>
            <div className="options-row__label">Couleur du calendrier d'activité</div>
            <div className="options-row__hint">
              Personnalisez la couleur des cases du calendrier d'activité (Tableau de
              bord). Par défaut, il suit la couleur d'accent du thème.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="color"
              value={heatmapColorValue}
              onChange={(e) => setHeatmapColor(e.target.value)}
              className="color-input"
              aria-label="Couleur du calendrier d'activité"
            />
            {heatmapColor && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setHeatmapColor(null)}
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="section-title">OpenRouteService</div>
      <div className="card options-card">
        <div className="options-row">
          <div>
            <div className="options-row__label">Clé API</div>
            <div className="options-row__hint">
              Nécessaire pour tracer un itinéraire sur la carte d'un parcours (calcul
              collé au réseau routier/cyclable réel). Créez une clé gratuite sur{" "}
              openrouteservice.org/dev/#/signup, puis collez-la ici.
            </div>
          </div>
          <input
            type="password"
            className="select-input"
            style={{ minWidth: 260 }}
            placeholder="Clé API OpenRouteService"
            value={orsApiKey ?? ""}
            onChange={(e) => setOrsApiKey(e.target.value)}
            aria-label="Clé API OpenRouteService"
          />
        </div>
        <div className="options-row">
          <div>
            <div className="options-row__label">Quota</div>
            <div className="options-row__hint">
              Basé sur les en-têtes renvoyés par le dernier appel à l'API (calcul
              d'itinéraire ou détection de commune) — non garanti par tous les
              endpoints, et pouvant être décalé par rapport au tableau de bord
              OpenRouteService.
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {formatOrsQuota(orsQuota).map((line, i) => (
              <div key={i} className={i === 0 ? undefined : "options-row__hint"}>
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-title">Base de données</div>
      <div className="card options-card">
        <div className="options-row">
          <div>
            <div className="options-row__label">Base active</div>
            <div className="options-row__hint">
              Basculez vers une autre base de données créée précédemment.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              className="select-input"
              value={currentDbFilename ?? ""}
              onChange={(e) => handleSwitchDatabase(e.target.value)}
            >
              {databases.map((d) => (
                <option key={d.filename} value={d.filename}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-icon"
              onClick={handleScan}
              disabled={scanning}
              title="Actualiser la liste (scanne le dossier de données)"
              aria-label="Actualiser la liste des bases de données"
            >
              <RefreshIcon spinning={scanning} />
            </button>
          </div>
        </div>
        <div className="options-row">
          <div>
            <div className="options-row__label">Nouvelle base</div>
            <div className="options-row__hint">
              Crée une base de données vide, séparée de celle-ci, et bascule dessus.
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => setCreateDbModalOpen(true)}>
            Créer…
          </button>
        </div>
        <div className="options-row">
          <div>
            <div className="options-row__label">Dossier des bases de données</div>
            <div className="options-row__hint">
              Ouvre le dossier contenant les fichiers .db, avec la base active sélectionnée.
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleOpenDataFolder}>
            Ouvrir le dossier
          </button>
        </div>

        <StatusText message={dbMessage} />
      </div>

      <div className="section-title">Données</div>
      <div className="card options-card">
        <div className="options-row">
          <div>
            <div className="options-row__label">Exporter</div>
            <div className="options-row__hint">
              Enregistre l'ensemble des vélos et des sorties dans un fichier JSON.
            </div>
          </div>
          <button className="btn btn-secondary" disabled={busy !== null} onClick={handleExport}>
            {busy === "export" ? "Export en cours…" : "Exporter (JSON)"}
          </button>
        </div>
        <div className="options-row">
          <div>
            <div className="options-row__label">Importer</div>
            <div className="options-row__hint">
              Ajoute les vélos et sorties d'un fichier JSON exporté précédemment. Les
              sorties déjà présentes sont ignorées, aucune donnée existante n'est
              supprimée ou modifiée.
            </div>
          </div>
          <button className="btn btn-secondary" disabled={busy !== null} onClick={handleImport}>
            {busy === "import" ? "Import en cours…" : "Importer (JSON)"}
          </button>
        </div>

        <StatusText message={dataMessage} />
      </div>

      <div className="section-title section-title--danger">Zone dangereuse</div>
      <div className="card options-card options-card--danger">
        <div className="options-row">
          <div>
            <div className="options-row__label">Réinitialiser toutes les données</div>
            <div className="options-row__hint">
              Supprime définitivement tous les vélos et toutes les sorties de la base
              active, pour repartir de zéro. Une sauvegarde JSON vous sera demandée
              juste avant.
            </div>
          </div>
          <button className="btn btn-danger" onClick={() => setResetModalOpen(true)}>
            Réinitialiser…
          </button>
        </div>

        <StatusText message={resetMessage} />
      </div>

      <div className="section-title">À propos</div>
      <div className="card options-card">
        <div className="options-row">
          <div>
            <div className="options-row__label">Version</div>
          </div>
          <div>{appVersion ?? "…"}</div>
        </div>
      </div>

      {resetModalOpen && (
        <ResetDataModal
          onClose={() => setResetModalOpen(false)}
          onDone={() => {
            setResetModalOpen(false);
            setResetMessage({
              type: "success",
              text: "Toutes les données ont été supprimées après sauvegarde. L'application repart de zéro.",
            });
            invalidateEverything();
          }}
        />
      )}

      {createDbModalOpen && (
        <CreateDatabaseModal
          onClose={() => setCreateDbModalOpen(false)}
          onCreate={(name) => {
            const entry = createDatabase(name);
            setDatabases(listDatabases());
            setCurrentDbFilename(entry.filename);
            setCreateDbModalOpen(false);
            setDbMessage({ type: "success", text: `Base « ${entry.name} » créée et sélectionnée.` });
            invalidateEverything();
          }}
        />
      )}
    </div>
  );
}
