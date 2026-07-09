import { useState } from "react";
import * as db from "../db";
import { exportToFile } from "../data-transfer";
import { Modal } from "./Modal";

const CONFIRM_WORD = "SUPPRIMER";

interface ResetDataModalProps {
  onClose: () => void;
  onDone: () => void;
}

type Step = "idle" | "backing-up" | "deleting" | "error";

/**
 * Fenêtre de confirmation pour la réinitialisation complète des données.
 * Ne supprime jamais sans avoir d'abord fait enregistrer à l'utilisateur une
 * sauvegarde JSON (boîte de dialogue « Enregistrer sous ») ; si la
 * sauvegarde échoue ou est annulée, la suppression est annulée aussi.
 */
export function ResetDataModal({ onClose, onDone }: ResetDataModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText === CONFIRM_WORD && (step === "idle" || step === "error");
  const busy = step === "backing-up" || step === "deleting";

  async function handleConfirm() {
    setError(null);
    setStep("backing-up");

    let didExport: boolean;
    try {
      didExport = await exportToFile();
    } catch (err) {
      setStep("error");
      setError(
        `La sauvegarde a échoué : suppression annulée par sécurité. (${
          err instanceof Error ? err.message : "erreur inconnue"
        })`
      );
      return;
    }
    if (!didExport) {
      setStep("error");
      setError("Sauvegarde annulée : suppression annulée par sécurité.");
      return;
    }

    setStep("deleting");
    try {
      await db.deleteAllData();
    } catch (err) {
      setStep("error");
      setError(
        `La sauvegarde a bien été enregistrée mais la suppression a échoué : ${
          err instanceof Error ? err.message : "erreur inconnue"
        }`
      );
      return;
    }

    onDone();
  }

  return (
    <Modal title="Réinitialiser toutes les données" onClose={onClose}>
      <p className="reset-warning">
        Cette action supprime <strong>définitivement</strong> tous les vélos et toutes
        les sorties enregistrés dans l'application. Une boîte de dialogue vous
        demandera où enregistrer une sauvegarde JSON complète juste avant — mais la
        suppression elle-même est irréversible.
      </p>

      <div className="field">
        <label htmlFor="confirm-word">
          Tapez <strong>{CONFIRM_WORD}</strong> pour confirmer
        </label>
        <input
          id="confirm-word"
          autoFocus
          disabled={busy}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </div>

      {busy && (
        <p className="reset-warning">
          {step === "backing-up" ? "En attente de la sauvegarde…" : "Suppression en cours…"}
        </p>
      )}
      {error && <div className="error-text">{error}</div>}

      <div className="modal-actions">
        <div />
        <div className="modal-actions__right">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!canConfirm || busy}
            onClick={handleConfirm}
          >
            Supprimer définitivement
          </button>
        </div>
      </div>
    </Modal>
  );
}
