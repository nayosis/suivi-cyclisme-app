import { useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { RidesPage } from "./pages/RidesPage";
import { BikesPage } from "./pages/BikesPage";

type Tab = "dashboard" | "rides" | "bikes";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);

  function bumpRefresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <span className="app-nav__brand">🚴 Suivi Cyclisme</span>
        <button
          className={`app-nav__tab ${tab === "dashboard" ? "active" : ""}`}
          onClick={() => setTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={`app-nav__tab ${tab === "rides" ? "active" : ""}`}
          onClick={() => setTab("rides")}
        >
          Sorties
        </button>
        <button
          className={`app-nav__tab ${tab === "bikes" ? "active" : ""}`}
          onClick={() => setTab("bikes")}
        >
          Vélos
        </button>
      </nav>

      {/* Les 3 pages restent montées en permanence (affichage bascule via CSS)
          pour que chacune conserve son état (filtres, sélections...) au changement d'onglet. */}
      <div className="app-page" style={{ display: tab === "dashboard" ? "block" : "none" }}>
        <DashboardPage refreshKey={refreshKey} />
      </div>
      <div className="app-page" style={{ display: tab === "rides" ? "block" : "none" }}>
        <RidesPage refreshKey={refreshKey} onDataChanged={bumpRefresh} />
      </div>
      <div className="app-page" style={{ display: tab === "bikes" ? "block" : "none" }}>
        <BikesPage refreshKey={refreshKey} onDataChanged={bumpRefresh} />
      </div>
    </div>
  );
}
