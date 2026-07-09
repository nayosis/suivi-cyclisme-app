import { FormEvent, useState } from "react";
import { createDatabase } from "../database-registry";

interface WelcomeSetupProps {
  onDone: () => void;
}

/**
 * Écran affiché au tout premier lancement (aucune base de données connue) :
 * demande un nom pour créer la première base de données avant d'entrer dans
 * l'application.
 */
export function WelcomeSetup({ onDone }: WelcomeSetupProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      createDatabase(name);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }

  return (
    <div className="welcome-screen">
      <div className="card welcome-card">
        <div className="welcome-card__icon">🚴</div>
        <h1>Bienvenue sur Suivi Cyclisme</h1>
        <p>
          Donnez un nom à votre base de données pour commencer. Vous pourrez en
          créer d'autres, ou basculer entre elles, depuis les Options.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="db-name">Nom de la base de données</label>
            <input
              id="db-name"
              autoFocus
              placeholder="Ex. Mon suivi vélo"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button type="submit" className="btn welcome-card__submit">
            Commencer
          </button>
        </form>
      </div>
    </div>
  );
}
