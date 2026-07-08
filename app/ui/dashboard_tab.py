from PySide6.QtWidgets import QHBoxLayout, QLabel, QScrollArea, QVBoxLayout, QWidget

from app import stats, theme
from app.format_utils import format_number
from app.ui.bar_chart import BarChart
from app.ui.stat_tile import StatTile


def _section_title(text: str) -> QLabel:
    label = QLabel(text)
    label.setStyleSheet(
        f"font-size: 12pt; font-weight: 600; color: {theme.PRIMARY_INK}; margin-top: 6px;"
    )
    return label


class DashboardTab(QWidget):
    def __init__(self, conn):
        super().__init__()
        self.conn = conn

        content = QWidget()
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(16, 16, 16, 16)
        content_layout.setSpacing(18)

        # --- Tuiles de totaux ---
        tiles_row = QHBoxLayout()
        tiles_row.setSpacing(12)
        self.tile_distance = StatTile("Distance totale", "0 km")
        self.tile_elevation = StatTile("Dénivelé total", "0 m")
        self.tile_count = StatTile("Nombre de sorties", "0")
        self.tile_duration = StatTile("Durée totale", "0 h")
        for tile in (self.tile_distance, self.tile_elevation, self.tile_count, self.tile_duration):
            tiles_row.addWidget(tile)
        content_layout.addLayout(tiles_row)

        # --- Par année ---
        content_layout.addWidget(_section_title("Par année"))
        year_row = QHBoxLayout()
        year_row.setSpacing(12)
        self.chart_year_distance = BarChart("Distance par année", "km", theme.SERIES_DISTANCE)
        self.chart_year_elevation = BarChart("Dénivelé par année", "m", theme.SERIES_ELEVATION)
        year_row.addWidget(self.chart_year_distance)
        year_row.addWidget(self.chart_year_elevation)
        content_layout.addLayout(year_row)

        # --- Par mois (saisonnalité) ---
        content_layout.addWidget(_section_title("Par mois (toutes années confondues)"))
        month_row = QHBoxLayout()
        month_row.setSpacing(12)
        self.chart_month_distance = BarChart("Distance par mois", "km", theme.SERIES_DISTANCE)
        self.chart_month_elevation = BarChart("Dénivelé par mois", "m", theme.SERIES_ELEVATION)
        month_row.addWidget(self.chart_month_distance)
        month_row.addWidget(self.chart_month_elevation)
        content_layout.addLayout(month_row)

        # --- Par vélo ---
        content_layout.addWidget(_section_title("Par vélo"))
        bike_row = QHBoxLayout()
        bike_row.setSpacing(12)
        self.chart_bike_distance = BarChart("Distance par vélo", "km", theme.SERIES_DISTANCE)
        self.chart_bike_elevation = BarChart("Dénivelé par vélo", "m", theme.SERIES_ELEVATION)
        bike_row.addWidget(self.chart_bike_distance)
        bike_row.addWidget(self.chart_bike_elevation)
        content_layout.addLayout(bike_row)

        content_layout.addStretch()

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(content)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(scroll)

        self.refresh()

    def refresh(self) -> None:
        t = stats.totals(self.conn)
        self.tile_distance.set_value(f"{format_number(t.distance_km)} km")
        self.tile_elevation.set_value(f"{format_number(t.elevation_m)} m")
        self.tile_count.set_value(format_number(t.ride_count))
        self.tile_duration.set_value(f"{format_number(t.duration_minutes / 60, 1)} h")

        year_rows = stats.by_year(self.conn)
        year_labels = [r.label for r in year_rows]
        self.chart_year_distance.set_data(year_labels, [r.distance_km for r in year_rows])
        self.chart_year_elevation.set_data(year_labels, [r.elevation_m for r in year_rows])

        month_rows = stats.by_month(self.conn)
        month_labels = [r.label for r in month_rows]
        self.chart_month_distance.set_data(month_labels, [r.distance_km for r in month_rows])
        self.chart_month_elevation.set_data(month_labels, [r.elevation_m for r in month_rows])

        bike_rows = stats.by_bike(self.conn)
        bike_labels = [r.label for r in bike_rows]
        self.chart_bike_distance.set_data(bike_labels, [r.distance_km for r in bike_rows])
        self.chart_bike_elevation.set_data(bike_labels, [r.elevation_m for r in bike_rows])
