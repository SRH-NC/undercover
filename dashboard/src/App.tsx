import { ClaimPage } from "./ClaimPage";
import { InstructionsPage } from "./InstructionsPage";
import { QueuePage } from "./QueuePage";

function Page({ path }: Readonly<{ path: string }>) {
  const claim = /^\/claims\/([^/]+)$/.exec(path);
  if (claim) return <ClaimPage claimId={decodeURIComponent(claim[1])} />;
  if (path === "/instructions") return <InstructionsPage />;
  return <QueuePage />;
}

export function App() {
  const path = window.location.pathname;
  return (
    <div className="page">
      <header className="masthead">
        <a className="brand" href="/">
          <span className="wordmark">UnderCover</span>
          <span className="tagline">Claims desk</span>
        </a>
        <nav className="nav" aria-label="Main">
          <a href="/" aria-current={path === "/" ? "page" : undefined}>
            Queue
          </a>
          <a
            href="/instructions"
            aria-current={path === "/instructions" ? "page" : undefined}
          >
            Agent instructions
          </a>
        </nav>
      </header>
      <main>
        <Page path={path} />
      </main>
    </div>
  );
}
