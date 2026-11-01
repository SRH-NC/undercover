"""The UnderCover backend."""

import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, Self

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

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


class Start(BaseModel):
    thread_id: str = Field(min_length=1)


class NewStep(BaseModel):
    thread_id: str = Field(min_length=1)
    kind: Literal["message", "tool_call", "tool_result"]
    name: str
    content: str


class Decision(BaseModel):
    decision: Literal["approve", "decline", "refer"]
    payout: float = Field(ge=0)
    reason: str = Field(min_length=1)
    policy_section: str = Field(min_length=1)

    @model_validator(mode="after")
    def payout_fits_decision(self) -> Self:
        """Only an approval has a payout, and every approval has one."""
        if self.decision == "approve" and self.payout == 0:
            raise ValueError("An approval needs a payout of more than $0")
        if self.decision != "approve" and self.payout != 0:
            raise ValueError("Only an approval has a payout")
        return self


class Payment(BaseModel):
    amount: float


class SignOff(BaseModel):
    handler_id: str


def now() -> str:
    """Return the current time in UTC, to the second."""
    return datetime.now(UTC).isoformat(timespec="seconds")


def dollars(amount: float) -> str:
    """Format an amount as US dollars, such as $1,250.00."""
    return f"${amount:,.2f}"


def find(connection: sqlite3.Connection, table: str, key: str, value: str) -> JSON:
    """Return one stored record, or raise 404."""
    row = connection.execute(
        f"SELECT record FROM {table} WHERE {key} = ?",  # noqa: S608
        (value,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"{value} not found")
    return db.record(row)


def status_of(connection: sqlite3.Connection, claim_id: str) -> str:
    """Return where a claim stands, or raise 404."""
    row = connection.execute(
        "SELECT status FROM claims WHERE claim_id = ?", (claim_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"{claim_id} not found")
    return row["status"]


def decision_of(connection: sqlite3.Connection, claim_id: str) -> JSON | None:
    """Return the decision on a claim, if there is one."""
    row = connection.execute(
        """
        SELECT decision, payout, reason, policy_section, decided_at
        FROM decisions WHERE claim_id = ?
        """,
        (claim_id,),
    ).fetchone()
    return dict(row) if row else None


def payment_of(connection: sqlite3.Connection, claim_id: str) -> JSON | None:
    """Return the payment on a claim, with who signed it off, if there is one."""
    row = connection.execute(
        """
        SELECT payments.amount, payments.paid_at,
            payments.signed_off_by AS handler_id,
            json_extract(handlers.record, '$.name') AS handler_name
        FROM payments LEFT JOIN handlers ON handlers.handler_id = signed_off_by
        WHERE claim_id = ?
        """,
        (claim_id,),
    ).fetchone()
    return dict(row) if row else None


def state(connection: sqlite3.Connection, claim_id: str) -> JSON:
    """Return where a claim stands: its status, run, decision and payment."""
    status = status_of(connection, claim_id)
    thread = connection.execute(
        "SELECT thread_id FROM claims WHERE claim_id = ?", (claim_id,)
    ).fetchone()
    return {
        "claim_id": claim_id,
        "status": status,
        "thread_id": thread["thread_id"],
        "decision": decision_of(connection, claim_id),
        "payment": payment_of(connection, claim_id),
    }


def set_status(connection: sqlite3.Connection, claim_id: str, status: str) -> None:
    """Move a claim to a new status."""
    connection.execute(
        "UPDATE claims SET status = ? WHERE claim_id = ?", (status, claim_id)
    )


def record_payment(
    connection: sqlite3.Connection, claim_id: str, amount: float, handler: str | None
) -> None:
    """Record that a claim is paid. No money moves in the pilot."""
    connection.execute(
        "INSERT INTO payments VALUES (?, ?, ?, ?)", (claim_id, amount, handler, now())
    )


@app.get("/api/health", operation_id="health")
def health() -> dict[str, str]:
    """Check that the backend is running."""
    return {"status": "ok"}


@app.get("/api/claims", operation_id="list_claims")
def list_claims(connection: Db) -> list[JSON]:
    """List the claims queue with where each claim stands."""
    rows = connection.execute(
        """
        SELECT claims.record, claims.status, decisions.decision, decisions.payout,
            json_extract(customers.record, '$.name') AS customer_name
        FROM claims
        JOIN customers USING (customer_id)
        LEFT JOIN decisions USING (claim_id)
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
        "decision": row["decision"],
        "payout": row["payout"],
    }


@app.get("/api/claims/{claim_id}", operation_id="get_claim")
def get_claim(claim_id: str, connection: Db) -> JSON:
    """Get a claim in full, with its status, decision and payment."""
    claim = find(connection, "claims", "claim_id", claim_id)
    return {**claim, **state(connection, claim_id)}


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


@app.post("/api/claims/{claim_id}/start", operation_id="start_claim")
def start_claim(claim_id: str, start: Start, connection: Db) -> JSON:
    """Start work on a claim and return it in full."""
    status = status_of(connection, claim_id)
    if status not in {"waiting", "in_progress"}:
        raise HTTPException(409, f"{claim_id} already has a decision")
    connection.execute(
        "UPDATE claims SET status = 'in_progress', thread_id = ? WHERE claim_id = ?",
        (start.thread_id, claim_id),
    )
    return get_claim(claim_id, connection)


@app.post("/api/claims/{claim_id}/steps", operation_id="add_step")
def add_step(claim_id: str, step: NewStep, connection: Db) -> JSON:
    """Record one step of the agent's work on a claim."""
    status_of(connection, claim_id)
    created_at = now()
    cursor = connection.execute(
        "INSERT INTO steps VALUES (NULL, ?, ?, ?, ?, ?, ?)",
        (claim_id, step.thread_id, step.kind, step.name, step.content, created_at),
    )
    return {"step_id": cursor.lastrowid, **step.model_dump(), "created_at": created_at}


@app.get("/api/claims/{claim_id}/steps", operation_id="list_steps")
def list_steps(claim_id: str, connection: Db) -> list[JSON]:
    """List the agent's steps on a claim, in order."""
    status_of(connection, claim_id)
    rows = connection.execute(
        """
        SELECT step_id, thread_id, kind, name, content, created_at
        FROM steps WHERE claim_id = ? ORDER BY step_id
        """,
        (claim_id,),
    ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/claims/{claim_id}/decision", operation_id="decide_claim")
def decide_claim(claim_id: str, decision: Decision, connection: Db) -> JSON:
    """Record the decision on a claim that is in progress."""
    if status_of(connection, claim_id) != "in_progress":
        raise HTTPException(409, f"{claim_id} is not in progress")
    payout = round(decision.payout, 2)
    connection.execute(
        "INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?)",
        (
            claim_id,
            decision.decision,
            payout,
            decision.reason,
            decision.policy_section,
            now(),
        ),
    )
    over_limit = payout > db.setting(connection, "payout_approval_limit")
    set_status(connection, claim_id, "awaiting_sign_off" if over_limit else "decided")
    return state(connection, claim_id)


@app.post("/api/claims/{claim_id}/payment", operation_id="pay_claim")
def pay_claim(claim_id: str, payment: Payment, connection: Db) -> JSON:
    """Pay the approved payout; one over the limit waits for a handler's sign-off."""
    status_of(connection, claim_id)
    decision = decision_of(connection, claim_id)
    if decision is None or decision["decision"] != "approve":
        raise HTTPException(409, f"{claim_id} has no approval to pay")
    if payment_of(connection, claim_id):
        raise HTTPException(409, f"{claim_id} is already paid")
    limit = db.setting(connection, "payout_approval_limit")
    if decision["payout"] > limit:
        raise HTTPException(
            403,
            f"A payout over {dollars(limit)} needs a handler's sign-off. "
            "The payment waits until a handler signs off, and then the system pays.",
        )
    if round(payment.amount, 2) != decision["payout"]:
        raise HTTPException(
            409,
            f"The approved payout on {claim_id} is {dollars(decision['payout'])}, "
            f"not {dollars(payment.amount)}",
        )
    record_payment(connection, claim_id, decision["payout"], None)
    return state(connection, claim_id)


@app.post("/api/claims/{claim_id}/sign-off", operation_id="sign_off_claim")
def sign_off_claim(claim_id: str, sign_off: SignOff, connection: Db) -> JSON:
    """A handler signs off an approval over the limit, and the system pays it."""
    if status_of(connection, claim_id) != "awaiting_sign_off":
        raise HTTPException(409, f"{claim_id} is not waiting for sign-off")
    handler = find(connection, "handlers", "handler_id", sign_off.handler_id)
    if not handler["can_approve_over_limit"]:
        raise HTTPException(
            403, f"{handler['name']} cannot sign off payouts over the limit"
        )
    payout = connection.execute(
        "SELECT payout FROM decisions WHERE claim_id = ?", (claim_id,)
    ).fetchone()["payout"]
    record_payment(connection, claim_id, payout, sign_off.handler_id)
    set_status(connection, claim_id, "decided")
    return state(connection, claim_id)
