import { useHeatmapColor } from "../heatmap-color-context";
import { HEATMAP_CLASSIC, HEATMAP_CUSTOM, HEATMAP_PALETTES, type HeatmapPalette } from "../heatmap-palettes";

/** Couleur proposée au premier choix de « Personnalisée » (accent par défaut du thème clair). */
const DEFAULT_CUSTOM_COLOR = "#2a78d6";

/** Trois pastilles (variante claire sur fond clair, variante sombre sur fond sombre) d'une palette. */
function Swatches({ light, dark }: { light: string[]; dark: string[] }) {
  return (
    <div className="palette-swatches">
      <div className="palette-swatches__set palette-swatches__set--light">
        {light.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
      <div className="palette-swatches__set palette-swatches__set--dark">
        {dark.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

/** Choix de la palette du calendrier d'activité : triptyques, classique, ou une couleur personnalisée. */
export function HeatmapPalettePicker() {
  const { palette, setPalette, color, setColor } = useHeatmapColor();

  function option(id: string, name: string, description: string, swatches: React.ReactNode) {
    return (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={palette === id}
        className="palette-option"
        onClick={() => setPalette(id)}
      >
        <span className="palette-option__name">
          {name}
          <span className="palette-option__tick">✓</span>
        </span>
        {swatches}
        <small>{description}</small>
      </button>
    );
  }

  const paletteOption = (p: HeatmapPalette) =>
    option(p.id, p.name, p.description, <Swatches light={p.light} dark={p.dark} />);

  return (
    <div className="palette-picker" role="radiogroup" aria-label="Palette du calendrier d'activité">
      <div className="palette-picker__group">Couleurs très différentes</div>
      {HEATMAP_PALETTES.filter((p) => p.group === "distinct").map(paletteOption)}
      <div className="palette-picker__group">Dégradés</div>
      {option(
        HEATMAP_CLASSIC,
        "Classique",
        "Une couleur, trois intensités (par défaut).",
        <Swatches light={["#a9cbf3", "#6aa3e8", "#2a78d6"]} dark={["#1d4a82", "#2a68b8", "#3987e5"]} />
      )}
      {HEATMAP_PALETTES.filter((p) => p.group === "gradient").map(paletteOption)}
      <div
        role="radio"
        tabIndex={0}
        aria-checked={palette === HEATMAP_CUSTOM}
        className="palette-option"
        onClick={() => setColor(color ?? DEFAULT_CUSTOM_COLOR)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setColor(color ?? DEFAULT_CUSTOM_COLOR);
          }
        }}
      >
        <span className="palette-option__name">
          Personnalisée
          <span className="palette-option__tick">✓</span>
        </span>
        <input
          type="color"
          className="color-input palette-option__color"
          value={color ?? DEFAULT_CUSTOM_COLOR}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Couleur personnalisée du calendrier d'activité"
        />
        <small>Une couleur au choix, trois intensités.</small>
      </div>
    </div>
  );
}
