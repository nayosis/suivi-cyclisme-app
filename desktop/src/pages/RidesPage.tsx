import { useEffect, useMemo, useState } from "react";
import * as db from "../db";
import type { Bike, Ride, RideInput } from "../types";
import { RideFormModal } from "../components/RideFormModal";
import { StatTile } from "../components/StatTile";
import {
  currentYearMonth,
  formatDate,
  formatDuration,
  formatMonthLabel,
  formatNumber,
} from "../format";

interface RidesPageProps {
  refreshKey: number;
  onDataChanged: () => void;
}

const ALL_MONTHS = "__all__";

export function RidesPage({ refreshKey, onDataChanged }: RidesPageProps) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => currentYearMonth());
  const [editingRide, setEditingRide] = useState<Ride | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);

  async function refresh() {
    const [r, b, m] = await Promise.all([db.listRides(), db.listBikes(), db.getMonthsWithRides()]);
    setRides(r);
    setBikes(b);
    setMonths(m);
  }

  useEffect(() => {
    refresh();
  }, [refreshKey]);

  const monthOptions = useMemo(() => {
    const withCurrent = new Set([currentYearMonth(), ...months]);
    return Array.from(withCurrent).sort((a, b) => b.localeCompare(a));
  }, [months]);

  const filteredRides = useMemo(() => {
    if (selectedMonth === ALL_MONTHS) return rides;
    const inMonth = rides.filter((r) => r.date.startsWith(selectedMonth));
    return [...inMonth].sort((a, b) => a.date.localeCompare(b.date));
  }, [rides, selectedMonth]);

  const monthSummary = useMemo(() => {
    if (selectedMonth === ALL_MONTHS) return null;
    const distance = filteredRides.reduce((s, r) => s + r.distance_km, 0);
    const elevation = filteredRides.reduce((s, r) => s + r.elevation_m, 0);
    return { count: filteredRides.length, distance, elevation };
  }, [filteredRides, selectedMonth]);

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
      <div className="month-picker">
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
          <option value={ALL_MONTHS}>Toutes les sorties</option>
          {monthOptions.map((ym) => (
            <option key={ym} value={ym}>
              {formatMonthLabel(ym)}
            </option>
          ))}
        </select>
      </div>

      {monthSummary && (
        <div className="stat-tiles stat-tiles--3">
          <StatTile label="Sorties" value={formatNumber(monthSummary.count)} />
          <StatTile label="Distance" value={`${formatNumber(monthSummary.distance)} km`} />
          <StatTile label="Dénivelé+" value={`${formatNumber(monthSummary.elevation)} m`} />
        </div>
      )}

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
                <th>Nom</th>
                <th>Durée</th>
                <th>Distance</th>
                <th>Dénivelé+</th>
                <th>Vélo</th>
                <th>Commentaire</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRides.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td>{r.name}</td>
                  <td>{formatDuration(r.duration_minutes)}</td>
                  <td>{formatNumber(r.distance_km, r.distance_km % 1 === 0 ? 0 : 1)} km</td>
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
