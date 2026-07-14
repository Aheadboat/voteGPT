import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <nav aria-label="Primary navigation" className="site-nav">
        <Link className="wordmark" href="/" aria-label="voteGPT home">
          voteGPT
        </Link>
        <Link className="sign-in-link" href="/sign-in">
          Sign in
        </Link>
      </nav>
    </header>
  );
}
