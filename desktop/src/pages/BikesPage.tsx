import { useEffect, useState } from "react";
import * as db from "../db";
import { BikeInUseError } from "../db";
import type { Bike } from "../types";
import { BikeFormModal } from "../components/BikeFormModal";

interface BikesPageProps {
  refreshKey: number;
  onDataChanged: () => void;
}

export function BikesPage({ refreshKey, onDataChanged }: BikesPageProps) {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [editingBike, setEditingBike] = useState<Bike | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);

  async function refresh() {
    setBikes(await db.listBikes());
  }

  useEffect(() => {
    refresh();
  }, [refreshKey]);

  async function handleAdd(name: string, color: string) {
    await db.addBike(name, color);
    setModal(null);
    await refresh();
    onDataChanged();
  }

  async function handleEdit(name: string, color: string) {
    if (!editingBike) return;
    await db.updateBike(editingBike.id, name, color);
    setModal(null);
    setEditingBike(null);
    await refresh();
    onDataChanged();
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
    await refresh();
    onDataChanged();
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bikes.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className="bike-color-dot" style={{ background: b.color }} />
                    {b.name}
                  </td>
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal === "add" && <BikeFormModal onSave={handleAdd} onClose={() => setModal(null)} />}
      {modal === "edit" && editingBike && (
        <BikeFormModal
          initialName={editingBike.name}
          initialColor={editingBike.color}
          onSave={handleEdit}
          onDelete={handleDelete}
          onClose={() => {
            setModal(null);
            setEditingBike(null);
          }}
        />
      )}
    </div>
  );
}
