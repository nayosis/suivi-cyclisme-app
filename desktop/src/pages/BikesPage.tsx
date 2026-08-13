import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as db from "../db";
import { BikeInUseError } from "../db";
import * as maint from "../maintenance-db";
import type { Bike } from "../types";
import { BikeFormModal } from "../components/BikeFormModal";
import { formatDate, formatNumber } from "../format";
import { cyclingKey, invalidateCycling, invalidateMaintenance } from "../query-client";
import { rootRoute } from "../routes/root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bikes",
  component: BikesPage,
});

interface BikeStats {
  distance_km: number;
  elevation_m: number;
  ride_count: number;
}

const EMPTY_STATS: BikeStats = { distance_km: 0, elevation_m: 0, ride_count: 0 };

function BikesPage() {
  const bikesQuery = useQuery({ queryKey: [...cyclingKey, "bikes"], queryFn: db.listBikes });
  const byBikeQuery = useQuery({ queryKey: [...cyclingKey, "byBike"], queryFn: db.getByBike });
  const bikes = bikesQuery.data ?? [];
  const statsByBike = new Map((byBikeQuery.data ?? []).map((s) => [s.label, s]));

  const [editingBike, setEditingBike] = useState<Bike | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);

  /** Une pièce d'origine mandatory est instanciée à la création : ça touche aussi le domaine Entretien. */
  async function invalidateBoth() {
    await Promise.all([invalidateCycling(), invalidateMaintenance()]);
  }

  async function handleAdd(name: string, color: string, purchaseDate: string, purchaseKm: number) {
    const bikeId = await db.addBike(name, color, purchaseDate, purchaseKm);
    await maint.instantiateMandatoryPartsForBike(bikeId);
    setModal(null);
    await invalidateBoth();
  }

  async function handleEdit(name: string, color: string, purchaseDate: string, purchaseKm: number) {
    if (!editingBike) return;
    await db.updateBike(editingBike.id, name, color, purchaseDate, purchaseKm);
    setModal(null);
    setEditingBike(null);
    await invalidateBoth();
  }

  async function handleDelete() {
    if (!editingBike) return;
    try {
      await db.deleteBike(editingBike.id);
    } catch (err) {
      if (err instanceof BikeInUseError) {
        throw new Error("Ce vélo est utilisé par des sorties enregistrées et ne peut pas être supprimé.");
      }
      throw err;
    }
    setModal(null);
    setEditingBike(null);
    await invalidateBoth();
  }

  return (
    <div>
      <div className="toolbar">
        <button className="btn" onClick={() => setModal("add")}>
          Ajouter
        </button>
      </div>

      <div className="card table-container">
        {bikes.length === 0 ? (
          <div className="empty-state">Aucun vélo enregistré. Ajoutez-en un pour commencer.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Acquisition</th>
                <th>Km à l'achat</th>
                <th>Distance</th>
                <th>Dénivelé+</th>
                <th>Sorties</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bikes.map((b) => {
                const stats = statsByBike.get(b.name) ?? EMPTY_STATS;
                return (
                  <tr key={b.id}>
                    <td>
                      <span className="bike-color-dot" style={{ background: b.color }} />
                      {b.name}
                    </td>
                    <td>{b.purchase_date ? formatDate(b.purchase_date) : "—"}</td>
                    <td>{formatNumber(b.purchase_km)} km</td>
                    <td>{formatNumber(stats.distance_km)} km</td>
                    <td>{formatNumber(stats.elevation_m)} m</td>
                    <td>{formatNumber(stats.ride_count)}</td>
                    <td className="actions-cell">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEditingBike(b);
                          setModal("edit");
                        }}
                      >
                        Modifier
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal === "add" && <BikeFormModal onSave={handleAdd} onClose={() => setModal(null)} />}
      {modal === "edit" && editingBike && (
        <BikeFormModal
          initialName={editingBike.name}
          initialColor={editingBike.color}
          initialPurchaseDate={editingBike.purchase_date}
          initialPurchaseKm={editingBike.purchase_km}
          onSave={handleEdit}
          onClose={() => {
            setModal(null);
            setEditingBike(null);
          }}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
