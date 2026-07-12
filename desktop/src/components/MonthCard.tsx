import { formatNumber } from "../format";
import { BreakdownList, type BreakdownRowData } from "./BreakdownList";

interface MonthCardProps {
  label: string;
  distanceKm: number;
  elevationM: number;
  rideCount: number;
  durationMinutes: number;
  breakdown?: BreakdownRowData[];
}

export function MonthCard({ label, distanceKm, elevationM, rideCount, durationMinutes, breakdown }: MonthCardProps) {
  return (
    <div className="card month-card">
      <div className="month-card__label">{label}</div>
      <div className="month-card__stats">
        <div className="month-card__stat">
          <div className="month-card__value">{formatNumber(distanceKm)} km</div>
          <div className="month-card__key">Distance</div>
        </div>
        <div className="month-card__stat">
          <div className="month-card__value">{formatNumber(elevationM)} m</div>
          <div className="month-card__key">Dénivelé+</div>
        </div>
        <div className="month-card__stat">
          <div className="month-card__value">{formatNumber(rideCount)}</div>
          <div className="month-card__key">Sorties</div>
        </div>
        <div className="month-card__stat">
          <div className="month-card__value">{formatNumber(durationMinutes / 60, 1)} h</div>
          <div className="month-card__key">Durée</div>
        </div>
      </div>
      {breakdown && <BreakdownList rows={breakdown} />}
    </div>
  );
}
