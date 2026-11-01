import { vi } from "vitest";
import type { QueueRow } from "./api";

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
