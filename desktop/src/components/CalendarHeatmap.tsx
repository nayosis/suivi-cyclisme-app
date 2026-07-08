import { useMemo, useState } from "react";
import type { DayValue } from "../db";
import { formatNumber } from "../format";

interface CalendarHeatmapProps {
  year: number;
  data: DayValue[];
}

const WEEKDAY_LABELS = ["", "Lun", "", "Mer", "", "Ven", ""];
const MONTH_NAMES_SHORT = [
  "Janv", "Fév", "Mars", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
];

const CELL = 12;
const GAP = 3;

interface Cell {
  date: Date;
  inYear: boolean;
  week: number;
  weekday: number; // 0 = lundi
  value: number;
  rideCount: number;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function CalendarHeatmap({ year, data }: CalendarHeatmapProps) {
  const [hovered, setHovered] = useState<{ x: number; y: number; cell: Cell } | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, DayValue>();
    for (const d of data) map.set(d.date, d);
    return map;
  }, [data]);

  const { weeks, cells, monthLabels, thresholds } = useMemo(() => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const startDow = (start.getDay() + 6) % 7; // 0 = lundi
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - startDow);
    const endDow = (end.getDay() + 6) % 7;
    const gridEnd = new Date(end);
    gridEnd.setDate(end.getDate() + (6 - endDow));

    const allCells: Cell[] = [];
    let week = 0;
    const cur = new Date(gridStart);
    while (cur <= gridEnd) {
      const weekday = (cur.getDay() + 6) % 7;
      const iso = isoDate(cur);
      const inYear = cur.getFullYear() === year;
      const dayValue = byDate.get(iso);
      allCells.push({
        date: new Date(cur),
        inYear,
        week,
        weekday,
        value: dayValue?.distance_km ?? 0,
        rideCount: dayValue?.ride_count ?? 0,
      });
      if (weekday === 6) week += 1;
      cur.setDate(cur.getDate() + 1);
    }

    const totalWeeks = week + (allCells[allCells.length - 1]?.weekday === 6 ? 0 : 1);

    const nonZero = allCells
      .filter((c) => c.inYear && c.value > 0)
      .map((c) => c.value)
      .sort((a, b) => a - b);
    const t1 = quantile(nonZero, 0.33);
    const t2 = quantile(nonZero, 0.66);
    const t3 = quantile(nonZero, 0.9);

    const labels: { month: string; week: number }[] = [];
    let lastMonth = -1;
    for (const c of allCells) {
      if (c.inYear && c.date.getMonth() !== lastMonth) {
        labels.push({ month: MONTH_NAMES_SHORT[c.date.getMonth()], week: c.week });
        lastMonth = c.date.getMonth();
      }
    }

    return { weeks: totalWeeks, cells: allCells, monthLabels: labels, thresholds: [t1, t2, t3] };
  }, [year, byDate]);

  function levelFor(value: number): number {
    if (value <= 0) return 0;
    if (value < thresholds[0]) return 1;
    if (value < thresholds[1]) return 2;
    if (value < thresholds[2]) return 3;
    return 4;
  }

  return (
    <div className="card chart-card calendar-heatmap-card">
      <div className="chart-card__title">Calendrier d'activité {year}</div>
      <div className="calendar-heatmap">
        <div className="calendar-heatmap__side">
          <div
            className="calendar-heatmap__months"
            style={{ gridTemplateColumns: `repeat(${weeks}, ${CELL}px)`, gap: GAP }}
          >
            {monthLabels.map((m, i) => (
              <span key={i} className="calendar-heatmap__month" style={{ gridColumnStart: m.week + 1 }}>
                {m.month}
              </span>
            ))}
          </div>
          <div className="calendar-heatmap__body">
            <div
              className="calendar-heatmap__weekdays"
              style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gap: GAP }}
            >
              {WEEKDAY_LABELS.map((label, i) => (
                <span key={i}>{label}</span>
              ))}
            </div>
            <div
              className="calendar-heatmap__grid"
              style={{
                gridTemplateColumns: `repeat(${weeks}, ${CELL}px)`,
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                gap: GAP,
              }}
            >
              {cells
                .filter((c) => c.inYear)
                .map((c) => (
                  <div
                    key={isoDate(c.date)}
                    className={`heat-cell heat-${levelFor(c.value)}`}
                    style={{ gridColumn: c.week + 1, gridRow: c.weekday + 1 }}
                    onMouseEnter={(e) => setHovered({ x: e.clientX, y: e.clientY, cell: c })}
                    onMouseMove={(e) => setHovered({ x: e.clientX, y: e.clientY, cell: c })}
                    onMouseLeave={() => setHovered(null)}
                  />
                ))}
            </div>
          </div>
        </div>
      </div>

      <div className="calendar-heatmap__legend">
        <span>Moins</span>
        {[0, 1, 2, 3, 4].map((lvl) => (
          <div key={lvl} className={`heat-cell heat-${lvl}`} />
        ))}
        <span>Plus</span>
      </div>

      {hovered && (
        <div
          className="calendar-heatmap__tooltip"
          style={{ left: hovered.x + 14, top: hovered.y + 14 }}
        >
          <div className="calendar-heatmap__tooltip-date">
            {hovered.cell.date.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
          <div>
            {hovered.cell.value > 0
              ? `${formatNumber(hovered.cell.value)} km · ${hovered.cell.rideCount} sortie${hovered.cell.rideCount > 1 ? "s" : ""}`
              : "Pas de sortie"}
          </div>
        </div>
      )}
    </div>
  );
}
