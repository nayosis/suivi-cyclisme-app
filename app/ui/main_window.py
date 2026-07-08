from PySide6.QtWidgets import QMainWindow, QTabWidget

from app.ui.bikes_tab import BikesTab
from app.ui.dashboard_tab import DashboardTab
from app.ui.rides_tab import RidesTab


class MainWindow(QMainWindow):
    def __init__(self, conn):
        super().__init__()
        self.setWindowTitle("Suivi Cyclisme")
        self.resize(1100, 720)

        self.dashboard_tab = DashboardTab(conn)
        self.bikes_tab = BikesTab(conn)
        self.rides_tab = RidesTab(conn)

        self.bikes_tab.bikes_changed.connect(self.rides_tab.refresh)
        self.bikes_tab.bikes_changed.connect(self.dashboard_tab.refresh)
        self.rides_tab.rides_changed.connect(self.dashboard_tab.refresh)

        tabs = QTabWidget()
        tabs.addTab(self.dashboard_tab, "Dashboard")
        tabs.addTab(self.rides_tab, "Sorties")
        tabs.addTab(self.bikes_tab, "Vélos")
        tabs.currentChanged.connect(self._on_tab_changed)
        self.tabs = tabs
        self.setCentralWidget(tabs)

    def _on_tab_changed(self, index: int) -> None:
        if self.tabs.widget(index) is self.dashboard_tab:
            self.dashboard_tab.refresh()
