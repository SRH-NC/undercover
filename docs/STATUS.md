# Status

The pilot is being built from `docs/PLAN.md`. Phases 1 to 5 of 6 are done.

## Built

- `backend/`: FastAPI on SQLite. The database is `backend/undercover.db` (or `UNDERCOVER_DB`), seeded from `data/` on the first start. It holds the claims, policies, customers, handlers, company settings and policy wording, never `data/evals/`, `data/security/` or the claims manual.
  - Reads: `list_claims`, `get_claim`, `get_policy`, `get_claim_history` (no contact details), `get_policy_wording`, `list_handlers` and `health`.
  - The workflow: `start_claim`, `add_step`, `list_steps`, `decide_claim`, `pay_claim` and `sign_off_claim`. A claim goes from `waiting` to `in_progress`, then to `decided`, or to `awaiting_sign_off` for an approval over $1,000 (the limit in `data/company.json`).
  - `pay_claim` pays only the approved payout, once, and refuses any payout over the limit with a 403. A handler's sign-off makes that payment. No money moves in the pilot.
  - A test checks that every operation has an `operation_id`, a one-line docstring and no optional inputs.
  - `get_instructions` serves the agent's instructions from `backend/instructions.md`.
- `agent/`: the UnderCover Agent, LangChain's `create_agent` on OpenRouter (`openai/gpt-6-luna` at low reasoning, or `MODEL_NAME`). `run(claim_id, thread_id)` starts the claim, fetches the instructions from the API, streams the agent and records each model message, tool call and tool result as a step. Its six tools (`get_claim`, `get_policy`, `get_claim_history`, `get_policy_wording`, `decide_claim`, `pay_claim`) take no ids and work only on the claim being run. The agent reaches everything through the API, and imports nothing from `backend/`.
- `dashboard/`: React, Vite and TypeScript in UnderCover's brand (`docs/BRAND.md`), light and dark from the system setting. Three pages, refreshing every two seconds:
  - `/`: the queue, with the claims in each state and a table of every claim.
  - `/claims/<id>`: the claim in full, with its policy and claim history, the agent's decision, reasons and policy section, and whether it's paid. Beside it, the agent's steps in plain words as they happen. An approval over the limit has a sign-off panel: choose a handler, sign off, and the system pays.
  - `/instructions`: the agent's instructions, read only.
- `e2e/`: Playwright tests on their own backend (port 8001, a new database in the system temp folder) and dashboard (port 5174), so `npm run check` never touches the development queue.

## Run it

- `npm run dev` starts the backend on port 8000 and the dashboard on port 5173.
- `uv run -m backend.seed` resets the database from `data/`.
- `uv run -m agent` works every claim without a decision, and `uv run -m agent CLM-1001` works one. It needs the backend running and `OPENROUTER_API_KEY` in `.env`.
- `npm run check` runs every check.
