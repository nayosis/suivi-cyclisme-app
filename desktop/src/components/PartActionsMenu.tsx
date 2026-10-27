import { useEffect, useRef, useState } from "react";
import type { PartTag } from "../types";

interface PartActionsMenuProps {
  /** Mise au rebut déjà enregistrée (`null` si la pièce est en service). */
  retiredDate: string | null;
  /** Pièce actuellement montée sur un vélo : le rebut est alors impossible. */
  mounted: boolean;
  allTags: PartTag[];
  /** Identifiants des tags déjà affectés à la pièce. */
  tagIds: number[];
  /** Libellé de la date du jour, affiché dans l'option de mise au rebut. */
  todayLabel: string;
  onScrap: () => void;
  onRestore: () => void;
  onToggleTag: (tagId: number, on: boolean) => void;
}

/**
 * Bouton « ⋯ » d'une ligne du tableau des pièces : mise au rebut à la date du
 * jour (ou remise en service) et affectation de tags dans un sous-menu. Le
 * menu est en position fixe pour ne pas être rogné par le tableau défilant.
 */
export function PartActionsMenu({
  retiredDate,
  mounted,
  allTags,
  tagIds,
  todayLabel,
  onScrap,
  onRestore,
  onToggleTag,
}: PartActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setTagsOpen(false);
  }

  function toggle() {
    if (open) return close();
    const rect = buttonRef.current!.getBoundingClientRect();
    const right = window.innerWidth - rect.right;
    // Ouvre vers le haut quand il n'y a pas assez de place sous le bouton.
    setPos(
      rect.bottom + 140 > window.innerHeight
        ? { bottom: window.innerHeight - rect.top + 6, right }
        : { top: rect.bottom + 6, right }
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
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
          {retiredDate ? (
            <button
              type="button"
              role="menuitem"
              className="part-actions__item"
              onClick={() => {
                close();
                onRestore();
              }}
            >
              <span>
                Remettre en service
                <small>Efface la date de rebut</small>
              </span>
            </button>
          ) : mounted ? (
            <button type="button" role="menuitem" className="part-actions__item" disabled>
              <span>
                Mettre au rebut
                <small>Montée sur un vélo : retirez-la d'abord</small>
              </span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="part-actions__item part-actions__item--danger"
              onClick={() => {
                close();
                onScrap();
              }}
            >
              <span>
                Mettre au rebut
                <small>Date de rebut : {todayLabel}</small>
              </span>
            </button>
          )}
          <div className="part-actions__sep" />
          <div className="part-actions__fly">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={tagsOpen}
              className="part-actions__item part-actions__item--sub"
              disabled={allTags.length === 0}
              onClick={() => setTagsOpen((o) => !o)}
            >
              <span>
                Affecter un tag
                {allTags.length === 0 && <small>Aucun tag : créez-en un plus haut</small>}
              </span>
            </button>
            {tagsOpen && (
              <div className="part-actions__menu part-actions__menu--sub" role="menu">
                {allTags.map((t) => {
                  const on = tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      className="part-actions__tag"
                      onClick={() => onToggleTag(t.id, !on)}
                    >
                      <span className="tag-chip__dot" style={{ background: t.color }} />
                      {t.name}
                      <span className={`part-actions__check ${on ? "on" : ""}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
