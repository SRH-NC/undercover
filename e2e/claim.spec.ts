import { expect, test } from "@playwright/test";

test("a claim's page shows the claim, its policy and claim history", async ({
  page,
}) => {
  await page.goto("/claims/CLM-1001");
  await expect(
    page.getByRole("heading", { name: /Flight home canceled/ }),
  ).toBeVisible();
  await expect(page.getByText(/My flight home from Rome/)).toBeVisible();

  const items = page.getByRole("region", { name: "Items claimed" });
  await expect(items.getByText("Airport hotel, one night")).toBeVisible();
  await expect(items.getByText("$420.00")).toBeVisible();

  const documents = page.getByRole("region", { name: "Documents" });
  await expect(
    documents.getByText("Meridian Air cancellation notice"),
  ).toBeVisible();

  const policy = page.getByRole("region", { name: "Policy" });
  await expect(policy.getByText("Premium")).toBeVisible();
  await expect(policy.getByText("Rome, Italy")).toBeVisible();

  const history = page.getByRole("region", { name: "Claim history" });
  await expect(history.getByText(/Maya Patel, a customer since/)).toBeVisible();
  await expect(history.getByText("CLM-0412")).toBeVisible();
});

test("the agent's steps appear on the page as it works", async ({
  page,
  request,
}) => {
  const step = (kind: string, name: string, content: string) =>
    request.post("/api/claims/CLM-1004/steps", {
      data: { thread_id: "e2e-steps", kind, name, content },
    });

  await page.goto("/claims/CLM-1004");
  const steps = page.getByRole("region", { name: "What the agent did" });
  await expect(
    steps.getByText("The agent has not started on this claim yet."),
  ).toBeVisible();

  await request.post("/api/claims/CLM-1004/start", {
    data: { thread_id: "e2e-steps" },
  });
  await expect(
    steps.getByText("The agent is working on this claim."),
  ).toBeVisible();

  await step("tool_call", "get_claim", "{}");
  await expect(steps.getByText("Reading the claim")).toBeVisible();
  await step("tool_result", "get_claim", '{"claim_id":"CLM-1004"}');
  await expect(steps.getByText("Read the claim")).toBeVisible();
  await step("message", "agent", "Checking the baggage delay.");
  await expect(steps.getByText("Checking the baggage delay.")).toBeVisible();
});

test("a payout over the limit waits for a handler to sign it off", async ({
  page,
  request,
}) => {
  await request.post("/api/claims/CLM-1012/start", {
    data: { thread_id: "e2e-sign-off" },
  });
  await request.post("/api/claims/CLM-1012/decision", {
    data: {
      decision: "approve",
      payout: 1200,
      reason: "A test approval. It is not a real decision.",
      policy_section: "Section 5, Baggage and Personal Effects",
    },
  });

  await page.goto("/claims/CLM-1012");
  await expect(
    page.getByText("Waiting for sign-off", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("The payment waits for a handler's sign-off."),
  ).toBeVisible();

  const payment = await request.post("/api/claims/CLM-1012/payment", {
    data: { amount: 1200 },
  });
  expect(payment.status()).toBe(403);

  await page.getByLabel("Handler").selectOption({ label: "Dana Whitfield" });
  await page
    .getByRole("button", { name: "Sign off and pay $1,200.00" })
    .click();
  await expect(page.getByText(/^Paid \$1,200\.00 on/)).toContainText(
    "signed off by Dana Whitfield",
  );
  await expect(page.getByText("Decided", { exact: true })).toBeVisible();

  await page.goto("/");
  const row = page.getByRole("row", { name: /CLM-1012/ });
  await expect(row.getByText("Decided", { exact: true })).toBeVisible();
  await expect(row.getByText("$1,200.00")).toBeVisible();
});
