import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueuePage } from "./QueuePage";
import { QUEUE, stubApi } from "./testing";
import { POLL_MS } from "./useApi";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("lists every claim with its status, amounts and a link to it", async () => {
  stubApi({ "/api/claims": QUEUE });
  render(<QueuePage />);

  const waiting = await screen.findByRole("row", { name: /CLM-1002/ });
  expect(within(waiting).getByText("Waiting")).toBeDefined();
  expect(within(waiting).getByText("$1,150.00")).toBeDefined();
  expect(within(waiting).getByText("Baggage")).toBeDefined();
  expect(within(waiting).getByText("Jul 20, 2026")).toBeDefined();
  expect(
    screen.getByRole("link", { name: "CLM-1002" }).getAttribute("href"),
  ).toBe("/claims/CLM-1002");

  const approved = screen.getByRole("row", { name: /CLM-1001/ });
  expect(within(approved).getByText("Approved")).toBeDefined();
  expect(within(approved).getAllByText("$420.00")).toHaveLength(2);

  const declined = screen.getByRole("row", { name: /CLM-1003/ });
  expect(within(declined).getByText("Declined")).toBeDefined();
  expect(within(declined).getByText("Emergency medical")).toBeDefined();
});

it("counts the claims in each state", async () => {
  stubApi({ "/api/claims": QUEUE });
  render(<QueuePage />);
  const counts = await screen.findByRole("region", {
    name: "Claims by status",
  });
  const tiles = within(counts)
    .getAllByText(/./, { selector: ".count-number" })
    .map((tile) => tile.textContent);
  expect(tiles).toEqual(["1", "0", "0", "2"]);
});

it("updates a claim when the next poll brings a new status", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const routes = { "/api/claims": QUEUE };
  stubApi(routes);
  render(<QueuePage />);
  const row = await screen.findByRole("row", { name: /CLM-1002/ });

  routes["/api/claims"] = QUEUE.map((claim) =>
    claim.claim_id === "CLM-1002" ? { ...claim, status: "in_progress" } : claim,
  );
  await vi.advanceTimersByTimeAsync(POLL_MS);
  expect(await within(row).findByText("In progress")).toBeDefined();
});

it("says when the backend is not responding", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<QueuePage />);
  expect(
    await screen.findByText("The backend is not responding."),
  ).toBeDefined();
});
