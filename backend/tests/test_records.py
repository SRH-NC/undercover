from fastapi.testclient import TestClient

from backend import db
from backend.main import app
from backend.seed import seed


def test_seed_counts(tmp_path, monkeypatch):
    monkeypatch.setenv("UNDERCOVER_DB", str(tmp_path / "undercover.db"))
    assert seed() == {"claims": 25, "policies": 50, "customers": 49, "handlers": 3}


def test_queue_is_the_25_queue_claims_waiting(client):
    claims = client.get("/api/claims").json()
    assert [claim["claim_id"] for claim in claims] == [
        f"CLM-{n}" for n in range(1001, 1026)
    ]
    assert {claim["status"] for claim in claims} == {"waiting"}
    assert claims[0]["customer_name"] == "Maya Patel"
    assert claims[0]["amount_claimed"] == 420.0


def test_get_claim(client):
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "waiting"
    assert claim["story"].startswith("My flight home from Rome")
    assert len(claim["items"]) == 3
    assert len(claim["documents"]) == 4


def test_unknown_records_are_404(client):
    assert client.get("/api/claims/CLM-9999").status_code == 404
    assert client.get("/api/policies/POL-9999").status_code == 404
    assert client.get("/api/customers/CUS-9999/claim-history").status_code == 404


def test_get_policy(client):
    policy = client.get("/api/policies/POL-2001").json()
    assert policy["plan"] == "premium"
    assert policy["trip"]["destination"] == "Rome, Italy"
    assert policy["trip"]["departs_on"] == "2026-06-10"
    assert policy["trip"]["returns_on"] == "2026-06-18"


def test_claim_history_has_no_contact_details(client):
    history = client.get("/api/customers/CUS-3001/claim-history").json()
    assert history["name"] == "Maya Patel"
    assert len(history["previous_claims"]) == 1
    assert set(history) == {"customer_id", "name", "customer_since", "previous_claims"}


def test_policy_wording(client):
    wording = client.get("/api/policy-wording").json()
    assert wording["version"] == "2026.1"
    assert wording["content"].startswith(
        "# UnderCover Travel Insurance: Policy Wording"
    )


def test_handlers(client):
    names = [handler["name"] for handler in client.get("/api/handlers").json()]
    assert names == ["Dana Whitfield", "Marcus Oyelaran", "Priya Raman"]


def test_first_start_seeds_the_database(tmp_path, monkeypatch):
    monkeypatch.setenv("UNDERCOVER_DB", str(tmp_path / "new.db"))
    with TestClient(app) as client:
        assert len(client.get("/api/claims").json()) == 25
    assert db.path().exists()
