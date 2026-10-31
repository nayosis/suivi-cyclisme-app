import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LatLngTuple } from "leaflet";
import { DIRECTIONS } from "../types";
import type { Direction, Parcours, ParcoursInput, Waypoint } from "../types";
import { errorMessage, formatNumber } from "../format";
import {
  bearingToDirection,
  buildGpxXml,
  computeGpxStats,
  computeOutboundDirection,
  extractOpenRunnerOrigin,
  parseGpx,
} from "../gpx";
import { pickGpxFile } from "../gpx-file";
import { GpxUploadField } from "../components/GpxUploadField";
import { ParcoursMap } from "../components/ParcoursMap";
import { ParcoursRouteDrawer } from "../components/ParcoursRouteDrawer";
import * as parcoursDb from "../parcours-db";
import { parcoursKey } from "../query-client";
import { reverseGeocodeTown } from "../ors";
import { useOrsApiKey } from "../ors-context";

interface ParcoursFormProps {
  /** Absent à la création, fourni à l'édition. */
  parcours?: Parcours;
  onSave: (input: ParcoursInput) => Promise<void>;
  onCancel: () => void;
}

/** Préfixe `https://` si l'utilisateur a saisi une URL sans protocole. */
function normalizeSiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Création ou édition d'un parcours. À la création, deux points d'entrée
 * exclusifs : importer un fichier GPX externe (le tracé reste figé, distance
 * et dénivelé sont calculés automatiquement — seule la direction reste
 * saisie à la main) ou tracer un itinéraire sur la carte (celui-ci devient
 * la référence du parcours et reste modifiable). Une fois un tracé établi
 * (import ou dessin), la distance et le dénivelé sont toujours calculés
 * depuis ses points, plus jamais saisis à la main. Les parcours plus anciens
 * sans aucun tracé restent éditables avec une distance/un dénivelé manuels.
 */
export function ParcoursForm({ parcours, onSave, onCancel }: ParcoursFormProps) {
  const isNew = !parcours;

  const [name, setName] = useState(parcours?.name ?? "");
  const [startTown, setStartTown] = useState(parcours?.start_town ?? "");
  const [direction, setDirection] = useState<Direction>(parcours?.direction ?? DIRECTIONS[0].code);
  // Tant que la direction n'a pas été choisie à la main, elle suit le tracé (jamais en édition d'un parcours existant).
  const [directionTouched, setDirectionTouched] = useState(!isNew);
  const [siteUrl, setSiteUrl] = useState(parcours?.site_url ?? "");
  const [folderId, setFolderId] = useState(parcours?.folder_id != null ? String(parcours.folder_id) : "");
  const foldersQuery = useQuery({ queryKey: [...parcoursKey, "folders"], queryFn: parcoursDb.listFolders });
  const [gpxData, setGpxData] = useState<string | null>(parcours?.gpx_data ?? null);
  const [waypoints, setWaypoints] = useState<Waypoint[] | null>(parcours?.waypoints ?? null);
  // Repli manuel, utilisé uniquement pour un parcours ancien édité sans aucun tracé.
  const [manualDistance, setManualDistance] = useState(
    parcours && !parcours.gpx_data ? parcours.distance_km.toString() : ""
  );
  const [manualElevation, setManualElevation] = useState(
    parcours && !parcours.gpx_data ? parcours.elevation_m.toString() : ""
  );
  const [drawMode, setDrawMode] = useState(false);
  // Création sans tracé : distance et dénivelé saisis à la main, seul un lien externe est gardé.
  const [manualMode, setManualMode] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detectingTown, setDetectingTown] = useState(false);

  const { apiKey: orsApiKey } = useOrsApiKey();

  const points = useMemo(() => {
    if (!gpxData) return [];
    try {
      return parseGpx(gpxData);
    } catch {
      return [];
    }
  }, [gpxData]);

  const computedStats = useMemo(() => (points.length > 0 ? computeGpxStats(points) : null), [points]);

  const outbound = useMemo(() => computeOutboundDirection(points), [points]);
  const outboundDirection = outbound ? DIRECTIONS.find((d) => d.code === bearingToDirection(outbound.bearing)) : null;

  // Importer ou dessiner un tracé propose automatiquement la direction de l'aller.
  useEffect(() => {
    if (outbound && !directionTouched) setDirection(bearingToDirection(outbound.bearing));
  }, [outbound, directionTouched]);

  /** Un import/retrait de fichier change le tracé : les points de passage d'un éventuel dessin ne correspondent plus à rien. */
  function handleGpxFileChange(next: string | null) {
    setGpxData(next);
    setWaypoints(null);
    // Un GPX OpenRunner préremplit le libellé et le lien de la fiche, sans écraser une saisie existante.
    const origin = next ? extractOpenRunnerOrigin(next) : null;
    if (origin) {
      if (!name.trim()) setName(origin.name);
      if (!siteUrl.trim()) setSiteUrl(origin.url);
    }
  }

  async function handlePickGpxForEntry() {
    setEntryError(null);
    try {
      const xml = await pickGpxFile();
      if (xml) handleGpxFileChange(xml);
    } catch (err) {
      setEntryError(errorMessage(err));
    }
  }

  async function handleReplaceGpx() {
    setError(null);
    try {
      const xml = await pickGpxFile();
      if (xml) handleGpxFileChange(xml);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  /** Suggère la commune de départ à partir du premier point du tracé (géocodage inversé). */
  async function handleDetectStartTown() {
    if (!orsApiKey || points.length === 0) return;
    setDetectingTown(true);
    setError(null);
    try {
      const town = await reverseGeocodeTown(orsApiKey, points[0].lat, points[0].lon);
      if (town) {
        setStartTown(town);
      } else {
        setError("Commune introuvable à cet emplacement.");
      }
    } finally {
      setDetectingTown(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le libellé du parcours est obligatoire.");
      return;
    }
    if (!startTown.trim()) {
      setError("La commune de départ est obligatoire.");
      return;
    }

    let distanceVal: number;
    let elevationVal: number;
    if (computedStats) {
      distanceVal = computedStats.distanceKm;
      elevationVal = computedStats.elevationGainM;
    } else {
      distanceVal = parseFloat(manualDistance.replace(",", "."));
      if (isNaN(distanceVal) || distanceVal <= 0) {
        setError("La distance doit être un nombre positif.");
        return;
      }
      const parsedElevation = manualElevation.trim() === "" ? 0 : parseInt(manualElevation, 10);
      elevationVal = isNaN(parsedElevation) ? 0 : parsedElevation;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        start_town: startTown.trim(),
        distance_km: distanceVal,
        elevation_m: elevationVal,
        direction,
        site_url: normalizeSiteUrl(siteUrl),
        folder_id: folderId ? Number(folderId) : null,
        gpx_data: gpxData,
        waypoints,
      });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  // Écran de choix initial : uniquement à la création, tant qu'aucun tracé n'a été établi.
  const showEntryChoice = isNew && !gpxData && !drawMode && !manualMode;

  return (
    <div>
      <div className="page-header">
        <button type="button" className="btn-back" onClick={onCancel}>
          ← Retour
        </button>
        <h1 className="page-header__title">{isNew ? "Ajouter un parcours" : `Modifier « ${parcours.name} »`}</h1>
      </div>

      {showEntryChoice ? (
        <div className="card maintenance-form-card maintenance-form-card--fluid">
          <div className="section-title" style={{ marginTop: 0 }}>Comment voulez-vous créer ce parcours ?</div>
          <div className="parcours-entry-choices">
            <button type="button" className="parcours-entry-choice" onClick={handlePickGpxForEntry}>
              <strong>Importer un fichier GPX</strong>
              <span>
                Un tracé déjà existant (Openrunner, Komoot, Strava...). Il reste figé tel quel ; distance et dénivelé
                sont calculés automatiquement.
              </span>
            </button>
            <button type="button" className="parcours-entry-choice" onClick={() => setManualMode(true)}>
              <strong>Sans tracé</strong>
              <span>
                Le tracé est géré ailleurs : vous renseignez seulement le lien, ainsi que la distance et le dénivelé à
                la main. Aucun tracé n'est affiché sur la carte.
              </span>
            </button>
            <button type="button" className="parcours-entry-choice"
              disabled
              title="Fonction désactivée pour le moment"
              onClick={() => setDrawMode(true)}
            >
              <strong>Tracer un itinéraire</strong>
              <span>(désactivé pour le moment)</span>
              <span>
                Dessinez le parcours point par point sur la carte. Le tracé devient la référence du parcours et
                pourra être modifié à tout moment.
              </span>
            </button>
          </div>
          {entryError && <div className="error-text">{entryError}</div>}
        </div>
      ) : drawMode ? (
        <div className="card maintenance-form-card maintenance-form-card--fluid">
          <ParcoursRouteDrawer
            initialWaypoints={waypoints ?? undefined}
            initialCenter={points[0] ? ([points[0].lat, points[0].lon] as LatLngTuple) : undefined}
            onRouteComputed={(computed, wps) => {
              setGpxData(buildGpxXml(computed));
              setWaypoints(wps);
              setDrawMode(false);
            }}
            onCancel={() => setDrawMode(false)}
          />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card maintenance-form-card maintenance-form-card--fluid">
          <div className="field">
            <label htmlFor="parcours-form-name">Libellé</label>
            <input
              id="parcours-form-name"
              autoFocus
              placeholder="Ex. Vernantes Longué Saumur"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="parcours-form-start-town">Commune de départ</label>
              <input
                id="parcours-form-start-town"
                placeholder="Ex. Vernantes"
                value={startTown}
                onChange={(e) => setStartTown(e.target.value)}
              />
              {points.length > 0 && orsApiKey && (
                <button
                  type="button"
                  className="link-button"
                  onClick={handleDetectStartTown}
                  disabled={detectingTown}
                >
                  {detectingTown ? "Détection…" : "Détecter depuis le tracé"}
                </button>
              )}
            </div>
            <div className="field">
              <label htmlFor="parcours-form-direction">Direction</label>
              <select
                id="parcours-form-direction"
                value={direction}
                onChange={(e) => {
                  setDirectionTouched(true);
                  setDirection(e.target.value as Direction);
                }}
              >
                {DIRECTIONS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.arrow} {d.label}
                  </option>
                ))}
              </select>
              <div className="field-hint">Vers où l'on roule sur la première moitié du tracé (l'aller).</div>
              {outbound && outboundDirection && (
                <div className="field-hint">
                  Détecté : cap {Math.round(outbound.bearing)}° ({outboundDirection.arrow} {outboundDirection.label})
                  {outbound.straightness < 0.5 && " — tracé sinueux, direction à vérifier"}
                  {direction !== outboundDirection.code && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          setDirection(outboundDirection.code);
                          setDirectionTouched(false);
                        }}
                      >
                        Appliquer
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {!gpxData && (
            <div className="field-row">
              <div className="field">
                <label htmlFor="parcours-form-distance">Distance (km)</label>
                <input
                  id="parcours-form-distance"
                  type="text"
                  inputMode="decimal"
                  value={manualDistance}
                  onChange={(e) => setManualDistance(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="parcours-form-elevation">Dénivelé positif (m)</label>
                <input
                  id="parcours-form-elevation"
                  type="number"
                  min={0}
                  value={manualElevation}
                  onChange={(e) => setManualElevation(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="parcours-form-folder">Dossier</label>
            <select id="parcours-form-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">Non classé</option>
              {(foldersQuery.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="parcours-form-site-url">Lien vers un site (optionnel)</label>
            <input
              id="parcours-form-site-url"
              type="text"
              placeholder="https://www.openrunner.com/..."
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
            />
          </div>

          {gpxData && computedStats && (
            <div className="field">
              <label>Tracé {waypoints ? "(dessiné)" : "(fichier importé, figé)"}</label>
              <p className="parcours-track-stats">
                Distance : {formatNumber(computedStats.distanceKm, computedStats.distanceKm % 1 === 0 ? 0 : 1)} km ·
                Dénivelé+ : {formatNumber(computedStats.elevationGainM)} m
              </p>
              <ParcoursMap points={points} />
              <div className="parcours-track-actions">
                {waypoints && (
                  <button type="button" className="link-button" onClick={() => setDrawMode(true)}>
                    Modifier le tracé sur la carte
                  </button>
                )}
                <button type="button" className="link-button" onClick={handleReplaceGpx}>
                  Remplacer par un fichier GPX…
                </button>
              </div>
            </div>
          )}

          {!isNew && !gpxData && (
            <>
              <GpxUploadField gpxData={gpxData} onChange={handleGpxFileChange} />
              <p style={{ margin: "8px 0 0" }}>
                <button type="button" className="link-button" onClick={() => setDrawMode(true)}>
                  — ou tracer un itinéraire sur la carte —
                </button>
              </p>
            </>
          )}

          {isNew && !gpxData && (
            <p style={{ margin: "8px 0 0" }}>
              <button type="button" className="link-button" onClick={() => setManualMode(false)}>
                ← Choisir un autre mode de création
              </button>
            </p>
          )}

          {error && <div className="error-text">{error}</div>}

          <div className="modal-actions">
            <div />
            <div className="modal-actions__right">
              <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
                Annuler
              </button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
