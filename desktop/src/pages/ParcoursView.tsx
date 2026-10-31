import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import { DIRECTIONS } from "../types";
import type { Parcours } from "../types";
import { errorMessage, formatNumber } from "../format";
import { ParcoursMap } from "../components/ParcoursMap";
import { parseGpx } from "../gpx";
import { parcoursSource, PARCOURS_SOURCE_LABEL } from "../parcours-source";

interface ParcoursViewProps {
  parcours: Parcours;
  onBack: () => void;
  onDelete: () => Promise<void>;
}

/** Fiche en lecture seule d'un parcours : identité, chiffres clés et carte du tracé, si disponible. */
export function ParcoursView({ parcours, onBack, onDelete }: ParcoursViewProps) {
  const [openError, setOpenError] = useState<string | null>(null);
  const direction = DIRECTIONS.find((d) => d.code === parcours.direction);
  const source = parcoursSource(parcours);
  const points = (() => {
    if (!parcours.gpx_data) return [];
    try {
      return parseGpx(parcours.gpx_data);
    } catch {
      return [];
    }
  })();

  async function handleDeleteClick() {
    if (!confirm(`Supprimer le parcours "${parcours.name}" ?`)) return;
    await onDelete();
  }

  async function handleOpenSite() {
    if (!parcours.site_url) return;
    setOpenError(null);
    try {
      await openUrl(parcours.site_url);
    } catch (err) {
      setOpenError(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-header">
        <button type="button" className="btn-back" onClick={onBack}>
          ← Retour
        </button>
        <h1 className="page-header__title">{parcours.name}</h1>
      </div>

      <div className="card maintenance-form-card maintenance-form-card--fluid">
        <div className="parcours-view-stats">
          <div className="parcours-view-stat">
            <div className="parcours-view-stat__label">Commune de départ</div>
            <div className="parcours-view-stat__value">{parcours.start_town}</div>
          </div>
          <div className="parcours-view-stat">
            <div className="parcours-view-stat__label">Distance</div>
            <div className="parcours-view-stat__value">
              {formatNumber(parcours.distance_km, parcours.distance_km % 1 === 0 ? 0 : 1)} km
            </div>
          </div>
          <div className="parcours-view-stat">
            <div className="parcours-view-stat__label">Dénivelé+</div>
            <div className="parcours-view-stat__value">{formatNumber(parcours.elevation_m)} m</div>
          </div>
          <div className="parcours-view-stat">
            <div className="parcours-view-stat__label">Direction</div>
            <div className="parcours-view-stat__value">
              {direction ? `${direction.arrow} ${direction.label}` : parcours.direction}
            </div>
          </div>
          <div className="parcours-view-stat">
            <div className="parcours-view-stat__label">Origine du tracé</div>
            <div className="parcours-view-stat__value">
              <span className={`parcours-source-badge parcours-source-badge--${source}`}>
                {PARCOURS_SOURCE_LABEL[source]}
              </span>
            </div>
          </div>
        </div>

        {parcours.site_url && (
          <p style={{ marginTop: 14 }}>
            <button type="button" className="link-button" onClick={handleOpenSite}>
              Voir le site du parcours ↗
            </button>
          </p>
        )}
        {openError && <div className="error-text">{openError}</div>}

        {points.length > 0 ? (
          <div className="field" style={{ marginTop: 18 }}>
            <label>Tracé</label>
            <ParcoursMap points={points} />
          </div>
        ) : (
          <div className="empty-state" style={{ marginTop: 18 }}>
            Pas de tracé dans l'application : le tracé est géré sur un site externe.
          </div>
        )}

        <div className="modal-actions">
          <div>
            <button type="button" className="btn btn-danger" onClick={handleDeleteClick}>
              Supprimer
            </button>
          </div>
          <div className="modal-actions__right">
            <Link
              to="/parcours/$parcoursId/edit"
              params={{ parcoursId: String(parcours.id) }}
              className="btn"
            >
              Modifier
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
