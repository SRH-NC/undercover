import { type SyntheticEvent, useState } from "react";
import { type Claim, type Decision, type Handler, postJson } from "./api";
import { DECISION_LABELS, dateTime, money } from "./format";
import { useApi } from "./useApi";

function SignOff({
  claimId,
  payout,
  onSignedOff,
}: Readonly<{ claimId: string; payout: number; onSignedOff: () => void }>) {
  const handlers = useApi<Handler[]>("/api/handlers").data ?? [];
  const [handlerId, setHandlerId] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setSending(true);
    postJson(`/api/claims/${claimId}/sign-off`, { handler_id: handlerId }).then(
      onSignedOff,
      () => {
        setFailed(true);
        setSending(false);
      },
    );
  };

  return (
    <form className="sign-off" onSubmit={submit}>
      <h3>Sign-off needed</h3>
      <p>
        This payout is over the approval limit, so it waits for a handler to
        sign it off. Signing off pays the claim.
      </p>
      <div className="sign-off-row">
        <label htmlFor="handler">Handler</label>
        <select
          id="handler"
          value={handlerId}
          onChange={(event) => {
            setHandlerId(event.target.value);
          }}
        >
          <option value="">Choose a handler</option>
          {handlers
            .filter((handler) => handler.can_approve_over_limit)
            .map((handler) => (
              <option key={handler.handler_id} value={handler.handler_id}>
                {handler.name}
              </option>
            ))}
        </select>
        <button type="submit" disabled={!handlerId || sending}>
          Sign off and pay {money(payout)}
        </button>
      </div>
      {failed && (
        <p role="alert">The sign-off did not go through. Please try again.</p>
      )}
    </form>
  );
}

function PaymentLine({ claim }: Readonly<{ claim: Claim }>) {
  const { payment } = claim;
  if (payment) {
    const signedOff = payment.handler_name
      ? `, signed off by ${payment.handler_name}`
      : "";
    return (
      <p>
        Paid <span className="mono">{money(payment.amount)}</span> on{" "}
        {dateTime(payment.paid_at)}
        {signedOff}.
      </p>
    );
  }
  if (claim.decision?.decision !== "approve") return <p>Nothing to pay.</p>;
  if (claim.status === "awaiting_sign_off") {
    return <p>The payment waits for a handler's sign-off.</p>;
  }
  return <p>Not paid yet.</p>;
}

export function DecisionPanel({
  claim,
  decision,
  onSignedOff,
}: Readonly<{ claim: Claim; decision: Decision; onSignedOff: () => void }>) {
  return (
    <section className="panel" aria-labelledby="decision-heading">
      <h2 id="decision-heading">The agent's decision</h2>
      <p className="verdict">
        {DECISION_LABELS[decision.decision]}
        {decision.decision === "approve" && (
          <span className="mono"> {money(decision.payout)}</span>
        )}
      </p>
      <p className="reason">{decision.reason}</p>
      <p className="muted">
        {decision.policy_section}. Decided {dateTime(decision.decided_at)}.
      </p>
      <PaymentLine claim={claim} />
      {claim.status === "awaiting_sign_off" && (
        <SignOff
          claimId={claim.claim_id}
          payout={decision.payout}
          onSignedOff={onSignedOff}
        />
      )}
    </section>
  );
}
