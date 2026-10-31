import { useEffect, useState } from "react";
import { useFixedMenu } from "../use-fixed-menu";
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
  const { open, pos, buttonRef, menuRef, toggle, close } = useFixedMenu(140);
  const [tagsOpen, setTagsOpen] = useState(false);

  // Le sous-menu des tags repart fermé à chaque ouverture du menu.
  useEffect(() => {
    if (!open) setTagsOpen(false);
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
