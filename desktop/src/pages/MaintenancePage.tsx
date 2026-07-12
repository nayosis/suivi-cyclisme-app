import { useEffect, useState } from "react";
import * as db from "../db";
import * as maint from "../maintenance-db";
import { PartInstanceInUseError } from "../maintenance-db";
import type { Bike, BikePartDef, Maintenance, PartInstanceStats, PartMount, PartTag, SlotMount } from "../types";
import { MaintenanceFormPage } from "./MaintenanceFormPage";
import { PartDetailPage } from "./PartDetailPage";
import { PartInstanceFormModal } from "../components/PartInstanceFormModal";
import { PartTagFormModal } from "../components/PartTagFormModal";
import { PartsLocationsView } from "../components/PartsLocationsView";
import { BikeDiagram } from "../components/BikeDiagram";
import { SlotHistoryTimeline } from "../components/SlotHistoryTimeline";
import { formatDate, formatNumber, todayIso } from "../format";

interface MaintenancePageProps {
  refreshKey: number;
  onDataChanged: () => void;
}

type View = "maintenances" | "parts" | "locations";
type MaintenanceSubView = "list" | "form";
type StatusFilter = "all" | "mounted" | "unmounted";

interface SummaryPart {
  id: number;
  name: string;
}

interface MaintenanceSummaryLine {
  slot: string;
  /** Pièce retirée, `null` si l'emplacement était vide avant (pose seule). */
  before: SummaryPart | null;
  /** Pièce posée, `null` si l'emplacement redevient vide (retrait seul). */
  after: SummaryPart | null;
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
        before: rem ? { id: rem.part_instance_id, name: rem.part_instance_name } : null,
        after: inst ? { id: inst.part_instance_id, name: inst.part_instance_name } : null,
      };
    })
    .sort((a, b) => a.slot.localeCompare(b.slot));
}

/** Une maintenance a-t-elle installé et/ou retiré une pièce sur cet emplacement précis ? */
function maintenanceTouchesDef(maintenanceId: number, defId: number, mounts: PartMount[]): boolean {
  return mounts.some(
    (m) =>
      m.bike_part_def_id === defId &&
      (m.mounted_by_maintenance_id === maintenanceId || m.removed_by_maintenance_id === maintenanceId)
  );
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
  const [defs, setDefs] = useState<BikePartDef[]>([]);
  const [selectedDefId, setSelectedDefId] = useState<number | null>(null);
  const [slotHistory, setSlotHistory] = useState<SlotMount[] | null>(null);
  const [mileageByMaintenance, setMileageByMaintenance] = useState<Map<number, number>>(new Map());

  const [editingMaintenance, setEditingMaintenance] = useState<Maintenance | null>(null);
  /** Fiche pièce actuellement affichée en plein écran (accessible depuis n'importe quel [id] de pièce dans l'app). */
  const [viewingPartId, setViewingPartId] = useState<number | null>(null);
  const [addingInstance, setAddingInstance] = useState(false);
  const [tagModal, setTagModal] = useState<"add" | "edit" | null>(null);
  const [editingTag, setEditingTag] = useState<PartTag | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [bikeFilterId, setBikeFilterId] = useState<number | null>(null);
  const [tagFilterIds, setTagFilterIds] = useState<Set<number>>(new Set());
  const [showRetired, setShowRetired] = useState(false);
  const [partSearch, setPartSearch] = useState("");

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
    maint.listBikePartDefs().then(setDefs);
  }, [refreshKey]);

  useEffect(() => {
    setSelectedDefId(null);
    if (selectedBikeId == null) {
      setMaintenances([]);
      setAllMounts([]);
      setMileageByMaintenance(new Map());
      return;
    }
    maint.listMaintenances(selectedBikeId).then(setMaintenances);
    maint.getAllMountsForBike(selectedBikeId).then(setAllMounts);
    maint.getBikeMileageAtMaintenances(selectedBikeId).then((rows) => {
      setMileageByMaintenance(new Map(rows.map((r) => [r.maintenance_id, r.mileage_km])));
    });
  }, [selectedBikeId, refreshKey]);

  useEffect(() => {
    if (selectedBikeId == null || selectedDefId == null) {
      setSlotHistory(null);
      return;
    }
    maint.getSlotHistory(selectedBikeId, selectedDefId).then(setSlotHistory);
  }, [selectedBikeId, selectedDefId, refreshKey]);

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

  const viewingPart = partStats.find((p) => p.part_instance_id === viewingPartId) ?? null;

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
    if (!viewingPartId) return;
    await maint.updatePartInstance(viewingPartId, name, purchaseCost, purchaseDate, retiredDate, tagIds);
    setViewingPartId(null);
    await refreshBikesAndParts();
  }

  async function handleDeleteInstance() {
    if (!viewingPartId) return;
    try {
      await maint.deletePartInstance(viewingPartId);
      setViewingPartId(null);
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
    if (!showRetired && p.retired_date && p.retired_date <= todayIso()) return false;
    if (statusFilter === "mounted" && !p.currentMount) return false;
    if (statusFilter === "unmounted" && p.currentMount) return false;
    if (bikeFilterId != null && p.currentMount?.bike_id !== bikeFilterId) return false;
    if (tagFilterIds.size > 0 && !p.tags.some((t) => tagFilterIds.has(t.id))) return false;
    if (partSearch.trim() && !p.name.toLowerCase().includes(partSearch.trim().toLowerCase())) return false;
    return true;
  });

  const selectedDef = defs.find((d) => d.id === selectedDefId) ?? null;
  const visibleMaintenances =
    selectedDefId == null
      ? maintenances
      : maintenances.filter((m) => maintenanceTouchesDef(m.id, selectedDefId, allMounts));

  if (viewingPart) {
    return (
      <PartDetailPage
        instance={viewingPart}
        allTags={partTags}
        onBack={() => setViewingPartId(null)}
        onSave={handleEditInstance}
        onDelete={handleDeleteInstance}
      />
    );
  }

  if (view === "maintenances" && maintSubView === "form") {
    return (
      <MaintenanceFormPage
        bikes={bikes}
        maintenance={editingMaintenance ?? undefined}
        defaultBikeId={selectedBikeId ?? undefined}
        onSaved={handleMaintenanceSaved}
        onDelete={editingMaintenance ? handleDeleteMaintenance : undefined}
        onViewPart={setViewingPartId}
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

              <div className="parts-locations">
                <div className="maintenance-diagram-column">
                  {defs.length === 0 ? (
                    <div className="card table-container">
                      <div className="empty-state">
                        Aucun emplacement défini. Configurez-les depuis l'onglet Emplacements.
                      </div>
                    </div>
                  ) : (
                    <BikeDiagram
                      defs={defs}
                      onMarkerClick={(def) => setSelectedDefId((current) => (current === def.id ? null : def.id))}
                      isSelected={(def) => def.id === selectedDefId}
                      markerVariant={(def) =>
                        allMounts.some((m) => m.bike_part_def_id === def.id) ? "filled" : "empty"
                      }
                    />
                  )}
                </div>

                <div className="maintenance-side-column">
                  {selectedDef && (
                    <div className="card" style={{ padding: "18px 20px" }}>
                      <div className="section-title" style={{ marginTop: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        {selectedDef.name}
                        <button className="btn-icon" onClick={() => setSelectedDefId(null)} title="Fermer l'historique">
                          ×
                        </button>
                      </div>
                      <SlotHistoryTimeline history={slotHistory} onSelectInstance={setViewingPartId} />
                    </div>
                  )}

                  <div className="card table-container">
                    {selectedDef && (
                      <div className="reposition-banner">
                        Maintenances filtrées sur « {selectedDef.name} »
                        <button className="btn-icon" onClick={() => setSelectedDefId(null)} title="Voir toutes les maintenances">
                          ×
                        </button>
                      </div>
                    )}
                    {visibleMaintenances.length === 0 ? (
                      <div className="empty-state">
                        {selectedDef
                          ? "Aucune maintenance n'a touché cet emplacement pour ce vélo."
                          : "Aucune maintenance enregistrée pour ce vélo."}
                      </div>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Kilométrage</th>
                            <th>Résumé</th>
                            <th>Commentaire</th>
                            <th>Coût</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleMaintenances.map((m) => {
                            const summary = buildMaintenanceSummary(m.id, allMounts);
                            return (
                              <tr key={m.id}>
                                <td>{formatDate(m.date)}</td>
                                <td>{formatNumber(mileageByMaintenance.get(m.id) ?? 0)} km</td>
                                <td className="maintenance-summary-cell">
                                  {summary.length === 0
                                    ? "—"
                                    : summary.map((line, i) => (
                                        <div key={i} className="maintenance-summary-line">
                                          <div className="maintenance-summary-line__slot">{line.slot}</div>
                                          <div className="maintenance-summary-line__detail">
                                            {line.before && (
                                              <>
                                                {line.before.name}{" "}
                                                <button
                                                  type="button"
                                                  className="link-button"
                                                  onClick={() => setViewingPartId(line.before!.id)}
                                                >
                                                  [{line.before.id}]
                                                </button>
                                              </>
                                            )}
                                            {line.before && line.after ? " → " : line.before ? " →" : "→ "}
                                            {line.after && (
                                              <>
                                                {line.after.name}{" "}
                                                <button
                                                  type="button"
                                                  className="link-button"
                                                  onClick={() => setViewingPartId(line.after!.id)}
                                                >
                                                  [{line.after.id}]
                                                </button>
                                              </>
                                            )}
                                          </div>
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
                </div>
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
              <input
                type="text"
                className="select-input"
                placeholder="Rechercher un nom…"
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
              />
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
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showRetired}
                  onChange={(e) => setShowRetired(e.target.checked)}
                />
                Afficher les pièces mises au rebut
              </label>
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
                      <td>
                        {p.name}{" "}
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setViewingPartId(p.part_instance_id)}
                        >
                          [{p.part_instance_id}]
                        </button>
                      </td>
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
                            {p.currentMount.bike_part_def_name} sur{" "}
                            <strong style={{ color: p.currentMount.bike_color }}>{p.currentMount.bike_name}</strong>{" "}
                            depuis le {formatDate(p.currentMount.mounted_at)}
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
                          onClick={() => setViewingPartId(p.part_instance_id)}
                        >
                          Détails
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
    </div>
  );
}
