import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { GearIcon } from "../components/GearIcon";

/** Route racine : porte la barre de navigation, commune à tout l'app. */
export const rootRoute = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <span className="app-nav__brand">🚴 Suivi Cyclisme</span>
        <Link to="/dashboard" className="app-nav__tab" activeProps={{ className: "active" }}>
          Tableau de bord
        </Link>
        <Link to="/rides" className="app-nav__tab" activeProps={{ className: "active" }}>
          Sorties
        </Link>
        <Link to="/bikes" className="app-nav__tab" activeProps={{ className: "active" }}>
          Vélos
        </Link>
        <Link to="/maintenance" className="app-nav__tab" activeProps={{ className: "active" }}>
          Entretien
        </Link>
        <Link
          to="/options"
          className="app-nav__tab app-nav__tab--icon"
          activeProps={{ className: "active" }}
          title="Options"
          aria-label="Options"
        >
          <GearIcon />
        </Link>
      </nav>

      <div className="app-page">
        <Outlet />
      </div>
    </div>
  );
}
