import { useEffect, useState } from "react";
import * as db from "../db";
import * as maint from "../maintenance-db";
import { PartInstanceInUseError } from "../maintenance-db";
import type { Bike, Maintenance, PartInstanceStats, PartMount, PartTag } from "../types";
import { MaintenanceFormPage } from "./MaintenanceFormPage";
import { PartInstanceFormModal } from "../components/PartInstanceFormModal";
import { PartTagFormModal } from "../components/PartTagFormModal";
import { PartHistoryModal } from "../components/PartHistoryModal";
import { PartsLocationsView } from "../components/PartsLocationsView";
import { formatDate, formatNumber } from "../format";

interface MaintenancePageProps {
  refreshKey: number;
  onDataChanged: () => void;
}

type View = "maintenances" | "parts" | "locations";
type MaintenanceSubView = "list" | "form";
type StatusFilter = "all" | "mounted" | "unmounted";

interface MaintenanceSummaryLine {
  slot: string;
  before: string;
  after: string;
}

/** Récapitulatif « avant → après » par emplacement touché par une maintenance donnée. */
function buildMaintenanceSummary(maintenanceId: number, mounts: PartMount[]): MaintenanceSummaryLine[] {
  const installed = new Map<number, PartMount>();
  const removed = new Map<number, PartMount>();
  for (const m of mounts) {
    if (m.mounted_by_maintenance_id === maintenanceId) installed.set(m.bike_part_def_id, m);
    if (m.removed_by_maintenance_id === maintenanceId) removed.set(m.bike_part_def_id, m);
  }
  const slotIds = new Set<number>([...installed.keys(), ...removed.keys()]);
  return Array.from(slotIds)
    .map((defId) => {
      const inst = installed.get(defId);
      const rem = removed.get(defId);
      return {
        slot: inst?.bike_part_def_name ?? rem?.bike_part_def_name ?? "",
        before: rem?.part_instance_name ?? "x",
        after: inst?.part_instance_name ?? "x",
      };
    })
    .sort((a, b) => a.slot.localeCompare(b.slot));
}

export function MaintenancePage({ refreshKey, onDataChanged }: MaintenancePageProps) {
  const [view, setView] = useState<View>("maintenances");
  const [maintSubView, setMaintSubView] = useState<MaintenanceSubView>("list");
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<number | null>(null);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [allMounts, setAllMounts] = useState<PartMount[]>([]);
  const [partStats, setPartStats] = useState<PartInstanceStats[]>([]);
  const [partTags, setPartTags] = useState<PartTag[]>([]);

  const [editingMaintenance, setEditingMaintenance] = useState<Maintenance | null>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<number | null>(null);
  const [historyInstanceId, setHistoryInstanceId] = useState<number | null>(null);
  const [addingInstance, setAddingInstance] = useState(false);
  const [tagModal, setTagModal] = useState<"add" | "edit" | null>(null);
  const [editingTag, setEditingTag] = useState<PartTag | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [bikeFilterId, setBikeFilterId] = useState<number | null>(null);
  const [tagFilterIds, setTagFilterIds] = useState<Set<number>>(new Set());

  async function refreshBikesAndParts() {
    const [b, stats, tags] = await Promise.all([db.listBikes(), maint.getPartInstanceStats(), maint.listPartTags()]);
    setBikes(b);
    setPartStats(stats);
    setPartTags(tags);
    return b;
  }

  useEffect(() => {
    (async () => {
      const b = await refreshBikesAndParts();
      setSelectedBikeId((current) => (current && b.some((x) => x.id === current) ? current : b[0]?.id ?? null));
    })();
  }, [refreshKey]);

  useEffect(() => {
    if (selectedBikeId == null) {
      setMaintenances([]);
      setAllMounts([]);
      return;
    }
    maint.listMaintenances(selectedBikeId).then(setMaintenances);
    maint.getAllMountsForBike(selectedBikeId).then(setAllMounts);
  }, [selectedBikeId, refreshKey]);

  async function handleMaintenanceSaved() {
    setMaintSubView("list");
    setEditingMaintenance(null);
    onDataChanged();
  }

  async function handleDeleteMaintenance() {
    if (!editingMaintenance) return;
    await maint.deleteMaintenance(editingMaintenance.id);
    await handleMaintenanceSaved();
  }

  const editingInstance = partStats.find((p) => p.part_instance_id === editingInstanceId) ?? null;
  const historyInstance = partStats.find((p) => p.part_instance_id === historyInstanceId) ?? null;

  async function handleAddInstance(
    name: string,
    purchaseCost: number | null,
    purchaseDate: string | null,
    retiredDate: string | null,
    tagIds: number[]
  ) {
    await maint.addPartInstance(name, purchaseCost, purchaseDate, retiredDate, tagIds);
    setAddingInstance(false);
    await refreshBikesAndParts();
  }

  async function handleEditInstance(
    name: string,
    purchaseCost: number | null,
    purchaseDate: string | null,
    retiredDate: string | null,
    tagIds: number[]
  ) {
    if (!editingInstanceId) return;
    await maint.updatePartInstance(editingInstanceId, name, purchaseCost, purchaseDate, retiredDate, tagIds);
    setEditingInstanceId(null);
    await refreshBikesAndParts();
  }

  async function handleDeleteInstance() {
    if (!editingInstanceId) return;
    try {
      await maint.deletePartInstance(editingInstanceId);
      setEditingInstanceId(null);
      await refreshBikesAndParts();
    } catch (err) {
      if (err instanceof PartInstanceInUseError) {
        throw new Error("Cette pièce a un historique de montage et ne peut pas être supprimée.");
      }
      throw err;
    }
  }

  async function handleAddTag(name: string, color: string) {
    await maint.addPartTag(name, color);
    setTagModal(null);
    await refreshBikesAndParts();
  }

  async function handleEditTag(name: string, color: string) {
    if (!editingTag) return;
    await maint.updatePartTag(editingTag.id, name, color);
    setTagModal(null);
    setEditingTag(null);
    await refreshBikesAndParts();
  }

  async function handleDeleteTag() {
    if (!editingTag) return;
    await maint.deletePartTag(editingTag.id);
    setTagModal(null);
    setEditingTag(null);
    setTagFilterIds((ids) => {
      const next = new Set(ids);
      next.delete(editingTag.id);
      return next;
    });
    await refreshBikesAndParts();
  }

  function toggleTagFilter(id: number) {
    setTagFilterIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredStats = partStats.filter((p) => {
    if (statusFilter === "mounted" && !p.currentMount) return false;
    if (statusFilter === "unmounted" && p.currentMount) return false;
    if (bikeFilterId != null && p.currentMount?.bike_id !== bikeFilterId) return false;
    if (tagFilterIds.size > 0 && !p.tags.some((t) => tagFilterIds.has(t.id))) return false;
    return true;
  });

  if (view === "maintenances" && maintSubView === "form") {
    return (
      <MaintenanceFormPage
        bikes={bikes}
        maintenance={editingMaintenance ?? undefined}
        defaultBikeId={selectedBikeId ?? undefined}
        onSaved={handleMaintenanceSaved}
        onDelete={editingMaintenance ? handleDeleteMaintenance : undefined}
        onBack={() => {
          setMaintSubView("list");
          setEditingMaintenance(null);
        }}
      />
    );
  }

  return (
    <div>
      <div className="segmented" style={{ marginBottom: 18 }}>
        <button
          className={`segmented__option ${view === "maintenances" ? "active" : ""}`}
          onClick={() => setView("maintenances")}
        >
          Maintenances
        </button>
        <button
          className={`segmented__option ${view === "parts" ? "active" : ""}`}
          onClick={() => setView("parts")}
        >
          Pièces
        </button>
        <button
          className={`segmented__option ${view === "locations" ? "active" : ""}`}
          onClick={() => setView("locations")}
        >
          Emplacements
        </button>
      </div>

      {view === "maintenances" && (
        <>
          {bikes.length === 0 ? (
            <div className="card table-container">
              <div className="empty-state">Ajoutez d'abord un vélo dans l'onglet Vélos.</div>
            </div>
          ) : (
            <>
              <div className="bike-picker">
                {bikes.map((b) => (
                  <button
                    key={b.id}
                    className={`bike-pill ${b.id === selectedBikeId ? "active" : ""}`}
                    onClick={() => setSelectedBikeId(b.id)}
                  >
                    <span className="bike-color-dot" style={{ background: b.color }} />
                    {b.name}
                  </button>
                ))}
              </div>

              <div className="toolbar">
                <button
                  className="btn"
                  onClick={() => {
                    setEditingMaintenance(null);
                    setMaintSubView("form");
                  }}
                >
                  Ajouter
                </button>
              </div>

              <div className="card table-container">
                {maintenances.length === 0 ? (
                  <div className="empty-state">Aucune maintenance enregistrée pour ce vélo.</div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Résumé</th>
                        <th>Commentaire</th>
                        <th>Coût</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {maintenances.map((m) => {
                        const summary = buildMaintenanceSummary(m.id, allMounts);
                        return (
                          <tr key={m.id}>
                            <td>{formatDate(m.date)}</td>
                            <td className="maintenance-summary-cell">
                              {summary.length === 0
                                ? "—"
                                : summary.map((line, i) => (
                                    <div key={i} className="maintenance-summary-line">
                                      <strong>{line.slot}</strong> = {line.before} → {line.after}
                                    </div>
                                  ))}
                            </td>
                            <td className="maintenance-comment-cell">{m.comment ?? ""}</td>
                            <td>{m.cost != null ? `${formatNumber(m.cost, 2)} €` : ""}</td>
                            <td className="actions-cell">
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setEditingMaintenance(m);
                                  setMaintSubView("form");
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
            </>
          )}
        </>
      )}

      {view === "parts" && (
        <>
          <div className="section-title" style={{ marginTop: 0 }}>Tags</div>
          <div className="card options-card">
            {partTags.length === 0 ? (
              <div className="empty-state">Aucun tag. Créez-en un pour filtrer vos pièces (ex. Route, Occasion).</div>
            ) : (
              <div className="tag-list">
                {partTags.map((t) => (
                  <button
                    key={t.id}
                    className="tag-pill"
                    onClick={() => {
                      setEditingTag(t);
                      setTagModal("edit");
                    }}
                  >
                    <span className="bike-color-dot" style={{ background: t.color }} />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setTagModal("add")}>
                Nouveau tag…
              </button>
            </div>
          </div>

          <div className="section-title">Exemplaires</div>
          <div className="toolbar toolbar--parts-filters">
            <div className="parts-filters">
              <select className="select-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="all">Toutes les pièces</option>
                <option value="mounted">Montées</option>
                <option value="unmounted">Non montées</option>
              </select>
              <select
                className="select-input"
                value={bikeFilterId ?? ""}
                onChange={(e) => setBikeFilterId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Tous les vélos</option>
                {bikes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {partTags.length > 0 && (
                <div className="tag-toggle-list">
                  {partTags.map((tag) => (
                    <button
                      type="button"
                      key={tag.id}
                      className={`tag-chip tag-chip--toggle ${tagFilterIds.has(tag.id) ? "active" : ""}`}
                      onClick={() => toggleTagFilter(tag.id)}
                    >
                      <span className="tag-chip__dot" style={{ background: tag.color }} />
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn" onClick={() => setAddingInstance(true)}>
              Nouvel exemplaire
            </button>
          </div>
          <div className="card table-container">
            {filteredStats.length === 0 ? (
              <div className="empty-state">
                {partStats.length === 0 ? "Aucune pièce enregistrée." : "Aucune pièce ne correspond aux filtres."}
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Tags</th>
                    <th>Statut</th>
                    <th>Distance</th>
                    <th>Dénivelé+</th>
                    <th>Prix d'achat</th>
                    <th>Achat</th>
                    <th>Rebut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStats.map((p) => (
                    <tr key={p.part_instance_id}>
                      <td>{p.name}</td>
                      <td>
                        {p.tags.map((t) => (
                          <span key={t.id} className="tag-chip">
                            <span className="tag-chip__dot" style={{ background: t.color }} />
                            {t.name}
                          </span>
                        ))}
                      </td>
                      <td>
                        {p.retired_date ? (
                          `Mis au rebut le ${formatDate(p.retired_date)}`
                        ) : p.currentMount ? (
                          <>
                            <span className="bike-color-dot" style={{ background: p.currentMount.bike_color }} />
                            {p.currentMount.bike_part_def_name} sur {p.currentMount.bike_name} depuis le{" "}
                            {formatDate(p.currentMount.mounted_at)}
                          </>
                        ) : (
                          "Non monté"
                        )}
                      </td>
                      <td>{formatNumber(p.total_km)} km</td>
                      <td>{formatNumber(p.total_elevation_m)} m</td>
                      <td>{p.purchase_cost != null ? `${formatNumber(p.purchase_cost, 2)} €` : ""}</td>
                      <td>{p.purchase_date ? formatDate(p.purchase_date) : ""}</td>
                      <td>{p.retired_date ? formatDate(p.retired_date) : ""}</td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setHistoryInstanceId(p.part_instance_id)}
                        >
                          Historique
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditingInstanceId(p.part_instance_id)}
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
        </>
      )}

      {view === "locations" && (
        <PartsLocationsView refreshKey={refreshKey} onDataChanged={onDataChanged} />
      )}

      {addingInstance && (
        <PartInstanceFormModal allTags={partTags} onSave={handleAddInstance} onClose={() => setAddingInstance(false)} />
      )}

      {editingInstance && (
        <PartInstanceFormModal
          allTags={partTags}
          initialTagIds={editingInstance.tags.map((t) => t.id)}
          instance={{
            id: editingInstance.part_instance_id,
            name: editingInstance.name,
            purchase_cost: editingInstance.purchase_cost,
            purchase_date: editingInstance.purchase_date,
            retired_date: editingInstance.retired_date,
            tags: editingInstance.tags,
          }}
          onSave={handleEditInstance}
          onDelete={handleDeleteInstance}
          onClose={() => setEditingInstanceId(null)}
        />
      )}

      {tagModal === "add" && (
        <PartTagFormModal
          onSave={handleAddTag}
          onClose={() => setTagModal(null)}
        />
      )}
      {tagModal === "edit" && editingTag && (
        <PartTagFormModal
          initialName={editingTag.name}
          initialColor={editingTag.color}
          onSave={handleEditTag}
          onDelete={handleDeleteTag}
          onClose={() => {
            setTagModal(null);
            setEditingTag(null);
          }}
        />
      )}

      {historyInstance && (
        <PartHistoryModal
          instanceId={historyInstance.part_instance_id}
          instanceName={historyInstance.name}
          purchaseDate={historyInstance.purchase_date}
          retiredDate={historyInstance.retired_date}
          onClose={() => setHistoryInstanceId(null)}
        />
      )}
    </div>
  );
}
