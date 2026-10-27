import { ChangeEvent } from "react";

interface RangeSliderProps {
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
  formatValue?: (value: number) => string;
}

/**
 * Curseur à deux poignées (min/max) pour filtrer une plage numérique.
 * Implémenté avec deux `<input type="range">` superposés (technique
 * classique, sans dépendance) : chaque poignée reste indépendamment
 * déplaçable, une barre de remplissage visuelle relie les deux valeurs.
 */
export function RangeSlider({ min, max, step = 1, valueMin, valueMax, onChange, formatValue }: RangeSliderProps) {
  const format = formatValue ?? ((v: number) => String(v));
  const span = Math.max(max - min, step);
  const minPct = ((valueMin - min) / span) * 100;
  const maxPct = ((valueMax - min) / span) * 100;

  function handleMinChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(Math.min(Number(e.target.value), valueMax), valueMax);
  }

  function handleMaxChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(valueMin, Math.max(Number(e.target.value), valueMin));
  }

  return (
    <div className="range-slider">
      <div className="range-slider__track">
        <div className="range-slider__fill" style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }} />
      </div>
      <input
        type="range"
        className="range-slider__input"
        min={min}
        max={max}
        step={step}
        value={valueMin}
        onChange={handleMinChange}
        aria-label="Valeur minimale"
      />
      <input
        type="range"
        className="range-slider__input"
        min={min}
        max={max}
        step={step}
        value={valueMax}
        onChange={handleMaxChange}
        aria-label="Valeur maximale"
      />
      <div className="range-slider__values">
        <span>{format(valueMin)}</span>
        <span>{format(valueMax)}</span>
      </div>
    </div>
  );
}
