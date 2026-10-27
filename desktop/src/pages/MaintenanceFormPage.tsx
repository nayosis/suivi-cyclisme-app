import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as maint from "../maintenance-db";
import { errorMessage, formatDate, formatNumber, todayIso } from "../format";
import { renderMarkdown } from "../markdown";
import { BikeDiagram } from "../components/BikeDiagram";
import { PartInstanceFormModal } from "../components/PartInstanceFormModal";
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
  bikePartDefId: number;
  /** Pièce à installer (existante, ou créée à l'instant via « Nouvelle pièce… »). */
  instanceId: number;
}

/** Retrait programmé sur cette maintenance ; `scrap` = la pièce est aussi mise au rebut. */
interface NewUninstall {
  mountId: number;
  scrap: boolean;
}

/** Action choisie sur un emplacement, en attente de confirmation. */
type PendingAction = "remove" | "remove-scrap" | "replace" | "replace-scrap" | "install";

const ACTION_LABELS: { action: Exclude<PendingAction, "install">; short: string; full: string; danger: boolean }[] = [
  { action: "remove", short: "Retirer", full: "Retirer", danger: true },
  { action: "remove-scrap", short: "Retirer + rebut", full: "Retirer et mettre au rebut", danger: true },
  { action: "replace", short: "Remplacer", full: "Remplacer", danger: false },
  { action: "replace-scrap", short: "Remplacer + rebut", full: "Remplacer et mettre au rebut", danger: false },
];

const isReplaceAction = (a: PendingAction) => a === "replace" || a === "replace-scrap";
const isScrapAction = (a: PendingAction) => a === "remove-scrap" || a === "replace-scrap";

type SlotState =
  | { kind: "existing-install"; mount: PartMount }
  | { kind: "existing-removal"; mount: PartMount }
  | { kind: "existing-replace"; removed: PartMount; installed: PartMount }
  | { kind: "staged-install"; draft: NewInstallDraft }
  | { kind: "staged-removal"; mount: PartMount; scrap: boolean }
  | { kind: "staged-replace"; mount: PartMount; scrap: boolean; draft: NewInstallDraft }
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

/** Pastille d'état de rebut d'une pièce retirée. */
function ScrapPill({ scrap }: { scrap: boolean }) {
  return scrap ? (
    <span className="slot-pill slot-pill--scrap">Mise au rebut</span>
  ) : (
    <span className="slot-pill slot-pill--keep">Gardée en stock</span>
  );
}

/** Ce qu'il faut pour afficher une pièce sous forme de carte (même présentation que la liste de choix). */
interface PieceInfo {
  /** `null` pour une nouvelle pièce pas encore créée. */
  id: number | null;
  name: string;
  purchaseDate: string | null;
  purchaseCost: number | null;
  tags: PartTag[];
}

/** Carte d'une pièce : identifiant, nom, date d'achat, prix et tags. */
function PieceCard({ piece }: { piece: PieceInfo }) {
  return (
    <div className="pick-item pick-item--static">
      <span className="pick-item__id">{piece.id ?? "+"}</span>
      <span className="pick-item__name">
        {piece.id != null ? (
          <Link to="/maintenance/parts/$partId" params={{ partId: String(piece.id) }} className="link-button">
            {piece.name}
          </Link>
        ) : (
          piece.name
        )}
      </span>
      <span className="pick-item__meta">
        {piece.purchaseDate ? (
          <span>Acheté le {formatDate(piece.purchaseDate)}</span>
        ) : (
          <span className="pick-item__none">Date d'achat inconnue</span>
        )}
        {piece.purchaseCost != null && <span>{formatNumber(piece.purchaseCost, 2)} €</span>}
        {piece.tags.map((t) => (
          <span key={t.id} className="tag-chip">
            <span className="tag-chip__dot" style={{ background: t.color }} />
            {t.name}
          </span>
        ))}
      </span>
    </div>
  );
}

/** Pièce affichée dans un encadré : actuelle/retirée (`old`) ou à installer (`new`). */
function PartBox({
  kind,
  label,
  children,
  scrapped,
}: {
  kind: "old" | "new" | "empty";
  label: string;
  children: ReactNode;
  /** Atténue l'encadré d'une pièce mise au rebut. */
  scrapped?: boolean;
}) {
  return (
    <div className={`slot-part slot-part--${kind} ${scrapped ? "slot-part--gone" : ""}`}>
      <div className="slot-part__label">{label}</div>
      {children}
    </div>
  );
}

/**
 * Page d'ajout/modification d'une maintenance. Le vélo est représenté par le
 * schéma des emplacements : cliquer sur un emplacement ouvre, sous le schéma
 * et sur toute la largeur, l'encart de l'emplacement avec quatre actions
 * (retirer, retirer et mettre au rebut, remplacer, remplacer et mettre au
 * rebut), datées et rattachées à cette maintenance. Le commentaire est un
 * champ Markdown multiligne avec aperçu.
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
  /** Tous les exemplaires (même montés ou au rebut), pour afficher les cartes de la liste des changements. */
  const [allInstances, setAllInstances] = useState<PartInstance[]>([]);
  const [openMounts, setOpenMounts] = useState<PartMount[]>([]);
  const [existingInstalled, setExistingInstalled] = useState<PartMount[]>([]);
  const [existingRemoved, setExistingRemoved] = useState<PartMount[]>([]);

  const [newInstalls, setNewInstalls] = useState<NewInstallDraft[]>([]);
  const [newUninstalls, setNewUninstalls] = useState<NewUninstall[]>([]);

  const [activeDefId, setActiveDefId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [pickInstance, setPickInstance] = useState("");
  /** Fenêtre de création d'une pièce (créée immédiatement en base, avant la validation de la maintenance). */
  const [creatingPart, setCreatingPart] = useState(false);
  /** Pièces créées depuis cette page, pour les signaler dans la liste. */
  const [createdIds, setCreatedIds] = useState<number[]>([]);
  const [pickSearch, setPickSearch] = useState("");
  const [tagFilterEnabled, setTagFilterEnabled] = useState(true);
  const [panelError, setPanelError] = useState<string | null>(null);

  async function refreshPickers() {
    const [d, tags, available, all, open] = await Promise.all([
      maint.listBikePartDefs(),
      maint.listPartTags(),
      maint.listAvailablePartInstances(),
      maint.listPartInstances(),
      bikeId ? maint.getOpenMountsForBike(bikeId) : Promise.resolve([]),
    ]);
    setDefs(d);
    setPartTags(tags);
    setAvailableInstances(available);
    setAllInstances(all);
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
    resetPick();
    setPendingAction(null);
    setTagFilterEnabled(true);
  }, [activeDefId]);

  function resetPick() {
    setPickInstance("");
    setPickSearch("");
    setPanelError(null);
  }

  const stagedInstanceIds = new Set(newInstalls.map((d) => d.instanceId));
  const selectableInstances = availableInstances.filter((i) => !stagedInstanceIds.has(i.id));

  function getSlotState(defId: number): SlotState {
    const existingInstall = existingInstalled.find((m) => m.bike_part_def_id === defId);
    const existingRemoval = existingRemoved.find((m) => m.bike_part_def_id === defId);
    if (existingInstall && existingRemoval) return { kind: "existing-replace", removed: existingRemoval, installed: existingInstall };
    if (existingInstall) return { kind: "existing-install", mount: existingInstall };
    if (existingRemoval) return { kind: "existing-removal", mount: existingRemoval };

    const stagedInstall = newInstalls.find((d) => d.bikePartDefId === defId);
    const mount = openMounts.find((m) => m.bike_part_def_id === defId);
    const stagedUninstall = mount ? newUninstalls.find((u) => u.mountId === mount.id) : undefined;
    if (stagedInstall && mount && stagedUninstall) {
      return { kind: "staged-replace", mount, scrap: stagedUninstall.scrap, draft: stagedInstall };
    }
    if (stagedInstall) return { kind: "staged-install", draft: stagedInstall };
    if (mount && stagedUninstall) return { kind: "staged-removal", mount, scrap: stagedUninstall.scrap };
    if (mount) return { kind: "occupied", mount };
    return { kind: "empty" };
  }

  function markerVariantFor(def: BikePartDef): string {
    const state = getSlotState(def.id);
    if (state.kind === "existing-install" || state.kind === "staged-install") return "install";
    if (state.kind === "existing-replace" || state.kind === "staged-replace") return "install";
    if (state.kind === "existing-removal" || state.kind === "staged-removal") return "uninstall";
    if (state.kind === "occupied") return "filled";
    return "empty";
  }

  function stageUninstall(mount: PartMount, scrap: boolean) {
    setNewUninstalls((list) => [...list, { mountId: mount.id, scrap }]);
  }

  /** Annule tout ce qui est programmé (retrait et/ou installation) sur cet emplacement. */
  function cancelStaged(defId: number) {
    const mount = openMounts.find((m) => m.bike_part_def_id === defId);
    setNewInstalls((list) => list.filter((d) => d.bikePartDefId !== defId));
    if (mount) setNewUninstalls((list) => list.filter((u) => u.mountId !== mount.id));
  }

  /** Construit l'installation à partir de la pièce choisie ; `null` (avec message) si aucune. */
  function buildDraft(defId: number): NewInstallDraft | null {
    if (pickInstance) {
      return { key: newKey(), bikePartDefId: defId, instanceId: Number(pickInstance) };
    }
    setPanelError("Choisissez une pièce ou créez-en une nouvelle.");
    return null;
  }

  /** Crée la pièce tout de suite en base, la rend disponible dans la liste et la sélectionne. */
  async function handleCreatePart(
    name: string,
    purchaseCost: number | null,
    purchaseDate: string | null,
    retiredDate: string | null,
    tagIds: number[]
  ) {
    const id = await maint.addPartInstance(name, purchaseCost, purchaseDate, retiredDate, tagIds);
    await refreshPickers();
    setCreatedIds((ids) => [...ids, id]);
    setPickInstance(String(id));
    setPickSearch("");
    setPanelError(null);
    setCreatingPart(false);
  }

  /** Valide l'action choisie : programme le retrait et/ou l'installation sur cet emplacement. */
  function confirmPending(defId: number, mount: PartMount | null) {
    if (!pendingAction) return;
    let draft: NewInstallDraft | null = null;
    if (pendingAction === "install" || isReplaceAction(pendingAction)) {
      draft = buildDraft(defId);
      if (!draft) return;
    }
    if (pendingAction !== "install" && mount) stageUninstall(mount, isScrapAction(pendingAction));
    if (draft) {
      const created = draft;
      setNewInstalls((list) => [...list, created]);
    }
    setPendingAction(null);
    resetPick();
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

  async function handleUndoExistingReplace(removed: PartMount, installed: PartMount) {
    if (!confirm(`Annuler le remplacement de "${removed.part_instance_name}" par "${installed.part_instance_name}" ?`)) return;
    try {
      await maint.removeMountRecord(installed.id);
      await maint.reopenMount(removed.id);
      setExistingInstalled((list) => list.filter((m) => m.id !== installed.id));
      setExistingRemoved((list) => list.filter((m) => m.id !== removed.id));
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

      for (const { mountId, scrap } of newUninstalls) {
        await maint.uninstallPart(mountId, maintenanceId, date, scrap);
      }
      for (const draft of newInstalls) {
        await maint.installPart(draft.instanceId, bikeId, draft.bikePartDefId, maintenanceId, date);
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

  const pickQuery = pickSearch.trim().toLowerCase();
  const matchedInstances = pickQuery
    ? tagFilteredInstances.filter((i) => i.name.toLowerCase().includes(pickQuery) || String(i.id) === pickQuery)
    : tagFilteredInstances;
  // La pièce choisie (ex. tout juste créée) reste visible même si un filtre ou la recherche l'écarterait.
  const pickedInstance = selectableInstances.find((i) => String(i.id) === pickInstance);
  const searchedInstances =
    pickedInstance && !matchedInstances.some((i) => i.id === pickedInstance.id)
      ? [pickedInstance, ...matchedInstances]
      : matchedInstances;

  /** Choix de la pièce à installer : recherche, liste de cartes et création d'une nouvelle pièce. */
  function renderPicker() {
    return (
      <>
        {hasTagFilter && (
          <label className="checkbox-row" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={tagFilterEnabled} onChange={(e) => setTagFilterEnabled(e.target.checked)} />
            Filtrer par tags compatibles ({activeDefTags.map((t) => t.name).join(", ")})
          </label>
        )}
        {hasTagFilter && tagFilterEnabled && tagFilteredInstances.length === 0 && selectableInstances.length > 0 && (
          <div className="op-empty">Aucune pièce disponible avec ces tags. Décochez le filtre pour tout voir.</div>
        )}
        <div className="field">
          <label htmlFor="pick-search">Pièce à installer</label>
          <input
            id="pick-search"
            type="search"
            placeholder="Rechercher par nom ou identifiant…"
            value={pickSearch}
            onChange={(e) => setPickSearch(e.target.value)}
          />
        </div>
        <div className="pick-list" role="listbox" aria-label="Pièces disponibles">
          <button
            type="button"
            role="option"
            aria-selected={false}
            className="pick-item pick-item--new"
            onClick={() => setCreatingPart(true)}
          >
            <span className="pick-item__id">+</span>
            <span className="pick-item__name">Nouvelle pièce…</span>
            <span className="pick-item__radio" />
            <span className="pick-item__meta">Ouvre la fenêtre de création</span>
          </button>
          {searchedInstances.map((i) => (
            <button
              key={i.id}
              type="button"
              role="option"
              aria-selected={pickInstance === String(i.id)}
              className="pick-item"
              onClick={() => setPickInstance(String(i.id))}
            >
              <span className="pick-item__id">{i.id}</span>
              <span className="pick-item__name">{i.name}</span>
              <span className="pick-item__radio" />
              <span className="pick-item__meta">
                {i.purchase_date ? (
                  <span>Acheté le {formatDate(i.purchase_date)}</span>
                ) : (
                  <span className="pick-item__none">Date d'achat inconnue</span>
                )}
                {i.purchase_cost != null && <span>{formatNumber(i.purchase_cost, 2)} €</span>}
                {i.tags.map((t) => (
                  <span key={t.id} className="tag-chip">
                    <span className="tag-chip__dot" style={{ background: t.color }} />
                    {t.name}
                  </span>
                ))}
                {createdIds.includes(i.id) && <span className="slot-pill slot-pill--keep">Créée</span>}
              </span>
            </button>
          ))}
          {searchedInstances.length === 0 && selectableInstances.length > 0 && pickSearch.trim() && (
            <div className="op-empty">Aucune pièce ne correspond à cette recherche.</div>
          )}
        </div>
      </>
    );
  }

  /** Pièce choisie dans la liste (avec sa date d'achat si connue), pour le récapitulatif. */
  function chosenPieceLabel(): ReactNode {
    const inst = availableInstances.find((i) => String(i.id) === pickInstance);
    if (!inst) return "la pièce choisie";
    return (
      <strong>
        [{inst.id}] {inst.name}
        {inst.purchase_date ? ` (achetée le ${formatDate(inst.purchase_date)})` : ""}
      </strong>
    );
  }

  /** Phrase récapitulant ce qui sera enregistré pour l'action choisie. */
  function pendingRecap(action: PendingAction, mount: PartMount | null) {
    if (action === "install") return <>Une pièce sera installée sur cet emplacement.</>;
    const old = mount ? <strong>« {mount.part_instance_name} »</strong> : null;
    const fate = isScrapAction(action) ? (
      <>
        déposée et <strong>mise au rebut</strong>
      </>
    ) : (
      <>déposée et gardée en stock</>
    );
    return (
      <>
        Sera enregistré : {old} {fate}
        {isReplaceAction(action) ? <>, remplacée par {chosenPieceLabel()}.</> : ". L'emplacement restera vide."}
      </>
    );
  }

  /** Infos d'une pièce existante, retrouvées par identifiant (repli sur le nom connu). */
  function pieceById(id: number, fallbackName: string): PieceInfo {
    const inst = allInstances.find((i) => i.id === id);
    return {
      id,
      name: inst?.name ?? fallbackName,
      purchaseDate: inst?.purchase_date ?? null,
      purchaseCost: inst?.purchase_cost ?? null,
      tags: inst?.tags ?? [],
    };
  }

  /** Pièce programmée à l'installation. */
  function pieceFromDraft(draft: NewInstallDraft): PieceInfo {
    return pieceById(draft.instanceId, "…");
  }

  /** Résumé d'un emplacement modifié (programmé ou déjà enregistré), `null` s'il est inchangé. */
  function describeChange(def: BikePartDef, state: SlotState) {
    const mountPiece = (m: PartMount) => pieceById(m.part_instance_id, m.part_instance_name);
    switch (state.kind) {
      case "staged-removal":
        return {
          removed: mountPiece(state.mount),
          removedScrap: state.scrap,
          installed: null,
          note: "Retrait programmé, il sera enregistré avec la maintenance.",
          undoLabel: "Annuler le retrait",
          onUndo: () => cancelStaged(def.id),
        };
      case "staged-install":
        return {
          removed: null,
          removedScrap: false,
          installed: pieceFromDraft(state.draft),
          note: "Installation programmée, elle sera enregistrée avec la maintenance.",
          undoLabel: "Annuler",
          onUndo: () => cancelStaged(def.id),
        };
      case "staged-replace":
        return {
          removed: mountPiece(state.mount),
          removedScrap: state.scrap,
          installed: pieceFromDraft(state.draft),
          note: "Remplacement programmé, il sera enregistré avec la maintenance.",
          undoLabel: "Annuler le remplacement",
          onUndo: () => cancelStaged(def.id),
        };
      case "existing-install":
        return {
          removed: null,
          removedScrap: false,
          installed: mountPiece(state.mount),
          note: "Installée par cette maintenance.",
          undoLabel: "Annuler cette installation",
          onUndo: () => handleUndoExistingInstall(state.mount),
        };
      case "existing-removal":
        return {
          removed: mountPiece(state.mount),
          removedScrap: state.mount.part_instance_retired_date === state.mount.unmounted_at,
          installed: null,
          note: "Retirée par cette maintenance.",
          undoLabel: "Annuler ce retrait",
          onUndo: () => handleUndoExistingRemoval(state.mount),
        };
      case "existing-replace":
        return {
          removed: mountPiece(state.removed),
          removedScrap: state.removed.part_instance_retired_date === state.removed.unmounted_at,
          installed: mountPiece(state.installed),
          note: "Remplacée par cette maintenance.",
          undoLabel: "Annuler ce remplacement",
          onUndo: () => handleUndoExistingReplace(state.removed, state.installed),
        };
      default:
        return null;
    }
  }

  /** Colonne de droite : un encadré par emplacement modifié, avec l'ancienne et la nouvelle pièce en cartes. */
  function renderChangesList() {
    const cards = defs
      .map((def) => ({ def, change: describeChange(def, getSlotState(def.id)) }))
      .filter((c) => c.change != null);
    if (cards.length === 0) {
      return (
        <div className="card maintenance-change-card">
          <div className="empty-state" style={{ padding: "24px 12px" }}>
            Aucun changement pour l'instant. Cliquez sur un emplacement du schéma pour retirer ou remplacer une pièce.
          </div>
        </div>
      );
    }
    return (
      <>
        {cards.map(({ def, change }) => {
          const c = change!;
          return (
            <div
              key={def.id}
              className={`card maintenance-change-card ${def.id === activeDefId ? "maintenance-change-card--active" : ""}`}
            >
              <div className="slot-panel__header">
                <button type="button" className="link-button slot-panel__title" onClick={() => setActiveDefId(def.id)}>
                  {def.name}
                </button>
              </div>
              <div className="slot-change">
                {c.removed ? (
                  <PartBox kind="old" label="Pièce retirée" scrapped={c.removedScrap}>
                    <PieceCard piece={c.removed} />
                    <ScrapPill scrap={c.removedScrap} />
                  </PartBox>
                ) : (
                  <PartBox kind="empty" label="Avant">
                    <div className="slot-part__name slot-part__name--muted">Emplacement vide</div>
                  </PartBox>
                )}
                {c.installed ? (
                  <PartBox kind="new" label="Nouvelle pièce">
                    <PieceCard piece={c.installed} />
                  </PartBox>
                ) : (
                  <PartBox kind="empty" label="Après">
                    <div className="slot-part__name slot-part__name--muted">Laissé vide</div>
                  </PartBox>
                )}
              </div>
              <div className="slot-recap">{c.note}</div>
              <div className="modal-actions">
                <div />
                <button type="button" className="btn btn-secondary btn-sm" onClick={c.onUndo}>
                  {c.undoLabel}
                </button>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  function renderPanel() {
    if (!activeDef || !activeState) {
      return <div className="empty-state" style={{ padding: "24px 20px" }}>Cliquez sur un emplacement pour installer, remplacer ou retirer une pièce.</div>;
    }

    const header = (actions?: ReactNode) => (
      <div className="slot-panel__header">
        <h3 className="slot-panel__title">{activeDef.name}</h3>
        {actions}
      </div>
    );

    const footer = (onConfirm: () => void, confirmLabel: string, danger = false) => (
      <div className="modal-actions">
        <div />
        <div className="modal-actions__right">
          <button type="button" className="btn btn-secondary" onClick={() => { setPendingAction(null); resetPick(); }}>
            Annuler
          </button>
          <button type="button" className={`btn ${danger ? "btn-danger" : ""}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    );

    if (activeState.kind === "empty") {
      return (
        <>
          {header(
            pendingAction !== "install" && (
              <button type="button" className="btn btn-sm" onClick={() => setPendingAction("install")}>
                Installer une pièce
              </button>
            )
          )}
          {pendingAction === "install" ? (
            <>
              <PartBox kind="new" label="Nouvelle pièce">
                {renderPicker()}
              </PartBox>
              {panelError && <div className="error-text">{panelError}</div>}
              {footer(() => confirmPending(activeDef.id, null), "Ajouter à la maintenance")}
            </>
          ) : (
            <p className="empty-state" style={{ padding: "8px 0" }}>Emplacement vide.</p>
          )}
        </>
      );
    }

    if (activeState.kind === "occupied") {
      const mount = activeState.mount;
      const action = pendingAction;
      const replacing = action != null && isReplaceAction(action);
      return (
        <>
          {header(
            <div className="segmented segmented--wrap" role="group" aria-label="Action sur la pièce">
              {ACTION_LABELS.map((a) => (
                <button
                  key={a.action}
                  type="button"
                  title={a.full}
                  className={`segmented__option ${action === a.action ? "active" : ""} ${a.danger ? "segmented__option--danger" : ""}`}
                  onClick={() => {
                    resetPick();
                    setPendingAction(action === a.action ? null : a.action);
                  }}
                >
                  {a.short}
                </button>
              ))}
            </div>
          )}
          <div className="slot-change">
            <PartBox kind="old" label="Montée actuellement" scrapped={action != null && isScrapAction(action)}>
              <div className="slot-part__name">
                <PartRefLabel name={mount.part_instance_name} id={mount.part_instance_id} />
              </div>
              <div className="slot-part__sub">Montée depuis le {formatDate(mount.mounted_at)}</div>
              {action && action !== "install" && <ScrapPill scrap={isScrapAction(action)} />}
            </PartBox>
            {action === null ? (
              <PartBox kind="empty" label="Action">
                <div className="slot-part__sub">Choisissez une action ci-dessus.</div>
              </PartBox>
            ) : replacing ? (
              <PartBox kind="new" label="Nouvelle pièce">
                {renderPicker()}
              </PartBox>
            ) : (
              <PartBox kind="empty" label="Emplacement">
                <div className="slot-part__name slot-part__name--muted">Laissé vide</div>
                <div className="slot-part__sub">Rien n'est monté après cette maintenance.</div>
              </PartBox>
            )}
          </div>
          {action && (
            <>
              <div className="slot-recap">{pendingRecap(action, mount)}</div>
              {panelError && <div className="error-text">{panelError}</div>}
              {footer(() => confirmPending(activeDef.id, mount), "Ajouter à la maintenance", !replacing && isScrapAction(action))}
            </>
          )}
        </>
      );
    }

    // Emplacement déjà modifié : le détail est dans la liste des changements ; ici on ne garde que la suite possible.
    return (
      <>
        {header()}
        <div className="slot-recap" style={{ marginTop: 0 }}>
          Cet emplacement est déjà modifié : voir « Liste des changements ».
        </div>
        {activeState.kind === "staged-removal" && pendingAction !== "install" && (
          <div className="modal-actions">
            <div />
            <button type="button" className="btn btn-sm" onClick={() => setPendingAction("install")}>
              Installer une pièce
            </button>
          </div>
        )}
        {activeState.kind === "staged-removal" && pendingAction === "install" && (
          <>
            <PartBox kind="new" label="Nouvelle pièce">
              {renderPicker()}
            </PartBox>
            {panelError && <div className="error-text">{panelError}</div>}
            {footer(() => confirmPending(activeDef.id, null), "Ajouter à la maintenance")}
          </>
        )}
      </>
    );
  }

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

      <form onSubmit={handleSubmit} className="maintenance-edit-layout">
      <div className="card maintenance-form-card maintenance-edit-layout__main">
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
            <div className="parts-locations parts-locations--stacked">
              <div className="parts-locations__main">
                <BikeDiagram
                  defs={defs}
                  onMarkerClick={(def) => setActiveDefId(def.id)}
                  markerVariant={markerVariantFor}
                  isSelected={(def) => def.id === activeDefId}
                />
              </div>
              <div className="card parts-locations__panel">{renderPanel()}</div>
            </div>
          )}
        </div>

      </div>

      <aside className="maintenance-changes">
        <h2 className="maintenance-changes__title">Liste des changements</h2>
        {renderChangesList()}

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <div>
            {onDelete && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  if (!confirm("Supprimer cette maintenance ? Les pièces qu'elle a installées seront retirées, celles qu'elle a désinstallées seront remontées (et remises en service si elles avaient été mises au rebut).")) return;
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
      </aside>
      </form>

      {creatingPart && (
        <PartInstanceFormModal
          allTags={partTags}
          initialTagIds={activeDefTags.map((t) => t.id)}
          defaultPurchaseDate={date}
          hideRetiredDate
          submitLabel="Créer la pièce"
          onSave={handleCreatePart}
          onClose={() => setCreatingPart(false)}
        />
      )}
    </div>
  );
}
