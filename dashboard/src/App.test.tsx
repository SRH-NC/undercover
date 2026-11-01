import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { CLAIM, QUEUE, claimRoutes, stubApi } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

it("shows the masthead and the queue on the home page", async () => {
  stubApi({ "/api/claims": QUEUE });
  render(<App />);
  expect(screen.getByText("UnderCover")).toBeDefined();
  expect(
    screen.getByRole("link", { name: "Queue" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    await screen.findByRole("heading", { name: "Claims queue" }),
  ).toBeDefined();
});

it("shows a claim's page from its address", async () => {
  window.history.pushState({}, "", "/claims/CLM-1001");
  stubApi(claimRoutes(CLAIM));
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: CLAIM.summary }),
  ).toBeDefined();
});

it("shows the instructions page from its address", async () => {
  window.history.pushState({}, "", "/instructions");
  stubApi({ "/api/instructions": { content: "You decide claims." } });
  render(<App />);
  expect(
    screen
      .getByRole("link", { name: "Agent instructions" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(await screen.findByText("You decide claims.")).toBeDefined();
});
