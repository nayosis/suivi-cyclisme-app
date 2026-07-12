import { FormEvent, useEffect, useState } from "react";
import * as maint from "../maintenance-db";
import { errorMessage, formatDate, formatNumber } from "../format";
import type { PartInstanceStats, PartMount, PartTag } from "../types";

interface PartDetailPageProps {
  instance: PartInstanceStats;
  allTags: PartTag[];
  onBack: () => void;
  onSave: (
    name: string,
    purchaseCost: number | null,
    purchaseDate: string | null,
    retiredDate: string | null,
    tagIds: number[]
  ) => Promise<void>;
  onDelete: () => Promise<void>;
}

type EventKind = "purchase" | "mount" | "unmount" | "retired";

interface TimelineEvent {
  date: string;
  label: string;
  kind: EventKind;
}

interface TimelineNode {
  date: string;
  events: TimelineEvent[];
}

const KIND_ORDER: Record<EventKind, number> = { purchase: 0, mount: 1, unmount: 2, retired: 3 };

function buildTimeline(purchaseDate: string | null, retiredDate: string | null, mounts: PartMount[]): TimelineNode[] {
  const events: TimelineEvent[] = [];
  if (purchaseDate) {
    events.push({ date: purchaseDate, label: "Achat", kind: "purchase" });
  }
  for (const m of mounts) {
    events.push({
      date: m.mounted_at,
      label: `Montage sur ${m.bike_name} (${m.bike_part_def_name})`,
      kind: "mount",
    });
    if (m.unmounted_at) {
      events.push({
        date: m.unmounted_at,
        label: `Démontage de ${m.bike_name} (${m.bike_part_def_name})`,
        kind: "unmount",
      });
    }
  }
  if (retiredDate) {
    events.push({ date: retiredDate, label: "Mise au rebut", kind: "retired" });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  const nodes: TimelineNode[] = [];
  for (const e of events) {
    const last = nodes[nodes.length - 1];
    if (last && last.date === e.date) {
      last.events.push(e);
    } else {
      nodes.push({ date: e.date, events: [e] });
    }
  }
  return nodes;
}

/**
 * Fiche complète d'un exemplaire de pièce : identité et champs modifiables
 * (nom, prix, dates, tags), statut de montage actuel, kilométrage cumulé et
 * frise chronologique complète (achat → montages/démontages → mise au
 * rebut). Remplace les anciennes modales séparées d'édition et d'historique.
 */
export function PartDetailPage({ instance, allTags, onBack, onSave, onDelete }: PartDetailPageProps) {
  const [name, setName] = useState(instance.name);
  const [purchaseCost, setPurchaseCost] = useState(instance.purchase_cost != null ? String(instance.purchase_cost) : "");
  const [purchaseDate, setPurchaseDate] = useState(instance.purchase_date ?? "");
  const [retiredDate, setRetiredDate] = useState(instance.retired_date ?? "");
  const [tagIds, setTagIds] = useState<Set<number>>(new Set(instance.tags.map((t) => t.id)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [mounts, setMounts] = useState<PartMount[] | null>(null);

  useEffect(() => {
    maint.getMountsForInstance(instance.part_instance_id).then(setMounts);
  }, [instance.part_instance_id]);

  const nodes = mounts ? buildTimeline(instance.purchase_date, instance.retired_date, mounts) : [];

  function toggleTag(id: number) {
    setTagIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(
        name.trim(),
        purchaseCost.trim() ? parseFloat(purchaseCost.replace(",", ".")) : null,
        purchaseDate || null,
        retiredDate || null,
        Array.from(tagIds)
      );
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  async function handleDeleteClick() {
    if (!confirm(`Supprimer l'exemplaire "${instance.name}" ?`)) return;
    try {
      await onDelete();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-header">
        <button type="button" className="btn-back" onClick={onBack}>
          ← Retour
        </button>
        <h1 className="page-header__title">
          {instance.name} [{instance.part_instance_id}]
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="card maintenance-form-card">
        <div className="field">
          <label htmlFor="part-detail-name">Nom</label>
          <input id="part-detail-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="part-detail-cost">Prix d'achat (€)</label>
            <input
              id="part-detail-cost"
              type="text"
              inputMode="decimal"
              placeholder="Optionnel"
              value={purchaseCost}
              onChange={(e) => setPurchaseCost(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="part-detail-purchase-date">Date d'achat</label>
            <input
              id="part-detail-purchase-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="part-detail-retired-date">Date de mise au rebut</label>
            <input
              id="part-detail-retired-date"
              type="date"
              value={retiredDate}
              onChange={(e) => setRetiredDate(e.target.value)}
            />
          </div>
        </div>
        {allTags.length > 0 && (
          <div className="field">
            <label>Tags</label>
            <div className="tag-toggle-list">
              {allTags.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  className={`tag-chip tag-chip--toggle ${tagIds.has(tag.id) ? "active" : ""}`}
                  onClick={() => toggleTag(tag.id)}
                >
                  <span className="tag-chip__dot" style={{ background: tag.color }} />
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label>Statut actuel</label>
          <p style={{ fontSize: 13.5, margin: "4px 0 0" }}>
            {instance.retired_date ? (
              `Mis au rebut le ${formatDate(instance.retired_date)}`
            ) : instance.currentMount ? (
              <>
                {instance.currentMount.bike_part_def_name} sur{" "}
                <strong style={{ color: instance.currentMount.bike_color }}>{instance.currentMount.bike_name}</strong>{" "}
                depuis le {formatDate(instance.currentMount.mounted_at)}
              </>
            ) : (
              "Non monté"
            )}
          </p>
          <p style={{ fontSize: 12.5, color: "var(--secondary-ink)", margin: "4px 0 0" }}>
            Kilométrage cumulé : {formatNumber(instance.total_km)} km · {formatNumber(instance.total_elevation_m)} m D+
          </p>
        </div>

        <div className="section-title" style={{ marginTop: 20 }}>Historique de montage</div>
        {mounts === null ? (
          <div className="empty-state">Chargement…</div>
        ) : nodes.length === 0 ? (
          <div className="empty-state">Aucun historique pour cette pièce.</div>
        ) : (
          <div className="timeline">
            {nodes.map((node, i) => (
              <div className="timeline__node" key={node.date}>
                <div className="timeline__marker">
                  <span className="timeline__dot" />
                  {i < nodes.length - 1 && <span className="timeline__line" />}
                </div>
                <div className="timeline__content">
                  <div className="timeline__date">{formatDate(node.date)}</div>
                  {node.events.map((e, j) => (
                    <div key={j} className={`timeline__label timeline__label--${e.kind}`}>
                      {e.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <div>
            <button type="button" className="btn btn-danger" onClick={handleDeleteClick}>
              Supprimer
            </button>
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
