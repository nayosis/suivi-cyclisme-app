import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as maint from "../maintenance-db";
import { PartInstanceInUseError } from "../maintenance-db";
import { PartDetailPage } from "./PartDetailPage";
import { maintenanceKey, invalidateMaintenance } from "../query-client";
import { rootRoute } from "../routes/root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/maintenance/parts/$partId",
  component: MaintenancePartDetailPage,
});

function MaintenancePartDetailPage() {
  const { partId } = Route.useParams();
  const navigate = useNavigate();

  const allTagsQuery = useQuery({ queryKey: [...maintenanceKey, "partTags"], queryFn: maint.listPartTags });
  const partStatsQuery = useQuery({ queryKey: [...maintenanceKey, "partStats"], queryFn: maint.getPartInstanceStats });
  const instance = partStatsQuery.data?.find((p) => p.part_instance_id === Number(partId));

  function backToList() {
    navigate({ to: "/maintenance/parts" });
  }

  if (partStatsQuery.isLoading) return null;

  if (!instance) {
    return (
      <div className="empty-state" style={{ margin: 24 }}>
        Pièce introuvable.{" "}
        <button type="button" className="link-button" onClick={backToList}>
          Retour à la liste
        </button>
      </div>
    );
  }

  async function handleSave(
    name: string,
    purchaseCost: number | null,
    purchaseDate: string | null,
    retiredDate: string | null,
    tagIds: number[]
  ) {
    await maint.updatePartInstance(instance!.part_instance_id, name, purchaseCost, purchaseDate, retiredDate, tagIds);
    await invalidateMaintenance();
    backToList();
  }

  async function handleDelete() {
    try {
      await maint.deletePartInstance(instance!.part_instance_id);
      await invalidateMaintenance();
      backToList();
    } catch (err) {
      if (err instanceof PartInstanceInUseError) {
        throw new Error("Cette pièce a un historique de montage et ne peut pas être supprimée.");
      }
      throw err;
    }
  }

  return (
    <PartDetailPage
      instance={instance}
      allTags={allTagsQuery.data ?? []}
      onBack={backToList}
      onSave={handleSave}
      onDelete={handleDelete}
    />
  );
}
