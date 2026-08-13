import { FormEvent, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as maint from "../maintenance-db";
import { errorMessage, formatDate, todayIso } from "../format";
import { renderMarkdown } from "../markdown";
import { BikeDiagram } from "../components/BikeDiagram";
import type { Bike, BikePartDef, Maintenance, MaintenanceInput, PartInstance, PartMount, PartTag } from "../types";

interface MaintenanceFormPageProps {
  bikes: Bike[];
  maintenance?: Maintenance;
  /** Vélo présélectionné à la création (vue « découpée par vélo »). */
  defaultBikeId?: number;
  onSaved: () => void;
  onDelete?: () => Promise<void> | void;
  onBack: () => void;
}

interface NewInstallDraft {
  key: string;
  mode: "existing" | "new";
  bikePartDefId: number;
  instanceId: number | null;
  name: string;
  purchaseCost: string;
}

type SlotState =
  | { kind: "existing-install"; mount: PartMount }
  | { kind: "existing-removal"; mount: PartMount }
  | { kind: "staged-install"; draft: NewInstallDraft }
  | { kind: "staged-removal"; mount: PartMount }
  | { kind: "occupied"; mount: PartMount }
  | { kind: "empty" };

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

/** Nom de pièce + identifiant entre crochets, cliquable vers sa fiche. */
function PartRefLabel({ name, id }: { name: string; id: number }) {
  return (
    <>
      {name}{" "}
      <Link to="/maintenance/parts/$partId" params={{ partId: String(id) }} className="link-button">
        [{id}]
      </Link>
    </>
  );
}

/**
 * Page d'ajout/modification d'une maintenance. Le vélo est représenté par le
 * schéma des emplacements : cliquer sur un emplacement permet d'y déclarer
 * une installation, un retrait ou un remplacement de pièce, daté et rattaché
 * à cette maintenance. Le commentaire est un champ Markdown multiligne avec
 * aperçu.
 */
export function MaintenanceFormPage({
  bikes,
  maintenance,
  defaultBikeId,
  onSaved,
  onDelete,
  onBack,
}: MaintenanceFormPageProps) {
  const [bikeId, setBikeId] = useState<number>(maintenance?.bike_id ?? defaultBikeId ?? bikes[0]?.id ?? 0);
  const [date, setDate] = useState(maintenance?.date ?? todayIso());
  const [comment, setComment] = useState(maintenance?.comment ?? "");
  const [cost, setCost] = useState(maintenance?.cost != null ? String(maintenance.cost) : "");
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [defs, setDefs] = useState<BikePartDef[]>([]);
  const [partTags, setPartTags] = useState<PartTag[]>([]);
  const [availableInstances, setAvailableInstances] = useState<PartInstance[]>([]);
  const [openMounts, setOpenMounts] = useState<PartMount[]>([]);
  const [existingInstalled, setExistingInstalled] = useState<PartMount[]>([]);
  const [existingRemoved, setExistingRemoved] = useState<PartMount[]>([]);

  const [newInstalls, setNewInstalls] = useState<NewInstallDraft[]>([]);
  const [newUninstallIds, setNewUninstallIds] = useState<number[]>([]);

  const [activeDefId, setActiveDefId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickInstance, setPickInstance] = useState("");
  const [pickName, setPickName] = useState("");
  const [pickCost, setPickCost] = useState("");
  const [tagFilterEnabled, setTagFilterEnabled] = useState(true);
  const [panelError, setPanelError] = useState<string | null>(null);

  async function refreshPickers() {
    const [d, tags, available, open] = await Promise.all([
      maint.listBikePartDefs(),
      maint.listPartTags(),
      maint.listAvailablePartInstances(),
      bikeId ? maint.getOpenMountsForBike(bikeId) : Promise.resolve([]),
    ]);
    setDefs(d);
    setPartTags(tags);
    setAvailableInstances(available);
    setOpenMounts(open);
  }

  useEffect(() => {
    refreshPickers();
    if (maintenance) {
      maint.getMaintenanceOperations(maintenance.id).then(({ installed, removed }) => {
        setExistingInstalled(installed);
        setExistingRemoved(removed);
      });
    }
  }, [bikeId]);

  useEffect(() => {
    setPicking(false);
    setPickInstance("");
    setPickName("");
    setPickCost("");
    setTagFilterEnabled(true);
    setPanelError(null);
  }, [activeDefId]);

  const stagedInstanceIds = new Set(newInstalls.filter((d) => d.mode === "existing" && d.instanceId).map((d) => d.instanceId));
  const selectableInstances = availableInstances.filter((i) => !stagedInstanceIds.has(i.id));

  function getSlotState(defId: number): SlotState {
    const existingInstall = existingInstalled.find((m) => m.bike_part_def_id === defId);
    if (existingInstall) return { kind: "existing-install", mount: existingInstall };
    const existingRemoval = existingRemoved.find((m) => m.bike_part_def_id === defId);
    if (existingRemoval) return { kind: "existing-removal", mount: existingRemoval };
    const staged = newInstalls.find((d) => d.bikePartDefId === defId);
    if (staged) return { kind: "staged-install", draft: staged };
    const mount = openMounts.find((m) => m.bike_part_def_id === defId);
    if (mount && newUninstallIds.includes(mount.id)) return { kind: "staged-removal", mount };
    if (mount) return { kind: "occupied", mount };
    return { kind: "empty" };
  }

  function markerVariantFor(def: BikePartDef): string {
    const state = getSlotState(def.id);
    if (state.kind === "existing-install" || state.kind === "staged-install") return "install";
    if (state.kind === "existing-removal" || state.kind === "staged-removal") return "uninstall";
    if (state.kind === "occupied") return "filled";
    return "empty";
  }

  function stageUninstall(mount: PartMount) {
    setNewUninstallIds((ids) => [...ids, mount.id]);
  }

  function confirmPicking(defId: number) {
    if (pickInstance === "__new__") {
      if (!pickName.trim()) {
        setPanelError("Le nom de la nouvelle pièce est obligatoire.");
        return;
      }
      setNewInstalls((d) => [
        ...d,
        { key: newKey(), mode: "new", bikePartDefId: defId, instanceId: null, name: pickName.trim(), purchaseCost: pickCost },
      ]);
    } else if (pickInstance) {
      setNewInstalls((d) => [
        ...d,
        { key: newKey(), mode: "existing", bikePartDefId: defId, instanceId: Number(pickInstance), name: "", purchaseCost: "" },
      ]);
    } else {
      setPanelError("Choisissez un exemplaire ou créez-en un nouveau.");
      return;
    }
    setPicking(false);
    setPickInstance("");
    setPickName("");
    setPickCost("");
  }

  async function handleUndoExistingInstall(mount: PartMount) {
    if (!confirm(`Annuler l'installation de "${mount.part_instance_name}" ?`)) return;
    try {
      await maint.removeMountRecord(mount.id);
      setExistingInstalled((list) => list.filter((m) => m.id !== mount.id));
      refreshPickers();
    } catch (err) {
      setPanelError(errorMessage(err));
    }
  }

  async function handleUndoExistingRemoval(mount: PartMount) {
    if (!confirm(`Annuler la désinstallation de "${mount.part_instance_name}" ?`)) return;
    try {
      await maint.reopenMount(mount.id);
      setExistingRemoved((list) => list.filter((m) => m.id !== mount.id));
      refreshPickers();
    } catch (err) {
      setPanelError(errorMessage(err));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!bikeId) {
      setError("Sélectionnez un vélo.");
      return;
    }
    for (const draft of newInstalls) {
      if (draft.mode === "new" && !draft.name.trim()) {
        setError("Renseignez le nom de chaque nouvelle pièce à installer.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const input: MaintenanceInput = {
        bike_id: bikeId,
        date,
        comment: comment.trim() || null,
        cost: cost.trim() ? parseFloat(cost.replace(",", ".")) : null,
      };
      let maintenanceId: number;
      if (maintenance) {
        await maint.updateMaintenance(maintenance.id, input);
        maintenanceId = maintenance.id;
      } else {
        maintenanceId = await maint.addMaintenance(input);
      }

      for (const mountId of newUninstallIds) {
        await maint.uninstallPart(mountId, maintenanceId, date);
      }
      for (const draft of newInstalls) {
        const instanceId =
          draft.mode === "existing"
            ? (draft.instanceId as number)
            : await maint.addPartInstance(
                draft.name.trim(),
                draft.purchaseCost.trim() ? parseFloat(draft.purchaseCost.replace(",", ".")) : null,
                date,
                null
              );
        await maint.installPart(instanceId, bikeId, draft.bikePartDefId, maintenanceId, date);
      }

      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const activeDef = defs.find((d) => d.id === activeDefId) ?? null;
  const activeState = activeDefId != null ? getSlotState(activeDefId) : null;
  const activeDefTags = (activeDef?.tagIds ?? [])
    .map((id) => partTags.find((t) => t.id === id))
    .filter((t): t is PartTag => t != null);
  const hasTagFilter = activeDefTags.length > 0;
  const tagFilteredInstances =
    hasTagFilter && tagFilterEnabled
      ? selectableInstances.filter((i) => i.tags.some((t) => activeDefTags.some((at) => at.id === t.id)))
      : selectableInstances;

  return (
    <div>
      <div className="page-header">
        <button type="button" className="btn-back" onClick={onBack}>
          ← Retour
        </button>
        <h1 className="page-header__title">
          {maintenance ? "Modifier la maintenance" : "Ajouter une maintenance"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="card maintenance-form-card">
        <div className="field-row">
          <div className="field">
            <label htmlFor="maint-date">Date</label>
            <input id="maint-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="maint-bike">Vélo</label>
            <select id="maint-bike" value={bikeId} onChange={(e) => setBikeId(Number(e.target.value))}>
              {bikes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="maint-cost">Coût global (€)</label>
            <input
              id="maint-cost"
              type="text"
              inputMode="decimal"
              placeholder="Optionnel"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <div className="markdown-field__header">
            <label htmlFor="maint-comment">Commentaire (Markdown)</label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPreview((s) => !s)}>
              {showPreview ? "Écrire" : "Aperçu"}
            </button>
          </div>
          {showPreview ? (
            <div
              className="markdown-preview"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(comment) || "<p><em>Rien à prévisualiser</em></p>" }}
            />
          ) : (
            <textarea
              id="maint-comment"
              rows={8}
              placeholder="Ex. Révision annuelle : jeu de direction resserré, transmission nettoyée…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          )}
        </div>

        <div className="field">
          <label>Pièces</label>
          {defs.length === 0 ? (
            <div className="op-empty">
              Aucun emplacement défini. Configurez-les depuis l'onglet Emplacements pour pouvoir déclarer un changement de pièce.
            </div>
          ) : (
            <div className="parts-locations">
              <div className="parts-locations__main">
                <BikeDiagram defs={defs} onMarkerClick={(def) => setActiveDefId(def.id)} markerVariant={markerVariantFor} />
              </div>
              <div className="card parts-locations__panel">
                {!activeDef || !activeState ? (
                  <div className="empty-state">Cliquez sur un emplacement pour installer, remplacer ou retirer une pièce.</div>
                ) : picking ? (
                  <div>
                    <div className="section-title" style={{ marginTop: 0 }}>{activeDef.name}</div>
                    {hasTagFilter && (
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={tagFilterEnabled}
                          onChange={(e) => setTagFilterEnabled(e.target.checked)}
                        />
                        Filtrer par tags compatibles ({activeDefTags.map((t) => t.name).join(", ")})
                      </label>
                    )}
                    {hasTagFilter && tagFilterEnabled && tagFilteredInstances.length === 0 && selectableInstances.length > 0 && (
                      <div className="op-empty">Aucune pièce disponible avec ces tags. Décochez le filtre pour tout voir.</div>
                    )}
                    <div className="field">
                      <label htmlFor="pick-instance">Exemplaire</label>
                      <select id="pick-instance" value={pickInstance} onChange={(e) => setPickInstance(e.target.value)}>
                        <option value="">Choisir…</option>
                        {tagFilteredInstances.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} [{i.id}]
                          </option>
                        ))}
                        <option value="__new__">+ Nouvel exemplaire…</option>
                      </select>
                    </div>
                    {pickInstance === "__new__" && (
                      <>
                        <div className="field">
                          <label htmlFor="pick-name">Nom</label>
                          <input
                            id="pick-name"
                            autoFocus
                            placeholder="Ex. Continental GP5000"
                            value={pickName}
                            onChange={(e) => setPickName(e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="pick-cost">Prix d'achat (€)</label>
                          <input
                            id="pick-cost"
                            type="text"
                            inputMode="decimal"
                            placeholder="Optionnel"
                            value={pickCost}
                            onChange={(e) => setPickCost(e.target.value)}
                          />
                        </div>
                      </>
                    )}
                    {panelError && <div className="error-text">{panelError}</div>}
                    <div className="modal-actions">
                      <div />
                      <div className="modal-actions__right">
                        <button type="button" className="btn btn-secondary" onClick={() => setPicking(false)}>
                          Annuler
                        </button>
                        <button type="button" className="btn" onClick={() => confirmPicking(activeDef.id)}>
                          Confirmer
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="section-title" style={{ marginTop: 0 }}>{activeDef.name}</div>
                    {activeState.kind === "empty" && (
                      <>
                        <p className="empty-state" style={{ padding: "8px 0" }}>Emplacement vide.</p>
                        <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>
                          Installer une pièce
                        </button>
                      </>
                    )}
                    {activeState.kind === "occupied" && (
                      <>
                        <p style={{ fontSize: 13.5, marginBottom: 4 }}>
                          <strong>
                            <PartRefLabel
                              name={activeState.mount.part_instance_name}
                              id={activeState.mount.part_instance_id}
                            />
                          </strong>
                        </p>
                        <p style={{ fontSize: 12.5, color: "var(--secondary-ink)", marginBottom: 12 }}>
                          Monté depuis le {formatDate(activeState.mount.mounted_at)}
                        </p>
                        <div className="modal-actions">
                          <div />
                          <div className="modal-actions__right">
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => activeState.kind === "occupied" && stageUninstall(activeState.mount)}
                            >
                              Retirer
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => {
                                if (activeState.kind === "occupied") stageUninstall(activeState.mount);
                                setPicking(true);
                              }}
                            >
                              Remplacer
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    {activeState.kind === "staged-removal" && (
                      <>
                        <p style={{ fontSize: 13.5, marginBottom: 12 }}>
                          <strong>
                            <PartRefLabel
                              name={activeState.mount.part_instance_name}
                              id={activeState.mount.part_instance_id}
                            />
                          </strong>{" "}
                          sera retiré
                        </p>
                        <div className="modal-actions">
                          <div />
                          <div className="modal-actions__right">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                activeState.kind === "staged-removal" &&
                                setNewUninstallIds((ids) => ids.filter((id) => id !== activeState.mount.id))
                              }
                            >
                              Annuler le retrait
                            </button>
                            <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>
                              Installer un remplacement
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    {activeState.kind === "staged-install" && (
                      <>
                        <p style={{ fontSize: 13.5, marginBottom: 12 }}>
                          <strong>
                            {activeState.draft.mode === "existing"
                              ? (() => {
                                  const inst = availableInstances.find((i) => i.id === activeState.draft.instanceId);
                                  return inst ? `${inst.name} [${inst.id}]` : "…";
                                })()
                              : activeState.draft.name}
                          </strong>{" "}
                          sera installé
                        </p>
                        <div className="modal-actions">
                          <div />
                          <div className="modal-actions__right">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                activeState.kind === "staged-install" &&
                                setNewInstalls((list) => list.filter((d) => d.key !== activeState.draft.key))
                              }
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    {activeState.kind === "existing-install" && (
                      <>
                        <p style={{ fontSize: 13.5, marginBottom: 12 }}>
                          <strong>
                            <PartRefLabel
                              name={activeState.mount.part_instance_name}
                              id={activeState.mount.part_instance_id}
                            />
                          </strong>{" "}
                          installé par cette maintenance
                        </p>
                        <div className="modal-actions">
                          <div />
                          <div className="modal-actions__right">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => activeState.kind === "existing-install" && handleUndoExistingInstall(activeState.mount)}
                            >
                              Annuler cette installation
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    {activeState.kind === "existing-removal" && (
                      <>
                        <p style={{ fontSize: 13.5, marginBottom: 12 }}>
                          <strong>
                            <PartRefLabel
                              name={activeState.mount.part_instance_name}
                              id={activeState.mount.part_instance_id}
                            />
                          </strong>{" "}
                          retiré par cette maintenance
                        </p>
                        <div className="modal-actions">
                          <div />
                          <div className="modal-actions__right">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => activeState.kind === "existing-removal" && handleUndoExistingRemoval(activeState.mount)}
                            >
                              Annuler ce retrait
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <div>
            {onDelete && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  if (!confirm("Supprimer cette maintenance ? Les pièces qu'elle a installées seront retirées, celles qu'elle a désinstallées seront remontées.")) return;
                  try {
                    await onDelete();
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                Supprimer
              </button>
            )}
          </div>
          <div className="modal-actions__right">
            <button type="button" className="btn btn-secondary" onClick={onBack} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
