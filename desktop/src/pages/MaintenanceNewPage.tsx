import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as db from "../db";
import { MaintenanceFormPage } from "./MaintenanceFormPage";
import { cyclingKey, invalidateMaintenance } from "../query-client";
import { rootRoute } from "../routes/root";

interface MaintenanceNewSearch {
  bikeId?: number;
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/maintenance/new",
  validateSearch: (search: Record<string, unknown>): MaintenanceNewSearch => ({
    bikeId: Number(search.bikeId) || undefined,
  }),
  component: MaintenanceNewPage,
});

function MaintenanceNewPage() {
  const { bikeId } = Route.useSearch();
  const navigate = useNavigate();
  const bikesQuery = useQuery({ queryKey: [...cyclingKey, "bikes"], queryFn: db.listBikes });

  function backToList() {
    navigate({ to: "/maintenance", search: { bike: bikeId } });
  }

  return (
    <MaintenanceFormPage
      bikes={bikesQuery.data ?? []}
      defaultBikeId={bikeId}
      onSaved={async () => {
        await invalidateMaintenance();
        backToList();
      }}
      onBack={backToList}
    />
  );
}
