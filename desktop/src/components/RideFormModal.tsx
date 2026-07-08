import { FormEvent, useState } from "react";
import type { Bike, Ride, RideInput } from "../types";
import { Modal } from "./Modal";

interface RideFormModalProps {
  bikes: Bike[];
  ride?: Ride;
  onSave: (input: RideInput) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RideFormModal({ bikes, ride, onSave, onDelete, onClose }: RideFormModalProps) {
  const [date, setDate] = useState(ride?.date ?? todayIso());
  const [name, setName] = useState(ride?.name ?? "");
  const [hours, setHours] = useState(ride ? Math.floor(ride.duration_minutes / 60) : 0);
  const [minutes, setMinutes] = useState(ride ? ride.duration_minutes % 60 : 0);
  const [distance, setDistance] = useState(ride?.distance_km.toString() ?? "");
  const [elevation, setElevation] = useState(ride?.elevation_m.toString() ?? "");
  const [bikeId, setBikeId] = useState<number>(ride?.bike_id ?? bikes[0]?.id ?? 0);
  const [comment, setComment] = useState(ride?.comment ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom de la sortie est obligatoire.");
      return;
    }
    if (hours === 0 && minutes === 0) {
      setError("La durée doit être supérieure à 0.");
      return;
    }
    if (!bikeId) {
      setError("Sélectionnez un vélo.");
      return;
    }
    const distanceVal = parseFloat(distance.replace(",", "."));
    if (isNaN(distanceVal) || distanceVal <= 0) {
      setError("La distance doit être un nombre positif.");
      return;
    }
    const elevationVal = elevation.trim() === "" ? 0 : parseInt(elevation, 10);
    try {
      await onSave({
        date,
        name: name.trim(),
        duration_minutes: hours * 60 + minutes,
        distance_km: distanceVal,
        elevation_m: isNaN(elevationVal) ? 0 : elevationVal,
        comment: comment.trim() || null,
        bike_id: bikeId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function handleDeleteClick() {
    if (!onDelete || !ride) return;
    if (!confirm(`Supprimer la sortie "${ride.name}" ?`)) return;
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  return (
    <Modal title={ride ? "Modifier la sortie" : "Ajouter une sortie"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ride-date">Date</label>
            <input id="ride-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ride-bike">Vélo</label>
            <select id="ride-bike" value={bikeId} onChange={(e) => setBikeId(Number(e.target.value))}>
              {bikes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="ride-name">Nom de la sortie</label>
          <input id="ride-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ride-hours">Durée (heures)</label>
            <input
              id="ride-hours"
              type="number"
              min={0}
              max={48}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="ride-minutes">Durée (minutes)</label>
            <input
              id="ride-minutes"
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ride-distance">Distance (km)</label>
            <input
              id="ride-distance"
              type="text"
              inputMode="decimal"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ride-elevation">Dénivelé positif (m)</label>
            <input
              id="ride-elevation"
              type="number"
              min={0}
              value={elevation}
              onChange={(e) => setElevation(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="ride-comment">Commentaire</label>
          <textarea
            id="ride-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
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
