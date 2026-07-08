import sqlite3
from dataclasses import dataclass

MONTH_LABELS = [
    "Janv", "Fév", "Mars", "Avr", "Mai", "Juin",
    "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
]


@dataclass
class Totals:
    distance_km: float
    elevation_m: int
    ride_count: int
    duration_minutes: int


@dataclass
class BreakdownRow:
    label: str
    distance_km: float
    elevation_m: int
    ride_count: int


def totals(conn: sqlite3.Connection) -> Totals:
    row = conn.execute(
        """
        SELECT
            COALESCE(SUM(distance_km), 0),
            COALESCE(SUM(elevation_m), 0),
            COUNT(*),
            COALESCE(SUM(duration_minutes), 0)
        FROM rides
        """
    ).fetchone()
    return Totals(
        distance_km=row[0],
        elevation_m=row[1],
        ride_count=row[2],
        duration_minutes=row[3],
    )


def by_year(conn: sqlite3.Connection) -> list[BreakdownRow]:
    rows = conn.execute(
        """
        SELECT substr(date, 1, 4) AS year,
               COALESCE(SUM(distance_km), 0),
               COALESCE(SUM(elevation_m), 0),
               COUNT(*)
        FROM rides
        GROUP BY year
        ORDER BY year
        """
    ).fetchall()
    return [BreakdownRow(label=r[0], distance_km=r[1], elevation_m=r[2], ride_count=r[3]) for r in rows]


def by_month(conn: sqlite3.Connection) -> list[BreakdownRow]:
    rows = conn.execute(
        """
        SELECT substr(date, 6, 2) AS month,
               COALESCE(SUM(distance_km), 0),
               COALESCE(SUM(elevation_m), 0),
               COUNT(*)
        FROM rides
        GROUP BY month
        ORDER BY month
        """
    ).fetchall()
    by_month_num = {r[0]: r for r in rows}
    result = []
    for i in range(1, 13):
        key = f"{i:02d}"
        r = by_month_num.get(key)
        if r:
            result.append(BreakdownRow(label=MONTH_LABELS[i - 1], distance_km=r[1], elevation_m=r[2], ride_count=r[3]))
        else:
            result.append(BreakdownRow(label=MONTH_LABELS[i - 1], distance_km=0, elevation_m=0, ride_count=0))
    return result


def by_bike(conn: sqlite3.Connection) -> list[BreakdownRow]:
    rows = conn.execute(
        """
        SELECT bikes.name,
               COALESCE(SUM(rides.distance_km), 0),
               COALESCE(SUM(rides.elevation_m), 0),
               COUNT(*)
        FROM rides
        JOIN bikes ON bikes.id = rides.bike_id
        GROUP BY bikes.name
        ORDER BY SUM(rides.distance_km) DESC
        """
    ).fetchall()
    return [BreakdownRow(label=r[0], distance_km=r[1], elevation_m=r[2], ride_count=r[3]) for r in rows]
