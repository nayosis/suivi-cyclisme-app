import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as parcoursDb from "../parcours-db";
import type { ParcoursInput } from "../types";
import { ParcoursForm } from "./ParcoursForm";
import { parcoursKey, invalidateParcours } from "../query-client";
import { rootRoute } from "../routes/root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/parcours/$parcoursId/edit",
  component: ParcoursEditPage,
});

function ParcoursEditPage() {
  const { parcoursId } = Route.useParams();
  const navigate = useNavigate();

  const parcoursQuery = useQuery({
    queryKey: [...parcoursKey, "detail", parcoursId],
    queryFn: () => parcoursDb.getParcoursById(Number(parcoursId)),
  });
  const parcours = parcoursQuery.data;

  function backToView() {
    navigate({ to: "/parcours/$parcoursId", params: { parcoursId } });
  }

  if (parcoursQuery.isLoading) return null;

  if (!parcours) {
    return (
      <div className="empty-state" style={{ margin: 24 }}>
        Parcours introuvable.{" "}
        <button type="button" className="link-button" onClick={() => navigate({ to: "/parcours" })}>
          Retour à la liste
        </button>
      </div>
    );
  }

  async function handleSave(input: ParcoursInput) {
    await parcoursDb.updateParcours(parcours!.id, input);
    await invalidateParcours();
    backToView();
  }

  return <ParcoursForm parcours={parcours} onSave={handleSave} onCancel={backToView} />;
}
