import { useEffect, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { RidesPage } from "./pages/RidesPage";
import { BikesPage } from "./pages/BikesPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { OptionsPage } from "./pages/OptionsPage";
import { WelcomeSetup } from "./pages/WelcomeSetup";
import { GearIcon } from "./components/GearIcon";
import { getCurrentDatabaseFilename, migrateLegacyDatabaseIfNeeded } from "./database-registry";

type Tab = "dashboard" | "rides" | "bikes" | "maintenance" | "options";
type DbState = "checking" | "needs-setup" | "ready";

export default function App() {
  const [dbState, setDbState] = useState<DbState>("checking");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      await migrateLegacyDatabaseIfNeeded();
      setDbState(getCurrentDatabaseFilename() ? "ready" : "needs-setup");
    })();
  }, []);

  function bumpRefresh() {
    setRefreshKey((k) => k + 1);
  }

  if (dbState === "checking") return null;

  if (dbState === "needs-setup") {
    return <WelcomeSetup onDone={() => setDbState("ready")} />;
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
        <button
          className={`app-nav__tab ${tab === "maintenance" ? "active" : ""}`}
          onClick={() => setTab("maintenance")}
        >
          Entretien
        </button>
        <button
          className={`app-nav__tab app-nav__tab--icon ${tab === "options" ? "active" : ""}`}
          onClick={() => setTab("options")}
          title="Options"
          aria-label="Options"
        >
          <GearIcon />
        </button>
      </nav>

      {/* Les pages restent montées en permanence (affichage bascule via CSS)
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
      <div className="app-page" style={{ display: tab === "maintenance" ? "block" : "none" }}>
        <MaintenancePage refreshKey={refreshKey} onDataChanged={bumpRefresh} />
      </div>
      <div className="app-page" style={{ display: tab === "options" ? "block" : "none" }}>
        <OptionsPage onDataChanged={bumpRefresh} />
      </div>
    </div>
  );
}
