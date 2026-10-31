import { useMemo, useState, type CSSProperties } from "react";
import type { DayValue } from "../db";
import { formatNumber } from "../format";
import { useHeatmapColor } from "../heatmap-color-context";
import { findHeatmapPalette, HEATMAP_CUSTOM } from "../heatmap-palettes";
import { useTheme } from "../theme-context";

interface CalendarHeatmapProps {
  year: number;
  data: DayValue[];
}

const WEEKDAY_LABELS = ["Lun", "", "Mer", "", "Ven", "", ""];
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

/** Bornes hautes (km) des paliers 1 à 3 de l'échelle de couleur — palier 0 = 0 km, palier 3 = au-delà de LEVEL_THRESHOLDS_KM[2]. */
const LEVEL_THRESHOLDS_KM = [75, 150];
const LEVEL_LEGEND = ["0 km", "1 à 75 km", "76 à 150 km", "Plus de 150 km"];

function levelFor(value: number): number {
  if (value <= 0) return 0;
  if (value <= LEVEL_THRESHOLDS_KM[0]) return 1;
  if (value <= LEVEL_THRESHOLDS_KM[1]) return 2;
  return 3;
}

export function CalendarHeatmap({ year, data }: CalendarHeatmapProps) {
  const [hovered, setHovered] = useState<{ x: number; y: number; cell: Cell } | null>(null);
  const { palette, color } = useHeatmapColor();
  const { resolvedDark } = useTheme();
  // Triptyque : une couleur par palier (variante selon le thème). Sinon, une seule couleur à trois intensités.
  const triptych = findHeatmapPalette(palette);
  const levelColors = triptych ? (resolvedDark ? triptych.dark : triptych.light) : null;
  const cardStyle: CSSProperties | undefined = levelColors
    ? ({ "--heat-1": levelColors[0], "--heat-2": levelColors[1], "--heat-3": levelColors[2] } as CSSProperties)
    : palette === HEATMAP_CUSTOM && color
      ? ({ "--heatmap-color": color } as CSSProperties)
      : undefined;

  const byDate = useMemo(() => {
    const map = new Map<string, DayValue>();
    for (const d of data) map.set(d.date, d);
    return map;
  }, [data]);

  const { weeks, cells, monthLabels } = useMemo(() => {
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

    const labels: { month: string; week: number }[] = [];
    let lastMonth = -1;
    for (const c of allCells) {
      if (c.inYear && c.date.getMonth() !== lastMonth) {
        labels.push({ month: MONTH_NAMES_SHORT[c.date.getMonth()], week: c.week });
        lastMonth = c.date.getMonth();
      }
    }

    return { weeks: totalWeeks, cells: allCells, monthLabels: labels };
  }, [year, byDate]);

  return (
    <div className={`card chart-card calendar-heatmap-card ${triptych ? "calendar-heatmap-card--triptych" : ""}`} style={cardStyle}>
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
        {LEVEL_LEGEND.map((label, lvl) => (
          <div key={lvl} className="calendar-heatmap__legend-item">
            <div className={`heat-cell heat-${lvl}`} title={label} />
            <span>{label}</span>
          </div>
        ))}
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
