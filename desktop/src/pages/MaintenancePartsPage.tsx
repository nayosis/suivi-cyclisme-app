import { useEffect, useState } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as db from "../db";
import * as maint from "../maintenance-db";
import type { PartTag } from "../types";
import { PartInstanceFormModal } from "../components/PartInstanceFormModal";
import { PartTagFormModal } from "../components/PartTagFormModal";
import { PartActionsMenu } from "../components/PartActionsMenu";
import { formatDate, formatNumber, todayIso } from "../format";
import { cyclingKey, maintenanceKey, invalidateMaintenance } from "../query-client";
import { maintenanceRoute } from "../routes/maintenance-layout";

type StatusFilter = "all" | "mounted" | "unmounted";

interface MaintenancePartsSearch {
  status?: StatusFilter;
  bike?: number;
  tags?: number[];
  retired?: boolean;
  q?: string;
}

export const Route = createRoute({
  getParentRoute: () => maintenanceRoute,
  path: "/parts",
  validateSearch: (search: Record<string, unknown>): MaintenancePartsSearch => ({
    status: search.status === "mounted" || search.status === "unmounted" ? search.status : "all",
    bike: Number(search.bike) || undefined,
    tags: Array.isArray(search.tags) ? search.tags.map(Number).filter((n) => !Number.isNaN(n)) : undefined,
    retired: search.retired === true || search.retired === "true" ? true : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  component: MaintenancePartsPage,
});

/** Onglet « Pièces » : catalogue des tags et tableau des exemplaires, avec filtres et recherche. */
function MaintenancePartsPage() {
  const { status: statusFilter, bike: bikeFilterId, tags: tagFilterIds, retired: showRetired, q: partSearch } =
    Route.useSearch();
  const navigate = Route.useNavigate();

  const bikesQuery = useQuery({ queryKey: [...cyclingKey, "bikes"], queryFn: db.listBikes });
  const partStatsQuery = useQuery({ queryKey: [...maintenanceKey, "partStats"], queryFn: maint.getPartInstanceStats });
  const partTagsQuery = useQuery({ queryKey: [...maintenanceKey, "partTags"], queryFn: maint.listPartTags });
  const bikes = bikesQuery.data ?? [];
  const partStats = partStatsQuery.data ?? [];
  const partTags = partTagsQuery.data ?? [];

  const [addingInstance, setAddingInstance] = useState(false);
  const [tagModal, setTagModal] = useState<"add" | "edit" | null>(null);
  const [editingTag, setEditingTag] = useState<PartTag | null>(null);

  async function handleAddInstance(
    name: string,
    purchaseCost: number | null,
    purchaseDate: string | null,
    retiredDate: string | null,
    tagIds: number[]
  ) {
    await maint.addPartInstance(name, purchaseCost, purchaseDate, retiredDate, tagIds);
    setAddingInstance(false);
    await invalidateMaintenance();
  }

  // Message de confirmation avec « Annuler », affiché quelques secondes après une action rapide.
  const [toast, setToast] = useState<{ message: string; undo: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleScrap(id: number, name: string, previousRetiredDate: string | null) {
    await maint.setPartInstanceRetiredDate(id, todayIso());
    setToast({
      message: `« ${name} » mise au rebut le ${formatDate(todayIso())}`,
      undo: () => maint.setPartInstanceRetiredDate(id, previousRetiredDate),
    });
    await invalidateMaintenance();
  }

  async function handleRestore(id: number, name: string, previousRetiredDate: string) {
    await maint.setPartInstanceRetiredDate(id, null);
    setToast({
      message: `« ${name} » remise en service`,
      undo: () => maint.setPartInstanceRetiredDate(id, previousRetiredDate),
    });
    await invalidateMaintenance();
  }

  async function handleToggleTag(id: number, tagId: number, on: boolean) {
    await maint.setPartInstanceTag(id, tagId, on);
    await invalidateMaintenance();
  }

  async function handleUndo() {
    if (!toast) return;
    const { undo } = toast;
    setToast(null);
    await undo();
    await invalidateMaintenance();
  }

  async function handleAddTag(name: string, color: string) {
    await maint.addPartTag(name, color);
    setTagModal(null);
    await invalidateMaintenance();
  }

  async function handleEditTag(name: string, color: string) {
    if (!editingTag) return;
    await maint.updatePartTag(editingTag.id, name, color);
    setTagModal(null);
    setEditingTag(null);
    await invalidateMaintenance();
  }

  async function handleDeleteTag() {
    if (!editingTag) return;
    await maint.deletePartTag(editingTag.id);
    setTagModal(null);
    setEditingTag(null);
    navigate({ search: (prev) => ({ ...prev, tags: prev.tags?.filter((id) => id !== editingTag.id) }) });
    await invalidateMaintenance();
  }

  function toggleTagFilter(id: number) {
    navigate({
      search: (prev) => {
        const current = prev.tags ?? [];
        const next = current.includes(id) ? current.filter((t) => t !== id) : [...current, id];
        return { ...prev, tags: next.length > 0 ? next : undefined };
      },
    });
  }

  const filteredStats = partStats.filter((p) => {
    if (!showRetired && p.retired_date && p.retired_date <= todayIso()) return false;
    if (statusFilter === "mounted" && !p.currentMount) return false;
    if (statusFilter === "unmounted" && p.currentMount) return false;
    if (bikeFilterId != null && p.currentMount?.bike_id !== bikeFilterId) return false;
    if (tagFilterIds && tagFilterIds.length > 0 && !p.tags.some((t) => tagFilterIds.includes(t.id))) return false;
    if (partSearch && !p.name.toLowerCase().includes(partSearch.toLowerCase())) return false;
    return true;
  });

  return (
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
            value={partSearch ?? ""}
            onChange={(e) => navigate({ search: (prev) => ({ ...prev, q: e.target.value || undefined }) })}
          />
          <select
            className="select-input"
            value={statusFilter ?? "all"}
            onChange={(e) =>
              navigate({ search: (prev) => ({ ...prev, status: e.target.value as StatusFilter }) })
            }
          >
            <option value="all">Toutes les pièces</option>
            <option value="mounted">Montées</option>
            <option value="unmounted">Non montées</option>
          </select>
          <select
            className="select-input"
            value={bikeFilterId ?? ""}
            onChange={(e) =>
              navigate({ search: (prev) => ({ ...prev, bike: e.target.value ? Number(e.target.value) : undefined }) })
            }
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
                  className={`tag-chip tag-chip--toggle ${tagFilterIds?.includes(tag.id) ? "active" : ""}`}
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
              checked={showRetired ?? false}
              onChange={(e) => navigate({ search: (prev) => ({ ...prev, retired: e.target.checked || undefined }) })}
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
                    <Link
                      to="/maintenance/parts/$partId"
                      params={{ partId: String(p.part_instance_id) }}
                      className="link-button"
                    >
                      [{p.part_instance_id}]
                    </Link>
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
                        <strong style={{ color: p.currentMount.bike_color }}>{p.currentMount.bike_name}</strong> depuis
                        le {formatDate(p.currentMount.mounted_at)}
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
                    <Link
                      to="/maintenance/parts/$partId"
                      params={{ partId: String(p.part_instance_id) }}
                      className="btn btn-secondary btn-sm"
                    >
                      Détails
                    </Link>
                    <PartActionsMenu
                      retiredDate={p.retired_date}
                      mounted={p.currentMount != null}
                      allTags={partTags}
                      tagIds={p.tags.map((t) => t.id)}
                      todayLabel={formatDate(todayIso())}
                      onScrap={() => handleScrap(p.part_instance_id, p.name, p.retired_date)}
                      onRestore={() => handleRestore(p.part_instance_id, p.name, p.retired_date!)}
                      onToggleTag={(tagId, on) => handleToggleTag(p.part_instance_id, tagId, on)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && (
        <div className="undo-toast" role="status">
          <span>{toast.message}</span>
          <button type="button" onClick={handleUndo}>
            Annuler
          </button>
        </div>
      )}

      {addingInstance && (
        <PartInstanceFormModal allTags={partTags} onSave={handleAddInstance} onClose={() => setAddingInstance(false)} />
      )}

      {tagModal === "add" && <PartTagFormModal onSave={handleAddTag} onClose={() => setTagModal(null)} />}
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
    </>
  );
}
