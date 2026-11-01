import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InstructionsPage } from "./InstructionsPage";
import { stubApi } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the agent's instructions with no way to change them", async () => {
  stubApi({
    "/api/instructions": { content: "# The UnderCover Agent\n\nYou decide." },
  });
  render(<InstructionsPage />);
  expect(screen.getByText("Loading the instructions.")).toBeDefined();
  expect(await screen.findByText(/You decide\./)).toBeDefined();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});
