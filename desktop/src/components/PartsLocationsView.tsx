import { useEffect, useState } from "react";
import * as maint from "../maintenance-db";
import { BikePartDefAlreadyExistsError, BikePartDefInUseError, BikesMissingPurchaseDateError } from "../maintenance-db";
import { errorMessage } from "../format";
import type { BikePartDef } from "../types";
import { BikeDiagram } from "./BikeDiagram";

interface PartsLocationsViewProps {
  refreshKey: number;
  onDataChanged: () => void;
}

type Detail =
  | { kind: "none" }
  | { kind: "edit-def"; def: BikePartDef }
  | { kind: "new-def"; x: number; y: number };

function describeError(err: unknown): string {
  if (err instanceof BikePartDefAlreadyExistsError) return "Un emplacement porte déjà ce nom.";
  if (err instanceof BikesMissingPurchaseDateError) {
    return "Tous les vélos doivent avoir une date d'acquisition avant de créer ou de rendre obligatoire un emplacement (onglet Vélos).";
  }
  return errorMessage(err);
}

/**
 * Vue « Emplacements » : configuration pure du catalogue d'emplacements du
 * vélo (nom, position sur le schéma, caractère obligatoire), partagé par
 * tous les vélos. N'installe ni ne désinstalle aucune pièce — ça, c'est le
 * rôle de la saisie d'une maintenance, pour garder la date et l'événement de
 * maintenance associés à chaque changement de pièce.
 */
export function PartsLocationsView({ refreshKey, onDataChanged }: PartsLocationsViewProps) {
  const [defs, setDefs] = useState<BikePartDef[]>([]);
  const [repositioningDefId, setRepositioningDefId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail>({ kind: "none" });
  const [panelError, setPanelError] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formMandatory, setFormMandatory] = useState(false);

  async function refreshCatalog() {
    setDefs(await maint.listBikePartDefs());
  }

  useEffect(() => {
    refreshCatalog();
  }, [refreshKey]);

  useEffect(() => {
    setPanelError(null);
    if (detail.kind === "new-def") {
      setFormName("");
      setFormMandatory(false);
    } else if (detail.kind === "edit-def") {
      setFormName(detail.def.name);
      setFormMandatory(detail.def.mandatory);
    }
  }, [detail]);

  function handleMarkerClick(def: BikePartDef) {
    if (repositioningDefId != null) return;
    setDetail({ kind: "edit-def", def });
  }

  async function handleImageClick(x: number, y: number) {
    if (repositioningDefId != null) {
      const def = defs.find((d) => d.id === repositioningDefId);
      if (def) {
        try {
          await maint.updateBikePartDef(def.id, def.name, x, y, def.mandatory);
          await refreshCatalog();
          onDataChanged();
        } catch (err) {
          setPanelError(describeError(err));
        }
      }
      setRepositioningDefId(null);
      setDetail({ kind: "none" });
      return;
    }
    setDetail({ kind: "new-def", x, y });
  }

  async function handleSaveNewDef(x: number, y: number) {
    if (!formName.trim()) {
      setPanelError("Le nom est obligatoire.");
      return;
    }
    try {
      await maint.addBikePartDef(formName.trim(), x, y, formMandatory);
      setDetail({ kind: "none" });
      await refreshCatalog();
      onDataChanged();
    } catch (err) {
      setPanelError(describeError(err));
    }
  }

  async function handleSaveEditDef(def: BikePartDef) {
    if (!formName.trim()) {
      setPanelError("Le nom est obligatoire.");
      return;
    }
    try {
      await maint.updateBikePartDef(def.id, formName.trim(), def.x, def.y, formMandatory);
      setDetail({ kind: "none" });
      setRepositioningDefId(null);
      await refreshCatalog();
      onDataChanged();
    } catch (err) {
      setPanelError(describeError(err));
    }
  }

  async function handleDeleteDef(def: BikePartDef) {
    if (!confirm(`Supprimer l'emplacement "${def.name}" ?`)) return;
    try {
      await maint.deleteBikePartDef(def.id);
      setDetail({ kind: "none" });
      setRepositioningDefId(null);
      await refreshCatalog();
      onDataChanged();
    } catch (err) {
      if (err instanceof BikePartDefInUseError) {
        setPanelError("Cet emplacement a un historique de montage et ne peut pas être supprimé.");
      } else {
        setPanelError(errorMessage(err));
      }
    }
  }

  return (
    <div>
      {repositioningDefId != null && (
        <div className="reposition-banner">
          Cliquez sur le schéma pour choisir le nouvel emplacement.
          <button className="btn-icon" onClick={() => setRepositioningDefId(null)} title="Annuler">
            ×
          </button>
        </div>
      )}

      <div className="parts-locations">
        <div className="parts-locations__main">
          <BikeDiagram
            defs={defs}
            editable
            onImageClick={handleImageClick}
            onMarkerClick={handleMarkerClick}
            markerVariant={(def) => (def.mandatory ? "filled" : "empty")}
            pendingPoint={detail.kind === "new-def" ? { x: detail.x, y: detail.y } : null}
          />
        </div>

        <div className="card parts-locations__panel">
          {detail.kind === "none" && (
            <div className="empty-state">
              Cliquez sur le schéma pour ajouter un emplacement, ou sur un marqueur existant pour le modifier.
            </div>
          )}

          {detail.kind === "new-def" && (
            <div>
              <div className="section-title" style={{ marginTop: 0 }}>Nouvel emplacement</div>
              <div className="field">
                <label htmlFor="def-name">Nom</label>
                <input
                  id="def-name"
                  autoFocus
                  placeholder="Ex. Support gourde"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={formMandatory}
                  onChange={(e) => setFormMandatory(e.target.checked)}
                />
                Obligatoire (chaque vélo en reçoit un exemplaire automatiquement)
              </label>
              {panelError && <div className="error-text">{panelError}</div>}
              <div className="modal-actions">
                <div />
                <div className="modal-actions__right">
                  <button className="btn btn-secondary" onClick={() => setDetail({ kind: "none" })}>
                    Annuler
                  </button>
                  <button className="btn" onClick={() => handleSaveNewDef(detail.x, detail.y)}>
                    Créer
                  </button>
                </div>
              </div>
            </div>
          )}

          {detail.kind === "edit-def" && (
            <div>
              <div className="section-title" style={{ marginTop: 0 }}>Modifier l'emplacement</div>
              <div className="field">
                <label htmlFor="edit-def-name">Nom</label>
                <input id="edit-def-name" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={formMandatory}
                  onChange={(e) => setFormMandatory(e.target.checked)}
                />
                Obligatoire (chaque vélo en reçoit un exemplaire automatiquement)
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginBottom: 12 }}
                onClick={() => setRepositioningDefId(detail.def.id)}
              >
                Repositionner sur le schéma
              </button>
              {panelError && <div className="error-text">{panelError}</div>}
              <div className="modal-actions">
                <div>
                  <button className="btn btn-danger" onClick={() => handleDeleteDef(detail.def)}>
                    Supprimer
                  </button>
                </div>
                <div className="modal-actions__right">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setDetail({ kind: "none" });
                      setRepositioningDefId(null);
                    }}
                  >
                    Annuler
                  </button>
                  <button className="btn" onClick={() => handleSaveEditDef(detail.def)}>
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
