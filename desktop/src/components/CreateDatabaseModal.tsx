import { FormEvent, useState } from "react";
import { errorMessage } from "../format";
import { Modal } from "./Modal";

interface CreateDatabaseModalProps {
  onCreate: (name: string) => void;
  onClose: () => void;
}

export function CreateDatabaseModal({ onCreate, onClose }: CreateDatabaseModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom de la base de données est obligatoire.");
      return;
    }
    try {
      onCreate(name.trim());
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Nouvelle base de données" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="new-db-name">Nom</label>
          <input
            id="new-db-name"
            autoFocus
            placeholder="Ex. Vélo de route"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <div />
          <div className="modal-actions__right">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn">
              Créer et basculer
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
