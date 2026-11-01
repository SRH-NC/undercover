import { AgentSteps } from "./AgentSteps";
import type { Claim, ClaimHistory, Policy } from "./api";
import { DecisionPanel } from "./DecisionPanel";
import { date, humanize, money } from "./format";
import { StatusBadge } from "./StatusBadge";
import { POLL_MS, useApi } from "./useApi";

function Facts({
  claim,
  customer,
}: Readonly<{ claim: Claim; customer: string | undefined }>) {
  return (
    <section className="panel">
      <dl className="facts">
        <div>
          <dt>Customer</dt>
          <dd>{customer}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{humanize(claim.claim_type)}</dd>
        </div>
        <div>
          <dt>Incident</dt>
          <dd>
            {date(claim.incident_date)}, {claim.incident_location}
          </dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{date(claim.submitted_on)}</dd>
        </div>
        <div>
          <dt>Claimed</dt>
          <dd className="mono">{money(claim.amount_claimed)}</dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd className="mono">{claim.policy_id}</dd>
        </div>
      </dl>
    </section>
  );
}

function Items({ claim }: Readonly<{ claim: Claim }>) {
  return (
    <section className="panel" aria-labelledby="items-heading">
      <h2 id="items-heading">Items claimed</h2>
      <table className="compact">
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th className="number">Amount</th>
          </tr>
        </thead>
        <tbody>
          {claim.items.map((item) => (
            <tr key={item.description}>
              <td>{item.description}</td>
              <td>{humanize(item.category)}</td>
              <td className="number mono">{money(item.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2}>Total claimed</th>
            <td className="number mono">{money(claim.amount_claimed)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function Documents({ claim }: Readonly<{ claim: Claim }>) {
  return (
    <section className="panel" aria-labelledby="documents-heading">
      <h2 id="documents-heading">Documents</h2>
      <div className="stack-tight">
        {claim.documents.map((document) => (
          <article className="document" key={document.name}>
            <h3>{document.name}</h3>
            <p className="muted small">{humanize(document.type)}</p>
            <p>{document.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PolicyPanel({ policy }: Readonly<{ policy: Policy | undefined }>) {
  return (
    <section className="panel" aria-labelledby="policy-heading">
      <h2 id="policy-heading">Policy</h2>
      {policy && (
        <dl className="facts">
          <div>
            <dt>Plan</dt>
            <dd>{humanize(policy.plan)}</dd>
          </div>
          <div>
            <dt>Add-ons</dt>
            <dd>
              {policy.add_ons.length
                ? policy.add_ons.map(humanize).join(", ")
                : "None"}
            </dd>
          </div>
          <div>
            <dt>Bought</dt>
            <dd>
              {date(policy.purchased_on)}, {policy.sold_through}
            </dd>
          </div>
          <div>
            <dt>Trip</dt>
            <dd>{policy.trip.destination}</dd>
          </div>
          <div>
            <dt>Covered dates</dt>
            <dd>
              {date(policy.trip.departs_on)} to {date(policy.trip.returns_on)}
            </dd>
          </div>
          <div>
            <dt>Trip cost</dt>
            <dd className="mono">{money(policy.trip.trip_cost)}</dd>
          </div>
          <div>
            <dt>Travelers</dt>
            <dd>{policy.travelers.join(", ")}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function History({ history }: Readonly<{ history: ClaimHistory | undefined }>) {
  return (
    <section className="panel" aria-labelledby="history-heading">
      <h2 id="history-heading">Claim history</h2>
      {history && (
        <>
          <p className="muted">
            {history.name}, a customer since {date(history.customer_since)}.
          </p>
          {history.previous_claims.length === 0 ? (
            <p>No earlier claims.</p>
          ) : (
            <table className="compact">
              <tbody>
                {history.previous_claims.map((earlier) => (
                  <tr key={earlier.claim_id}>
                    <td className="mono">{earlier.claim_id}</td>
                    <td className="nowrap">{date(earlier.filed_on)}</td>
                    <td>{earlier.summary}</td>
                    <td>{humanize(earlier.outcome)}</td>
                    <td className="number mono">
                      {money(earlier.amount_paid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

export function ClaimPage({ claimId }: Readonly<{ claimId: string }>) {
  const {
    data: claim,
    failed,
    refresh,
  } = useApi<Claim>(`/api/claims/${claimId}`, POLL_MS);
  const policy = useApi<Policy>(
    claim && `/api/policies/${claim.policy_id}`,
  ).data;
  const history = useApi<ClaimHistory>(
    claim && `/api/customers/${claim.customer_id}/claim-history`,
  ).data;

  if (!claim) {
    return (
      <p className="muted">
        {failed ? `${claimId} could not be loaded.` : "Loading the claim."}
      </p>
    );
  }

  return (
    <div className="stack">
      <a href="/">Back to the queue</a>
      <header className="claim-header">
        <p className="mono muted">{claim.claim_id}</p>
        <h1>{claim.summary}</h1>
        <StatusBadge status={claim.status} />
      </header>
      <div className="claim-layout">
        <div className="stack">
          <Facts claim={claim} customer={history?.name} />
          {claim.decision && (
            <DecisionPanel
              claim={claim}
              decision={claim.decision}
              onSignedOff={refresh}
            />
          )}
          <section className="panel" aria-labelledby="story-heading">
            <h2 id="story-heading">The customer's story</h2>
            <p>{claim.story}</p>
          </section>
          <Items claim={claim} />
          <Documents claim={claim} />
          <PolicyPanel policy={policy} />
          <History history={history} />
        </div>
        <AgentSteps claimId={claim.claim_id} status={claim.status} />
      </div>
    </div>
  );
}
