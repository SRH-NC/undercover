import type { Instructions } from "./api";
import { useApi } from "./useApi";

export function InstructionsPage() {
  const { data: instructions } = useApi<Instructions>("/api/instructions");

  return (
    <div className="stack">
      <h1>Agent instructions</h1>
      <p className="muted">
        What the UnderCover Agent is told before it works each claim. They can
        be read here but not changed.
      </p>
      <section className="panel">
        {instructions ? (
          <pre className="instructions">{instructions.content}</pre>
        ) : (
          <p className="muted">Loading the instructions.</p>
        )}
      </section>
    </div>
  );
}
