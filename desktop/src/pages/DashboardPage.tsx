import { useEffect, useMemo, useState } from "react";
import * as db from "../db";
import type { DayValue, YearBikeRow } from "../db";
import type { Totals } from "../types";
import { StatTile } from "../components/StatTile";
import { type BreakdownRowData } from "../components/BreakdownList";
import { StackedBarChart } from "../components/StackedBarChart";
import { MonthCard } from "../components/MonthCard";
import { CalendarHeatmap } from "../components/CalendarHeatmap";
import { addMonths, currentYearMonth, formatMonthLabel, formatNumber } from "../format";

interface BikeTotal {
  label: string;
  color: string;
  distance_km: number;
  elevation_m: number;
  ride_count: number;
  duration_minutes: number;
}

function pivotByYear(
  rows: YearBikeRow[],
  bikeNames: string[],
  metric: "distance_km" | "elevation_m"
): Record<string, string | number>[] {
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

export function DashboardPage({ refreshKey }: { refreshKey: number }) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [byBike, setByBike] = useState<BikeTotal[]>([]);
  const [byYearAndBike, setByYearAndBike] = useState<YearBikeRow[]>([]);
  const [monthStats, setMonthStats] = useState<
    { label: string; totals: Totals; breakdown: BreakdownRowData[] }[]
  >([]);
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  const [dailyData, setDailyData] = useState<DayValue[]>([]);

  useEffect(() => {
    (async () => {
      const currentYm = currentYearMonth();
      const lastFourYm = [0, -1, -2, -3].map((delta) => addMonths(currentYm, delta));
      const [t, bikes, yearBike, monthTotalsArr, monthByBikeArr] = await Promise.all([
        db.getTotals(),
        db.getByBike(),
        db.getByYearAndBike(),
        Promise.all(lastFourYm.map((ym) => db.getStatsForMonth(ym))),
        Promise.all(lastFourYm.map((ym) => db.getStatsForMonthByBike(ym))),
      ]);
      setTotals(t);
      setByBike(bikes);
      setByYearAndBike(yearBike);
      setMonthStats(
        lastFourYm.map((ym, i) => ({
          label: formatMonthLabel(ym),
          totals: monthTotalsArr[i],
          breakdown: monthByBikeArr[i].map((b) => ({
            label: b.label,
            value: `${formatNumber(b.distance_km)} km · ${formatNumber(b.elevation_m)} m · ${formatNumber(b.ride_count)}`,
            color: b.color,
          })),
        }))
      );
    })();
  }, [refreshKey]);

  useEffect(() => {
    db.getDailyDistanceForYear(calendarYear).then(setDailyData);
  }, [calendarYear, refreshKey]);

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
      </div>

      <div className="section-title">Derniers mois</div>
      <div className="month-cards-row">
        {monthStats.map((m) => (
          <MonthCard
            key={m.label}
            label={m.label}
            distanceKm={m.totals.distance_km}
            elevationM={m.totals.elevation_m}
            rideCount={m.totals.ride_count}
            breakdown={m.breakdown}
          />
        ))}
      </div>

      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        Calendrier d'activité
        <select
          value={calendarYear}
          onChange={(e) => setCalendarYear(Number(e.target.value))}
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
      <CalendarHeatmap year={calendarYear} data={dailyData} />
    </div>
  );
}
