/**
 * Palettes du calendrier d'activité : un triptyque de trois couleurs, une par
 * palier de distance (jusqu'à 75 km, jusqu'à 150 km, au-delà). Chaque palette
 * a une variante claire et une variante sombre : un jaune clair se voit mal sur
 * fond clair, un violet foncé se voit mal sur fond sombre. Les jours sans
 * sortie restent gris, quelle que soit la palette.
 */
export interface HeatmapPalette {
  id: string;
  name: string;
  description: string;
  group: "distinct" | "gradient";
  light: [string, string, string];
  dark: [string, string, string];
}

/** Identifiants des deux palettes qui ne sont pas des triptyques (voir `useHeatmapColor`). */
export const HEATMAP_CLASSIC = "classique";
export const HEATMAP_CUSTOM = "custom";

export const HEATMAP_PALETTES: HeatmapPalette[] = [
  {
    id: "tricolore",
    name: "Vert, jaune, rouge",
    description: "Feu tricolore : trois couleurs bien séparées.",
    group: "distinct",
    light: ["#17843f", "#e6a700", "#d7263d"],
    dark: ["#2fb455", "#f5c518", "#ff5a5a"],
  },
  {
    id: "bleu-jaune-rouge",
    name: "Bleu, jaune, rouge",
    description: "Trois couleurs primaires, sans vert.",
    group: "distinct",
    light: ["#2a78d6", "#e6a700", "#d7263d"],
    dark: ["#4f9bff", "#f5c518", "#ff5a5a"],
  },
  {
    id: "contraste",
    name: "Jaune, vert-bleu, violet",
    description: "Très lisible, sans rouge ni vert pur.",
    group: "distinct",
    light: ["#e8c32a", "#1f9e89", "#4b2e83"],
    dark: ["#7a6612", "#1f9e89", "#c2adf5"],
  },
  {
    id: "ocean",
    name: "Océan",
    description: "Turquoise, bleu, indigo.",
    group: "gradient",
    light: ["#6ec6d9", "#2a78d6", "#1f3a93"],
    dark: ["#2a6f82", "#3987e5", "#9cc2ff"],
  },
  {
    id: "feu",
    name: "Feu",
    description: "Jaune, orange, rouge brique.",
    group: "gradient",
    light: ["#f2c14e", "#e8702a", "#b3261e"],
    dark: ["#7a5817", "#d9692a", "#ff9a85"],
  },
  {
    id: "foret",
    name: "Forêt",
    description: "Vert clair, vert, vert profond.",
    group: "gradient",
    light: ["#9ed36a", "#2e9d57", "#14684a"],
    dark: ["#4c7a2e", "#2e9d57", "#6fe3a5"],
  },
  {
    id: "violet",
    name: "Violet",
    description: "Lavande, violet, prune.",
    group: "gradient",
    light: ["#c9a7ee", "#8e54d6", "#4a1f8f"],
    dark: ["#6b4a9c", "#8e54d6", "#c9a7ee"],
  },
];

export function findHeatmapPalette(id: string): HeatmapPalette | undefined {
  return HEATMAP_PALETTES.find((p) => p.id === id);
}
