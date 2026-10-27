import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L, { type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import { computeDistanceMarkers, type GpxPoint } from "../gpx";

interface ParcoursMapProps {
  points: GpxPoint[];
}

/** Cadre la carte sur l'ensemble du tracé dès que les points changent. */
function FitBounds({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(L.latLngBounds(positions), { padding: [24, 24] });
    }
  }, [map, positions]);
  return null;
}

/** Marqueur en pastille colorée, sans dépendre des images d'icône par défaut de Leaflet (cassées par les bundlers). */
function dotIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.35);"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

const startIcon = dotIcon("#22c55e");
const endIcon = dotIcon("#ef4444");

/** Badge "Xx km" positionné sur le tracé (voir `.parcours-distance-marker` dans theme.css). */
function distanceMarkerIcon(km: number) {
  return L.divIcon({
    className: "",
    html: `<span class="parcours-distance-marker">${km} km</span>`,
    iconSize: [0, 0],
  });
}

/** Tracé d'un parcours (importé depuis un GPX) affiché sur un fond de carte OpenStreetMap. */
export function ParcoursMap({ points }: ParcoursMapProps) {
  const positions = useMemo<LatLngTuple[]>(() => points.map((p) => [p.lat, p.lon]), [points]);
  const distanceMarkers = useMemo(() => computeDistanceMarkers(points), [points]);

  if (positions.length === 0) return null;

  return (
    <MapContainer center={positions[0]} zoom={13} scrollWheelZoom className="parcours-map">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Polyline positions={positions} pathOptions={{ color: "#2563eb", weight: 4 }} />
      {distanceMarkers.map((m) => (
        <Marker key={m.km} position={[m.lat, m.lon]} icon={distanceMarkerIcon(m.km)} />
      ))}
      <Marker position={positions[0]} icon={startIcon} />
      <Marker position={positions[positions.length - 1]} icon={endIcon} />
      <FitBounds positions={positions} />
    </MapContainer>
  );
}
