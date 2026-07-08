import { BreakdownList, type BreakdownRowData } from "./BreakdownList";

interface StatTileProps {
  label: string;
  value: string;
  breakdown?: BreakdownRowData[];
}

export function StatTile({ label, value, breakdown }: StatTileProps) {
  return (
    <div className="card stat-tile">
      <div className="stat-tile__value">{value}</div>
      <div className="stat-tile__label">{label}</div>
      {breakdown && <BreakdownList rows={breakdown} />}
    </div>
  );
}
