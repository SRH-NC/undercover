import { expect, test } from "@playwright/test";

test("the queue shows every claim and follows a claim as it starts", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Claims queue" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(25);

  const row = page.getByRole("row", { name: /CLM-1025/ });
  await expect(row.getByText("Waiting", { exact: true })).toBeVisible();
  await request.post("/api/claims/CLM-1025/start", {
    data: { thread_id: "e2e-queue" },
  });
  await expect(row.getByText("In progress", { exact: true })).toBeVisible();
});
