"""The UnderCover backend."""

import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException

from backend import db
from backend.seed import seed

type JSON = dict[str, Any]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Seed the database on the first start."""
    if not db.path().exists():
        seed()
    yield


app = FastAPI(title="UnderCover", lifespan=lifespan)
Db = Annotated[sqlite3.Connection, Depends(db.database)]


def find(connection: sqlite3.Connection, table: str, key: str, value: str) -> JSON:
    """Return one stored record, or raise 404."""
    row = connection.execute(
        f"SELECT record FROM {table} WHERE {key} = ?",  # noqa: S608
        (value,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"{value} not found")
    return db.record(row)


@app.get("/api/health", operation_id="health")
def health() -> dict[str, str]:
    """Check that the backend is running."""
    return {"status": "ok"}


@app.get("/api/claims", operation_id="list_claims")
def list_claims(connection: Db) -> list[JSON]:
    """List the claims queue with where each claim stands."""
    rows = connection.execute(
        """
        SELECT claims.record, claims.status,
            json_extract(customers.record, '$.name') AS customer_name
        FROM claims JOIN customers USING (customer_id)
        ORDER BY claims.claim_id
        """
    ).fetchall()
    return [queue_row(row) for row in rows]


def queue_row(row: sqlite3.Row) -> JSON:
    """Return the fields of a claim that the queue shows."""
    claim = db.record(row)
    return {
        "claim_id": claim["claim_id"],
        "customer_name": row["customer_name"],
        "claim_type": claim["claim_type"],
        "summary": claim["summary"],
        "amount_claimed": claim["amount_claimed"],
        "submitted_on": claim["submitted_on"],
        "status": row["status"],
    }


@app.get("/api/claims/{claim_id}", operation_id="get_claim")
def get_claim(claim_id: str, connection: Db) -> JSON:
    """Get a claim in full, with where it stands."""
    row = connection.execute(
        "SELECT record, status FROM claims WHERE claim_id = ?", (claim_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"{claim_id} not found")
    return {**db.record(row), "status": row["status"]}


@app.get("/api/policies/{policy_id}", operation_id="get_policy")
def get_policy(policy_id: str, connection: Db) -> JSON:
    """Get a policy: its plan, add-ons, trip and travelers."""
    return find(connection, "policies", "policy_id", policy_id)


@app.get("/api/customers/{customer_id}/claim-history", operation_id="get_claim_history")
def get_claim_history(customer_id: str, connection: Db) -> JSON:
    """Get a customer's earlier claims, without their contact details."""
    customer = find(connection, "customers", "customer_id", customer_id)
    return {
        "customer_id": customer["customer_id"],
        "name": customer["name"],
        "customer_since": customer["customer_since"],
        "previous_claims": customer["previous_claims"],
    }


@app.get("/api/policy-wording", operation_id="get_policy_wording")
def get_policy_wording(connection: Db) -> JSON:
    """Get the policy wording that decisions follow."""
    row = connection.execute(
        "SELECT content FROM documents WHERE name = 'policy_wording'"
    ).fetchone()
    return {
        "version": db.setting(connection, "policy_wording_version"),
        "content": row["content"],
    }


@app.get("/api/handlers", operation_id="list_handlers")
def list_handlers(connection: Db) -> list[JSON]:
    """List the claims handlers."""
    rows = connection.execute(
        "SELECT record FROM handlers ORDER BY handler_id"
    ).fetchall()
    return [db.record(row) for row in rows]
