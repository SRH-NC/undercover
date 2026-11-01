import type { Status, Step } from "./api";
import { type ToolEntry, entries, readable, refusal, title } from "./steps";
import { POLL_MS, useApi } from "./useApi";

function ToolStep({ entry }: Readonly<{ entry: ToolEntry }>) {
  const refused = entry.result && refusal(entry.result);
  const sent = entry.args === "{}" ? undefined : readable(entry.args);
  return (
    <li className="step">
      <div className="step-title">
        {title(entry)}
        {refused !== undefined && <span className="badge alert">Refused</span>}
      </div>
      {refused && <p className="step-detail">{refused}</p>}
      {sent && <pre className="step-sent">{sent}</pre>}
      {entry.result && !refused && (
        <details>
          <summary>The reply</summary>
          <pre>{readable(entry.result.content)}</pre>
        </details>
      )}
    </li>
  );
}

export function AgentSteps({
  claimId,
  status,
}: Readonly<{ claimId: string; status: Status }>) {
  const { data: steps } = useApi<Step[]>(
    `/api/claims/${claimId}/steps`,
    POLL_MS,
  );
  const list = entries(steps ?? []);

  return (
    <section className="panel steps" aria-labelledby="steps-heading">
      <h2 id="steps-heading">What the agent did</h2>
      {status === "in_progress" && (
        <p className="working">The agent is working on this claim.</p>
      )}
      {list.length === 0 && status !== "in_progress" && (
        <p className="muted">
          {status === "waiting"
            ? "The agent has not started on this claim yet."
            : "No steps were recorded for this claim."}
        </p>
      )}
      <ol aria-label="Agent steps">
        {list.map((entry) =>
          entry.kind === "tool" ? (
            <ToolStep entry={entry} key={entry.id} />
          ) : (
            <li className="step agent-message" key={entry.id}>
              <div className="step-title">The agent</div>
              <p className="step-detail">{entry.text}</p>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
