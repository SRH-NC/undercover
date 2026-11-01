# Plan: the claims pilot

This plan builds the pilot in `docs/SPEC.md`: a backend that holds UnderCover's records and enforces its rules, the UnderCover Agent that decides claims through the backend's API, and a dashboard where the claims team watches the queue, reads each claim and decision, follows the agent step by step, reads its instructions and signs off large payouts.

It's in six phases. Each builds on the last, so the backend's rules come first, then the agent that works within them, and then the screens the handlers use. A phase is done only when every checkbox under it is ticked.

## How it fits together

```
dashboard (React)  ── HTTP ──▶  backend (FastAPI + SQLite)  ◀── HTTP ──  UnderCover Agent (LangChain)
                                        ▲
                                  seeded from data/
                     (never data/evals/, data/security/ or the claims manual)
```

The backend is the only part that touches the data. The agent and the dashboard are both clients of its API, and the agent imports nothing from `backend/` and reads nothing from `data/`.

A claim moves through four states:

```
waiting ──▶ in progress ──▶ decided                      (decline, refer, or approve up to $1,000)
                       └──▶ waiting for sign-off ──▶ decided   (approve over $1,000; the sign-off pays)
```

## The main choices, and why

1. **The $1,000 rule is enforced in the backend, not in the agent's instructions.** The spec says the system must block the payment "even if the agent tries to pay", so the block can't depend on the model behaving. The payment operation refuses any payout over the limit (read from `data/company.json`) until a handler signs off, and the sign-off itself makes the payment. It also refuses to pay a claim twice, or to pay an amount other than the approved payout. That closes the obvious workaround of paying $1,500 as two payments of $750.
2. **The agent's tools are scoped to the claim it's working on.** The entry point starts the claim, then gives the agent tools that take no claim, policy or customer id: `get_claim`, `get_policy`, `get_claim_history`, `get_policy_wording`, `decide_claim` and `pay_claim`. The agent can't read another customer's records or decide a claim it wasn't given, and a small model can't pass the wrong id.
3. **The agent sees no personal contact details.** `customers.json` holds email addresses, phone numbers, birth dates and home addresses, and the agent needs none of them to decide a claim. The backend serves a customer's *claim history* (name, customer since, earlier claims), and nothing else about the customer. The dashboard uses the same operation.
4. **The agent's instructions live in the backend**, in `backend/instructions.md`. The tech stack says the agent gets its instructions only through the API, and the spec asks for them to be visible, read only. So the backend serves them, the agent fetches them at the start of every run, and the dashboard shows the same text.
5. **The agent's steps are recorded as they happen.** The entry point streams the agent's run, and posts each model message, tool call and tool result to the backend as a step. The dashboard polls every two seconds, so the team sees the agent read the claim, the policy and the wording, then decide and pay. Polling is a few lines and plenty live for steps that take seconds each, so there are no WebSockets or server-sent events.
6. **The agent is run from the command line.** `uv run -m agent` works through every claim that's still waiting, one at a time, and `uv run -m agent CLM-1001` works one claim. The spec doesn't ask for a button in the dashboard, and keeping the agent out of the backend's process keeps the two apart.
7. **SQLite holds the records as they come, plus what happens to them.** The seed copies claims, policies, customers, handlers, the company settings and the policy wording into SQLite, keeping each record's JSON as it is in `data/`. Separate tables hold what changes: each claim's status, the decision, the payment and the agent's steps. `uv run -m backend.seed` resets everything, which is how you rerun the queue, since a decided claim is final.
8. **The end-to-end tests run on their own servers and their own database.** Today Playwright reuses whatever is on port 8000. Once the tests start deciding claims, that would rewrite your queue whenever `npm run check` runs. So Playwright will start a backend on port 8001 with a new database in the system temp folder, and a dashboard on port 5174 that talks to it.
9. **No new libraries.** Three pages don't need a router (the app picks the page from the URL path, and links are plain links). The instructions are shown as preformatted text, so no Markdown library. SQLite comes with Python.

## The API

Every operation has an `operation_id`, a one-line docstring and no optional inputs, as the tech stack requires. A test checks this for every route, so later operations can't slip.

| `operation_id` | Route | What it does |
|---|---|---|
| `health` | `GET /api/health` | Checks that the backend is running (exists today) |
| `list_claims` | `GET /api/claims` | The queue: each claim's id, customer, type, summary, amount claimed, date, status, and decision and payout once decided |
| `get_claim` | `GET /api/claims/{claim_id}` | The claim in full, with its status, decision and payment |
| `get_policy` | `GET /api/policies/{policy_id}` | A policy: plan, add-ons, purchase date, trip and travelers |
| `get_claim_history` | `GET /api/customers/{customer_id}/claim-history` | A customer's name, customer-since date and earlier claims, without contact details |
| `get_policy_wording` | `GET /api/policy-wording` | The policy wording and its version |
| `get_instructions` | `GET /api/instructions` | The agent's instructions |
| `list_handlers` | `GET /api/handlers` | The claims handlers |
| `start_claim` | `POST /api/claims/{claim_id}/start` | Takes a `thread_id`, moves the claim to in progress and returns it |
| `add_step` | `POST /api/claims/{claim_id}/steps` | Records one step of the agent's work: `thread_id`, `kind` (message, tool call or tool result), `name`, `content` |
| `list_steps` | `GET /api/claims/{claim_id}/steps` | The agent's steps on a claim, in order |
| `decide_claim` | `POST /api/claims/{claim_id}/decision` | Records `decision` (approve, decline or refer), `payout`, `reason` and `policy_section` |
| `pay_claim` | `POST /api/claims/{claim_id}/payment` | Takes the `amount` and pays the claim, within the rules below |
| `sign_off_claim` | `POST /api/claims/{claim_id}/sign-off` | Takes a `handler_id`. The handler signs off an approval over the limit, and the system pays it |

The rules:

- `start_claim` refuses a claim that's decided or waiting for sign-off (409). It accepts one left in progress, so a run that crashed can be picked up again.
- `decide_claim` refuses a claim that isn't in progress (409). The payout must be more than $0 to approve and exactly $0 to decline or refer (422). An approval over the limit moves the claim to waiting for sign-off, and any other decision moves it to decided.
- `pay_claim` refuses a claim without an approval (409), one already paid (409), any payout over the limit (403, "needs a handler's sign-off") and any amount other than the approved payout (409).
- `sign_off_claim` refuses a claim that isn't waiting for sign-off (409), an unknown handler (404) and a handler who can't approve over the limit (403). Today, all three can.
- Unknown claims, policies and customers are 404.

## Phase 1: The backend's records

Builds the SQLite database, the seed and the read operations: `list_claims`, `get_claim`, `get_policy`, `get_claim_history`, `get_policy_wording` and `list_handlers`. The database lives at `backend/undercover.db` (ignored by git), or wherever the `UNDERCOVER_DB` environment variable points. The backend seeds it on startup if it doesn't exist, and `uv run -m backend.seed` resets it. The seed reads only `claims.json`, `policies.json`, `customers.json`, `handlers.json`, `company.json` and `policy_wording.md`, and maps each claim's `open` status to `waiting`. Tests run on a fresh database in a temporary folder.

Why first: everything else reads from this, and getting the records right (and keeping the answer key out) is the foundation.

- [x] `uv run -m backend.seed` resets the database and prints the counts: 25 claims, 50 policies, 49 customers and 3 handlers
- [x] `GET /api/claims` returns 25 claims, `CLM-1001` to `CLM-1025` in order, all `waiting`, each with its customer's name
- [x] `GET /api/claims/CLM-1001` returns the story, 3 items, 4 documents, status `waiting`, and no decision or payment
- [x] `GET /api/policies/POL-2001` returns the Premium plan and the Rome trip from June 10 to June 18, 2026
- [x] `GET /api/customers/CUS-3001/claim-history` returns Maya Patel with one earlier claim, and the response has no email, phone, address or date of birth
- [x] `GET /api/policy-wording` returns version `2026.1` and text that starts with `# UnderCover Travel Insurance: Policy Wording`
- [x] `GET /api/handlers` returns Dana Whitfield, Marcus Oyelaran and Priya Raman
- [x] `GET /api/claims/CLM-9999` returns 404
- [x] A test checks that the queue holds exactly `CLM-1001` to `CLM-1025` and none of the held-out claims
- [x] A test walks the OpenAPI schema and checks that every operation has an `operation_id`, a one-line description, and only required parameters and body fields
- [x] `npm run check:python` passes, with coverage at 80% or more

## Phase 2: The claim workflow and the payment block

Adds `start_claim`, `add_step`, `list_steps`, `decide_claim`, `pay_claim` and `sign_off_claim`, with the rules above. The payment and sign-off are records in SQLite. No money moves.

Why now: these are the business rules the agent has to work within. Building and testing them before the agent exists means the $1,000 block is proven to hold whatever the agent does.

- [x] Tests cover each move between states: start, then decline, refer, approve within the limit (decided) and approve over the limit (waiting for sign-off)
- [x] Tests cover each refusal: starting a decided claim, deciding a waiting claim, declining with a payout, approving with $0, paying without an approval, paying twice, paying the wrong amount, signing off a decided claim, and signing off as an unknown handler
- [x] Tests show the block holds: paying the full amount of an approval over $1,000 returns 403 and records no payment, paying $1,000 of a $1,500 approval is refused, and paying after a handler's sign-off is refused as already paid
- [x] A test shows that a sign-off pays the approved payout, records who signed off and moves the claim to decided
- [x] A test shows that steps come back in the order they were added, with their thread id
- [x] Against the running backend, `curl` walks one claim through start, an approval of $1,200, a payment attempt (403 with the sign-off message), a sign-off by `HND-01`, and `get_claim` showing it decided and paid $1,200.00 with Dana's sign-off. Then `uv run -m backend.seed` resets the queue
- [x] `npm run check:python` passes, with coverage at 80% or more

## Phase 3: The UnderCover Agent

Builds the agent on LangChain's `create_agent` and OpenRouter, keeping the skeleton's model choice: `openai/gpt-6-luna` at low reasoning effort, or `MODEL_NAME` when it's set.

- **Instructions:** `backend/instructions.md`, served by `get_instructions`. They tell the agent to read the claim, the policy, the claim history and the policy wording, then decide from the wording alone. That means the covered trip dates, the benefit's conditions and waiting periods, the documents it requires, the exclusions, the add-ons, the per-item limits, what other parties have paid, the deductible and the maximums, worked out as section 10 of the wording sets out. It approves with a payout, declines, or refers when a required document is missing or the claim needs a person's judgment. It gives the reason in two or three plain sentences with the policy section (such as "Section 3, Trip Delay"), then pays approvals of $1,000 or less. Over $1,000, a handler signs off and the system pays.
- **Entry point:** `run(claim_id, thread_id)` starts the claim through the API, fetches the instructions, builds the tools for that claim, streams the agent and records each step, then returns the agent's final reply.
- **Tools:** the six claim-scoped tools in choice 2. Each returns the backend's response as text, refusals included, so the agent learns why a payment was refused and can say so.
- **Queue runner:** `uv run -m agent` works every claim that's waiting (or left in progress by a failed run), each with a new thread id. It prints one line per claim and a summary at the end: claims decided, approvals, declines, referrals and approvals waiting for sign-off. If one claim fails, for example on a rate limit from a free model, it prints the error and carries on.

Why: this is the core of the pilot. The tests use a stub model with scripted replies, so they never call a real model.

- [ ] A stub-model test runs a claim through the four reads, an approval of $420 and a payment of $420. The claim ends decided and paid, and the steps (tool calls, tool results and the final message) are recorded with the thread id
- [ ] A stub-model test approves $1,200 and tries to pay it. The tool returns the backend's refusal, the claim is waiting for sign-off, and no payment is recorded
- [ ] A test shows the tools take no ids and act only on the claim the run was given
- [ ] A test of the queue runner, with `run` stubbed, shows it works only waiting and in-progress claims, carries on past a failure and prints the summary
- [ ] `GET /api/instructions` returns the instructions, and the agent's system prompt is that text
- [ ] `grep` shows that nothing in `agent/` imports from `backend` or opens a file in `data/`
- [ ] With the backend running, `uv run -m agent CLM-1001` on the real model leaves CLM-1001 decided or waiting for sign-off, with a reason of two or three sentences, a policy section, and its steps in `GET /api/claims/CLM-1001/steps`. This is one claim's worth of API spend. Then `uv run -m backend.seed` resets the queue
- [ ] `npm run check:python` passes, with coverage at 80% or more

## Phase 4: The dashboard's look and the queue

Builds the dashboard's foundations and the queue page:

- **Brand:** Instrument Sans, Instrument Serif and JetBrains Mono from Google Fonts, the colors as CSS variables, and light and dark mode from the system setting. The four states take the brand's order: Decided in Sea Green, In progress in Marigold, Waiting for sign-off in Coral and Waiting in Cerulean. Panels are rounded with no outline and no one-edge borders. Money shows as $1,250.00, and ids and amounts are in JetBrains Mono.
- **Layout:** a header with the UnderCover name, a short tagline in Instrument Serif, and links to the queue and the instructions. The page is chosen from the URL path: `/`, `/claims/<id>` and `/instructions`.
- **Plumbing:** typed API calls in one module, a small polling hook, and formatting helpers for money and dates.
- **Queue page:** a count of claims in each state, and a table of every claim with its id, customer, type, summary, amount claimed, date submitted, status and, once decided, the decision and payout. Each row links to the claim. It refreshes every two seconds.
- **End-to-end setup:** Playwright starts its own backend (port 8001, new temporary database) and dashboard (port 5174, with the proxy pointed at 8001 through a `BACKEND_URL` variable in `vite.config.ts`). The health test is replaced by the queue test.

Why: the queue is what the team looks at first, and the shared look and plumbing are needed by every page after it.

- [ ] Vitest tests show the queue renders every claim with its status label and amounts such as $1,150.00, shows the counts, links each claim to its page, and updates a row when a poll returns a new status
- [ ] A Playwright test shows the queue with 25 claims. Then it starts a claim through the API and the row changes to In progress without a reload. Each end-to-end test works on its own claims, so the tests can run in parallel
- [ ] Running `npm run e2e` while `npm run dev` is running leaves the development queue unchanged (`GET /api/claims` on port 8000 is the same before and after)
- [ ] With the Playwright MCP server, the queue page in light and in dark mode matches `docs/BRAND.md`: the fonts load (checked in computed styles), the state colors and backgrounds are right, and there are no outlines on panels or lines across the top. Screenshots are checked for both modes
- [ ] `npm run check:ts` and `npm run e2e` pass, with coverage at 80% or more

## Phase 5: The claim page, sign-off and the instructions

Builds the rest of the dashboard:

- **Claim page:** the claim in full (summary, customer, type, dates, place, story, items with their total, and each document's text), the policy (plan, add-ons, purchase date, trip, trip cost and travelers) and the claim history. Once decided, it shows the agent's decision, payout, reasons and policy section, and whether it's paid, waiting for sign-off or not paid.
- **The agent's steps:** a live list in plain labels, such as "Read the claim", "Read the policy wording", "Recorded the decision" and "Payment refused: needs a handler's sign-off". The agent's own words are shown as they are, and each tool's result can be opened for the detail. While the claim is in progress, it says the agent is working, and new steps appear as they're recorded.
- **Sign-off:** when a claim is waiting for sign-off, a panel to choose a handler and "Sign off and pay $1,200.00". After it, the page shows the payment and who signed off.
- **Instructions page:** the agent's instructions as read-only text.

Why: this is where a handler checks the agent's work and does the one thing the pilot needs from them, signing off large payouts.

- [ ] Vitest tests show the claim page renders the story, items and total, documents, policy, claim history, decision, reasons and policy section, and each payment state. Steps show with their plain labels. The sign-off panel shows only when the claim is waiting for sign-off, and sends the chosen handler
- [ ] A vitest test shows the instructions page renders the text with no way to edit it
- [ ] A Playwright test opens CLM-1001 and sees its story, items, documents, policy and claim history
- [ ] A Playwright test opens a claim, then starts it and adds steps through the API, and the steps appear on the page without a reload
- [ ] A Playwright test of the payment block: the API approves a claim for $1,200, the page shows Waiting for sign-off, the API's payment attempt gets 403, a handler signs off in the page as Dana Whitfield, and the page shows it paid $1,200.00 with her sign-off. The queue shows it Decided
- [ ] A Playwright test opens the instructions page and sees the instructions
- [ ] With the Playwright MCP server, the claim page (waiting, in progress with steps, waiting for sign-off, decided) and the instructions page look right in light and dark mode, judged from screenshots
- [ ] `npm run check:ts` and `npm run e2e` pass, with coverage at 80% or more

## Phase 6: The pilot on the real queue

Runs the whole queue with the real model and the dashboard open, and gets the project ready to hand over. The only code change expected here is fixing whatever the live run turns up. Instruction changes stay within the policy wording, and nothing is tuned against the handlers' answers.

Why: the earlier phases prove the parts with stub models. This proves the pilot works end to end on UnderCover's real queue, as the team would watch it.

- [ ] After `uv run -m backend.seed`, with `npm run dev` running, `uv run -m agent` works the full queue on the real model. This is the plan's main API spend: one pass over 25 claims
- [ ] While it runs, the Playwright MCP server shows the queue's states changing and a claim's steps appearing live on its page
- [ ] At the end, no claim is waiting or in progress (any that failed are rerun with `uv run -m agent`), and the runner's summary is reported
- [ ] Through the API: every decision has a reason of two or three sentences and a policy section. Every approval of $1,000 or less is paid, every approval over $1,000 is waiting for sign-off with no payment, and no decline or referral is paid
- [ ] The decided queue is left in place for the student to review in the dashboard, with the approvals over $1,000 left for them to sign off
- [ ] `docs/STATUS.md` says what's built and how to run it: `npm run dev`, `uv run -m agent`, `uv run -m backend.seed`, `npm run check`
- [ ] `npm run check` passes, and the results are reported

## Not in the pilot

- The claims manual, sign-in, real payments and messages to customers, as the spec says.
- Scoring the agent against the handlers' decisions. That needs `data/evals/`, which I won't open unless you ask. The checks above test that the agent follows the rules and decides every claim, not that its decisions match the handlers'. If you'd like a score after Phase 6, I can write a separate script that compares the decisions with `data/evals/decisions.json`. It would never run inside the agent.
- A handler overruling the agent, or sending a claim back. The spec only asks for sign-off.
- Running the agent from the dashboard, and running claims in parallel.
- `data/plans.json`, `data/knowledge.json` and `data/policy_wording_short.md`. The policy wording already holds the plan limits, and the other two belong to the labs and later builds.
