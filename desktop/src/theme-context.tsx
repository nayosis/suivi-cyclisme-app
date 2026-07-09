import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "suivi-cyclisme-theme";

interface ThemeContextValue {
  /** Mode choisi par l'utilisateur ("system" = suit le thème de l'OS). */
  mode: ThemeMode;
  /** Change le mode et le persiste (localStorage) pour les prochains lancements. */
  setMode: (mode: ThemeMode) => void;
  /** Valeur resolue (true = sombre), a utiliser pour la logique conditionnelle (ex: couleurs de graphiques). */
  resolvedDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Lit la préférence sombre/claire actuelle du système d'exploitation. */
function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Relit le mode sauvegardé en local (localStorage), "system" par défaut. */
function readStoredMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

/**
 * Fournit le thème (clair/sombre/système) à toute l'application et
 * synchronise l'attribut `data-theme` sur `<html>`, lu par `theme.css`.
 * Un script inline dans `index.html` applique déjà ce même attribut avant le
 * premier rendu pour éviter un flash de thème incorrect au démarrage.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedDark = mode === "system" ? systemDark : mode === "dark";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedDark ? "dark" : "light");
  }, [resolvedDark]);

  function setMode(next: ThemeMode) {
    setModeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolvedDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Donne accès au thème courant (mode choisi + valeur claire/sombre résolue).
 * Doit être appelé depuis un composant situé sous `<ThemeProvider>`.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() doit être utilisé à l'intérieur de <ThemeProvider>.");
  return ctx;
}
