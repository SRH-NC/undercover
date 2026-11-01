"""Work the claims queue: uv run -m agent, or uv run -m agent CLM-1001 to work one."""

import sys
from collections import Counter
from typing import Any
from uuid import uuid4

from agent.main import request, run


def pending() -> list[str]:
    """Return the claims with no decision yet, including any a failed run left."""
    claims = request("GET", "/api/claims").json()
    return [
        claim["claim_id"]
        for claim in claims
        if claim["status"] in {"waiting", "in_progress"}
    ]


def outcome(claim: dict[str, Any]) -> str:
    """Describe where a claim ended up, in one line."""
    decision = claim["decision"]
    if decision is None:
        return f"{claim['claim_id']}  no decision"
    held = "  waiting for sign-off" if claim["status"] == "awaiting_sign_off" else ""
    return (
        f"{claim['claim_id']}  {decision['decision']}  ${decision['payout']:,.2f}{held}"
    )


def summary(claim_ids: list[str]) -> str:
    """Count what happened to the claims that were worked."""
    claims = [
        claim
        for claim in request("GET", "/api/claims").json()
        if claim["claim_id"] in claim_ids
    ]
    decisions = Counter(claim["decision"] for claim in claims)
    held = sum(claim["status"] == "awaiting_sign_off" for claim in claims)
    return (
        f"{len(claims)} claims: {decisions['approve']} approved, "
        f"{decisions['decline']} declined, {decisions['refer']} referred, "
        f"{decisions[None]} without a decision. "
        f"{held} approvals are waiting for sign-off."
    )


def main(claim_ids: list[str]) -> None:
    """Work the given claims, or every claim with no decision yet."""
    claim_ids = claim_ids or pending()
    for claim_id in claim_ids:
        try:
            run(claim_id, uuid4().hex)
        except Exception as error:
            print(f"{claim_id}  failed: {error}")
            continue
        print(outcome(request("GET", f"/api/claims/{claim_id}").json()))
    print(summary(claim_ids))


if __name__ == "__main__":
    main(sys.argv[1:])
