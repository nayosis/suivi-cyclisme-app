import { createContext, useContext, useState, type ReactNode } from "react";
import { findHeatmapPalette, HEATMAP_CLASSIC, HEATMAP_CUSTOM } from "./heatmap-palettes";

const COLOR_KEY = "suivi-cyclisme-heatmap-color";
const PALETTE_KEY = "suivi-cyclisme-heatmap-palette";

interface HeatmapColorContextValue {
  /**
   * Palette choisie : `"classique"` (une couleur d'accent, trois intensités),
   * `"custom"` (une couleur au choix, voir `color`) ou l'identifiant d'un
   * triptyque de `heatmap-palettes.ts`.
   */
  palette: string;
  setPalette: (palette: string) => void;
  /** Couleur de la palette « personnalisée », ou `null` si aucune n'a encore été choisie. */
  color: string | null;
  /** Change la couleur personnalisée et sélectionne la palette « personnalisée ». */
  setColor: (color: string) => void;
}

const HeatmapColorContext = createContext<HeatmapColorContextValue | null>(null);

function readStoredPalette(): string {
  const saved = localStorage.getItem(PALETTE_KEY);
  if (saved === HEATMAP_CLASSIC || saved === HEATMAP_CUSTOM || (saved && findHeatmapPalette(saved))) return saved;
  // Réglage antérieur aux palettes : une couleur personnalisée déjà choisie reste active.
  return localStorage.getItem(COLOR_KEY) ? HEATMAP_CUSTOM : HEATMAP_CLASSIC;
}

/**
 * Fournit la palette du calendrier d'activité à toute l'application, persistée
 * en local (localStorage) pour les prochains lancements. Par défaut, « classique » :
 * le graphique suit la couleur d'accent du thème.
 */
export function HeatmapColorProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<string>(readStoredPalette);
  const [color, setColorState] = useState<string | null>(() => localStorage.getItem(COLOR_KEY));

  function setPalette(next: string) {
    setPaletteState(next);
    localStorage.setItem(PALETTE_KEY, next);
  }

  function setColor(next: string) {
    setColorState(next);
    localStorage.setItem(COLOR_KEY, next);
    setPalette(HEATMAP_CUSTOM);
  }

  return <HeatmapColorContext.Provider value={{ palette, setPalette, color, setColor }}>{children}</HeatmapColorContext.Provider>;
}

/**
 * Donne accès à la palette du calendrier d'activité. Doit être appelé depuis
 * un composant situé sous `<HeatmapColorProvider>`.
 */
export function useHeatmapColor(): HeatmapColorContextValue {
  const ctx = useContext(HeatmapColorContext);
  if (!ctx) throw new Error("useHeatmapColor() doit être utilisé à l'intérieur de <HeatmapColorProvider>.");
  return ctx;
}
