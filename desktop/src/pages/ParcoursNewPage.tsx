import { createRoute, useNavigate } from "@tanstack/react-router";
import * as parcoursDb from "../parcours-db";
import type { ParcoursInput } from "../types";
import { ParcoursForm } from "./ParcoursForm";
import { invalidateParcours } from "../query-client";
import { rootRoute } from "../routes/root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/parcours/new",
  component: ParcoursNewPage,
});

function ParcoursNewPage() {
  const navigate = useNavigate();

  function backToList() {
    navigate({ to: "/parcours" });
  }

  async function handleSave(input: ParcoursInput) {
    const id = await parcoursDb.addParcours(input);
    await invalidateParcours();
    navigate({ to: "/parcours/$parcoursId", params: { parcoursId: String(id) } });
  }

  return <ParcoursForm onSave={handleSave} onCancel={backToList} />;
}
