"""Palette et style partages par l'UI Qt (QSS) et les graphiques matplotlib."""

PAGE = "#f9f9f7"
SURFACE = "#fcfcfb"
PRIMARY_INK = "#0b0b0b"
SECONDARY_INK = "#52514e"
MUTED_INK = "#898781"
GRIDLINE = "#e1e0d9"
BASELINE = "#c3c2b7"
BORDER = "#e1e0d9"

ACCENT = "#2a78d6"          # bleu, categorical slot 1
ACCENT_HOVER = "#256abf"
ACCENT_PRESSED = "#184f95"

SERIES_DISTANCE = "#2a78d6"   # bleu (slot 1)
SERIES_ELEVATION = "#1baf7a"  # aqua (slot 2)

DANGER = "#e34948"
DANGER_HOVER = "#c53b3a"

FONT_FAMILY = '"Segoe UI", system-ui, sans-serif'

STYLESHEET = f"""
QWidget {{
    background-color: {PAGE};
    color: {PRIMARY_INK};
    font-family: {FONT_FAMILY};
    font-size: 10pt;
}}

QMainWindow {{
    background-color: {PAGE};
}}

QTabWidget::pane {{
    border: 1px solid {BORDER};
    border-radius: 6px;
    background-color: {SURFACE};
    top: -1px;
}}

QTabBar::tab {{
    background: transparent;
    color: {SECONDARY_INK};
    padding: 8px 18px;
    margin-right: 2px;
    border-bottom: 2px solid transparent;
    font-weight: 500;
}}

QTabBar::tab:selected {{
    color: {PRIMARY_INK};
    border-bottom: 2px solid {ACCENT};
    font-weight: 600;
}}

QTabBar::tab:hover {{
    color: {PRIMARY_INK};
}}

QPushButton {{
    background-color: {ACCENT};
    color: white;
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-weight: 600;
}}

QPushButton:hover {{
    background-color: {ACCENT_HOVER};
}}

QPushButton:pressed {{
    background-color: {ACCENT_PRESSED};
}}

QPushButton:disabled {{
    background-color: {MUTED_INK};
}}

QTableWidget {{
    background-color: {SURFACE};
    alternate-background-color: {PAGE};
    gridline-color: {GRIDLINE};
    border: 1px solid {BORDER};
    border-radius: 6px;
    selection-background-color: #cde2fb;
    selection-color: {PRIMARY_INK};
}}

QHeaderView::section {{
    background-color: {SURFACE};
    color: {SECONDARY_INK};
    padding: 6px;
    border: none;
    border-bottom: 1px solid {BORDER};
    font-weight: 600;
}}

QLineEdit, QTextEdit, QComboBox, QSpinBox, QDoubleSpinBox, QDateEdit {{
    background-color: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 4px;
    padding: 4px 6px;
    selection-background-color: {ACCENT};
}}

QLineEdit:focus, QTextEdit:focus, QComboBox:focus, QSpinBox:focus,
QDoubleSpinBox:focus, QDateEdit:focus {{
    border: 1px solid {ACCENT};
}}

QScrollArea {{
    border: none;
    background-color: transparent;
}}

QLabel {{
    background-color: transparent;
}}
"""


def apply_theme(app) -> None:
    app.setStyleSheet(STYLESHEET)


def configure_matplotlib() -> None:
    import matplotlib

    matplotlib.rcParams.update(
        {
            "font.family": "sans-serif",
            "font.sans-serif": ["Segoe UI", "DejaVu Sans"],
            "axes.edgecolor": BASELINE,
            "axes.labelcolor": SECONDARY_INK,
            "text.color": PRIMARY_INK,
            "xtick.color": MUTED_INK,
            "ytick.color": MUTED_INK,
            "axes.facecolor": SURFACE,
            "figure.facecolor": SURFACE,
            "grid.color": GRIDLINE,
            "font.size": 9,
        }
    )
