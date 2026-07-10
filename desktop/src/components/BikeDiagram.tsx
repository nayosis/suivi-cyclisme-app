import { MouseEvent, useRef } from "react";
import planCycleUrl from "../assets/planCycle.jpg";
import type { BikePartDef } from "../types";

interface BikeDiagramProps {
  defs: BikePartDef[];
  /** Style visuel de chaque marqueur (nom de variante → suffixe de classe `bike-diagram__marker--<variante>`). */
  markerVariant?: (def: BikePartDef) => string;
  onMarkerClick?: (def: BikePartDef) => void;
  /** En mode édition, un clic sur une zone vide du schéma déclenche `onImageClick(x%, y%)`. */
  editable?: boolean;
  onImageClick?: (x: number, y: number) => void;
  /** Point provisoire à afficher (ex. l'endroit tout juste cliqué pour un nouvel emplacement). */
  pendingPoint?: { x: number; y: number } | null;
}

/**
 * Schéma de vélo partagé, avec des marqueurs positionnés en pourcentage
 * (0-100) de sa largeur/hauteur — indépendant de la taille d'affichage.
 */
export function BikeDiagram({ defs, markerVariant, onMarkerClick, editable, onImageClick, pendingPoint }: BikeDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  function handleContainerClick(e: MouseEvent<HTMLDivElement>) {
    if (!editable || !onImageClick || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onImageClick(Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)));
  }

  return (
    <div
      ref={containerRef}
      className={`bike-diagram ${editable ? "bike-diagram--editable" : ""}`}
      onClick={handleContainerClick}
    >
      <img src={planCycleUrl} alt="Schéma du vélo" className="bike-diagram__image" draggable={false} />
      {defs.map((def) => (
        <button
          key={def.id}
          type="button"
          className={`bike-diagram__marker bike-diagram__marker--${markerVariant ? markerVariant(def) : "filled"}`}
          style={{ left: `${def.x}%`, top: `${def.y}%` }}
          title={def.name}
          onClick={(e) => {
            e.stopPropagation();
            onMarkerClick?.(def);
          }}
        >
          <span className="bike-diagram__marker-label">{def.name}</span>
        </button>
      ))}
      {pendingPoint && (
        <span
          className="bike-diagram__marker bike-diagram__marker--pending"
          style={{ left: `${pendingPoint.x}%`, top: `${pendingPoint.y}%` }}
        />
      )}
    </div>
  );
}
