import { createRoute, createRouter, redirect } from "@tanstack/react-router";
import { rootRoute } from "./routes/root";
import { maintenanceRoute } from "./routes/maintenance-layout";
import { Route as DashboardRoute } from "./pages/DashboardPage";
import { Route as RidesRoute } from "./pages/RidesPage";
import { Route as BikesRoute } from "./pages/BikesPage";
import { Route as OptionsRoute } from "./pages/OptionsPage";
import { Route as MaintenanceListRoute } from "./pages/MaintenanceListPage";
import { Route as MaintenancePartsRoute } from "./pages/MaintenancePartsPage";
import { Route as MaintenanceLocationsRoute } from "./pages/MaintenanceLocationsPage";
import { Route as MaintenanceNewRoute } from "./pages/MaintenanceNewPage";
import { Route as MaintenanceEditRoute } from "./pages/MaintenanceEditPage";
import { Route as MaintenancePartDetailRoute } from "./pages/MaintenancePartDetailPage";

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  DashboardRoute,
  RidesRoute,
  BikesRoute,
  OptionsRoute,
  maintenanceRoute.addChildren([MaintenanceListRoute, MaintenancePartsRoute, MaintenanceLocationsRoute]),
  MaintenanceNewRoute,
  MaintenanceEditRoute,
  MaintenancePartDetailRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
