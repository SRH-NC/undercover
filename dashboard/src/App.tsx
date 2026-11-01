import { QueuePage } from "./QueuePage";

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
        <QueuePage />
      </main>
    </div>
  );
}
