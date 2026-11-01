import { vi } from "vitest";
import type {
  Claim,
  ClaimHistory,
  Decision,
  Handler,
  Policy,
  QueueRow,
  Step,
} from "./api";

export type Routes = Record<string, unknown>;

// Answers GET requests from routes[path] and POSTs from routes["POST " + path].
export function stubApi(routes: Routes) {
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    const body = routes[init?.method === "POST" ? `POST ${path}` : path];
    return Promise.resolve(
      body === undefined
        ? new Response("{}", { status: 404 })
        : new Response(JSON.stringify(body)),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export const QUEUE: QueueRow[] = [
  {
    claim_id: "CLM-1001",
    customer_name: "Maya Patel",
    claim_type: "trip_delay",
    summary: "Flight home canceled by the airline",
    amount_claimed: 420,
    submitted_on: "2026-06-24",
    status: "decided",
    decision: "approve",
    payout: 420,
  },
  {
    claim_id: "CLM-1002",
    customer_name: "Tom Becker",
    claim_type: "baggage",
    summary: "Suitcase lost on a connecting flight",
    amount_claimed: 1150,
    submitted_on: "2026-07-20",
    status: "waiting",
    decision: null,
    payout: null,
  },
  {
    claim_id: "CLM-1003",
    customer_name: "Ana Souza",
    claim_type: "emergency_medical",
    summary: "Treated for a fall",
    amount_claimed: 3800,
    submitted_on: "2026-07-02",
    status: "decided",
    decision: "decline",
    payout: 0,
  },
];

export const CLAIM: Claim = {
  claim_id: "CLM-1001",
  policy_id: "POL-2001",
  customer_id: "CUS-3001",
  claim_type: "trip_delay",
  submitted_on: "2026-06-24",
  incident_date: "2026-06-18",
  incident_location: "Rome, Italy",
  summary: "Flight home canceled by the airline",
  story: "My flight home from Rome was canceled by Meridian Air.",
  items: [
    {
      description: "Airport hotel, one night",
      category: "accommodation",
      amount: 245,
    },
    { description: "Dinner and breakfast", category: "meals", amount: 95 },
  ],
  amount_claimed: 340,
  documents: [
    {
      name: "Meridian Air cancellation notice",
      type: "carrier_report",
      content: "Flight MA 611 was canceled because of crew availability.",
    },
  ],
  status: "waiting",
  thread_id: null,
  decision: null,
  payment: null,
};

export const APPROVAL: Decision = {
  decision: "approve",
  payout: 340,
  reason:
    "The crew problem is a covered cause. The receipts support the costs.",
  policy_section: "Section 3, Trip Delay",
  decided_at: "2026-11-01T13:59:51+00:00",
};

export const POLICY: Policy = {
  policy_id: "POL-2001",
  plan: "premium",
  add_ons: ["electronics_plus"],
  purchased_on: "2026-04-22",
  sold_through: "Meridian Air checkout",
  trip: {
    destination: "Rome, Italy",
    departs_on: "2026-06-10",
    returns_on: "2026-06-18",
    trip_cost: 3100,
  },
  travelers: ["Maya Patel"],
};

export const HISTORY: ClaimHistory = {
  customer_id: "CUS-3001",
  name: "Maya Patel",
  customer_since: "2023-04-11",
  previous_claims: [
    {
      claim_id: "CLM-0412",
      filed_on: "2024-08-19",
      claim_type: "baggage_delay",
      summary: "Checked bag arrived 30 hours late in Lisbon",
      outcome: "approved",
      amount_paid: 140,
    },
  ],
};

export const HANDLERS: Handler[] = [
  {
    handler_id: "HND-01",
    name: "Dana Whitfield",
    role: "Senior Claims Handler",
    can_approve_over_limit: true,
  },
  {
    handler_id: "HND-09",
    name: "Sam Trainee",
    role: "Trainee",
    can_approve_over_limit: false,
  },
];

export function step(
  step_id: number,
  kind: Step["kind"],
  name: string,
  content: string,
): Step {
  return {
    step_id,
    thread_id: "t-1",
    kind,
    name,
    content,
    created_at: "2026-11-01T13:59:00+00:00",
  };
}

// The routes a claim page reads, for a claim in the given state.
export function claimRoutes(claim: Claim, steps: Step[] = []): Routes {
  return {
    [`/api/claims/${claim.claim_id}`]: claim,
    [`/api/claims/${claim.claim_id}/steps`]: steps,
    "/api/policies/POL-2001": POLICY,
    "/api/customers/CUS-3001/claim-history": HISTORY,
    "/api/handlers": HANDLERS,
  };
}
