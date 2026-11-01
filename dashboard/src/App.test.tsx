import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { QUEUE, stubApi } from "./testing";

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
