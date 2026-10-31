import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import { Link } from "@tanstack/react-router";
import L, { type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadTrackPositions } from "../parcours-tracks";
import { RefreshIcon } from "./RefreshIcon";
import type { ParcoursSummary } from "../types";

interface ParcoursOverviewMapProps {
  parcoursList: ParcoursSummary[];
  /** Couleur de chaque tracé, stable indépendamment des filtres (voir `parcours-colors.ts`). */
  colorById: Map<number, string>;
  /** Parcours survolé dans la liste : son tracé est mis en avant, les autres sont atténués. */
  highlightedId?: number | null;
  /** Parcours sélectionné dans la liste : tracé plus épais, sans atténuer les autres. */
  selectedId?: number | null;
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

/** Nombre de tracés lus en base puis analysés à chaque tranche, avant de rendre la main à l'interface. */
const BATCH_SIZE = 6;

/** Centre de la France, vue initiale tant qu'aucun tracé n'est chargé. */
const FRANCE_CENTER: LatLngTuple = [46.6, 2.5];

interface OverviewRouteFull extends OverviewRoute {
  name: string;
  color: string;
}

/**
 * Charge les tracés des parcours par petits lots (lecture en base + analyse),
 * en rendant la main à l'interface entre chaque : la page reste réactive et les
 * tracés apparaissent au fur et à mesure.
 */
function useOverviewRoutes(parcoursList: ParcoursSummary[], colorById: Map<number, string>) {
  const [state, setState] = useState<{ routes: OverviewRouteFull[]; done: number; total: number; loading: boolean }>({
    routes: [],
    done: 0,
    total: 0,
    loading: false,
  });

  useEffect(() => {
    const withTrack = parcoursList.filter((p) => p.has_track);
    let cancelled = false;
    setState({ routes: [], done: 0, total: withTrack.length, loading: withTrack.length > 0 });

    (async () => {
      const acc: OverviewRouteFull[] = [];
      try {
        for (let index = 0; index < withTrack.length && !cancelled; index += BATCH_SIZE) {
          const batch = withTrack.slice(index, index + BATCH_SIZE);
          const positionsById = await loadTrackPositions(batch.map((p) => p.id));
          if (cancelled) return;
          for (const p of batch) {
            const positions = positionsById.get(p.id);
            if (positions && positions.length >= 2) {
              acc.push({ id: p.id, name: p.name, color: colorById.get(p.id) ?? "#2563eb", positions });
            }
          }
          const done = Math.min(index + BATCH_SIZE, withTrack.length);
          setState({ routes: [...acc], done, total: withTrack.length, loading: done < withTrack.length });
          // Rend la main au navigateur (rendu, clics) avant le lot suivant.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } catch {
        // Lecture impossible : on garde les tracés déjà affichés et on arrête l'indicateur.
        if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parcoursList, colorById]);

  return state;
}

/** Vue d'ensemble : le tracé de chaque parcours (ayant un GPX) superposé sur une même carte, cadrée sur l'ensemble. */
export function ParcoursOverviewMap({ parcoursList, colorById, highlightedId, selectedId, onVisibleChange, focusRequest }: ParcoursOverviewMapProps) {
  const { routes, done, total, loading } = useOverviewRoutes(parcoursList, colorById);

  const allPositions = useMemo(() => routes.flatMap((r) => r.positions), [routes]);

  if (routes.length === 0 && !loading) {
    return <div className="empty-state">Aucun tracé disponible pour les parcours affichés.</div>;
  }

  return (
    <>
    <MapContainer center={allPositions[0] ?? FRANCE_CENTER} zoom={6} scrollWheelZoom preferCanvas className="parcours-overview-map">
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
              ? r.id === selectedId
                ? { color: r.color, weight: 5, opacity: 1 }
                : { color: r.color, weight: 3, opacity: 0.85 }
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
      {/* Cadrage et suivi de la zone visible seulement une fois tous les tracés chargés (sinon la carte « saute » à chaque tranche). */}
      {!loading && <FitAll positions={allPositions} fitKey={routes.map((r) => r.id).join(",")} />}
      <InvalidateOnResize />
      {focusRequest && <FocusRoute routes={routes} request={focusRequest} />}
      {!loading && onVisibleChange && <VisibleReporter routes={routes} onChange={onVisibleChange} />}
    </MapContainer>
    {loading && (
      <div className="parcours-map-loading" role="status">
        <RefreshIcon spinning />
        <span>
          Chargement des tracés… {done}/{total}
        </span>
        <div className="parcours-map-loading__bar">
          <i style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
        </div>
      </div>
    )}
    </>
  );
}
