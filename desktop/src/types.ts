export const DEFAULT_BIKE_COLOR = "#9ca3af";

export interface Bike {
  id: number;
  name: string;
  color: string;
  /**
   * Date d'acquisition du vélo — sert de date de montage par défaut pour ses
   * pièces d'origine. `null` seulement pour les vélos créés avant l'ajout de
   * ce champ ; toute création/modification exige désormais une valeur.
   */
  purchase_date: string | null;
  /** Kilométrage du vélo à l'achat (un vélo d'occasion ne part pas forcément de 0). */
  purchase_km: number;
}

export interface Ride {
  id: number;
  date: string; // ISO YYYY-MM-DD
  name: string;
  duration_minutes: number;
  distance_km: number;
  elevation_m: number;
  comment: string | null;
  bike_id: number;
  bike_name: string;
  bike_color: string;
}

export interface RideInput {
  date: string;
  name: string;
  duration_minutes: number;
  distance_km: number;
  elevation_m: number;
  comment: string | null;
  bike_id: number;
}

export interface Totals {
  distance_km: number;
  elevation_m: number;
  ride_count: number;
  duration_minutes: number;
}

export interface BreakdownRow {
  label: string;
  distance_km: number;
  elevation_m: number;
  ride_count: number;
}

/**
 * Emplacement du vélo (ex. "Pédalier", "Pneu avant"), positionné sur le
 * schéma partagé par tous les vélos. `mandatory` = tous les vélos possèdent
 * automatiquement un exemplaire à cet emplacement (ex. le pédalier), par
 * opposition aux emplacements facultatifs que l'utilisateur instancie
 * lui-même vélo par vélo (ex. un support de gourde).
 */
export interface BikePartDef {
  id: number;
  name: string;
  /** Position sur le schéma, en pourcentage (0-100) de sa largeur/hauteur. */
  x: number;
  y: number;
  mandatory: boolean;
  /**
   * Tags de pièces jugés compatibles avec cet emplacement (ex. "Roue avant"
   * → tags "Roue", "Support"). Purement indicatif : sert à pré-filtrer les
   * pièces proposées à l'installation dans la saisie de maintenance, mais
   * n'empêche rien — un emplacement sans tag ne filtre simplement pas.
   */
  tagIds: number[];
}

/**
 * Exemplaire concret d'une pièce, ex. "Continental GP5000 #1". N'a pas
 * d'emplacement fixe : celui-ci est porté par chaque période de montage
 * ({@link PartMount}), pour permettre par exemple de déplacer un même pneu
 * de la roue avant à la roue arrière au fil du temps.
 */
export interface PartInstance {
  id: number;
  name: string;
  purchase_cost: number | null;
  /** Date d'achat de l'exemplaire (début de vie), indépendante de son historique de montage. */
  purchase_date: string | null;
  /** Date de mise au rebut de l'exemplaire (fin de vie), `null` s'il est toujours en service. */
  retired_date: string | null;
  tags: PartTag[];
}

/** Étiquette libre (libellé + couleur) qu'on peut accrocher à un ou plusieurs exemplaires, pour les filtrer. */
export interface PartTag {
  id: number;
  name: string;
  color: string;
}

/** Événement de maintenance : une action sur un vélo à une date. */
export interface Maintenance {
  id: number;
  bike_id: number;
  bike_name: string;
  date: string;
  comment: string | null;
  cost: number | null;
}

export interface MaintenanceInput {
  bike_id: number;
  date: string;
  comment: string | null;
  cost: number | null;
}

/**
 * Période de montage d'un exemplaire de pièce sur un **emplacement** d'un
 * vélo : de `mounted_at` à `unmounted_at` (`null` = encore monté
 * aujourd'hui). Chaque bout est rattaché à la maintenance qui l'a déclenché,
 * si elle existe — une pose/dépose peut aussi être directe (sans
 * maintenance), notamment pour l'instanciation automatique des pièces
 * d'origine obligatoires.
 */
export interface PartMount {
  id: number;
  part_instance_id: number;
  part_instance_name: string;
  bike_part_def_id: number;
  bike_part_def_name: string;
  bike_id: number;
  bike_name: string;
  mounted_at: string;
  unmounted_at: string | null;
  mounted_by_maintenance_id: number | null;
  removed_by_maintenance_id: number | null;
}

/** Statistiques cumulées d'un exemplaire de pièce (toutes périodes confondues). */
export interface PartInstanceStats {
  part_instance_id: number;
  name: string;
  purchase_cost: number | null;
  purchase_date: string | null;
  retired_date: string | null;
  total_km: number;
  total_elevation_m: number;
  tags: PartTag[];
  /** Monture actuelle, si l'exemplaire est actuellement installé quelque part. */
  currentMount: {
    bike_id: number;
    bike_name: string;
    bike_color: string;
    bike_part_def_id: number;
    bike_part_def_name: string;
    mounted_at: string;
  } | null;
}
