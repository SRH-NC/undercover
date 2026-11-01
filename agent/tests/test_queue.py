import importlib

queue = importlib.import_module("agent.__main__")


def decide(api, claim_id, decision, payout):
    api.post(f"/api/claims/{claim_id}/start", json={"thread_id": "t"})
    api.post(
        f"/api/claims/{claim_id}/decision",
        json={
            "decision": decision,
            "payout": payout,
            "reason": "A scripted decision.",
            "policy_section": "Section 5, Baggage and Personal Effects",
        },
    )


def test_pending_is_every_claim_without_a_decision(api):
    decide(api, "CLM-1001", "decline", 0)
    api.post("/api/claims/CLM-1002/start", json={"thread_id": "t"})
    pending = queue.pending()
    assert "CLM-1001" not in pending
    assert pending[:2] == ["CLM-1002", "CLM-1003"]
    assert len(pending) == 24


def test_main_works_each_claim_carries_on_past_a_failure_and_sums_up(
    api, monkeypatch, capsys
):
    outcomes = {
        "CLM-1001": ("approve", 420),
        "CLM-1002": ("approve", 1200),
        "CLM-1004": ("refer", 0),
    }

    def run(claim_id, thread_id):
        if claim_id == "CLM-1003":
            raise RuntimeError("rate limited")
        if claim_id in outcomes:
            decide(api, claim_id, *outcomes[claim_id])

    monkeypatch.setattr(queue, "run", run)
    queue.main(["CLM-1001", "CLM-1002", "CLM-1003", "CLM-1004", "CLM-1005"])
    assert capsys.readouterr().out.splitlines() == [
        "CLM-1001  approve  $420.00",
        "CLM-1002  approve  $1,200.00  waiting for sign-off",
        "CLM-1003  failed: rate limited",
        "CLM-1004  refer  $0.00",
        "CLM-1005  no decision",
        "5 claims: 2 approved, 0 declined, 1 referred, 2 without a decision. "
        "1 approvals are waiting for sign-off.",
    ]


def test_main_with_no_claims_named_works_the_pending_ones(api, monkeypatch):
    worked = []
    monkeypatch.setattr(queue, "pending", lambda: ["CLM-1007"])
    monkeypatch.setattr(queue, "run", lambda claim_id, _: worked.append(claim_id))
    queue.main([])
    assert worked == ["CLM-1007"]
