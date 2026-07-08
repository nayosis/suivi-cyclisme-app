export const DEFAULT_BIKE_COLOR = "#9ca3af";

export interface Bike {
  id: number;
  name: string;
  color: string;
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
