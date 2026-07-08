import sqlite3
from dataclasses import dataclass


@dataclass
class Bike:
    id: int
    name: str


@dataclass
class Ride:
    id: int
    date: str  # ISO 8601 YYYY-MM-DD
    name: str
    duration_minutes: int
    distance_km: float
    elevation_m: int
    comment: str | None
    bike_id: int
    bike_name: str = ""


class BikeAlreadyExistsError(Exception):
    pass


class BikeInUseError(Exception):
    pass


def list_bikes(conn: sqlite3.Connection) -> list[Bike]:
    rows = conn.execute("SELECT id, name FROM bikes ORDER BY name").fetchall()
    return [Bike(id=r["id"], name=r["name"]) for r in rows]


def add_bike(conn: sqlite3.Connection, name: str) -> int:
    try:
        cur = conn.execute("INSERT INTO bikes (name) VALUES (?)", (name,))
        conn.commit()
        return cur.lastrowid
    except sqlite3.IntegrityError:
        raise BikeAlreadyExistsError(name)


def update_bike(conn: sqlite3.Connection, bike_id: int, name: str) -> None:
    try:
        conn.execute("UPDATE bikes SET name = ? WHERE id = ?", (name, bike_id))
        conn.commit()
    except sqlite3.IntegrityError:
        raise BikeAlreadyExistsError(name)


def delete_bike(conn: sqlite3.Connection, bike_id: int) -> None:
    in_use = conn.execute(
        "SELECT COUNT(*) FROM rides WHERE bike_id = ?", (bike_id,)
    ).fetchone()[0]
    if in_use:
        raise BikeInUseError(bike_id)
    conn.execute("DELETE FROM bikes WHERE id = ?", (bike_id,))
    conn.commit()


def list_rides(conn: sqlite3.Connection) -> list[Ride]:
    rows = conn.execute(
        """
        SELECT rides.id, rides.date, rides.name, rides.duration_minutes,
               rides.distance_km, rides.elevation_m, rides.comment,
               rides.bike_id, bikes.name AS bike_name
        FROM rides
        JOIN bikes ON bikes.id = rides.bike_id
        ORDER BY rides.date DESC, rides.id DESC
        """
    ).fetchall()
    return [
        Ride(
            id=r["id"],
            date=r["date"],
            name=r["name"],
            duration_minutes=r["duration_minutes"],
            distance_km=r["distance_km"],
            elevation_m=r["elevation_m"],
            comment=r["comment"],
            bike_id=r["bike_id"],
            bike_name=r["bike_name"],
        )
        for r in rows
    ]


def add_ride(
    conn: sqlite3.Connection,
    date: str,
    name: str,
    duration_minutes: int,
    distance_km: float,
    elevation_m: int,
    comment: str | None,
    bike_id: int,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO rides (date, name, duration_minutes, distance_km, elevation_m, comment, bike_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (date, name, duration_minutes, distance_km, elevation_m, comment, bike_id),
    )
    conn.commit()
    return cur.lastrowid


def update_ride(
    conn: sqlite3.Connection,
    ride_id: int,
    date: str,
    name: str,
    duration_minutes: int,
    distance_km: float,
    elevation_m: int,
    comment: str | None,
    bike_id: int,
) -> None:
    conn.execute(
        """
        UPDATE rides
        SET date = ?, name = ?, duration_minutes = ?, distance_km = ?,
            elevation_m = ?, comment = ?, bike_id = ?
        WHERE id = ?
        """,
        (date, name, duration_minutes, distance_km, elevation_m, comment, bike_id, ride_id),
    )
    conn.commit()


def delete_ride(conn: sqlite3.Connection, ride_id: int) -> None:
    conn.execute("DELETE FROM rides WHERE id = ?", (ride_id,))
    conn.commit()
