import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentSteps } from "./AgentSteps";
import { step, stubApi } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REFUSAL = JSON.stringify({
  detail: "A payout over $1,000.00 needs a handler's sign-off.",
});

it("shows each step in plain words, with what was sent and the reply", async () => {
  stubApi({
    "/api/claims/CLM-1001/steps": [
      step(1, "tool_call", "get_claim", "{}"),
      step(2, "tool_call", "get_policy_wording", "{}"),
      step(3, "tool_result", "get_claim", '{"claim_id":"CLM-1001"}'),
      step(4, "message", "agent", "The delay is covered."),
      step(5, "tool_call", "decide_claim", '{"decision":"approve"}'),
      step(6, "tool_result", "decide_claim", '{"status":"decided"}'),
      step(7, "tool_call", "pay_claim", '{"amount":1200}'),
      step(8, "tool_result", "pay_claim", REFUSAL),
    ],
  });
  render(<AgentSteps claimId="CLM-1001" status="awaiting_sign_off" />);

  const list = await screen.findByRole("list", { name: "Agent steps" });
  const titles = await within(list).findAllByText(/./, {
    selector: ".step-title",
  });
  expect(titles.map((title) => title.textContent)).toEqual([
    "Read the claim",
    "Reading the policy wording",
    "The agent",
    "Recorded the decision",
    "Tried to pay the claimRefused",
  ]);
  expect(within(list).getByText("The delay is covered.")).toBeDefined();
  expect(
    within(list).getByText(
      "A payout over $1,000.00 needs a handler's sign-off.",
    ),
  ).toBeDefined();
  expect(within(list).getByText(/"decision": "approve"/)).toBeDefined();
  expect(within(list).getAllByText("The reply")).toHaveLength(2);
  expect(screen.queryByText("The agent is working on this claim.")).toBeNull();
});

it("says when the agent is working and when it has not started", async () => {
  stubApi({ "/api/claims/CLM-1001/steps": [] });
  const { rerender } = render(
    <AgentSteps claimId="CLM-1001" status="waiting" />,
  );
  expect(
    await screen.findByText("The agent has not started on this claim yet."),
  ).toBeDefined();
  rerender(<AgentSteps claimId="CLM-1001" status="in_progress" />);
  expect(screen.getByText("The agent is working on this claim.")).toBeDefined();
  rerender(<AgentSteps claimId="CLM-1001" status="decided" />);
  expect(
    screen.getByText("No steps were recorded for this claim."),
  ).toBeDefined();
});
