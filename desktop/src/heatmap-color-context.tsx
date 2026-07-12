import { createContext, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "suivi-cyclisme-heatmap-color";

interface HeatmapColorContextValue {
  /** Couleur personnalisée du calendrier d'activité, ou `null` pour suivre la couleur d'accent du thème. */
  color: string | null;
  /** Change la couleur et la persiste (localStorage). `null` revient à suivre le thème. */
  setColor: (color: string | null) => void;
}

const HeatmapColorContext = createContext<HeatmapColorContextValue | null>(null);

/**
 * Fournit la couleur personnalisée (optionnelle) du calendrier d'activité à
 * toute l'application, persistée en local (localStorage) pour les prochains
 * lancements. `null` = pas de personnalisation, le graphique suit la couleur
 * d'accent du thème (comportement par défaut).
 */
export function HeatmapColorProvider({ children }: { children: ReactNode }) {
  const [color, setColorState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  function setColor(next: string | null) {
    setColorState(next);
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  }

  return <HeatmapColorContext.Provider value={{ color, setColor }}>{children}</HeatmapColorContext.Provider>;
}

/**
 * Donne accès à la couleur personnalisée du calendrier d'activité. Doit être
 * appelé depuis un composant situé sous `<HeatmapColorProvider>`.
 */
export function useHeatmapColor(): HeatmapColorContextValue {
  const ctx = useContext(HeatmapColorContext);
  if (!ctx) throw new Error("useHeatmapColor() doit être utilisé à l'intérieur de <HeatmapColorProvider>.");
  return ctx;
}
