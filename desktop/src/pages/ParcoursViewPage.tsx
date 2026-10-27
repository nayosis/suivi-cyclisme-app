import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as parcoursDb from "../parcours-db";
import { ParcoursView } from "./ParcoursView";
import { parcoursKey, invalidateParcours } from "../query-client";
import { rootRoute } from "../routes/root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/parcours/$parcoursId",
  component: ParcoursViewPage,
});

function ParcoursViewPage() {
  const { parcoursId } = Route.useParams();
  const navigate = useNavigate();

  const parcoursQuery = useQuery({
    queryKey: [...parcoursKey, "detail", parcoursId],
    queryFn: () => parcoursDb.getParcoursById(Number(parcoursId)),
  });
  const parcours = parcoursQuery.data;

  function backToList() {
    navigate({ to: "/parcours" });
  }

  if (parcoursQuery.isLoading) return null;

  if (!parcours) {
    return (
      <div className="empty-state" style={{ margin: 24 }}>
        Parcours introuvable.{" "}
        <button type="button" className="link-button" onClick={backToList}>
          Retour à la liste
        </button>
      </div>
    );
  }

  async function handleDelete() {
    await parcoursDb.deleteParcours(parcours!.id);
    await invalidateParcours();
    backToList();
  }

  return <ParcoursView parcours={parcours} onBack={backToList} onDelete={handleDelete} />;
}
