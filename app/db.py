import sqlite3
from pathlib import Path

from app.paths import db_path

SCHEMA = """
CREATE TABLE IF NOT EXISTS bikes (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS rides (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT NOT NULL,       -- ISO 8601 (YYYY-MM-DD)
    name             TEXT NOT NULL,       -- nom descriptif de la sortie
    duration_minutes INTEGER NOT NULL,    -- duree totale en minutes
    distance_km      REAL NOT NULL,
    elevation_m       INTEGER NOT NULL,   -- denivele positif
    comment          TEXT,
    bike_id          INTEGER NOT NULL REFERENCES bikes(id)
);
"""


def get_connection(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path or db_path()))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()
