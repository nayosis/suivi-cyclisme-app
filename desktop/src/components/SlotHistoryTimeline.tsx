import { Link } from "@tanstack/react-router";
import { formatDate, formatNumber } from "../format";
import type { SlotMount } from "../types";

interface SlotHistoryTimelineProps {
  history: SlotMount[] | null;
}

/** Frise chronologique des pièces montées sur un emplacement donné d'un vélo donné, avec le kilométrage parcouru par période. */
export function SlotHistoryTimeline({ history }: SlotHistoryTimelineProps) {
  if (history === null) {
    return <div className="empty-state">Chargement…</div>;
  }
  if (history.length === 0) {
    return <div className="empty-state">Aucun historique pour cet emplacement sur ce vélo.</div>;
  }
  return (
    <div className="timeline">
      {history.map((h, i) => (
        <div className="timeline__node" key={h.id}>
          <div className="timeline__marker">
            <span className="timeline__dot" />
            {i < history.length - 1 && <span className="timeline__line" />}
          </div>
          <div className="timeline__content">
            <div className="timeline__date">
              {formatDate(h.mounted_at)} → {h.unmounted_at ? formatDate(h.unmounted_at) : "aujourd'hui"}
            </div>
            <div className="timeline__label timeline__label--mount">
              {h.part_instance_name}{" "}
              <Link to="/maintenance/parts/$partId" params={{ partId: String(h.part_instance_id) }} className="link-button">
                [{h.part_instance_id}]
              </Link>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--secondary-ink)" }}>
              {formatNumber(h.total_km)} km · {formatNumber(h.total_elevation_m)} m D+
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
