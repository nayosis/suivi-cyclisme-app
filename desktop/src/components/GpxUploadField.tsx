import { useMemo, useState } from "react";
import { pickGpxFile } from "../gpx-file";
import { parseGpx } from "../gpx";
import { errorMessage } from "../format";

interface GpxUploadFieldProps {
  gpxData: string | null;
  onChange: (gpxData: string | null) => void;
}

/** Champ d'import d'un fichier GPX : choisit un fichier, le valide, et expose son contenu brut au parent. */
export function GpxUploadField({ gpxData, onChange }: GpxUploadFieldProps) {
  const [error, setError] = useState<string | null>(null);

  const pointCount = useMemo(() => {
    if (!gpxData) return null;
    try {
      return parseGpx(gpxData).length;
    } catch {
      return null;
    }
  }, [gpxData]);

  async function handlePick() {
    setError(null);
    try {
      const xml = await pickGpxFile();
      if (xml) onChange(xml);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="field">
      <label>Tracé GPX</label>
      {gpxData ? (
        <div className="gpx-field-status">
          <span className="gpx-field-status__text">
            Fichier importé{pointCount != null ? ` (${pointCount} points)` : ""}
          </span>
          <div className="gpx-field-status__actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handlePick}>
              Remplacer…
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(null)}>
              Retirer
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" onClick={handlePick}>
          Importer un fichier GPX…
        </button>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
