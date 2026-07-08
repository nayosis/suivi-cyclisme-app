import sys

from PySide6.QtWidgets import QApplication

from app import theme
from app.db import get_connection, init_db
from app.ui.main_window import MainWindow


def main() -> None:
    app = QApplication(sys.argv)
    theme.apply_theme(app)
    theme.configure_matplotlib()

    conn = get_connection()
    init_db(conn)

    window = MainWindow(conn)
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
