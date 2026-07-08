from PySide6.QtCore import Qt
from PySide6.QtWidgets import QFrame, QLabel, QVBoxLayout

from app import theme
from app.format_utils import format_number

__all__ = ["StatTile", "format_number"]


class StatTile(QFrame):
    def __init__(self, label: str, value: str, parent=None):
        super().__init__(parent)
        self.setObjectName("statTile")
        self.setStyleSheet(
            f"""
            QFrame#statTile {{
                background-color: {theme.SURFACE};
                border: 1px solid {theme.BORDER};
                border-radius: 10px;
            }}
            """
        )

        self.value_label = QLabel(value)
        self.value_label.setStyleSheet(
            f"font-size: 22pt; font-weight: 600; color: {theme.PRIMARY_INK}; border: none;"
        )
        self.value_label.setAlignment(Qt.AlignLeft)

        self.title_label = QLabel(label)
        self.title_label.setStyleSheet(
            f"font-size: 9pt; color: {theme.SECONDARY_INK}; border: none;"
        )
        self.title_label.setAlignment(Qt.AlignLeft)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 14, 16, 14)
        layout.setSpacing(4)
        layout.addWidget(self.value_label)
        layout.addWidget(self.title_label)

    def set_value(self, value: str) -> None:
        self.value_label.setText(value)
