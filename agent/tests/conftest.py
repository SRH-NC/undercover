import pytest
from fastapi.testclient import TestClient

from agent import main
from backend.main import app
from backend.seed import seed


@pytest.fixture
def api(tmp_path, monkeypatch):
    """Point the agent at the backend on a freshly seeded database."""
    monkeypatch.setenv("UNDERCOVER_DB", str(tmp_path / "undercover.db"))
    seed()
    monkeypatch.setattr(main, "backend", lambda: TestClient(app))
    return TestClient(app)
