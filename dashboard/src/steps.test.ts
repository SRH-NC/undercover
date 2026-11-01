import { expect, it } from "vitest";
import type { Step } from "./api";
import { type ToolEntry, entries, readable, refusal, title } from "./steps";
import { step } from "./testing";

function tool(name: string, result?: Step): ToolEntry {
  return { kind: "tool", id: 1, thread: "t-1", name, args: "{}", result };
}

it("pairs each result with its call on the same run", () => {
  const list = entries([
    step(1, "tool_call", "get_claim", "{}"),
    { ...step(2, "tool_result", "get_claim", "{}"), thread_id: "t-2" },
    step(3, "tool_result", "get_claim", '{"claim_id":"CLM-1001"}'),
  ]);
  expect(list).toHaveLength(1);
  const [call] = list as ToolEntry[];
  expect(call.result?.step_id).toBe(3);
});

it("names steps it does not know by their tool", () => {
  expect(title(tool("search"))).toBe("Using search");
  const done = step(2, "tool_result", "search", "{}");
  expect(title(tool("search", done))).toBe("Used search");
  const refused = step(2, "tool_result", "search", '{"detail":"No"}');
  expect(title(tool("search", refused))).toBe("Tried search");
});

it("reads the backend's reason for a refusal", () => {
  const invalid = '{"detail":[{"msg":"Field required"}]}';
  expect(refusal(step(1, "tool_result", "x", invalid))).toBe(
    '[{"msg":"Field required"}]',
  );
  expect(
    refusal(step(1, "tool_result", "x", "Internal Server Error")),
  ).toBeUndefined();
  expect(refusal(step(1, "tool_result", "x", "[1]"))).toBeUndefined();
});

it("shows documents as text and other replies as indented JSON", () => {
  expect(readable('{"version":"2026.1","content":"# Wording"}')).toBe(
    "# Wording",
  );
  expect(readable('{"a":1}')).toBe('{\n  "a": 1\n}');
  expect(readable("plain text")).toBe("plain text");
});
