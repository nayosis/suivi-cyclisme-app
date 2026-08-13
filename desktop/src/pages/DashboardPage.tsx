import { useMemo } from "react";
import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as db from "../db";
import type { YearBikeRow } from "../db";
import { DEFAULT_BIKE_COLOR, type Totals } from "../types";
import { StatTile } from "../components/StatTile";
import { type BreakdownRowData } from "../components/BreakdownList";
import { StackedBarChart } from "../components/StackedBarChart";
import { MonthCard } from "../components/MonthCard";
import { CalendarHeatmap } from "../components/CalendarHeatmap";
import { MONTH_NAMES, formatNumber } from "../format";
import { cyclingKey } from "../query-client";
import { rootRoute } from "../routes/root";

interface DashboardSearch {
  year?: number;
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  validateSearch: (search: Record<string, unknown>): DashboardSearch => {
    const year = Number(search.year);
    return { year: Number.isFinite(year) && year > 0 ? year : undefined };
  },
  component: DashboardPage,
});

interface BikeTotal {
  label: string;
  color: string;
  distance_km: number;
  elevation_m: number;
  ride_count: number;
  duration_minutes: number;
}

type YearMetric = "distance_km" | "elevation_m" | "ride_count" | "duration_minutes";

function pivotByYear(rows: YearBikeRow[], bikeNames: string[], metric: YearMetric): Record<string, string | number>[] {
  const years = Array.from(new Set(rows.map((r) => r.year))).sort();
  return years.map((year) => {
    const rec: Record<string, string | number> = { label: year };
    for (const bike of bikeNames) {
      const match = rows.find((r) => r.year === year && r.bike_name === bike);
      rec[bike] = match ? match[metric] : 0;
    }
    return rec;
  });
}

/** Convertit en heures les valeurs (en minutes) d'un jeu de données déjà pivoté par année. */
function toHours(rows: Record<string, string | number>[], bikeNames: string[]): Record<string, string | number>[] {
  return rows.map((row) => {
    const rec: Record<string, string | number> = { label: row.label };
    for (const bike of bikeNames) rec[bike] = Number(row[bike]) / 60;
    return rec;
  });
}

function DashboardPage() {
  const { year } = Route.useSearch();
  const navigate = Route.useNavigate();
  const calendarYear = year ?? new Date().getFullYear();

  const totalsQuery = useQuery({ queryKey: [...cyclingKey, "totals"], queryFn: db.getTotals });
  const byBikeQuery = useQuery({ queryKey: [...cyclingKey, "byBike"], queryFn: db.getByBike });
  const byYearAndBikeQuery = useQuery({ queryKey: [...cyclingKey, "byYearAndBike"], queryFn: db.getByYearAndBike });
  const dailyQuery = useQuery({
    queryKey: [...cyclingKey, "dailyDistance", calendarYear],
    queryFn: () => db.getDailyDistanceForYear(calendarYear),
  });
  const monthGridQuery = useQuery({
    queryKey: [...cyclingKey, "monthGrid", calendarYear],
    queryFn: async () => {
      const months = Array.from({ length: 12 }, (_, i) => `${calendarYear}-${String(i + 1).padStart(2, "0")}`);
      const [monthTotalsArr, monthByBikeArr] = await Promise.all([
        Promise.all(months.map((ym) => db.getStatsForMonth(ym))),
        Promise.all(months.map((ym) => db.getStatsForMonthByBike(ym))),
      ]);
      return months.map((_ym, i) => ({
        label: MONTH_NAMES[i],
        totals: monthTotalsArr[i],
        breakdown: monthByBikeArr[i].map((b) => ({
          label: b.label,
          value: `${formatNumber(b.distance_km)} km · ${formatNumber(b.elevation_m)} m · ${formatNumber(b.ride_count)} · ${formatNumber(b.duration_minutes / 60, 1)} h`,
          color: b.color,
        })),
      }));
    },
  });

  const totals = totalsQuery.data;
  const byBike = byBikeQuery.data ?? [];
  const byYearAndBike = byYearAndBikeQuery.data ?? [];
  const monthStats = monthGridQuery.data ?? [];
  const dailyData = dailyQuery.data ?? [];

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(byYearAndBike.map((r) => parseInt(r.year, 10))));
    const currentYear = new Date().getFullYear();
    if (!years.includes(currentYear)) years.push(currentYear);
    return years.sort((a, b) => b - a);
  }, [byYearAndBike]);

  if (!totals) return null;

  const bikeNames = byBike.map((b) => b.label);
  const bikeColors = Object.fromEntries(byBike.map((b) => [b.label, b.color]));

  function breakdownFor(pick: (b: BikeTotal) => string): BreakdownRowData[] | undefined {
    if (byBike.length === 0) return undefined;
    return byBike.map((b) => ({ label: b.label, value: pick(b), color: b.color }));
  }

  const yearRows = byYearAndBike
    .filter((r) => r.year === String(calendarYear))
    .sort((a, b) => b.distance_km - a.distance_km);
  const yearTotals: Totals = yearRows.reduce(
    (acc, r) => ({
      distance_km: acc.distance_km + r.distance_km,
      elevation_m: acc.elevation_m + r.elevation_m,
      ride_count: acc.ride_count + r.ride_count,
      duration_minutes: acc.duration_minutes + r.duration_minutes,
    }),
    { distance_km: 0, elevation_m: 0, ride_count: 0, duration_minutes: 0 }
  );

  function yearBreakdownFor(pick: (r: YearBikeRow) => string): BreakdownRowData[] | undefined {
    if (yearRows.length === 0) return undefined;
    return yearRows.map((r) => ({ label: r.bike_name, value: pick(r), color: bikeColors[r.bike_name] ?? DEFAULT_BIKE_COLOR }));
  }

  return (
    <div>
      <div className="stat-tiles">
        <StatTile
          label="Distance totale"
          value={`${formatNumber(totals.distance_km)} km`}
          breakdown={breakdownFor((b) => `${formatNumber(b.distance_km)} km`)}
        />
        <StatTile
          label="Dénivelé total"
          value={`${formatNumber(totals.elevation_m)} m`}
          breakdown={breakdownFor((b) => `${formatNumber(b.elevation_m)} m`)}
        />
        <StatTile
          label="Nombre de sorties"
          value={formatNumber(totals.ride_count)}
          breakdown={breakdownFor((b) => formatNumber(b.ride_count))}
        />
        <StatTile
          label="Durée totale"
          value={`${formatNumber(totals.duration_minutes / 60, 1)} h`}
          breakdown={breakdownFor((b) => `${formatNumber(b.duration_minutes / 60, 1)} h`)}
        />
      </div>

      <div className="section-title">Par année</div>
      <div className="chart-row">
        <StackedBarChart
          title="Distance par année"
          unit="km"
          bikeNames={bikeNames}
          bikeColors={bikeColors}
          data={pivotByYear(byYearAndBike, bikeNames, "distance_km")}
        />
        <StackedBarChart
          title="Dénivelé par année"
          unit="m"
          bikeNames={bikeNames}
          bikeColors={bikeColors}
          data={pivotByYear(byYearAndBike, bikeNames, "elevation_m")}
        />
        <StackedBarChart
          title="Nombre de sorties par année"
          unit="sorties"
          bikeNames={bikeNames}
          bikeColors={bikeColors}
          data={pivotByYear(byYearAndBike, bikeNames, "ride_count")}
        />
        <StackedBarChart
          title="Temps par année"
          unit="h"
          bikeNames={bikeNames}
          bikeColors={bikeColors}
          data={toHours(pivotByYear(byYearAndBike, bikeNames, "duration_minutes"), bikeNames)}
        />
      </div>

      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        Informations de l'année {calendarYear}
        <select
          value={calendarYear}
          onChange={(e) => navigate({ search: { year: Number(e.target.value) } })}
          style={{
            padding: "4px 8px",
            fontSize: 12.5,
            fontWeight: 500,
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--surface)",
            color: "var(--primary-ink)",
          }}
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="section-title" style={{ marginTop: 0 }}>Récap de l'année</div>
      <div className="stat-tiles">
        <StatTile
          label="Distance totale"
          value={`${formatNumber(yearTotals.distance_km)} km`}
          breakdown={yearBreakdownFor((r) => `${formatNumber(r.distance_km)} km`)}
        />
        <StatTile
          label="Dénivelé total"
          value={`${formatNumber(yearTotals.elevation_m)} m`}
          breakdown={yearBreakdownFor((r) => `${formatNumber(r.elevation_m)} m`)}
        />
        <StatTile
          label="Nombre de sorties"
          value={formatNumber(yearTotals.ride_count)}
          breakdown={yearBreakdownFor((r) => formatNumber(r.ride_count))}
        />
        <StatTile
          label="Durée totale"
          value={`${formatNumber(yearTotals.duration_minutes / 60, 1)} h`}
          breakdown={yearBreakdownFor((r) => `${formatNumber(r.duration_minutes / 60, 1)} h`)}
        />
      </div>

      <div className="section-title">Détail par mois</div>
      <div className="month-cards-row">
        {monthStats.map((m) => (
          <MonthCard
            key={m.label}
            label={m.label}
            distanceKm={m.totals.distance_km}
            elevationM={m.totals.elevation_m}
            rideCount={m.totals.ride_count}
            durationMinutes={m.totals.duration_minutes}
            breakdown={m.breakdown}
          />
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <CalendarHeatmap year={calendarYear} data={dailyData} />
      </div>
    </div>
  );
}
