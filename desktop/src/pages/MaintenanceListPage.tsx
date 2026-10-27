import { useEffect } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as db from "../db";
import * as maint from "../maintenance-db";
import type { PartMount } from "../types";
import { BikeDiagram } from "../components/BikeDiagram";
import { SlotHistoryTimeline } from "../components/SlotHistoryTimeline";
import { formatDate, formatNumber } from "../format";
import { cyclingKey, maintenanceKey } from "../query-client";
import { maintenanceRoute } from "../routes/maintenance-layout";

interface MaintenanceListSearch {
  bike?: number;
  slot?: number;
}

export const Route = createRoute({
  getParentRoute: () => maintenanceRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): MaintenanceListSearch => ({
    bike: Number(search.bike) || undefined,
    slot: Number(search.slot) || undefined,
  }),
  component: MaintenanceListPage,
});

interface SummaryPart {
  id: number;
  name: string;
  /** Pièce retirée et mise au rebut par cette maintenance (sa date de rebut = la date du retrait). */
  scrapped?: boolean;
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
        before: rem
          ? {
              id: rem.part_instance_id,
              name: rem.part_instance_name,
              scrapped: rem.part_instance_retired_date != null && rem.part_instance_retired_date === rem.unmounted_at,
            }
          : null,
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

/** Onglet « Maintenances » : historique des interventions d'un vélo, et frise chronologique par emplacement. */
function MaintenanceListPage() {
  const { bike: selectedBikeId, slot: selectedDefId } = Route.useSearch();
  const navigate = Route.useNavigate();

  const bikesQuery = useQuery({ queryKey: [...cyclingKey, "bikes"], queryFn: db.listBikes });
  const defsQuery = useQuery({ queryKey: [...maintenanceKey, "defs"], queryFn: maint.listBikePartDefs });
  const maintenancesQuery = useQuery({
    queryKey: [...maintenanceKey, "maintenances", selectedBikeId],
    queryFn: () => maint.listMaintenances(selectedBikeId!),
    enabled: selectedBikeId != null,
  });
  const allMountsQuery = useQuery({
    queryKey: [...maintenanceKey, "allMounts", selectedBikeId],
    queryFn: () => maint.getAllMountsForBike(selectedBikeId!),
    enabled: selectedBikeId != null,
  });
  const mileageQuery = useQuery({
    queryKey: [...maintenanceKey, "mileage", selectedBikeId],
    queryFn: () => maint.getBikeMileageAtMaintenances(selectedBikeId!),
    enabled: selectedBikeId != null,
  });
  const slotHistoryQuery = useQuery({
    queryKey: [...maintenanceKey, "slotHistory", selectedBikeId, selectedDefId],
    queryFn: () => maint.getSlotHistory(selectedBikeId!, selectedDefId!),
    enabled: selectedBikeId != null && selectedDefId != null,
  });

  const bikes = bikesQuery.data ?? [];
  const defs = defsQuery.data ?? [];
  const maintenances = maintenancesQuery.data ?? [];
  const allMounts = allMountsQuery.data ?? [];
  const slotHistory = selectedDefId == null ? null : slotHistoryQuery.data ?? null;
  const mileageByMaintenance = new Map((mileageQuery.data ?? []).map((r) => [r.maintenance_id, r.mileage_km]));

  useEffect(() => {
    if (selectedBikeId == null && bikes.length > 0) {
      navigate({ search: (prev) => ({ ...prev, bike: bikes[0].id }), replace: true });
    }
  }, [selectedBikeId, bikes]);

  const selectedDef = defs.find((d) => d.id === selectedDefId) ?? null;
  const visibleMaintenances =
    selectedDefId == null
      ? maintenances
      : maintenances.filter((m) => maintenanceTouchesDef(m.id, selectedDefId, allMounts));

  function selectDef(defId: number | null) {
    navigate({ search: (prev) => ({ ...prev, slot: defId ?? undefined }) });
  }

  if (bikes.length === 0) {
    return (
      <div className="card table-container">
        <div className="empty-state">Ajoutez d'abord un vélo dans l'onglet Vélos.</div>
      </div>
    );
  }

  return (
    <>
      <div className="bike-picker">
        {bikes.map((b) => (
          <button
            key={b.id}
            className={`bike-pill ${b.id === selectedBikeId ? "active" : ""}`}
            onClick={() => navigate({ search: { bike: b.id } })}
          >
            <span className="bike-color-dot" style={{ background: b.color }} />
            {b.name}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <Link to="/maintenance/new" search={{ bikeId: selectedBikeId }} className="btn">
          Ajouter
        </Link>
      </div>

      <div className="parts-locations">
        <div className="maintenance-diagram-column">
          {defs.length === 0 ? (
            <div className="card table-container">
              <div className="empty-state">Aucun emplacement défini. Configurez-les depuis l'onglet Emplacements.</div>
            </div>
          ) : (
            <BikeDiagram
              defs={defs}
              onMarkerClick={(def) => selectDef(def.id === selectedDefId ? null : def.id)}
              isSelected={(def) => def.id === selectedDefId}
              markerVariant={(def) => (allMounts.some((m) => m.bike_part_def_id === def.id) ? "filled" : "empty")}
            />
          )}
        </div>

        <div className="maintenance-side-column">
          {selectedDef && (
            <div className="card" style={{ padding: "18px 20px" }}>
              <div
                className="section-title"
                style={{ marginTop: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                {selectedDef.name}
                <button className="btn-icon" onClick={() => selectDef(null)} title="Fermer l'historique">
                  ×
                </button>
              </div>
              <SlotHistoryTimeline history={slotHistory} />
            </div>
          )}

          <div className="card table-container">
            {selectedDef && (
              <div className="reposition-banner">
                Maintenances filtrées sur « {selectedDef.name} »
                <button className="btn-icon" onClick={() => selectDef(null)} title="Voir toutes les maintenances">
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
                                        <Link
                                          to="/maintenance/parts/$partId"
                                          params={{ partId: String(line.before.id) }}
                                          className="link-button"
                                        >
                                          [{line.before.id}]
                                        </Link>
                                      </>
                                    )}
                                    {line.before && line.after ? " → " : line.before ? " →" : "→ "}
                                    {line.after && (
                                      <>
                                        {line.after.name}{" "}
                                        <Link
                                          to="/maintenance/parts/$partId"
                                          params={{ partId: String(line.after.id) }}
                                          className="link-button"
                                        >
                                          [{line.after.id}]
                                        </Link>
                                      </>
                                    )}
                                    {line.before && (
                                      <>
                                        {" "}
                                        <span className={`slot-pill ${line.before.scrapped ? "slot-pill--scrap" : "slot-pill--keep"}`}>
                                          {line.before.scrapped ? "Mise au rebut" : "Gardée en stock"}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                        </td>
                        <td className="maintenance-comment-cell">{m.comment ?? ""}</td>
                        <td>{m.cost != null ? `${formatNumber(m.cost, 2)} €` : ""}</td>
                        <td className="actions-cell">
                          <Link
                            to="/maintenance/$maintenanceId/edit"
                            params={{ maintenanceId: String(m.id) }}
                            className="btn btn-secondary btn-sm"
                          >
                            Modifier
                          </Link>
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
  );
}
