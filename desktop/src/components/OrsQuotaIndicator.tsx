import { useOrsQuota } from "../ors-context";
import { formatOrsQuota } from "../ors-quota";

/** Icône jauge (info-bulle native au survol), affichant le dernier quota OpenRouteService/HeiGIT connu. */
function GaugeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M12 2a10 10 0 0 0-7.35 16.74" />
      <path d="M19.35 18.74A10 10 0 0 0 12 2" />
      <path d="M13.4 10.6 18 6" />
    </svg>
  );
}

/**
 * Indicateur du quota restant sur l'API OpenRouteService/HeiGIT, avec le
 * détail au survol (info-bulle native). Placé dans la nav, à gauche du
 * bouton Options. Se met à jour dès qu'un appel API observe de nouveaux
 * en-têtes de quota (voir `ors-quota.ts`) — jamais d'appel réseau propre.
 */
export function OrsQuotaIndicator() {
  const quota = useOrsQuota();
  const lines = formatOrsQuota(quota);

  return (
    <span className="app-nav__quota" title={lines.join("\n")} aria-label={`Quota OpenRouteService : ${lines.join(" — ")}`}>
      <GaugeIcon />
    </span>
  );
}
