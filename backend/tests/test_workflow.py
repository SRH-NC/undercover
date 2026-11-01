import json
from contextlib import closing

import pytest

from backend import db

REASON = "The delay was covered. The receipts support the costs."
SECTION = "Section 3, Trip Delay"


def start(client, claim_id="CLM-1001"):
    return client.post(f"/api/claims/{claim_id}/start", json={"thread_id": "t-1"})


def decide(client, decision, payout, claim_id="CLM-1001"):
    return client.post(
        f"/api/claims/{claim_id}/decision",
        json={
            "decision": decision,
            "payout": payout,
            "reason": REASON,
            "policy_section": SECTION,
        },
    )


def pay(client, amount, claim_id="CLM-1001"):
    return client.post(f"/api/claims/{claim_id}/payment", json={"amount": amount})


def sign_off(client, handler_id="HND-01", claim_id="CLM-1001"):
    return client.post(
        f"/api/claims/{claim_id}/sign-off", json={"handler_id": handler_id}
    )


def approved(client, payout):
    start(client)
    decide(client, "approve", payout)


def test_start_moves_the_claim_to_in_progress_and_returns_it(client):
    response = start(client)
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert response.json()["policy_id"] == "POL-2001"
    assert response.json()["thread_id"] == "t-1"
    assert start(client).status_code == 200


@pytest.mark.parametrize("decision", ["decline", "refer"])
def test_decline_and_refer_are_decided(client, decision):
    start(client)
    response = decide(client, decision, 0)
    assert response.status_code == 200
    assert response.json()["status"] == "decided"
    assert response.json()["decision"]["decision"] == decision
    assert response.json()["payment"] is None


@pytest.mark.parametrize(
    ("payout", "status"),
    [(420, "decided"), (1000, "decided"), (1000.01, "awaiting_sign_off")],
)
def test_approvals_over_the_limit_wait_for_sign_off(client, payout, status):
    start(client)
    assert decide(client, "approve", payout).json()["status"] == status


def test_the_queue_and_the_claim_show_the_decision(client):
    approved(client, 420)
    row = client.get("/api/claims").json()[0]
    assert (row["status"], row["decision"], row["payout"]) == (
        "decided",
        "approve",
        420,
    )
    decision = client.get("/api/claims/CLM-1001").json()["decision"]
    assert decision["reason"] == REASON
    assert decision["policy_section"] == SECTION


def test_a_claim_with_a_decision_cannot_be_started_again(client):
    approved(client, 420)
    assert start(client).status_code == 409
    start(client, "CLM-1002")
    decide(client, "approve", 1200, "CLM-1002")
    assert start(client, "CLM-1002").status_code == 409


def test_only_a_claim_in_progress_can_be_decided(client):
    assert decide(client, "decline", 0).status_code == 409
    start(client)
    decide(client, "decline", 0)
    assert decide(client, "decline", 0).status_code == 409


@pytest.mark.parametrize(
    ("decision", "payout"),
    [("decline", 100), ("refer", 50), ("approve", 0), ("approve", -5), ("pay", 0)],
)
def test_the_payout_must_fit_the_decision(client, decision, payout):
    start(client)
    assert decide(client, decision, payout).status_code == 422


def test_paying_an_approval_within_the_limit(client):
    approved(client, 420)
    response = pay(client, 420)
    assert response.status_code == 200
    payment = response.json()["payment"]
    assert payment["amount"] == 420
    assert payment["handler_id"] is None


def test_only_an_approval_can_be_paid(client):
    assert pay(client, 100).status_code == 409
    start(client)
    decide(client, "decline", 0)
    assert pay(client, 100).status_code == 409


def test_a_claim_is_paid_once(client):
    approved(client, 420)
    pay(client, 420)
    assert pay(client, 420).status_code == 409


def test_only_the_approved_payout_can_be_paid(client):
    approved(client, 420)
    response = pay(client, 400)
    assert response.status_code == 409
    assert "$420.00" in response.json()["detail"]
    assert client.get("/api/claims/CLM-1001").json()["payment"] is None


def test_a_payout_over_the_limit_is_blocked_until_sign_off(client):
    approved(client, 1200)
    response = pay(client, 1200)
    assert response.status_code == 403
    assert "needs a handler's sign-off" in response.json()["detail"]
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "awaiting_sign_off"
    assert claim["payment"] is None


def test_splitting_a_payout_over_the_limit_is_blocked(client):
    approved(client, 1500)
    assert pay(client, 1000).status_code == 403
    assert pay(client, 750).status_code == 403
    assert client.get("/api/claims/CLM-1001").json()["payment"] is None


def test_a_sign_off_pays_the_approved_payout(client):
    approved(client, 1200)
    response = sign_off(client)
    assert response.status_code == 200
    assert response.json()["status"] == "decided"
    payment = response.json()["payment"]
    assert payment["amount"] == 1200
    assert payment["handler_id"] == "HND-01"
    assert payment["handler_name"] == "Dana Whitfield"
    assert pay(client, 1200).status_code == 409


def test_only_a_claim_waiting_for_sign_off_can_be_signed_off(client):
    assert sign_off(client).status_code == 409
    approved(client, 420)
    assert sign_off(client).status_code == 409


def test_a_sign_off_needs_a_handler_who_can_approve_over_the_limit(client):
    approved(client, 1200)
    assert sign_off(client, "HND-99").status_code == 404
    with closing(db.connect()) as connection, connection:
        handler = db.record(
            connection.execute(
                "SELECT record FROM handlers WHERE handler_id = 'HND-03'"
            ).fetchone()
        )
        handler["can_approve_over_limit"] = False
        connection.execute(
            "UPDATE handlers SET record = ? WHERE handler_id = 'HND-03'",
            (json.dumps(handler),),
        )
    assert sign_off(client, "HND-03").status_code == 403
    assert client.get("/api/claims/CLM-1001").json()["payment"] is None


def test_steps_come_back_in_order_with_their_thread(client):
    for n, kind in enumerate(["tool_call", "tool_result", "message"]):
        response = client.post(
            "/api/claims/CLM-1001/steps",
            json={"thread_id": "t-1", "kind": kind, "name": "agent", "content": str(n)},
        )
        assert response.status_code == 200
    steps = client.get("/api/claims/CLM-1001/steps").json()
    assert [step["kind"] for step in steps] == ["tool_call", "tool_result", "message"]
    assert [step["content"] for step in steps] == ["0", "1", "2"]
    assert {step["thread_id"] for step in steps} == {"t-1"}


def test_steps_need_a_known_claim_and_kind(client):
    assert client.get("/api/claims/CLM-9999/steps").status_code == 404
    response = client.post(
        "/api/claims/CLM-1001/steps",
        json={"thread_id": "t-1", "kind": "guess", "name": "agent", "content": ""},
    )
    assert response.status_code == 422
