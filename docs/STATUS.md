# Status

The pilot is being built from `docs/PLAN.md`. Phases 1 and 2 of 6 are done.

## Built

- `backend/`: FastAPI on SQLite. The database is `backend/undercover.db` (or `UNDERCOVER_DB`), seeded from `data/` on the first start. It holds the claims, policies, customers, handlers, company settings and policy wording, never `data/evals/`, `data/security/` or the claims manual.
  - Reads: `list_claims`, `get_claim`, `get_policy`, `get_claim_history` (no contact details), `get_policy_wording`, `list_handlers` and `health`.
  - The workflow: `start_claim`, `add_step`, `list_steps`, `decide_claim`, `pay_claim` and `sign_off_claim`. A claim goes from `waiting` to `in_progress`, then to `decided`, or to `awaiting_sign_off` for an approval over $1,000 (the limit in `data/company.json`).
  - `pay_claim` pays only the approved payout, once, and refuses any payout over the limit with a 403. A handler's sign-off makes that payment. No money moves in the pilot.
  - A test checks that every operation has an `operation_id`, a one-line docstring and no optional inputs.
- `agent/`: still the skeleton, `run(claim_id, thread_id)` with one tool that calls the health route.
- `dashboard/`: still the skeleton, one page that shows whether the backend is up.
- `e2e/`: one test of that page.

## Run it

- `npm run dev` starts the backend on port 8000 and the dashboard on port 5173.
- `uv run -m backend.seed` resets the database from `data/`.
- `npm run check` runs every check.
