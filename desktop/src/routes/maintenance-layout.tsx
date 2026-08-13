import { createRoute, Link, Outlet } from "@tanstack/react-router";
import { rootRoute } from "./root";

/** Route parente `/maintenance` : porte les onglets Maintenances/Pièces/Emplacements, partagés par ses routes filles. */
export const maintenanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/maintenance",
  component: MaintenanceLayout,
});

function MaintenanceLayout() {
  return (
    <div>
      <div className="segmented" style={{ marginBottom: 18 }}>
        <Link to="/maintenance" activeOptions={{ exact: true }} className="segmented__option" activeProps={{ className: "active" }}>
          Maintenances
        </Link>
        <Link to="/maintenance/parts" className="segmented__option" activeProps={{ className: "active" }}>
          Pièces
        </Link>
        <Link to="/maintenance/locations" className="segmented__option" activeProps={{ className: "active" }}>
          Emplacements
        </Link>
      </div>
      <Outlet />
    </div>
  );
}
