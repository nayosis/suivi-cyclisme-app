import { QueryClient } from "@tanstack/react-query";

/**
 * Client de requêtes partagé par toute l'app. `staleTime` évite de
 * recharger inutilement en navigant vite d'un onglet à l'autre — les
 * données déjà en cache s'affichent instantanément, un rechargement en
 * arrière-plan ne se déclenche que si elles sont jugées périmées (ou après
 * une invalidation explicite suite à une mutation).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

/**
 * Domaine « cyclisme » : vélos, sorties, et toutes les statistiques qui en
 * dérivent (tableau de bord, page Sorties). Toute mutation d'un vélo ou
 * d'une sortie doit invalider ce domaine.
 */
export const cyclingKey = ["cycling"] as const;

/**
 * Domaine « entretien » : maintenances, exemplaires de pièces, emplacements
 * et tags. Toute mutation dans l'onglet Entretien doit invalider ce
 * domaine.
 */
export const maintenanceKey = ["maintenance"] as const;

export function invalidateCycling() {
  return queryClient.invalidateQueries({ queryKey: cyclingKey });
}

export function invalidateMaintenance() {
  return queryClient.invalidateQueries({ queryKey: maintenanceKey });
}

/** À utiliser après un changement de base de données (bascule, import, réinitialisation) : plus rien du cache n'est valide. */
export function invalidateEverything() {
  return queryClient.invalidateQueries();
}
