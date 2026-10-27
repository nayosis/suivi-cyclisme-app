import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L, { type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useOrsApiKey } from "../ors-context";
import { computeCyclingRoute, CYCLING_PROFILES, OrsError, type CyclingProfile } from "../ors";
import type { GpxPoint } from "../gpx";
import type { Waypoint } from "../types";
import { errorMessage } from "../format";

interface ParcoursRouteDrawerProps {
  /** Points de passage à reprendre tels quels (ex. on rouvre un tracé déjà dessiné pour le modifier). */
  initialWaypoints?: Waypoint[];
  /** Centre initial de la carte si `initialWaypoints` est vide (ex. premier point d'un tracé importé à remplacer). */
  initialCenter?: LatLngTuple;
  onRouteComputed: (points: GpxPoint[], waypoints: Waypoint[]) => void;
  onCancel: () => void;
}

const DEFAULT_CENTER: LatLngTuple = [46.6, 2.5]; // Centre approximatif de la France

/** Capture les clics sur une zone vide de la carte pour ajouter un point en fin de tracé. */
function ClickCapture({ onAdd }: { onAdd: (wp: Waypoint) => void }) {
  useMapEvents({
    click(e) {
      onAdd({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

/** Cadre la carte sur l'itinéraire calculé à chaque (re)calcul. */
function FitToRoute({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(L.latLngBounds(positions), { padding: [24, 24] });
    }
  }, [map, positions]);
  return null;
}

function numberedIcon(n: number) {
  return L.divIcon({
    className: "",
    html: `<span class="route-drawer-marker">${n}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/**
 * Trace un itinéraire en cliquant des points de passage sur la carte —
 * cliquer sur le trait entre deux points en insère un nouveau à cet endroit
 * — puis calcule le tracé réel (collé au réseau routier/cyclable) via l'API
 * Directions d'OpenRouteService. Les deux tracés restent visibles ensemble :
 * les points de passage (trait pointillé, éditables) et le dernier itinéraire
 * calculé (trait plein bleu), pour pouvoir comparer et ajuster. Le résultat
 * n'est transmis au parent (`onRouteComputed`) que sur validation explicite.
 * Toute modification des points après un calcul invalide ce dernier (il faut
 * recalculer) pour ne jamais valider un tracé qui ne correspond plus aux
 * points actuels.
 */
export function ParcoursRouteDrawer({
  initialWaypoints,
  initialCenter,
  onRouteComputed,
  onCancel,
}: ParcoursRouteDrawerProps) {
  const { apiKey } = useOrsApiKey();
  const [waypoints, setWaypoints] = useState<Waypoint[]>(initialWaypoints ?? []);
  const [profile, setProfile] = useState<CyclingProfile>("cycling-regular");
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computedPoints, setComputedPoints] = useState<GpxPoint[] | null>(null);

  function addWaypoint(wp: Waypoint) {
    setWaypoints((list) => [...list, wp]);
    setComputedPoints(null);
  }

  function insertWaypoint(index: number, wp: Waypoint) {
    setWaypoints((list) => [...list.slice(0, index), wp, ...list.slice(index)]);
    setComputedPoints(null);
  }

  function updateWaypoint(index: number, wp: Waypoint) {
    setWaypoints((list) => list.map((w, i) => (i === index ? wp : w)));
    setComputedPoints(null);
  }

  function undoLast() {
    setWaypoints((list) => list.slice(0, -1));
    setComputedPoints(null);
  }

  function clearAll() {
    setWaypoints([]);
    setComputedPoints(null);
    setError(null);
  }

  async function handleCompute() {
    if (!apiKey) {
      setError("Renseignez une clé API OpenRouteService dans les Options avant de calculer un itinéraire.");
      return;
    }
    setComputing(true);
    setError(null);
    try {
      const points = await computeCyclingRoute(apiKey, waypoints, profile);
      setComputedPoints(points);
    } catch (err) {
      setError(err instanceof OrsError ? err.message : errorMessage(err));
    } finally {
      setComputing(false);
    }
  }

  const computedPositions: LatLngTuple[] = computedPoints?.map((p) => [p.lat, p.lon]) ?? [];
  const startCenter: LatLngTuple =
    initialCenter ?? (waypoints[0] ? [waypoints[0].lat, waypoints[0].lon] : DEFAULT_CENTER);
  const startZoom = initialCenter || waypoints.length > 0 ? 13 : 6;

  return (
    <div>
      <div className="route-drawer-toolbar">
        <select
          className="select-input"
          value={profile}
          onChange={(e) => setProfile(e.target.value as CyclingProfile)}
        >
          {CYCLING_PROFILES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={undoLast} disabled={waypoints.length === 0}>
          Annuler le dernier point
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={clearAll} disabled={waypoints.length === 0}>
          Effacer
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={handleCompute}
          disabled={waypoints.length < 2 || computing}
        >
          {computing ? "Calcul en cours…" : computedPoints ? "Recalculer" : "Calculer l'itinéraire"}
        </button>
        {computedPoints && (
          <button type="button" className="btn btn-sm" onClick={() => onRouteComputed(computedPoints, waypoints)}>
            Utiliser ce tracé
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Annuler
        </button>
      </div>

      {waypoints.length === 0 && (
        <p className="route-drawer-hint">
          Cliquez sur la carte pour poser des points de passage, dans l'ordre du parcours. Cliquez sur le trait entre
          deux points pour en insérer un nouveau à cet endroit ; glissez un point pour le déplacer.
        </p>
      )}
      {error && <div className="error-text">{error}</div>}

      <MapContainer
        center={startCenter}
        zoom={startZoom}
        scrollWheelZoom
        className="parcours-map parcours-map--drawing"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ClickCapture onAdd={addWaypoint} />

        {computedPositions.length > 1 && (
          <>
            <Polyline positions={computedPositions} pathOptions={{ color: "#2563eb", weight: 4 }} />
            <FitToRoute positions={computedPositions} />
          </>
        )}

        {waypoints.slice(0, -1).map((wp, i) => (
          <Polyline
            key={i}
            positions={[
              [wp.lat, wp.lon],
              [waypoints[i + 1].lat, waypoints[i + 1].lon],
            ]}
            pathOptions={{ color: "#94a3b8", weight: 4, dashArray: "6 8" }}
            eventHandlers={{
              click: (e) => {
                // Empêche le clic de remonter jusqu'à la carte (qui ajouterait sinon un point en fin de tracé).
                L.DomEvent.stopPropagation(e);
                insertWaypoint(i + 1, { lat: e.latlng.lat, lon: e.latlng.lng });
              },
            }}
          />
        ))}

        {waypoints.map((wp, i) => (
          <Marker
            key={i}
            position={[wp.lat, wp.lon]}
            icon={numberedIcon(i + 1)}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = e.target.getLatLng();
                updateWaypoint(i, { lat, lon: lng });
              },
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
