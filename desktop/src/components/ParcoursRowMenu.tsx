import { useEffect, useState } from "react";
import type { ParcoursFolder } from "../types";
import { useFixedMenu } from "../use-fixed-menu";

interface ParcoursRowMenuProps {
  siteUrl: string | null;
  folders: ParcoursFolder[];
  /** Dossier actuel du parcours (`null` = non classé). */
  folderId: number | null;
  onOpenSite: () => void;
  onMove: (folderId: number | null) => void;
}

/** Bouton « ⋯ » d'une ligne de la liste des parcours : lien du site et déplacement vers un dossier. */
export function ParcoursRowMenu({ siteUrl, folders, folderId, onOpenSite, onMove }: ParcoursRowMenuProps) {
  const { open, pos, buttonRef, menuRef, toggle, close } = useFixedMenu(200);
  const [moveOpen, setMoveOpen] = useState(false);

  useEffect(() => {
    if (!open) setMoveOpen(false);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-secondary btn-sm part-actions__button"
        aria-label="Autres actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        ⋯
      </button>
      {open && (
        <div ref={menuRef} className="part-actions__menu" role="menu" style={pos}>
          <button
            type="button"
            role="menuitem"
            className="part-actions__item"
            disabled={!siteUrl}
            onClick={() => {
              close();
              onOpenSite();
            }}
          >
            <span>
              Voir le site ↗
              {!siteUrl && <small>Aucun lien renseigné</small>}
            </span>
          </button>
          <div className="part-actions__sep" />
          <div className="part-actions__fly">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={moveOpen}
              className="part-actions__item part-actions__item--sub"
              onClick={() => setMoveOpen((o) => !o)}
            >
              <span>Déplacer vers un dossier</span>
            </button>
            {moveOpen && (
              <div className="part-actions__menu part-actions__menu--sub" role="menu">
                {[{ id: null, name: "Non classé" }, ...folders].map((f) => (
                  <button
                    key={f.id ?? "none"}
                    type="button"
                    role="menuitemradio"
                    aria-checked={f.id === folderId}
                    className="part-actions__tag"
                    onClick={() => {
                      close();
                      if (f.id !== folderId) onMove(f.id);
                    }}
                  >
                    {f.name}
                    <span className={`part-actions__check ${f.id === folderId ? "on" : ""}`} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
