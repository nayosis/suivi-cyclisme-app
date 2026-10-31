import { FormEvent, useState } from "react";
import { errorMessage } from "../format";
import type { ParcoursFolder } from "../types";
import { Modal } from "./Modal";

interface ParcoursFolderModalProps {
  /** Dossier à renommer ; absent pour une création. */
  folder?: ParcoursFolder;
  onSave: (name: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

/** Création, renommage ou suppression d'un dossier de parcours. */
export function ParcoursFolderModal({ folder, onSave, onDelete, onClose }: ParcoursFolderModalProps) {
  const [name, setName] = useState(folder?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom du dossier est obligatoire.");
      return;
    }
    try {
      await onSave(name.trim());
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteClick() {
    if (!onDelete || !folder) return;
    if (!confirm(`Supprimer le dossier "${folder.name}" ? Ses parcours ne sont pas supprimés, ils redeviennent non classés.`)) return;
    try {
      await onDelete();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={folder ? "Renommer le dossier" : "Nouveau dossier"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="parcours-folder-name">Nom</label>
          <input
            id="parcours-folder-name"
            autoFocus
            placeholder="Ex. Sorties montagne 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <div>
            {onDelete && folder && (
              <button type="button" className="btn btn-danger" onClick={handleDeleteClick}>
                Supprimer
              </button>
            )}
          </div>
          <div className="modal-actions__right">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn">
              {folder ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
