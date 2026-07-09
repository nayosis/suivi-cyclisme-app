/**
 * Jeu de couleurs utilisé par les graphiques (recharts), en miroir des
 * variables CSS définies dans `theme.css`. Le thème actif (clair/sombre) est
 * fourni par `useTheme()` (voir `theme-context.tsx`).
 */
export const PALETTE = {
  light: {
    gridline: "#e1e0d9",
    baseline: "#c3c2b7",
    mutedInk: "#898781",
    secondaryInk: "#52514e",
    primaryInk: "#0b0b0b",
    surface: "#fcfcfb",
  },
  dark: {
    gridline: "#2c2c2a",
    baseline: "#383835",
    mutedInk: "#898781",
    secondaryInk: "#c3c2b7",
    primaryInk: "#ffffff",
    surface: "#1a1a19",
  },
};
