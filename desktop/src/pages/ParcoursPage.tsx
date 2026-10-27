import { useMemo, useState } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as parcoursDb from "../parcours-db";
import { DIRECTIONS } from "../types";
import type { Direction } from "../types";
import { RangeSlider } from "../components/RangeSlider";
import { ParcoursOverviewMap } from "../components/ParcoursOverviewMap";
import { buildParcoursColorMap } from "../parcours-colors";
import { parcoursSource, PARCOURS_SOURCE_LABEL } from "../parcours-source";
import { useResizableHeight } from "../use-resizable-height";
import { errorMessage, formatNumber } from "../format";
import { parcoursKey } from "../query-client";
import { rootRoute } from "../routes/root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/parcours",
  component: ParcoursPage,
});

const DIRECTION_BY_CODE = new Map(DIRECTIONS.map((d) => [d.code, d]));

function ParcoursPage() {
  const parcoursQuery = useQuery({ queryKey: [...parcoursKey, "list"], queryFn: parcoursDb.listParcours });
  const parcoursList = parcoursQuery.data ?? [];

  const [openError, setOpenError] = useState<string | null>(null);
  const [selectedTowns, setSelectedTowns] = useState<Set<string>>(new Set());
  const [selectedDirections, setSelectedDirections] = useState<Set<Direction>>(new Set());
  const [distanceRange, setDistanceRange] = useState<[number, number] | null>(null);
  const [elevationRange, setElevationRange] = useState<[number, number] | null>(null);

  // Couleurs stables (par id), indépendantes des filtres, partagées entre la carte et le tableau.
  const colorById = useMemo(() => buildParcoursColorMap(parcoursList), [parcoursList]);

  // La carte de synthèse n'est affichée que s'il existe au moins un tracé ; les parcours sans tracé (lien seul) restent dans le tableau.
  const hasAnyTrack = parcoursList.some((p) => p.gpx_data);

  // Hauteur de la carte de synthèse, ajustable par l'utilisateur (poignée sous la carte) et mémorisée.
  const { height: mapHeight, onHandleMouseDown } = useResizableHeight(
    "suivi-cyclisme-parcours-map-height",
    320,
    180,
    720
  );

  const availableTowns = useMemo(() => {
    const towns = new Set(parcoursList.map((p) => p.start_town));
    return Array.from(towns).sort((a, b) => a.localeCompare(b));
  }, [parcoursList]);

  const distanceBounds = useMemo<[number, number]>(() => {
    if (parcoursList.length === 0) return [0, 0];
    const values = parcoursList.map((p) => p.distance_km);
    return [Math.floor(Math.min(...values)), Math.ceil(Math.max(...values))];
  }, [parcoursList]);

  const elevationBounds = useMemo<[number, number]>(() => {
    if (parcoursList.length === 0) return [0, 0];
    const values = parcoursList.map((p) => p.elevation_m);
    return [Math.floor(Math.min(...values)), Math.ceil(Math.max(...values))];
  }, [parcoursList]);

  const effectiveDistanceRange = distanceRange ?? distanceBounds;
  const effectiveElevationRange = elevationRange ?? elevationBounds;

  function toggleTown(town: string) {
    setSelectedTowns((prev) => {
      const next = new Set(prev);
      if (next.has(town)) next.delete(town);
      else next.add(town);
      return next;
    });
  }

  function toggleDirection(code: Direction) {
    setSelectedDirections((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function resetFilters() {
    setSelectedTowns(new Set());
    setSelectedDirections(new Set());
    setDistanceRange(null);
    setElevationRange(null);
  }

  const hasActiveFilters =
    selectedTowns.size > 0 || selectedDirections.size > 0 || distanceRange !== null || elevationRange !== null;

  const filteredList = parcoursList.filter((p) => {
    if (selectedTowns.size > 0 && !selectedTowns.has(p.start_town)) return false;
    if (selectedDirections.size > 0 && !selectedDirections.has(p.direction)) return false;
    if (p.distance_km < effectiveDistanceRange[0] || p.distance_km > effectiveDistanceRange[1]) return false;
    if (p.elevation_m < effectiveElevationRange[0] || p.elevation_m > effectiveElevationRange[1]) return false;
    return true;
  });

  async function handleOpenSite(url: string) {
    setOpenError(null);
    try {
      await openUrl(url);
    } catch (err) {
      setOpenError(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="toolbar">
        <Link to="/parcours/new" className="btn">
          Ajouter
        </Link>
      </div>

      {hasAnyTrack && (
        <>
          <div className="card parcours-overview-map-card" style={{ height: mapHeight }}>
            <ParcoursOverviewMap parcoursList={filteredList} colorById={colorById} />
          </div>
          <div
            className="parcours-resize-handle"
            onMouseDown={onHandleMouseDown}
            title="Glisser pour redimensionner la carte"
          />
        </>
      )}

      <div className={parcoursList.length > 0 ? "parcours-content-row" : undefined}>
        {parcoursList.length > 0 && (
          <div className="card options-card parcours-filters-panel">
            <div className="parcours-filter-group">
              <div className="parcours-filter-group__label">Commune de départ</div>
              {availableTowns.length === 0 ? (
                <div className="empty-state" style={{ padding: "8px 0" }}>Aucune commune enregistrée.</div>
              ) : (
                <div className="tag-toggle-list">
                  {availableTowns.map((town) => (
                    <button
                      key={town}
                      type="button"
                      className={`tag-chip tag-chip--toggle ${selectedTowns.has(town) ? "active" : ""}`}
                      onClick={() => toggleTown(town)}
                    >
                      {town}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="parcours-filter-group">
              <div className="parcours-filter-group__label">Direction</div>
              <div className="tag-toggle-list">
                {DIRECTIONS.map((d) => (
                  <button
                    key={d.code}
                    type="button"
                    className={`tag-chip tag-chip--toggle ${selectedDirections.has(d.code) ? "active" : ""}`}
                    onClick={() => toggleDirection(d.code)}
                  >
                    {d.arrow} {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="parcours-filter-group">
              <div className="parcours-filter-group__label">Distance (km)</div>
              <RangeSlider
                min={distanceBounds[0]}
                max={distanceBounds[1]}
                step={0.5}
                valueMin={effectiveDistanceRange[0]}
                valueMax={effectiveDistanceRange[1]}
                onChange={(vMin, vMax) => setDistanceRange([vMin, vMax])}
                formatValue={(v) => `${formatNumber(v, v % 1 === 0 ? 0 : 1)} km`}
              />
            </div>

            <div className="parcours-filter-group">
              <div className="parcours-filter-group__label">Dénivelé+ (m)</div>
              <RangeSlider
                min={elevationBounds[0]}
                max={elevationBounds[1]}
                step={10}
                valueMin={effectiveElevationRange[0]}
                valueMax={effectiveElevationRange[1]}
                onChange={(vMin, vMax) => setElevationRange([vMin, vMax])}
                formatValue={(v) => `${formatNumber(v)} m`}
              />
            </div>

            {hasActiveFilters && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters}>
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}

        <div className="parcours-list-panel">
          <div className="card table-container">
            {filteredList.length === 0 ? (
              <div className="empty-state">
                {parcoursList.length === 0
                  ? "Aucun parcours enregistré. Ajoutez-en un pour commencer."
                  : "Aucun parcours ne correspond aux filtres."}
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Libellé</th>
                    <th>Départ</th>
                    <th>Distance</th>
                    <th>Dénivelé+</th>
                    <th>Direction</th>
                    <th>Origine</th>
                    <th>Site</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((p) => {
                    const direction = DIRECTION_BY_CODE.get(p.direction);
                    const color = colorById.get(p.id);
                    const source = parcoursSource(p);
                    return (
                      <tr key={p.id}>
                        <td>
                          {color && <span className="bike-color-dot" style={{ background: color }} title="Couleur du tracé sur la carte" />}
                          {p.name}
                        </td>
                        <td>{p.start_town}</td>
                        <td>{formatNumber(p.distance_km, p.distance_km % 1 === 0 ? 0 : 1)} km</td>
                        <td>{formatNumber(p.elevation_m)} m</td>
                        <td>
                          {direction ? `${direction.arrow} ${direction.label}` : p.direction}
                        </td>
                        <td>
                          <span className={`parcours-source-badge parcours-source-badge--${source}`}>
                            {PARCOURS_SOURCE_LABEL[source]}
                          </span>
                        </td>
                        <td>
                          {p.site_url ? (
                            <button type="button" className="link-button" onClick={() => handleOpenSite(p.site_url!)}>
                              Voir ↗
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="actions-cell">
                          <Link
                            to="/parcours/$parcoursId"
                            params={{ parcoursId: String(p.id) }}
                            className="btn btn-secondary btn-sm"
                          >
                            Détails
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {openError && <div className="error-text">{openError}</div>}
    </div>
  );
}
