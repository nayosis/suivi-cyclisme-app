import { FormEvent, useState } from "react";
import { errorMessage } from "../format";
import type { PartInstance, PartTag } from "../types";
import { Modal } from "./Modal";

interface PartInstanceFormModalProps {
  /** Exemplaire à modifier ; absent pour une création. */
  instance?: PartInstance;
  allTags: PartTag[];
  /** Tags actuellement portés par l'exemplaire (ignoré à la création). */
  initialTagIds?: number[];
  onSave: (
    name: string,
    purchaseCost: number | null,
    purchaseDate: string | null,
    retiredDate: string | null,
    tagIds: number[]
  ) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
  /** Date d'achat préremplie à la création (ignorée à la modification). */
  defaultPurchaseDate?: string;
  /** Masque la date de mise au rebut (ex. création d'une pièce qu'on s'apprête à monter). */
  hideRetiredDate?: boolean;
  /** Libellé du bouton de validation (défaut : « Enregistrer »). */
  submitLabel?: string;
}

/** Création ou modification d'un exemplaire de pièce (nom, prix, dates d'achat/mise au rebut, tags). */
export function PartInstanceFormModal({
  instance,
  allTags,
  initialTagIds,
  onSave,
  onDelete,
  onClose,
  defaultPurchaseDate,
  hideRetiredDate,
  submitLabel = "Enregistrer",
}: PartInstanceFormModalProps) {
  const [name, setName] = useState(instance?.name ?? "");
  const [purchaseCost, setPurchaseCost] = useState(
    instance?.purchase_cost != null ? String(instance.purchase_cost) : ""
  );
  const [purchaseDate, setPurchaseDate] = useState(instance?.purchase_date ?? defaultPurchaseDate ?? "");
  const [retiredDate, setRetiredDate] = useState(instance?.retired_date ?? "");
  const [tagIds, setTagIds] = useState<Set<number>>(new Set(initialTagIds ?? []));
  const [error, setError] = useState<string | null>(null);

  function toggleTag(id: number) {
    setTagIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    try {
      await onSave(
        name.trim(),
        purchaseCost.trim() ? parseFloat(purchaseCost.replace(",", ".")) : null,
        purchaseDate || null,
        retiredDate || null,
        Array.from(tagIds)
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteClick() {
    if (!onDelete || !instance) return;
    if (!confirm(`Supprimer l'exemplaire "${instance.name}" ?`)) return;
    try {
      await onDelete();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={instance ? "Modifier la pièce" : "Nouvel exemplaire"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="part-instance-name">Nom</label>
          <input
            id="part-instance-name"
            autoFocus
            placeholder="Ex. Continental GP5000"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="part-instance-cost">Prix d'achat (€)</label>
          <input
            id="part-instance-cost"
            type="text"
            inputMode="decimal"
            placeholder="Optionnel"
            value={purchaseCost}
            onChange={(e) => setPurchaseCost(e.target.value)}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="part-instance-purchase-date">Date d'achat</label>
            <input
              id="part-instance-purchase-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          {!hideRetiredDate && (
            <div className="field">
              <label htmlFor="part-instance-retired-date">Date de mise au rebut</label>
              <input
                id="part-instance-retired-date"
                type="date"
                value={retiredDate}
                onChange={(e) => setRetiredDate(e.target.value)}
              />
            </div>
          )}
        </div>
        {allTags.length > 0 && (
          <div className="field">
            <label>Tags</label>
            <div className="tag-toggle-list">
              {allTags.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  className={`tag-chip tag-chip--toggle ${tagIds.has(tag.id) ? "active" : ""}`}
                  onClick={() => toggleTag(tag.id)}
                >
                  <span className="tag-chip__dot" style={{ background: tag.color }} />
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <div>
            {onDelete && instance && (
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
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
