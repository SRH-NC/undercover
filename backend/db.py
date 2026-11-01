"""The UnderCover database: SQLite, seeded from data/."""

import json
import os
import sqlite3
from collections.abc import Iterator
from contextlib import closing
from pathlib import Path
from typing import Any

DEFAULT_PATH = Path(__file__).parent / "undercover.db"

SCHEMA = """
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS policies;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS handlers;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS documents;

CREATE TABLE claims (
    claim_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    status TEXT NOT NULL,
    record TEXT NOT NULL
);
CREATE TABLE policies (policy_id TEXT PRIMARY KEY, record TEXT NOT NULL);
CREATE TABLE customers (customer_id TEXT PRIMARY KEY, record TEXT NOT NULL);
CREATE TABLE handlers (handler_id TEXT PRIMARY KEY, record TEXT NOT NULL);
CREATE TABLE settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE documents (name TEXT PRIMARY KEY, content TEXT NOT NULL);
"""


def path() -> Path:
    """Return the database file: UNDERCOVER_DB if set, else backend/undercover.db."""
    return Path(os.getenv("UNDERCOVER_DB", DEFAULT_PATH))


def connect() -> sqlite3.Connection:
    """Open a connection that returns rows by column name."""
    connection = sqlite3.connect(path(), check_same_thread=False)
    connection.row_factory = sqlite3.Row
    return connection


def database() -> Iterator[sqlite3.Connection]:
    """Give one request a connection, committing when the request succeeds."""
    with closing(connect()) as connection, connection:
        yield connection


def record(row: sqlite3.Row) -> dict[str, Any]:
    """Return the JSON record stored in a row."""
    return json.loads(row["record"])


def setting(connection: sqlite3.Connection, name: str) -> Any:
    """Return one of the company settings from data/company.json."""
    row = connection.execute(
        "SELECT value FROM settings WHERE name = ?", (name,)
    ).fetchone()
    return json.loads(row["value"])
