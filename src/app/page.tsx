export default function HomePage() {
  return (
    <main>
      <div className="landing">
        <section className="intro" aria-labelledby="page-title">
          <p className="status">
            voteGPT is in development. Civic coverage is not available yet.
          </p>
          <h1 id="page-title">Clear civic information, grounded in sources.</h1>
          <p className="lede">
            voteGPT will help U.S. voters find current representatives, understand
            upcoming elections, and compare verified candidates using source-backed
            information.
          </p>
          <a className="disclosure-link" href="#principles">
            How voteGPT works
          </a>
        </section>

        <section
          className="principles"
          id="principles"
          aria-labelledby="principles-heading"
        >
          <div>
            <p className="section-label">Our foundation</p>
            <h2 id="principles-heading">Built for trustworthy civic research</h2>
          </div>
          <ul>
            <li>Sources stay visible.</li>
            <li>Freshness stays explicit.</li>
            <li>AI may explain evidence; it does not determine civic facts.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
