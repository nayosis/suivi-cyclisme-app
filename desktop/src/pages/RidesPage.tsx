import { useMemo, useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as db from "../db";
import type { Ride, RideInput } from "../types";
import { RideFormModal } from "../components/RideFormModal";
import { StatTile } from "../components/StatTile";
import { Switch } from "../components/Switch";
import { MonthPicker } from "../components/MonthPicker";
import type { BreakdownRowData } from "../components/BreakdownList";
import {
  addMonths,
  currentYearMonth,
  formatDate,
  formatDuration,
  formatNumber,
  formatSpeed,
} from "../format";
import { cyclingKey, invalidateCycling } from "../query-client";
import { rootRoute } from "../routes/root";

interface RidesSearch {
  month?: string;
  all?: boolean;
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rides",
  validateSearch: (search: Record<string, unknown>): RidesSearch => ({
    month: typeof search.month === "string" ? search.month : undefined,
    all: search.all === true || search.all === "true" ? true : undefined,
  }),
  component: RidesPage,
});

function RidesPage() {
  const { month, all } = Route.useSearch();
  const navigate = Route.useNavigate();
  const selectedMonth = month ?? currentYearMonth();
  const showAllRides = all ?? false;

  const ridesQuery = useQuery({ queryKey: [...cyclingKey, "rides"], queryFn: db.listRides });
  const bikesQuery = useQuery({ queryKey: [...cyclingKey, "bikes"], queryFn: db.listBikes });
  const rides = ridesQuery.data ?? [];
  const bikes = bikesQuery.data ?? [];

  const [editingRide, setEditingRide] = useState<Ride | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);

  function goToMonth(delta: number) {
    navigate({ search: (prev) => ({ ...prev, month: addMonths(selectedMonth, delta) }) });
  }

  const filteredRides = useMemo(() => {
    if (showAllRides) return rides; // déjà trié par date décroissante (listRides())
    const inMonth = rides.filter((r) => r.date.startsWith(selectedMonth));
    return [...inMonth].sort((a, b) => a.date.localeCompare(b.date));
  }, [rides, selectedMonth, showAllRides]);

  /** Rang de chaque sortie au sein de son mois (1, 2, 3…), tous mois confondus. */
  const rideNumberById = useMemo(() => {
    const byMonth = new Map<string, Ride[]>();
    for (const r of rides) {
      const ym = r.date.slice(0, 7);
      if (!byMonth.has(ym)) byMonth.set(ym, []);
      byMonth.get(ym)!.push(r);
    }
    const result = new Map<number, number>();
    for (const group of byMonth.values()) {
      const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      sorted.forEach((r, i) => result.set(r.id, i + 1));
    }
    return result;
  }, [rides]);

  const monthSummary = useMemo(() => {
    const distance = filteredRides.reduce((s, r) => s + r.distance_km, 0);
    const elevation = filteredRides.reduce((s, r) => s + r.elevation_m, 0);

    const byBikeMap = new Map<string, { color: string; distance: number; elevation: number; count: number }>();
    for (const r of filteredRides) {
      const entry = byBikeMap.get(r.bike_name) ?? {
        color: r.bike_color,
        distance: 0,
        elevation: 0,
        count: 0,
      };
      entry.distance += r.distance_km;
      entry.elevation += r.elevation_m;
      entry.count += 1;
      byBikeMap.set(r.bike_name, entry);
    }
    const byBike = Array.from(byBikeMap.entries()).map(([name, v]) => ({ name, ...v }));

    return { count: filteredRides.length, distance, elevation, byBike };
  }, [filteredRides]);

  function bikeBreakdown(
    pick: (b: { name: string; color: string; distance: number; elevation: number; count: number }) => string
  ): BreakdownRowData[] | undefined {
    if (monthSummary.byBike.length === 0) return undefined;
    return monthSummary.byBike.map((b) => ({ label: b.name, value: pick(b), color: b.color }));
  }

  async function handleAdd(input: RideInput) {
    await db.addRide(input);
    setModal(null);
    await invalidateCycling();
  }

  async function handleEdit(input: RideInput) {
    if (!editingRide) return;
    await db.updateRide(editingRide.id, input);
    setModal(null);
    setEditingRide(null);
    await invalidateCycling();
  }

  async function handleDelete() {
    if (!editingRide) return;
    await db.deleteRide(editingRide.id);
    setModal(null);
    setEditingRide(null);
    await invalidateCycling();
  }

  return (
    <div>
      <div className="rides-header">
        <div />
        <div className="month-picker">
          {!showAllRides && (
            <>
              <button
                className="btn-icon"
                onClick={() => goToMonth(-1)}
                title="Mois précédent"
                aria-label="Mois précédent"
              >
                ‹
              </button>
              <MonthPicker
                value={selectedMonth}
                onChange={(m) => navigate({ search: (prev) => ({ ...prev, month: m }) })}
              />
              <button
                className="btn-icon"
                onClick={() => goToMonth(1)}
                title="Mois suivant"
                aria-label="Mois suivant"
              >
                ›
              </button>
            </>
          )}
        </div>
        <div className="rides-header__right">
          <Switch
            checked={showAllRides}
            onChange={(v) => navigate({ search: (prev) => ({ ...prev, all: v || undefined }) })}
            label="Voir toutes les sorties"
          />
        </div>
      </div>

      <div className="stat-tiles stat-tiles--3">
        <StatTile
          label="Sorties"
          value={formatNumber(monthSummary.count)}
          breakdown={bikeBreakdown((b) => formatNumber(b.count))}
        />
        <StatTile
          label="Distance"
          value={`${formatNumber(monthSummary.distance)} km`}
          breakdown={bikeBreakdown((b) => `${formatNumber(b.distance)} km`)}
        />
        <StatTile
          label="Dénivelé+"
          value={`${formatNumber(monthSummary.elevation)} m`}
          breakdown={bikeBreakdown((b) => `${formatNumber(b.elevation)} m`)}
        />
      </div>

      <div className="toolbar">
        <button className="btn" onClick={() => setModal("add")}>
          Ajouter
        </button>
      </div>

      <div className="card table-container">
        {filteredRides.length === 0 ? (
          <div className="empty-state">Aucune sortie pour cette période.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>N°</th>
                <th>Nom</th>
                <th>Durée</th>
                <th>Distance</th>
                <th>Vit. moy.</th>
                <th>Dénivelé+</th>
                <th>Vélo</th>
                <th>Commentaire</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRides.map((r) => (
                <tr key={r.id}>
                  <td style={{ boxShadow: `inset 4px 0 0 0 ${r.bike_color}` }}>{formatDate(r.date)}</td>
                  <td>{rideNumberById.get(r.id)}</td>
                  <td>{r.name}</td>
                  <td>{formatDuration(r.duration_minutes)}</td>
                  <td>{formatNumber(r.distance_km, r.distance_km % 1 === 0 ? 0 : 1)} km</td>
                  <td>{formatSpeed(r.distance_km, r.duration_minutes)}</td>
                  <td>{formatNumber(r.elevation_m)} m</td>
                  <td>{r.bike_name}</td>
                  <td>{r.comment ?? ""}</td>
                  <td className="actions-cell">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEditingRide(r);
                        setModal("edit");
                      }}
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal === "add" && (
        <RideFormModal bikes={bikes} onSave={handleAdd} onClose={() => setModal(null)} />
      )}
      {modal === "edit" && editingRide && (
        <RideFormModal
          bikes={bikes}
          ride={editingRide}
          onSave={handleEdit}
          onDelete={handleDelete}
          onClose={() => {
            setModal(null);
            setEditingRide(null);
          }}
        />
      )}
    </div>
  );
}
