import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as db from "../db";
import * as maint from "../maintenance-db";
import { MaintenanceFormPage } from "./MaintenanceFormPage";
import { cyclingKey, maintenanceKey, invalidateMaintenance } from "../query-client";
import { rootRoute } from "../routes/root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/maintenance/$maintenanceId/edit",
  component: MaintenanceEditPage,
});

function MaintenanceEditPage() {
  const { maintenanceId } = Route.useParams();
  const navigate = useNavigate();

  const bikesQuery = useQuery({ queryKey: [...cyclingKey, "bikes"], queryFn: db.listBikes });
  const maintenancesQuery = useQuery({
    queryKey: [...maintenanceKey, "maintenances", "all"],
    queryFn: () => maint.listMaintenances(),
  });
  const maintenance = maintenancesQuery.data?.find((m) => m.id === Number(maintenanceId));

  function backToList() {
    navigate({ to: "/maintenance", search: { bike: maintenance?.bike_id } });
  }

  if (maintenancesQuery.isLoading) return null;

  if (!maintenance) {
    return (
      <div className="empty-state" style={{ margin: 24 }}>
        Maintenance introuvable.{" "}
        <button type="button" className="link-button" onClick={() => navigate({ to: "/maintenance" })}>
          Retour à la liste
        </button>
      </div>
    );
  }

  async function handleDelete() {
    await maint.deleteMaintenance(maintenance!.id);
    await invalidateMaintenance();
    backToList();
  }

  return (
    <MaintenanceFormPage
      bikes={bikesQuery.data ?? []}
      maintenance={maintenance}
      onSaved={async () => {
        await invalidateMaintenance();
        backToList();
      }}
      onDelete={handleDelete}
      onBack={backToList}
    />
  );
}
