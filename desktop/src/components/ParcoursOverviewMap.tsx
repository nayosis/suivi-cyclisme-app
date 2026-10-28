import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import { Link } from "@tanstack/react-router";
import L, { type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import { parseGpx } from "../gpx";
import type { Parcours } from "../types";

interface ParcoursOverviewMapProps {
  parcoursList: Parcours[];
  /** Couleur de chaque tracé, stable indépendamment des filtres (voir `parcours-colors.ts`). */
  colorById: Map<number, string>;
  /** Parcours survolé dans la liste : son tracé est mis en avant, les autres sont atténués. */
  highlightedId?: number | null;
  /** Appelé avec les parcours dont une partie du tracé est dans la zone visible, à chaque déplacement/zoom. */
  onVisibleChange?: (visibleIds: Set<number>) => void;
  /** Demande de cadrage sur un parcours ; un nouvel objet (nonce différent) relance le cadrage. */
  focusRequest?: { id: number; nonce: number } | null;
}

/**
 * Cadre la carte sur l'ensemble des tracés. Ne se redéclenche que si l'ensemble
 * de tracés affiché change (`fitKey`), pas à chaque rendu : sinon un simple
 * survol dans la liste annulerait le zoom de l'utilisateur.
 */
function FitAll({ positions, fitKey }: { positions: LatLngTuple[]; fitKey: string }) {
  const map = useMap();
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  useEffect(() => {
    if (positionsRef.current.length > 0) {
      map.fitBounds(L.latLngBounds(positionsRef.current), { padding: [24, 24] });
    }
  }, [map, fitKey]);
  return null;
}

/** Cadre la carte sur le tracé demandé. */
function FocusRoute({ routes, request }: { routes: OverviewRoute[]; request: { id: number; nonce: number } }) {
  const map = useMap();
  useEffect(() => {
    const route = routes.find((r) => r.id === request.id);
    if (route) map.fitBounds(L.latLngBounds(route.positions), { padding: [32, 32] });
    // Seule une nouvelle demande doit recadrer, pas un changement de la liste de tracés.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, request]);
  return null;
}

interface OverviewRoute {
  id: number;
  positions: LatLngTuple[];
}

/** Signale les tracés ayant au moins un point dans la zone visible, au chargement et après chaque déplacement ou zoom. */
function VisibleReporter({
  routes,
  onChange,
}: {
  routes: OverviewRoute[];
  onChange: (visibleIds: Set<number>) => void;
}) {
  const map = useMap();
  const report = () => {
    const bounds = map.getBounds();
    const ids = new Set<number>();
    for (const r of routes) {
      if (r.positions.some(([lat, lon]) => bounds.contains([lat, lon]))) ids.add(r.id);
    }
    onChange(ids);
  };
  useMapEvents({ moveend: report });
  useEffect(report, [routes]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Le conteneur peut changer de hauteur (poignée de redimensionnement) sans déclencher de `resize` window : on le fait à la place. */
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/** Vue d'ensemble : le tracé de chaque parcours (ayant un GPX) superposé sur une même carte, cadrée sur l'ensemble. */
export function ParcoursOverviewMap({ parcoursList, colorById, highlightedId, onVisibleChange, focusRequest }: ParcoursOverviewMapProps) {
  const routes = useMemo(() => {
    return parcoursList
      .map((p) => {
        if (!p.gpx_data) return null;
        try {
          const points = parseGpx(p.gpx_data);
          if (points.length < 2) return null;
          return {
            id: p.id,
            name: p.name,
            color: colorById.get(p.id) ?? "#2563eb",
            positions: points.map((pt): LatLngTuple => [pt.lat, pt.lon]),
          };
        } catch {
          return null;
        }
      })
      .filter((r): r is { id: number; name: string; color: string; positions: LatLngTuple[] } => r != null);
  }, [parcoursList, colorById]);

  const allPositions = useMemo(() => routes.flatMap((r) => r.positions), [routes]);

  if (routes.length === 0) {
    return <div className="empty-state">Aucun tracé disponible pour les parcours affichés.</div>;
  }

  return (
    <MapContainer center={allPositions[0]} zoom={6} scrollWheelZoom className="parcours-overview-map">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {routes.map((r) => (
        <Polyline
          key={r.id}
          positions={r.positions}
          pathOptions={
            highlightedId == null
              ? { color: r.color, weight: 3, opacity: 0.85 }
              : r.id === highlightedId
                ? { color: r.color, weight: 5, opacity: 1 }
                : { color: r.color, weight: 2, opacity: 0.15 }
          }
        >
          <Popup>
            <strong>{r.name}</strong>
            <br />
            <Link to="/parcours/$parcoursId" params={{ parcoursId: String(r.id) }}>
              Voir la fiche
            </Link>
          </Popup>
        </Polyline>
      ))}
      <FitAll positions={allPositions} fitKey={routes.map((r) => r.id).join(",")} />
      <InvalidateOnResize />
      {focusRequest && <FocusRoute routes={routes} request={focusRequest} />}
      {onVisibleChange && <VisibleReporter routes={routes} onChange={onVisibleChange} />}
    </MapContainer>
  );
}
