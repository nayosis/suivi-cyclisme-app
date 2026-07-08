from PySide6.QtCore import QDate
from PySide6.QtWidgets import (
    QComboBox,
    QDateEdit,
    QDialog,
    QDialogButtonBox,
    QDoubleSpinBox,
    QFormLayout,
    QLineEdit,
    QMessageBox,
    QSpinBox,
    QTextEdit,
)

from app import repository


class RideDialog(QDialog):
    """Formulaire d'ajout/modification d'une sortie."""

    def __init__(self, bikes: list[repository.Bike], ride: repository.Ride | None = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Modifier la sortie" if ride else "Ajouter une sortie")
        self.bikes = bikes

        self.date_edit = QDateEdit()
        self.date_edit.setCalendarPopup(True)
        self.date_edit.setDisplayFormat("dd/MM/yyyy")
        self.date_edit.setDate(QDate.currentDate())

        self.name_edit = QLineEdit()

        self.hours_spin = QSpinBox()
        self.hours_spin.setRange(0, 48)
        self.hours_spin.setSuffix(" h")
        self.minutes_spin = QSpinBox()
        self.minutes_spin.setRange(0, 59)
        self.minutes_spin.setSuffix(" min")

        self.distance_spin = QDoubleSpinBox()
        self.distance_spin.setRange(0, 2000)
        self.distance_spin.setDecimals(1)
        self.distance_spin.setSuffix(" km")

        self.elevation_spin = QSpinBox()
        self.elevation_spin.setRange(0, 20000)
        self.elevation_spin.setSuffix(" m")

        self.bike_combo = QComboBox()
        for bike in bikes:
            self.bike_combo.addItem(bike.name, bike.id)

        self.comment_edit = QTextEdit()
        self.comment_edit.setFixedHeight(60)

        form = QFormLayout(self)
        form.addRow("Date :", self.date_edit)
        form.addRow("Nom de la sortie :", self.name_edit)
        form.addRow("Durée :", self._duration_row())
        form.addRow("Distance :", self.distance_spin)
        form.addRow("Dénivelé positif :", self.elevation_spin)
        form.addRow("Vélo :", self.bike_combo)
        form.addRow("Commentaire :", self.comment_edit)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self._on_accept)
        buttons.rejected.connect(self.reject)
        form.addRow(buttons)

        if ride:
            y, m, d = (int(p) for p in ride.date.split("-"))
            self.date_edit.setDate(QDate(y, m, d))
            self.name_edit.setText(ride.name)
            self.hours_spin.setValue(ride.duration_minutes // 60)
            self.minutes_spin.setValue(ride.duration_minutes % 60)
            self.distance_spin.setValue(ride.distance_km)
            self.elevation_spin.setValue(ride.elevation_m)
            self.comment_edit.setPlainText(ride.comment or "")
            idx = self.bike_combo.findData(ride.bike_id)
            if idx >= 0:
                self.bike_combo.setCurrentIndex(idx)

    def _duration_row(self):
        from PySide6.QtWidgets import QHBoxLayout, QWidget

        wrapper = QWidget()
        row = QHBoxLayout(wrapper)
        row.setContentsMargins(0, 0, 0, 0)
        row.addWidget(self.hours_spin)
        row.addWidget(self.minutes_spin)
        row.addStretch()
        return wrapper

    def _on_accept(self) -> None:
        if not self.name_edit.text().strip():
            QMessageBox.warning(self, "Erreur", "Le nom de la sortie est obligatoire.")
            return
        if self.bike_combo.count() == 0:
            QMessageBox.warning(self, "Erreur", "Ajoutez d'abord un vélo dans l'onglet Vélos.")
            return
        if self.hours_spin.value() == 0 and self.minutes_spin.value() == 0:
            QMessageBox.warning(self, "Erreur", "La durée doit être supérieure à 0.")
            return
        self.accept()

    def result_data(self) -> dict:
        qd = self.date_edit.date()
        return {
            "date": f"{qd.year():04d}-{qd.month():02d}-{qd.day():02d}",
            "name": self.name_edit.text().strip(),
            "duration_minutes": self.hours_spin.value() * 60 + self.minutes_spin.value(),
            "distance_km": self.distance_spin.value(),
            "elevation_m": self.elevation_spin.value(),
            "comment": self.comment_edit.toPlainText().strip() or None,
            "bike_id": self.bike_combo.currentData(),
        }
