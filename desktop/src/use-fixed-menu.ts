import { useEffect, useRef, useState } from "react";

/**
 * Menu déroulant en position fixe (pour ne pas être rogné par un tableau
 * défilant) : s'ouvre sous le bouton, ou au-dessus s'il manque de place, et se
 * ferme au clic extérieur, à Échap, au redimensionnement et au défilement.
 *
 * @param estimatedHeight hauteur approximative du menu, pour choisir le sens d'ouverture.
 */
export function useFixedMenu(estimatedHeight: number) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
  }

  function toggle() {
    if (open) return close();
    const rect = buttonRef.current!.getBoundingClientRect();
    const right = window.innerWidth - rect.right;
    setPos(
      rect.bottom + estimatedHeight > window.innerHeight
        ? { bottom: window.innerHeight - rect.top + 6, right }
        : { top: rect.bottom + 6, right }
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDismiss() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [open]);

  return { open, pos, buttonRef, menuRef, toggle, close };
}
