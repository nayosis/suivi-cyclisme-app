import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Hauteur (en px) ajustable par glisser-déposer d'une poignée, persistée en
 * localStorage sous `storageKey`. Fournit `onHandleMouseDown` à poser sur
 * l'élément de poignée (`onMouseDown={onHandleMouseDown}`) ; le glisser est
 * ensuite suivi via des écouteurs globaux le temps du drag.
 */
export function useResizableHeight(storageKey: string, defaultPx: number, min: number, max: number) {
  const [height, setHeight] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw !== null ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? clamp(parsed, min, max) : defaultPx;
    } catch {
      return defaultPx;
    }
  });

  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    function handleMouseMove(e: globalThis.MouseEvent) {
      if (!dragState.current) return;
      const delta = e.clientY - dragState.current.startY;
      setHeight(clamp(dragState.current.startHeight + delta, min, max));
    }
    function handleMouseUp() {
      if (!dragState.current) return;
      dragState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [min, max]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(height));
    } catch {
      // Stockage indisponible : la préférence ne survivra pas au redémarrage, tant pis.
    }
  }, [storageKey, height]);

  function onHandleMouseDown(e: ReactMouseEvent) {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startHeight: height };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  return { height, onHandleMouseDown };
}
