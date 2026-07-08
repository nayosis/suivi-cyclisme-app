from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QAbstractItemView,
    QHBoxLayout,
    QHeaderView,
    QMessageBox,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from app import repository
from app.ui.ride_dialog import RideDialog

COLUMNS = ["Date", "Nom", "Durée", "Distance", "Dénivelé+", "Vélo", "Commentaire"]


def format_duration(minutes: int) -> str:
    return f"{minutes // 60}h{minutes % 60:02d}"


def format_date(iso_date: str) -> str:
    y, m, d = iso_date.split("-")
    return f"{d}/{m}/{y}"


class RidesTab(QWidget):
    rides_changed = Signal()

    def __init__(self, conn):
        super().__init__()
        self.conn = conn

        self.table = QTableWidget(0, len(COLUMNS))
        self.table.setHorizontalHeaderLabels(COLUMNS)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(6, QHeaderView.Stretch)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)

        add_btn = QPushButton("Ajouter")
        edit_btn = QPushButton("Modifier")
        delete_btn = QPushButton("Supprimer")
        add_btn.clicked.connect(self.add_ride)
        edit_btn.clicked.connect(self.edit_ride)
        delete_btn.clicked.connect(self.delete_ride)
        self.add_btn = add_btn

        buttons = QHBoxLayout()
        buttons.addWidget(add_btn)
        buttons.addWidget(edit_btn)
        buttons.addWidget(delete_btn)
        buttons.addStretch()

        layout = QVBoxLayout(self)
        layout.addWidget(self.table)
        layout.addLayout(buttons)

        self.refresh()

    def refresh(self) -> None:
        rides = repository.list_rides(self.conn)
        self.table.setRowCount(len(rides))
        for row, ride in enumerate(rides):
            values = [
                format_date(ride.date),
                ride.name,
                format_duration(ride.duration_minutes),
                f"{ride.distance_km:g} km",
                f"{ride.elevation_m} m",
                ride.bike_name,
                ride.comment or "",
            ]
            for col, value in enumerate(values):
                item = QTableWidgetItem(value)
                if col == 0:
                    item.setData(1000, ride.id)  # stash id in a custom role
                self.table.setItem(row, col, item)

    def _selected_ride_id(self) -> int | None:
        row = self.table.currentRow()
        if row < 0:
            return None
        return self.table.item(row, 0).data(1000)

    def _bikes_or_warn(self):
        bikes = repository.list_bikes(self.conn)
        if not bikes:
            QMessageBox.information(
                self, "Aucun vélo", "Ajoutez d'abord un vélo dans l'onglet Vélos."
            )
            return None
        return bikes

    def add_ride(self) -> None:
        bikes = self._bikes_or_warn()
        if bikes is None:
            return
        dialog = RideDialog(bikes, parent=self)
        if dialog.exec():
            data = dialog.result_data()
            repository.add_ride(self.conn, **data)
            self.refresh()
            self.rides_changed.emit()

    def edit_ride(self) -> None:
        ride_id = self._selected_ride_id()
        if ride_id is None:
            QMessageBox.information(self, "Modifier", "Sélectionnez une sortie.")
            return
        bikes = self._bikes_or_warn()
        if bikes is None:
            return
        ride = next(r for r in repository.list_rides(self.conn) if r.id == ride_id)
        dialog = RideDialog(bikes, ride=ride, parent=self)
        if dialog.exec():
            data = dialog.result_data()
            repository.update_ride(self.conn, ride_id, **data)
            self.refresh()
            self.rides_changed.emit()

    def delete_ride(self) -> None:
        ride_id = self._selected_ride_id()
        if ride_id is None:
            QMessageBox.information(self, "Supprimer", "Sélectionnez une sortie.")
            return
        name = self.table.item(self.table.currentRow(), 1).text()
        confirm = QMessageBox.question(self, "Confirmer", f"Supprimer la sortie '{name}' ?")
        if confirm != QMessageBox.Yes:
            return
        repository.delete_ride(self.conn, ride_id)
        self.refresh()
        self.rides_changed.emit()
