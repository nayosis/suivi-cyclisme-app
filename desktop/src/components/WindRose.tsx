import { DIRECTIONS } from "../types";
import type { Direction } from "../types";

interface WindRoseProps {
  /** Direction d'où vient le vent, `null` si non choisie. */
  value: Direction | null;
  onChange: (value: Direction | null) => void;
}

/** Disposition 3×3 de la rose ; `null` = case centrale. */
const GRID: (Direction | null)[] = ["NO", "N", "NE", "O", null, "E", "SO", "S", "SE"];

/** Choix de la direction d'où vient le vent, sur une rose 3×3 (recliquer retire le choix). */
export function WindRose({ value, onChange }: WindRoseProps) {
  const labelOf = (code: Direction) => DIRECTIONS.find((d) => d.code === code)!.label;
  return (
    <div>
      <div className="wind-rose" role="group" aria-label="Direction d'où vient le vent">
        {GRID.map((code, i) =>
          code ? (
            <button
              key={code}
              type="button"
              aria-pressed={value === code}
              title={`Vent du ${labelOf(code)}`}
              onClick={() => onChange(value === code ? null : code)}
            >
              {code}
            </button>
          ) : (
            <span key={i} className="wind-rose__center" aria-hidden>
              ⌖
            </span>
          )
        )}
      </div>
      <div className="parcours-filter-hint">
        {value
          ? `Vent du ${labelOf(value)} : les parcours dont l'aller part vers le ${labelOf(value)} passent en premier.`
          : "Choisissez d'où vient le vent pour classer les parcours."}
      </div>
    </div>
  );
}
