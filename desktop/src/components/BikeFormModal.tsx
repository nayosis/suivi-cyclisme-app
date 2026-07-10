import { FormEvent, useState } from "react";
import { DEFAULT_BIKE_COLOR } from "../types";
import { errorMessage, todayIso } from "../format";
import { Modal } from "./Modal";

interface BikeFormModalProps {
  initialName?: string;
  initialColor?: string;
  initialPurchaseDate?: string | null;
  initialPurchaseKm?: number;
  onSave: (name: string, color: string, purchaseDate: string, purchaseKm: number) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

export function BikeFormModal({
  initialName,
  initialColor,
  initialPurchaseDate,
  initialPurchaseKm,
  onSave,
  onDelete,
  onClose,
}: BikeFormModalProps) {
  const [name, setName] = useState(initialName ?? "");
  const [color, setColor] = useState(initialColor ?? DEFAULT_BIKE_COLOR);
  const [purchaseDate, setPurchaseDate] = useState(initialPurchaseDate ?? todayIso());
  const [purchaseKm, setPurchaseKm] = useState(initialPurchaseKm != null ? String(initialPurchaseKm) : "0");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom du vélo est obligatoire.");
      return;
    }
    if (!purchaseDate) {
      setError("La date d'acquisition est obligatoire.");
      return;
    }
    try {
      await onSave(name.trim(), color, purchaseDate, purchaseKm.trim() ? parseFloat(purchaseKm.replace(",", ".")) : 0);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteClick() {
    if (!onDelete) return;
    if (!confirm(`Supprimer le vélo "${initialName}" ?`)) return;
    try {
      await onDelete();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={initialName ? "Modifier le vélo" : "Ajouter un vélo"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="bike-name">Nom du vélo</label>
            <input
              id="bike-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="bike-color">Couleur</label>
            <input
              id="bike-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="color-input"
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="bike-purchase-date">Date d'acquisition</label>
            <input
              id="bike-purchase-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="bike-purchase-km">Kilométrage à l'achat</label>
            <input
              id="bike-purchase-km"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={purchaseKm}
              onChange={(e) => setPurchaseKm(e.target.value)}
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
