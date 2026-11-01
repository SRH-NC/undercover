import type { Step } from "./api";

export interface ToolEntry {
  kind: "tool";
  id: number;
  thread: string;
  name: string;
  args: string;
  result: Step | undefined;
}

export interface MessageEntry {
  kind: "message";
  id: number;
  text: string;
}

export type Entry = ToolEntry | MessageEntry;

type Labels = Partial<Record<string, string>>;

const DOING: Labels = {
  get_claim: "Reading the claim",
  get_policy: "Reading the policy",
  get_claim_history: "Reading the claim history",
  get_policy_wording: "Reading the policy wording",
  decide_claim: "Recording the decision",
  pay_claim: "Paying the claim",
};

const DONE: Labels = {
  get_claim: "Read the claim",
  get_policy: "Read the policy",
  get_claim_history: "Read the claim history",
  get_policy_wording: "Read the policy wording",
  decide_claim: "Recorded the decision",
  pay_claim: "Paid the claim",
};

const REFUSED: Labels = {
  decide_claim: "Tried to record the decision",
  pay_claim: "Tried to pay the claim",
};

// Pairs each tool call with its result, in the order the agent worked.
export function entries(steps: Step[]): Entry[] {
  const list: Entry[] = [];
  for (const step of steps) {
    if (step.kind === "message") {
      list.push({ kind: "message", id: step.step_id, text: step.content });
    } else if (step.kind === "tool_call") {
      list.push({
        kind: "tool",
        id: step.step_id,
        thread: step.thread_id,
        name: step.name,
        args: step.content,
        result: undefined,
      });
    } else {
      const call = list.find(
        (entry): entry is ToolEntry =>
          entry.kind === "tool" &&
          entry.thread === step.thread_id &&
          entry.name === step.name &&
          entry.result === undefined,
      );
      if (call) call.result = step;
    }
  }
  return list;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The backend's reason for refusing a tool call, if it refused.
export function refusal(result: Step): string | undefined {
  const reply = parse(result.content);
  if (!isRecord(reply) || !("detail" in reply)) return undefined;
  return typeof reply.detail === "string"
    ? reply.detail
    : JSON.stringify(reply.detail);
}

export function title(entry: ToolEntry): string {
  if (!entry.result) return DOING[entry.name] ?? `Using ${entry.name}`;
  if (refusal(entry.result) !== undefined) {
    return REFUSED[entry.name] ?? `Tried ${entry.name}`;
  }
  return DONE[entry.name] ?? `Used ${entry.name}`;
}

// Text that reads well: a document's content as it is, other JSON indented.
export function readable(text: string): string {
  const value = parse(text);
  if (isRecord(value) && typeof value.content === "string") {
    return value.content;
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
