from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QAbstractItemView,
    QHBoxLayout,
    QInputDialog,
    QMessageBox,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from app import repository


class BikesTab(QWidget):
    bikes_changed = Signal()

    def __init__(self, conn):
        super().__init__()
        self.conn = conn

        self.table = QTableWidget(0, 1)
        self.table.setHorizontalHeaderLabels(["Nom"])
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)

        add_btn = QPushButton("Ajouter")
        edit_btn = QPushButton("Modifier")
        delete_btn = QPushButton("Supprimer")
        add_btn.clicked.connect(self.add_bike)
        edit_btn.clicked.connect(self.edit_bike)
        delete_btn.clicked.connect(self.delete_bike)

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
        bikes = repository.list_bikes(self.conn)
        self.table.setRowCount(len(bikes))
        for row, bike in enumerate(bikes):
            item = QTableWidgetItem(bike.name)
            item.setData(1000, bike.id)  # stash id in a custom role
            self.table.setItem(row, 0, item)

    def _selected_bike_id(self) -> int | None:
        row = self.table.currentRow()
        if row < 0:
            return None
        return self.table.item(row, 0).data(1000)

    def add_bike(self) -> None:
        name, ok = QInputDialog.getText(self, "Ajouter un vélo", "Nom du vélo :")
        if not ok or not name.strip():
            return
        try:
            repository.add_bike(self.conn, name.strip())
        except repository.BikeAlreadyExistsError:
            QMessageBox.warning(self, "Erreur", "Un vélo avec ce nom existe déjà.")
            return
        self.refresh()
        self.bikes_changed.emit()

    def edit_bike(self) -> None:
        bike_id = self._selected_bike_id()
        if bike_id is None:
            QMessageBox.information(self, "Modifier", "Sélectionnez un vélo.")
            return
        current_name = self.table.item(self.table.currentRow(), 0).text()
        name, ok = QInputDialog.getText(self, "Modifier le vélo", "Nom du vélo :", text=current_name)
        if not ok or not name.strip():
            return
        try:
            repository.update_bike(self.conn, bike_id, name.strip())
        except repository.BikeAlreadyExistsError:
            QMessageBox.warning(self, "Erreur", "Un vélo avec ce nom existe déjà.")
            return
        self.refresh()
        self.bikes_changed.emit()

    def delete_bike(self) -> None:
        bike_id = self._selected_bike_id()
        if bike_id is None:
            QMessageBox.information(self, "Supprimer", "Sélectionnez un vélo.")
            return
        name = self.table.item(self.table.currentRow(), 0).text()
        confirm = QMessageBox.question(
            self, "Confirmer", f"Supprimer le vélo '{name}' ?"
        )
        if confirm != QMessageBox.Yes:
            return
        try:
            repository.delete_bike(self.conn, bike_id)
        except repository.BikeInUseError:
            QMessageBox.warning(
                self,
                "Erreur",
                "Ce vélo est utilisé par des sorties enregistrées et ne peut pas être supprimé.",
            )
            return
        self.refresh()
        self.bikes_changed.emit()
