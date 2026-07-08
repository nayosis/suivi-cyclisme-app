from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg
from matplotlib.figure import Figure
from matplotlib.patches import FancyBboxPatch

from app import theme
from app.format_utils import format_number


class BarChart(FigureCanvasQTAgg):
    """Graphique en barres unique-serie, style epure (une seule teinte)."""

    def __init__(self, title: str, unit: str, color: str = theme.SERIES_DISTANCE, parent=None):
        fig = Figure(figsize=(4.2, 2.6), dpi=100)
        super().__init__(fig)
        if parent is not None:
            self.setParent(parent)
        self.title = title
        self.unit = unit
        self.color = color
        self.ax = fig.add_subplot(111)
        self.setMinimumHeight(220)

    def set_data(self, labels: list[str], values: list[float]) -> None:
        ax = self.ax
        ax.clear()

        ax.set_title(self.title, loc="left", fontsize=10.5, color=theme.SECONDARY_INK,
                     fontweight="bold", pad=10)

        max_val = max(values) if values else 0
        if max_val <= 0:
            ax.text(0.5, 0.5, "Pas de données", ha="center", va="center",
                     color=theme.MUTED_INK, fontsize=9, transform=ax.transAxes)
            ax.set_xticks([])
            ax.set_yticks([])
            for spine in ax.spines.values():
                spine.set_visible(False)
            self.draw()
            return

        n = len(values)
        x_positions = list(range(n))
        bar_width = 0.6

        for x, val in zip(x_positions, values):
            if val <= 0:
                continue
            height = val
            radius = min(bar_width, height) * 0.12
            patch = FancyBboxPatch(
                (x - bar_width / 2, 0),
                bar_width,
                height,
                boxstyle=f"round,pad=0,rounding_size={radius}",
                linewidth=0,
                facecolor=self.color,
                mutation_aspect=1,
                zorder=3,
            )
            ax.add_patch(patch)

        top_idx = max(range(n), key=lambda i: values[i])
        ax.annotate(
            f"{format_number(values[top_idx])} {self.unit}",
            xy=(top_idx, values[top_idx]),
            xytext=(0, 4),
            textcoords="offset points",
            ha="center",
            fontsize=8.5,
            color=theme.SECONDARY_INK,
            fontweight="bold",
        )

        ax.set_xlim(-0.6, n - 0.4)
        ax.set_ylim(0, max_val * 1.22)
        ax.set_xticks(x_positions)
        ax.set_xticklabels(labels, fontsize=8.5, color=theme.MUTED_INK)
        ax.tick_params(axis="y", labelsize=8, colors=theme.MUTED_INK)
        ax.tick_params(axis="x", length=0)

        ax.grid(axis="y", color=theme.GRIDLINE, linewidth=1, zorder=0)
        ax.set_axisbelow(True)
        for side in ("top", "right", "left"):
            ax.spines[side].set_visible(False)
        ax.spines["bottom"].set_color(theme.BASELINE)
        ax.spines["bottom"].set_linewidth(1)

        self.figure.tight_layout()
        self.draw()
