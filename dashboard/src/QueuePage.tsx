import type { DecisionKind, QueueRow } from "./api";
import { DECISION_LABELS, STATUSES, date, humanize, money } from "./format";
import { StatusBadge } from "./StatusBadge";
import { usePolling } from "./usePolling";

function Outcome({
  decision,
  payout,
}: Readonly<{ decision: DecisionKind; payout: number }>) {
  return (
    <>
      {DECISION_LABELS[decision]}{" "}
      {decision === "approve" && <span className="mono">{money(payout)}</span>}
    </>
  );
}

export function QueuePage() {
  const { data: claims, failed } = usePolling<QueueRow[]>("/api/claims");

  if (!claims) {
    return (
      <p className="muted">
        {failed ? "The backend is not responding." : "Loading the queue."}
      </p>
    );
  }

  return (
    <div className="stack">
      <h1>Claims queue</h1>
      <section className="counts" aria-label="Claims by status">
        {STATUSES.map((status) => (
          <div className="panel count" key={status}>
            <StatusBadge status={status} />
            <span className="count-number">
              {claims.filter((claim) => claim.status === status).length}
            </span>
          </div>
        ))}
      </section>
      <section className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Claim</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Summary</th>
              <th className="number">Claimed</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <tr key={claim.claim_id}>
                <td className="nowrap">
                  <a className="mono" href={`/claims/${claim.claim_id}`}>
                    {claim.claim_id}
                  </a>
                </td>
                <td className="nowrap">{claim.customer_name}</td>
                <td>{humanize(claim.claim_type)}</td>
                <td>{claim.summary}</td>
                <td className="number mono">{money(claim.amount_claimed)}</td>
                <td className="nowrap">{date(claim.submitted_on)}</td>
                <td>
                  <StatusBadge status={claim.status} />
                </td>
                <td className="nowrap">
                  {claim.decision && (
                    <Outcome
                      decision={claim.decision}
                      payout={claim.payout ?? 0}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
