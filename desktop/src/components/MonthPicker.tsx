import { useEffect, useRef, useState } from "react";
import { formatMonthLabel } from "../format";

interface MonthPickerProps {
  /** Mois sélectionné, au format `AAAA-MM`. */
  value: string;
  onChange: (value: string) => void;
}

const MONTH_SHORT = [
  "Janv", "Fév", "Mars", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
];

/**
 * Bouton affichant le mois courant, ouvrant un petit calendrier (navigation
 * par année + grille des 12 mois) pour choisir rapidement n'importe quel
 * mois/année sans avoir à cliquer plusieurs fois sur "mois précédent".
 */
export function MonthPicker({ value, onChange }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseInt(value.slice(0, 4), 10));
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedYear, selectedMonthNum] = value.split("-").map(Number);

  useEffect(() => {
    if (open) setViewYear(selectedYear);
  }, [open, selectedYear]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="month-picker-popover" ref={containerRef}>
      <button type="button" className="month-input" onClick={() => setOpen((o) => !o)}>
        {formatMonthLabel(value)}
      </button>
      {open && (
        <div className="month-picker-popover__panel">
          <div className="month-picker-popover__year-nav">
            <button
              type="button"
              className="btn-icon"
              onClick={() => setViewYear((y) => y - 1)}
              aria-label="Année précédente"
            >
              ‹
            </button>
            <span>{viewYear}</span>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setViewYear((y) => y + 1)}
              aria-label="Année suivante"
            >
              ›
            </button>
          </div>
          <div className="month-picker-popover__grid">
            {MONTH_SHORT.map((label, i) => {
              const monthNum = i + 1;
              const isSelected = viewYear === selectedYear && monthNum === selectedMonthNum;
              return (
                <button
                  type="button"
                  key={label}
                  className={`month-picker-popover__month ${isSelected ? "active" : ""}`}
                  onClick={() => {
                    onChange(`${viewYear}-${String(monthNum).padStart(2, "0")}`);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
