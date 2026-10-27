import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Popup, useMap } from "react-leaflet";
import { Link } from "@tanstack/react-router";
import L, { type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import { parseGpx } from "../gpx";
import type { Parcours } from "../types";

interface ParcoursOverviewMapProps {
  parcoursList: Parcours[];
  /** Couleur de chaque tracé, stable indépendamment des filtres (voir `parcours-colors.ts`). */
  colorById: Map<number, string>;
}

function FitAll({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(L.latLngBounds(positions), { padding: [24, 24] });
    }
  }, [map, positions]);
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
export function ParcoursOverviewMap({ parcoursList, colorById }: ParcoursOverviewMapProps) {
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
        <Polyline key={r.id} positions={r.positions} pathOptions={{ color: r.color, weight: 3, opacity: 0.85 }}>
          <Popup>
            <strong>{r.name}</strong>
            <br />
            <Link to="/parcours/$parcoursId" params={{ parcoursId: String(r.id) }}>
              Voir la fiche
            </Link>
          </Popup>
        </Polyline>
      ))}
      <FitAll positions={allPositions} />
      <InvalidateOnResize />
    </MapContainer>
  );
}
