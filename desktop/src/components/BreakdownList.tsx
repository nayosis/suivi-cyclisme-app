export interface BreakdownRowData {
  label: string;
  value: string;
  color: string;
}

export function BreakdownList({ rows }: { rows: BreakdownRowData[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="breakdown-list">
      {rows.map((row) => (
        <div className="breakdown-row" key={row.label}>
          <span className="breakdown-label">
            <span className="breakdown-dot" style={{ background: row.color }} />
            {row.label}
          </span>
          <span className="breakdown-value">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
