"""Reset the database from the records in data/: uv run -m backend.seed"""

import json
from contextlib import closing
from pathlib import Path
from typing import Any

from backend.db import SCHEMA, connect

DATA = Path(__file__).parent.parent / "data"


def load(name: str) -> Any:
    """Read one JSON file from data/."""
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def rows(records: list[dict[str, Any]], key: str) -> list[tuple[str, str]]:
    """Pair each record's id with the record as JSON."""
    return [(item[key], json.dumps(item)) for item in records]


def seed() -> dict[str, int]:
    """Recreate every table and load the records from data/."""
    claims = load("claims.json")
    policies = load("policies.json")
    customers = load("customers.json")
    handlers = load("handlers.json")
    company = load("company.json")
    wording = (DATA / "policy_wording.md").read_text(encoding="utf-8")
    with closing(connect()) as connection, connection:
        connection.executescript(SCHEMA)
        connection.executemany(
            "INSERT INTO claims VALUES (?, ?, ?, 'waiting', NULL, ?)",
            [
                (
                    claim["claim_id"],
                    claim["customer_id"],
                    claim["policy_id"],
                    json.dumps({k: v for k, v in claim.items() if k != "status"}),
                )
                for claim in claims
            ],
        )
        connection.executemany(
            "INSERT INTO policies VALUES (?, ?)", rows(policies, "policy_id")
        )
        connection.executemany(
            "INSERT INTO customers VALUES (?, ?)", rows(customers, "customer_id")
        )
        connection.executemany(
            "INSERT INTO handlers VALUES (?, ?)", rows(handlers, "handler_id")
        )
        connection.executemany(
            "INSERT INTO settings VALUES (?, ?)",
            [(name, json.dumps(value)) for name, value in company.items()],
        )
        connection.execute(
            "INSERT INTO documents VALUES ('policy_wording', ?)", (wording,)
        )
    return {
        "claims": len(claims),
        "policies": len(policies),
        "customers": len(customers),
        "handlers": len(handlers),
    }


if __name__ == "__main__":
    counts = seed()
    print("Seeded " + ", ".join(f"{n} {name}" for name, n in counts.items()))
