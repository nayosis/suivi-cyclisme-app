import { useEffect, useMemo, useState } from "react";
import * as db from "../db";
import type { Bike, Ride, RideInput } from "../types";
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

interface RidesPageProps {
  refreshKey: number;
  onDataChanged: () => void;
}

export function RidesPage({ refreshKey, onDataChanged }: RidesPageProps) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => currentYearMonth());
  const [showAllRides, setShowAllRides] = useState(false);
  const [editingRide, setEditingRide] = useState<Ride | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);

  async function refresh() {
    const [r, b] = await Promise.all([db.listRides(), db.listBikes()]);
    setRides(r);
    setBikes(b);
  }

  useEffect(() => {
    refresh();
  }, [refreshKey]);

  function goToMonth(delta: number) {
    setSelectedMonth((current) => addMonths(current, delta));
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
    await refresh();
    onDataChanged();
  }

  async function handleEdit(input: RideInput) {
    if (!editingRide) return;
    await db.updateRide(editingRide.id, input);
    setModal(null);
    setEditingRide(null);
    await refresh();
    onDataChanged();
  }

  async function handleDelete() {
    if (!editingRide) return;
    await db.deleteRide(editingRide.id);
    setModal(null);
    setEditingRide(null);
    await refresh();
    onDataChanged();
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
              <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
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
          <Switch checked={showAllRides} onChange={setShowAllRides} label="Voir toutes les sorties" />
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
