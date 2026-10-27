import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { getOrsQuota, subscribeOrsQuota, type OrsQuota } from "./ors-quota";

const STORAGE_KEY = "suivi-cyclisme-ors-api-key";

interface OrsApiKeyContextValue {
  /** Clé API OpenRouteService personnelle de l'utilisateur, ou `null` si non renseignée. */
  apiKey: string | null;
  /** Change la clé et la persiste (localStorage). `null` (ou chaîne vide) l'efface. */
  setApiKey: (apiKey: string | null) => void;
}

const OrsApiKeyContext = createContext<OrsApiKeyContextValue | null>(null);

/**
 * Fournit la clé API OpenRouteService à toute l'application, persistée en
 * local (localStorage) pour les prochains lancements — nécessaire pour
 * calculer un itinéraire (tracer un parcours sur la carte).
 */
export function OrsApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  function setApiKey(next: string | null) {
    const trimmed = next?.trim() || null;
    setApiKeyState(trimmed);
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  }

  return <OrsApiKeyContext.Provider value={{ apiKey, setApiKey }}>{children}</OrsApiKeyContext.Provider>;
}

/**
 * Donne accès à la clé API OpenRouteService. Doit être appelé depuis un
 * composant situé sous `<OrsApiKeyProvider>`.
 */
export function useOrsApiKey(): OrsApiKeyContextValue {
  const ctx = useContext(OrsApiKeyContext);
  if (!ctx) throw new Error("useOrsApiKey() doit être utilisé à l'intérieur de <OrsApiKeyProvider>.");
  return ctx;
}

/**
 * Dernier quota OpenRouteService/HeiGIT connu (lu depuis les en-têtes
 * `X-Ratelimit-*` du dernier appel API effectué), ou `null` si aucun appel
 * n'a encore été observé. Se met à jour automatiquement (`useSyncExternalStore`)
 * dès qu'un nouvel appel (Directions ou géocodage) est effectué ailleurs dans
 * l'appli — voir `ors-quota.ts`.
 */
export function useOrsQuota(): OrsQuota | null {
  return useSyncExternalStore(subscribeOrsQuota, getOrsQuota);
}
