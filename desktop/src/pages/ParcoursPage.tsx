import { useCallback, useMemo, useState } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as parcoursDb from "../parcours-db";
import { DIRECTIONS } from "../types";
import type { Direction, ParcoursFolder, ParcoursSummary } from "../types";
import { RangeSlider } from "../components/RangeSlider";
import { ParcoursOverviewMap } from "../components/ParcoursOverviewMap";
import { ParcoursFolderModal } from "../components/ParcoursFolderModal";
import { ParcoursRowMenu } from "../components/ParcoursRowMenu";
import { WindRose } from "../components/WindRose";
import { buildParcoursColorMap } from "../parcours-colors";
import { parcoursSource, PARCOURS_SOURCE_LABEL } from "../parcours-source";
import { windMatch, WIND_MATCH_HINT, WIND_MATCH_LABEL } from "../wind";
import { errorMessage, formatNumber } from "../format";
import { invalidateParcours, parcoursKey } from "../query-client";
import { rootRoute } from "../routes/root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/parcours",
  component: ParcoursPage,
});

const DIRECTION_BY_CODE = new Map(DIRECTIONS.map((d) => [d.code, d]));

/** Nombre de dossiers affichés d'emblée (les plus remplis) ; les autres se déplient. */
const FOLDERS_SHOWN = 5;

/** Nombre de communes de départ affichées d'emblée (les plus utilisées) ; les autres se déplient. */
const TOWNS_SHOWN = 6;

const MAP_ENABLED_KEY = "suivi-cyclisme-parcours-map-enabled";

/** Dossier choisi dans la colonne de gauche : tous, les non classés, ou un dossier précis. */
type FolderFilter = "all" | "none" | number;

/** Carte de synthèse affichée ou non, mémorisé. Masquée, elle n'est pas chargée du tout (plus rapide). */
function useMapEnabled(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MAP_ENABLED_KEY) !== "false";
    } catch {
      return true;
    }
  });
  function setEnabled(next: boolean) {
    setEnabledState(next);
    try {
      localStorage.setItem(MAP_ENABLED_KEY, String(next));
    } catch {
      // sans impact : le choix vaut pour la session
    }
  }
  return [enabled, setEnabled];
}

function WindBadge({ routeDirection, windFrom }: { routeDirection: Direction; windFrom: Direction | null }) {
  if (!windFrom) return <span className="wind-badge wind-badge--none">—</span>;
  const { kind } = windMatch(routeDirection, windFrom);
  return (
    <span className={`wind-badge wind-badge--${kind}`} title={WIND_MATCH_HINT[kind]}>
      {kind === "ideal" ? "✓ " : ""}
      {WIND_MATCH_LABEL[kind]}
    </span>
  );
}

function ParcoursPage() {
  const parcoursQuery = useQuery({ queryKey: [...parcoursKey, "list"], queryFn: parcoursDb.listParcours });
  const foldersQuery = useQuery({ queryKey: [...parcoursKey, "folders"], queryFn: parcoursDb.listFolders });
  const parcoursList = parcoursQuery.data ?? [];
  const folders = foldersQuery.data ?? [];

  const [openError, setOpenError] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [folderModal, setFolderModal] = useState<{ folder?: ParcoursFolder } | null>(null);
  const [selectedTowns, setSelectedTowns] = useState<Set<string>>(new Set());
  const [townsExpanded, setTownsExpanded] = useState(false);
  const [foldersExpanded, setFoldersExpanded] = useState(false);
  const [windFrom, setWindFrom] = useState<Direction | null>(null);
  const [onlyIdeal, setOnlyIdeal] = useState(false);
  const [distanceRange, setDistanceRange] = useState<[number, number] | null>(null);
  const [elevationRange, setElevationRange] = useState<[number, number] | null>(null);
  const [search, setSearch] = useState("");
  // Parcours survolé dans le tableau : mis en avant sur la carte, les autres tracés sont atténués.
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Demande de centrage de la carte sur un parcours (le nonce permet de recentrer sur le même après un déplacement).
  const [focusRequest, setFocusRequest] = useState<{ id: number; nonce: number } | null>(null);
  // Parcours dont le tracé est dans la zone visible de la carte (null tant que la carte n'a rien signalé).
  const [visibleIds, setVisibleIds] = useState<Set<number> | null>(null);

  /** Évite un nouveau rendu quand le zoom/déplacement ne change pas l'ensemble des parcours visibles. */
  const handleVisibleChange = useCallback((next: Set<number>) => {
    setVisibleIds((prev) => (prev && prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next));
  }, []);

  // Couleurs stables (par id), indépendantes des filtres, partagées entre la carte et le tableau.
  const colorById = useMemo(() => buildParcoursColorMap(parcoursList), [parcoursList]);

  // La carte de synthèse n'est affichée que s'il existe au moins un tracé ; les parcours sans tracé (lien seul) restent dans le tableau.
  const hasAnyTrack = parcoursList.some((p) => p.has_track);
  const [mapEnabled, setMapEnabled] = useMapEnabled();
  const showMap = hasAnyTrack && mapEnabled;
  // Sans carte, aucune ligne n'est « hors zone ».
  const effectiveVisibleIds = showMap ? visibleIds : null;

  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);
  const folderCounts = useMemo(() => {
    const counts = new Map<number, number>();
    let unclassified = 0;
    for (const p of parcoursList) {
      if (p.folder_id != null && folderNameById.has(p.folder_id)) {
        counts.set(p.folder_id, (counts.get(p.folder_id) ?? 0) + 1);
      } else {
        unclassified++;
      }
    }
    return { counts, unclassified };
  }, [parcoursList, folderNameById]);

  // Dossiers, les plus remplis d'abord ; le dossier choisi reste toujours visible.
  const sortedFolders = useMemo(
    () =>
      [...folders].sort(
        (a, b) =>
          (folderCounts.counts.get(b.id) ?? 0) - (folderCounts.counts.get(a.id) ?? 0) || a.name.localeCompare(b.name)
      ),
    [folders, folderCounts]
  );
  const shownFolders = foldersExpanded
    ? sortedFolders
    : sortedFolders.filter((f, i) => i < FOLDERS_SHOWN || folderFilter === f.id);

  // Communes de départ, les plus utilisées d'abord (Chinon, Avoine… sont ainsi à portée de clic).
  const towns = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of parcoursList) counts.set(p.start_town, (counts.get(p.start_town) ?? 0) + 1);
    return Array.from(counts, ([town, count]) => ({ town, count })).sort(
      (a, b) => b.count - a.count || a.town.localeCompare(b.town)
    );
  }, [parcoursList]);
  const shownTowns = townsExpanded
    ? towns
    : towns.filter((t, i) => i < TOWNS_SHOWN || selectedTowns.has(t.town));

  const distanceBounds = useMemo<[number, number]>(() => {
    if (parcoursList.length === 0) return [0, 0];
    const values = parcoursList.map((p) => p.distance_km);
    return [Math.floor(Math.min(...values)), Math.ceil(Math.max(...values))];
  }, [parcoursList]);

  const elevationBounds = useMemo<[number, number]>(() => {
    if (parcoursList.length === 0) return [0, 0];
    const values = parcoursList.map((p) => p.elevation_m);
    return [Math.floor(Math.min(...values)), Math.ceil(Math.max(...values))];
  }, [parcoursList]);

  const effectiveDistanceRange = distanceRange ?? distanceBounds;
  const effectiveElevationRange = elevationRange ?? elevationBounds;

  function toggleTown(town: string) {
    setSelectedTowns((prev) => {
      const next = new Set(prev);
      if (next.has(town)) next.delete(town);
      else next.add(town);
      return next;
    });
  }

  function resetFilters() {
    setSelectedTowns(new Set());
    setWindFrom(null);
    setOnlyIdeal(false);
    setDistanceRange(null);
    setElevationRange(null);
    setSearch("");
  }

  const hasActiveFilters =
    selectedTowns.size > 0 ||
    windFrom !== null ||
    onlyIdeal ||
    distanceRange !== null ||
    elevationRange !== null ||
    search.trim() !== "";

  // Mémorisée : une nouvelle liste à chaque rendu (ex. au survol d'une ligne) obligerait la carte à tout recalculer.
  const filteredList = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = parcoursList.filter((p) => {
      if (folderFilter === "none") {
        if (p.folder_id != null && folderNameById.has(p.folder_id)) return false;
      } else if (folderFilter !== "all" && p.folder_id !== folderFilter) return false;
      if (selectedTowns.size > 0 && !selectedTowns.has(p.start_town)) return false;
      if (p.distance_km < effectiveDistanceRange[0] || p.distance_km > effectiveDistanceRange[1]) return false;
      if (p.elevation_m < effectiveElevationRange[0] || p.elevation_m > effectiveElevationRange[1]) return false;
      if (windFrom && onlyIdeal && windMatch(p.direction, windFrom).kind !== "ideal") return false;
      if (query) {
        const folderName = p.folder_id != null ? (folderNameById.get(p.folder_id) ?? "") : "";
        if (!`${p.name} ${p.start_town} ${folderName}`.toLowerCase().includes(query)) return false;
      }
      return true;
    });
    // Avec un vent choisi : les parcours les mieux adaptés d'abord, puis les plus courts.
    if (windFrom) {
      result.sort(
        (a, b) =>
          windMatch(b.direction, windFrom).score - windMatch(a.direction, windFrom).score ||
          a.distance_km - b.distance_km
      );
    }
    return result;
  }, [
    parcoursList,
    folderFilter,
    folderNameById,
    selectedTowns,
    effectiveDistanceRange,
    effectiveElevationRange,
    search,
    windFrom,
    onlyIdeal,
  ]);

  const selected: ParcoursSummary | null = filteredList.find((p) => p.id === selectedId) ?? filteredList[0] ?? null;

  async function handleOpenSite(url: string) {
    setOpenError(null);
    try {
      await openUrl(url);
    } catch (err) {
      setOpenError(errorMessage(err));
    }
  }

  async function handleMove(parcoursId: number, folderId: number | null) {
    await parcoursDb.setParcoursFolder(parcoursId, folderId);
    await invalidateParcours();
  }

  async function handleSaveFolder(name: string) {
    if (folderModal?.folder) await parcoursDb.renameFolder(folderModal.folder.id, name);
    else setFolderFilter(await parcoursDb.addFolder(name));
    await invalidateParcours();
    setFolderModal(null);
  }

  async function handleDeleteFolder() {
    const folder = folderModal?.folder;
    if (!folder) return;
    await parcoursDb.deleteFolder(folder.id);
    if (folderFilter === folder.id) setFolderFilter("all");
    await invalidateParcours();
    setFolderModal(null);
  }

  function folderButton(filter: FolderFilter, label: string, count: number, folder?: ParcoursFolder) {
    const active = folderFilter === filter;
    return (
      <div key={String(filter)} className={`parcours-folder ${active ? "active" : ""}`}>
        <button type="button" className="parcours-folder__main" aria-pressed={active} onClick={() => setFolderFilter(filter)}>
          <span className="parcours-folder__name">{label}</span>
          <span className="parcours-folder__count">{count}</span>
        </button>
        {folder && (
          <button
            type="button"
            className="parcours-folder__edit"
            title="Renommer ou supprimer le dossier"
            aria-label={`Renommer ou supprimer le dossier ${folder.name}`}
            onClick={() => setFolderModal({ folder })}
          >
            ✎
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="parcours-page">
      <div className={`parcours-layout ${showMap ? "parcours-layout--map" : ""}`}>
        <aside className="card parcours-side">
          <div className="parcours-filter-group">
            <div className="parcours-filter-group__label">Dossiers</div>
            <div className="parcours-folders">
              {folderButton("all", "Tous les parcours", parcoursList.length)}
              {shownFolders.map((f) => folderButton(f.id, f.name, folderCounts.counts.get(f.id) ?? 0, f))}
              {folders.length > shownFolders.length && (
                <button type="button" className="link-button parcours-folders__more" onClick={() => setFoldersExpanded(true)}>
                  + {folders.length - shownFolders.length} autres dossiers
                </button>
              )}
              {foldersExpanded && folders.length > FOLDERS_SHOWN && (
                <button type="button" className="link-button parcours-folders__more" onClick={() => setFoldersExpanded(false)}>
                  Réduire
                </button>
              )}
              {folders.length > 0 && folderButton("none", "Non classés", folderCounts.unclassified)}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFolderModal({})}>
              + Nouveau dossier
            </button>
          </div>

          {parcoursList.length > 0 && (
            <>
              <div className="parcours-filter-group">
                <div className="parcours-filter-group__label">Départ</div>
                <div className="tag-toggle-list">
                  {shownTowns.map(({ town, count }) => (
                    <button
                      key={town}
                      type="button"
                      className={`tag-chip tag-chip--toggle ${selectedTowns.has(town) ? "active" : ""}`}
                      onClick={() => toggleTown(town)}
                      title={`${count} parcours`}
                    >
                      {town}
                    </button>
                  ))}
                  {towns.length > shownTowns.length && (
                    <button type="button" className="link-button" onClick={() => setTownsExpanded(true)}>
                      + {towns.length - shownTowns.length} autres
                    </button>
                  )}
                  {townsExpanded && towns.length > TOWNS_SHOWN && (
                    <button type="button" className="link-button" onClick={() => setTownsExpanded(false)}>
                      Réduire
                    </button>
                  )}
                </div>
              </div>

              <div className="parcours-filter-group">
                <div className="parcours-filter-group__label">Vent (d'où il vient)</div>
                <WindRose value={windFrom} onChange={setWindFrom} />
                <label className={`parcours-filter-check ${windFrom ? "" : "parcours-filter-check--disabled"}`}>
                  <input
                    type="checkbox"
                    checked={onlyIdeal}
                    disabled={!windFrom}
                    onChange={(e) => setOnlyIdeal(e.target.checked)}
                  />
                  Ne garder que les parcours idéaux
                </label>
              </div>

              <div className="parcours-filter-group">
                <div className="parcours-filter-group__label">Distance (km)</div>
                <RangeSlider
                  min={distanceBounds[0]}
                  max={distanceBounds[1]}
                  step={0.5}
                  valueMin={effectiveDistanceRange[0]}
                  valueMax={effectiveDistanceRange[1]}
                  onChange={(vMin, vMax) => setDistanceRange([vMin, vMax])}
                  formatValue={(v) => `${formatNumber(v, v % 1 === 0 ? 0 : 1)} km`}
                />
              </div>

              <div className="parcours-filter-group">
                <div className="parcours-filter-group__label">Dénivelé+ (m)</div>
                <RangeSlider
                  min={elevationBounds[0]}
                  max={elevationBounds[1]}
                  step={10}
                  valueMin={effectiveElevationRange[0]}
                  valueMax={effectiveElevationRange[1]}
                  onChange={(vMin, vMax) => setElevationRange([vMin, vMax])}
                  formatValue={(v) => `${formatNumber(v)} m`}
                />
              </div>

              {hasActiveFilters && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters}>
                  Réinitialiser les filtres
                </button>
              )}
            </>
          )}
        </aside>

        <section className="parcours-center">
          <div className="parcours-center__bar">
            <input
              type="search"
              className="parcours-search"
              placeholder="Rechercher un parcours…"
              aria-label="Rechercher un parcours"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="parcours-center__count">
              {filteredList.length} parcours
            </span>
            <span className="parcours-center__spacer" />
            {hasAnyTrack && !mapEnabled && (
              <button type="button" className="btn btn-secondary" onClick={() => setMapEnabled(true)}>
                Afficher la carte
              </button>
            )}
            <Link to="/parcours/new" className="btn">
              Ajouter
            </Link>
          </div>

          <div className="card parcours-table-card">
            {parcoursQuery.isPending ? (
              <div className="empty-state" role="status">
                Chargement des parcours…
              </div>
            ) : filteredList.length === 0 ? (
              <div className="empty-state">
                {parcoursList.length === 0
                  ? "Aucun parcours enregistré. Ajoutez-en un pour commencer."
                  : "Aucun parcours ne correspond aux filtres."}
              </div>
            ) : (
              <div className="parcours-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Parcours</th>
                      <th>Distance</th>
                      <th>Dénivelé+</th>
                      <th>Aller</th>
                      <th>Vent</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((p) => {
                      const direction = DIRECTION_BY_CODE.get(p.direction);
                      const color = colorById.get(p.id);
                      const source = parcoursSource(p);
                      const folderName = p.folder_id != null ? folderNameById.get(p.folder_id) : undefined;
                      const classes = [
                        "parcours-row",
                        selected?.id === p.id ? "parcours-row--selected" : "",
                        effectiveVisibleIds && p.has_track && !effectiveVisibleIds.has(p.id) ? "parcours-row--offscreen" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <tr
                          key={p.id}
                          className={classes}
                          onClick={() => setSelectedId(p.id)}
                          onMouseEnter={() => setHoveredId(p.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <td>
                            <div className="parcours-row__name">
                              {color && (
                                <span className="bike-color-dot" style={{ background: color }} title="Couleur du tracé sur la carte" />
                              )}
                              {p.name}
                            </div>
                            <div className="parcours-row__meta">
                              {p.start_town}
                              {folderName ? ` · ${folderName}` : ""}
                              <span className={`parcours-source-badge parcours-source-badge--${source}`}>
                                {PARCOURS_SOURCE_LABEL[source]}
                              </span>
                            </div>
                          </td>
                          <td className="parcours-row__num">
                            {formatNumber(p.distance_km, p.distance_km % 1 === 0 ? 0 : 1)} km
                          </td>
                          <td className="parcours-row__num">{formatNumber(p.elevation_m)} m</td>
                          <td className="parcours-row__num" title={direction ? `Aller vers ${direction.label}` : undefined}>
                            {direction ? (
                              <>
                                <span className="direction-badge">{direction.arrow}</span> {direction.code}
                              </>
                            ) : (
                              p.direction
                            )}
                          </td>
                          <td>
                            <WindBadge routeDirection={p.direction} windFrom={windFrom} />
                          </td>
                          <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                            {showMap && p.has_track && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                title="Centrer la carte sur ce parcours"
                                aria-label={`Centrer la carte sur ${p.name}`}
                                onClick={() => {
                                  setSelectedId(p.id);
                                  setFocusRequest({ id: p.id, nonce: Date.now() });
                                }}
                              >
                                ◎
                              </button>
                            )}{" "}
                            <Link
                              to="/parcours/$parcoursId"
                              params={{ parcoursId: String(p.id) }}
                              className="btn btn-secondary btn-sm"
                            >
                              Détails
                            </Link>{" "}
                            <ParcoursRowMenu
                              siteUrl={p.site_url}
                              folders={folders}
                              folderId={p.folder_id}
                              onOpenSite={() => handleOpenSite(p.site_url!)}
                              onMove={(folderId) => handleMove(p.id, folderId)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {openError && <div className="error-text">{openError}</div>}
        </section>

        {showMap && (
          <aside className="parcours-mapcol">
            <div className="card parcours-mapcol__map">
              <ParcoursOverviewMap
                parcoursList={filteredList}
                colorById={colorById}
                highlightedId={hoveredId}
                selectedId={selected?.id ?? null}
                focusRequest={focusRequest}
                onVisibleChange={handleVisibleChange}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm parcours-mapcol__hide"
                onClick={() => setMapEnabled(false)}
                title="Les tracés ne sont plus chargés : la page est plus rapide"
              >
                Masquer la carte
              </button>
            </div>
            {selected && (
              <div className="card parcours-detail">
                <div className="parcours-detail__title">{selected.name}</div>
                <div className="parcours-detail__stats">
                  <div>
                    <small>Distance</small>
                    <b>{formatNumber(selected.distance_km, selected.distance_km % 1 === 0 ? 0 : 1)} km</b>
                  </div>
                  <div>
                    <small>Dénivelé+</small>
                    <b>{formatNumber(selected.elevation_m)} m</b>
                  </div>
                  <div>
                    <small>Aller vers</small>
                    <b>
                      <span className="direction-badge">{DIRECTION_BY_CODE.get(selected.direction)?.arrow}</span>{" "}
                      {DIRECTION_BY_CODE.get(selected.direction)?.label}
                    </b>
                  </div>
                </div>
                <div className="parcours-detail__wind">
                  <WindBadge routeDirection={selected.direction} windFrom={windFrom} />
                </div>
                <div className="parcours-detail__actions">
                  <Link
                    to="/parcours/$parcoursId"
                    params={{ parcoursId: String(selected.id) }}
                    className="btn btn-sm"
                  >
                    Ouvrir la fiche
                  </Link>
                  {selected.has_track && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setFocusRequest({ id: selected.id, nonce: Date.now() })}
                    >
                      Centrer
                    </button>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {folderModal && (
        <ParcoursFolderModal
          folder={folderModal.folder}
          onSave={handleSaveFolder}
          onDelete={folderModal.folder ? handleDeleteFolder : undefined}
          onClose={() => setFolderModal(null)}
        />
      )}
    </div>
  );
}
