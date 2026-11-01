import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ClaimPage } from "./ClaimPage";
import { APPROVAL, CLAIM, claimRoutes, stubApi } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function region(name: string) {
  return screen.getByRole("region", { name });
}

it("shows the claim in full, with its policy and claim history", async () => {
  stubApi(claimRoutes(CLAIM));
  render(<ClaimPage claimId="CLM-1001" />);

  expect(
    await screen.findByRole("heading", {
      name: "Flight home canceled by the airline",
    }),
  ).toBeDefined();
  expect(screen.getByText("Waiting")).toBeDefined();
  expect(screen.getByText(/canceled by Meridian Air/)).toBeDefined();
  expect(screen.getByText("Jun 18, 2026, Rome, Italy")).toBeDefined();

  const items = region("Items claimed");
  expect(within(items).getByText("Airport hotel, one night")).toBeDefined();
  expect(within(items).getByText("Accommodation")).toBeDefined();
  expect(within(items).getAllByText("$340.00")).toHaveLength(1);
  expect(within(items).getByText("Total claimed")).toBeDefined();

  const documents = region("Documents");
  expect(within(documents).getByText("Carrier report")).toBeDefined();
  expect(within(documents).getByText(/crew availability/)).toBeDefined();

  const policy = region("Policy");
  expect(await within(policy).findByText("Premium")).toBeDefined();
  expect(within(policy).getByText("Electronics plus")).toBeDefined();
  expect(
    within(policy).getByText("Jun 10, 2026 to Jun 18, 2026"),
  ).toBeDefined();
  expect(within(policy).getByText("$3,100.00")).toBeDefined();

  const history = region("Claim history");
  expect(
    await within(history).findByText(
      "Maya Patel, a customer since Apr 11, 2023.",
    ),
  ).toBeDefined();
  expect(within(history).getByText("CLM-0412")).toBeDefined();
  expect(
    screen.queryByRole("region", { name: "The agent's decision" }),
  ).toBeNull();
});

it("shows an approval that has been paid", async () => {
  const payment = {
    amount: 340,
    paid_at: "2026-11-01T14:00:00+00:00",
    handler_id: null,
    handler_name: null,
  };
  stubApi(
    claimRoutes({
      ...CLAIM,
      status: "decided",
      decision: APPROVAL,
      payment,
    }),
  );
  render(<ClaimPage claimId="CLM-1001" />);

  const decision = await screen.findByRole("region", {
    name: "The agent's decision",
  });
  expect(within(decision).getByText("Approved")).toBeDefined();
  expect(within(decision).getByText(APPROVAL.reason)).toBeDefined();
  expect(within(decision).getByText(/Section 3, Trip Delay\./)).toBeDefined();
  expect(within(decision).getByText(/^Paid/).textContent).toMatch(
    /^Paid \$340\.00 on Nov 1, 2026.*\.$/,
  );
  expect(within(decision).queryByRole("button")).toBeNull();
});

it.each([
  [
    {
      status: "decided",
      decision: { ...APPROVAL, decision: "decline", payout: 0 },
    },
    "Nothing to pay.",
  ],
  [{ status: "decided", decision: APPROVAL }, "Not paid yet."],
  [
    { status: "awaiting_sign_off", decision: { ...APPROVAL, payout: 1200 } },
    "The payment waits for a handler's sign-off.",
  ],
] as const)("shows where the payment stands", async (state, text) => {
  stubApi(claimRoutes({ ...CLAIM, ...state }));
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText(text)).toBeDefined();
});

it("signs off an approval over the limit as the chosen handler", async () => {
  const waiting = {
    ...CLAIM,
    status: "awaiting_sign_off" as const,
    decision: { ...APPROVAL, payout: 1200 },
  };
  const routes = claimRoutes(waiting);
  const fetchMock = stubApi(routes);
  render(<ClaimPage claimId="CLM-1001" />);

  const button = await screen.findByRole("button", {
    name: "Sign off and pay $1,200.00",
  });
  expect(button.hasAttribute("disabled")).toBe(true);
  const select = screen.getByLabelText("Handler");
  expect(await within(select).findByText("Dana Whitfield")).toBeDefined();
  expect(within(select).queryByText("Sam Trainee")).toBeNull();

  routes["POST /api/claims/CLM-1001/sign-off"] = {};
  routes["/api/claims/CLM-1001"] = {
    ...waiting,
    status: "decided",
    payment: {
      amount: 1200,
      paid_at: "2026-11-01T14:00:00+00:00",
      handler_id: "HND-01",
      handler_name: "Dana Whitfield",
    },
  };
  fireEvent.change(select, { target: { value: "HND-01" } });
  fireEvent.click(button);

  expect(await screen.findByText(/signed off by Dana Whitfield/)).toBeDefined();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/claims/CLM-1001/sign-off",
    expect.objectContaining({ body: '{"handler_id":"HND-01"}' }),
  );
  expect(screen.queryByRole("button")).toBeNull();
});

it("says when a sign-off does not go through", async () => {
  stubApi(
    claimRoutes({
      ...CLAIM,
      status: "awaiting_sign_off",
      decision: { ...APPROVAL, payout: 1200 },
    }),
  );
  render(<ClaimPage claimId="CLM-1001" />);
  const select = await screen.findByLabelText("Handler");
  await within(select).findByText("Dana Whitfield");
  fireEvent.change(select, { target: { value: "HND-01" } });
  fireEvent.click(screen.getByRole("button"));
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /did not go through/,
  );
});

it("says when the claim cannot be loaded", async () => {
  stubApi({});
  render(<ClaimPage claimId="CLM-9999" />);
  expect(
    await screen.findByText("CLM-9999 could not be loaded."),
  ).toBeDefined();
});
