import { useEffect, useState } from "react";
import { exportToFile, importFromFile } from "../data-transfer";
import { useTheme, type ThemeMode } from "../theme-context";
import { ResetDataModal } from "../components/ResetDataModal";
import { CreateDatabaseModal } from "../components/CreateDatabaseModal";
import {
  createDatabase,
  getCurrentDatabaseFilename,
  listDatabases,
  switchDatabase,
  type DatabaseEntry,
} from "../database-registry";

interface OptionsPageProps {
  onDataChanged: () => void;
}

const THEME_LABELS: Record<ThemeMode, string> = {
  system: "Système",
  light: "Clair",
  dark: "Sombre",
};

export function OptionsPage({ onDataChanged }: OptionsPageProps) {
  const { mode, setMode } = useTheme();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [createDbModalOpen, setCreateDbModalOpen] = useState(false);
  const [databases, setDatabases] = useState<DatabaseEntry[]>([]);
  const [currentDbFilename, setCurrentDbFilename] = useState<string | null>(null);

  useEffect(() => {
    setDatabases(listDatabases());
    setCurrentDbFilename(getCurrentDatabaseFilename());
  }, []);

  async function handleExport() {
    setBusy("export");
    setMessage(null);
    try {
      const done = await exportToFile();
      if (done) setMessage({ type: "success", text: "Export réalisé avec succès." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Erreur inconnue lors de l'export.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setBusy("import");
    setMessage(null);
    try {
      const summary = await importFromFile();
      if (summary) {
        const warning = summary.newerFormatDetected
          ? " Ce fichier vient d'une version plus récente de l'application : certaines données ont pu être ignorées."
          : "";
        setMessage({
          type: summary.newerFormatDetected ? "warning" : "success",
          text: `Import terminé : ${summary.bikesAdded} vélo(s) ajouté(s), ${summary.ridesAdded} sortie(s) ajoutée(s), ${summary.ridesSkipped} ignorée(s) (déjà présentes).${warning}`,
        });
        onDataChanged();
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Erreur inconnue lors de l'import.",
      });
    } finally {
      setBusy(null);
    }
  }

  function handleSwitchDatabase(filename: string) {
    if (filename === currentDbFilename) return;
    switchDatabase(filename);
    setCurrentDbFilename(filename);
    setMessage(null);
    onDataChanged();
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

        {message && <div className={`${message.type}-text`}>{message.text}</div>}
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
      </div>

      {resetModalOpen && (
        <ResetDataModal
          onClose={() => setResetModalOpen(false)}
          onDone={() => {
            setResetModalOpen(false);
            setMessage({
              type: "success",
              text: "Toutes les données ont été supprimées après sauvegarde. L'application repart de zéro.",
            });
            onDataChanged();
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
            setMessage({ type: "success", text: `Base « ${entry.name} » créée et sélectionnée.` });
            onDataChanged();
          }}
        />
      )}
    </div>
  );
}
