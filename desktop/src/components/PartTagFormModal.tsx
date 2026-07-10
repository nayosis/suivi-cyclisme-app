import { FormEvent, useState } from "react";
import { DEFAULT_BIKE_COLOR } from "../types";
import { errorMessage } from "../format";
import { Modal } from "./Modal";

interface PartTagFormModalProps {
  initialName?: string;
  initialColor?: string;
  onSave: (name: string, color: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

/** Création ou modification d'un tag de pièce (libellé + couleur). */
export function PartTagFormModal({ initialName, initialColor, onSave, onDelete, onClose }: PartTagFormModalProps) {
  const [name, setName] = useState(initialName ?? "");
  const [color, setColor] = useState(initialColor ?? DEFAULT_BIKE_COLOR);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom du tag est obligatoire.");
      return;
    }
    try {
      await onSave(name.trim(), color);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteClick() {
    if (!onDelete) return;
    if (!confirm(`Supprimer le tag "${initialName}" ?`)) return;
    try {
      await onDelete();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={initialName ? "Modifier le tag" : "Nouveau tag"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="tag-name">Libellé</label>
            <input
              id="tag-name"
              autoFocus
              placeholder="Ex. Route, Occasion, Shimano"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="tag-color">Couleur</label>
            <input
              id="tag-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="color-input"
            />
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <div>
            {onDelete && (
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
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
