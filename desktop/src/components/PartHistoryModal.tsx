import { useEffect, useState } from "react";
import * as maint from "../maintenance-db";
import { formatDate } from "../format";
import type { PartMount } from "../types";
import { Modal } from "./Modal";

interface PartHistoryModalProps {
  instanceId: number;
  instanceName: string;
  purchaseDate: string | null;
  retiredDate: string | null;
  onClose: () => void;
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

function buildTimeline(
  purchaseDate: string | null,
  retiredDate: string | null,
  mounts: PartMount[]
): TimelineNode[] {
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

/** Frise chronologique de l'historique complet d'un exemplaire de pièce (achat, montages/démontages, mise au rebut). */
export function PartHistoryModal({ instanceId, instanceName, purchaseDate, retiredDate, onClose }: PartHistoryModalProps) {
  const [mounts, setMounts] = useState<PartMount[] | null>(null);

  useEffect(() => {
    maint.getMountsForInstance(instanceId).then(setMounts);
  }, [instanceId]);

  const nodes = mounts ? buildTimeline(purchaseDate, retiredDate, mounts) : [];

  return (
    <Modal title={`Historique — ${instanceName}`} onClose={onClose}>
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
      <div className="modal-actions">
        <div />
        <div className="modal-actions__right">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}
