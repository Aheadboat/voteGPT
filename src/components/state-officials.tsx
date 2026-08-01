import type {
  StateFreshness,
  StateOfficialsView,
  StateSeat,
  StateSource,
} from "@/lib/state-officials";

import styles from "./state-officials.module.css";

export type StateOfficialsResult =
  | Readonly<{ status: "available"; view: StateOfficialsView }>
  | Readonly<{ status: "unavailable" }>;

export function StateOfficials({
  heading = "State officials",
  result,
}: {
  heading?: string | null;
  result: StateOfficialsResult;
}) {
  if (result.status === "unavailable") {
    return (
      <RecoveryState
        heading={heading}
        message="State legislature information is unavailable."
      />
    );
  }

  const { view } = result;
  if (view.freshness.state === "expired") {
    return (
      <RecoveryState
        checkedAt={view.freshness.checkedAt}
        heading={heading}
        message="State legislature data has expired. Refresh before relying on current officeholders."
      />
    );
  }
  const missing = missingDistricts(view);

  return (
    <section aria-label={`State legislature for ${view.jurisdiction.stateCode}`} className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>State legislature</p>
        {heading ? <h2>{heading}</h2> : null}
      </header>
      {view.freshness.state === "stale" ? (
        <p className={styles.status} role="status">
          This roster is stale but not expired. Verify before use.
        </p>
      ) : null}
      {view.chambers.length === 0 ? (
        <p className={styles.status} role="status">
          No verified state legislature offices are available for this saved coverage.
        </p>
      ) : null}
      {missing.map((district) => (
        <p className={styles.status} key={`${district.chamber}:${district.district}`} role="status">
          State legislature coverage is incomplete for {chamberLabel(district.chamber)} — District {district.district}.
          Current officeholder is unknown. No qualifying source is available for this district.
        </p>
      ))}
      {view.chambers.map((chamber) =>
        chamber.districts.map((district) => (
          <section key={`${chamber.chamber}:${district.district}`} className={styles.chamber}>
            <h3>{chamberLabel(chamber.chamber)} — District {district.district}</h3>
            <ol aria-label={`${chamberLabel(chamber.chamber)} District ${district.district} seats`} className={styles.grid}>
              {district.seats.map((seat) => (
                <li className={styles.gridItem} key={seat.seat}>
                  <SeatCard freshness={view.freshness} seat={seat} />
                </li>
              ))}
            </ol>
          </section>
        )),
      )}
    </section>
  );
}

function SeatCard({ freshness, seat }: { freshness: StateFreshness; seat: StateSeat }) {
  return (
    <article aria-label={cardLabel(seat)} className={styles.card}>
      <h4>{seat.seat}</h4>
      {seat.status === "serving" ? (
        <ul aria-label={`Current officeholders for ${seat.seat}`} className={styles.people}>
          {seat.people.map((person) => (
            <li key={person.id}>
              <strong>{person.name}</strong>
              <span>Verified current officeholder</span>
            </li>
          ))}
        </ul>
      ) : seat.status === "vacant" ? (
        <p className={styles.fact}>This seat is verified vacant.</p>
      ) : (
        <p className={styles.fact}>
          Current officeholder is unknown. Listed sources are not qualifying
          evidence of a current officeholder.
        </p>
      )}
      <p className={styles.freshness}>
        Checked <time dateTime={freshness.checkedAt}>{freshness.checkedAt}</time>.{" "}
        {freshness.state === "fresh"
          ? "Fresh at last check."
          : "Stale but not expired; verify before use."}
      </p>
      <SourceEvidence
        heading={seat.seat}
        qualifying={seat.status !== "unknown"}
        sources={seat.sources}
      />
    </article>
  );
}

function SourceEvidence({
  heading,
  qualifying,
  sources,
}: {
  heading: string;
  qualifying: boolean;
  sources: readonly StateSource[];
}) {
  return (
    <section aria-label={`Sources for ${heading}`} className={styles.sources}>
      <h5>Sources and retrieval times</h5>
      {sources.length > 0 ? (
        <ul>
          {sources.map((source) => (
            <li key={`${source.sourceType}:${source.publicUrl}:${source.retrievedAt}`}>
              <a className={styles.sourceLink} href={source.publicUrl}>
                {sourceLabel(source, qualifying)}
              </a>
              <span>Retrieved <time dateTime={source.retrievedAt}>{source.retrievedAt}</time></span>
              {source.effectiveAt ? (
                <span>Effective <time dateTime={source.effectiveAt}>{source.effectiveAt}</time></span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>No qualifying source is available for this seat.</p>
      )}
    </section>
  );
}

function RecoveryState({
  checkedAt,
  heading,
  message,
}: {
  checkedAt?: string;
  heading: string | null;
  message: string;
}) {
  return (
    <section aria-label="State legislature" className={styles.shell}>
      {heading ? <h2>{heading}</h2> : null}
      <p className={styles.status} role="status">{message}</p>
      {checkedAt ? <p>Last checked <time dateTime={checkedAt}>{checkedAt}</time>.</p> : null}
    </section>
  );
}

function chamberLabel(chamber: "upper" | "lower") {
  return chamber === "upper" ? "Upper chamber" : "Lower chamber";
}

function cardLabel(seat: StateSeat) {
  if (seat.status === "serving") return `${seat.seat}: ${seat.people.map(({ name }) => name).join(", ")}`;
  return `${seat.seat}: ${seat.status === "vacant" ? "vacant" : "officeholder unknown"}`;
}

function sourceLabel(source: StateSource, qualifying: boolean) {
  const label = source.sourceType === "official" ? "Official source" : "Vacancy source";
  return qualifying ? label : `${label} not qualifying current officeholder evidence`;
}

function missingDistricts(view: StateOfficialsView) {
  const displayed = new Set(
    view.chambers.flatMap(({ chamber, districts }) =>
      districts.map(({ district }) => `${chamber}:${district}`),
    ),
  );
  return view.jurisdiction.districts.filter(
    ({ chamber, district }) => !displayed.has(`${chamber}:${district}`),
  );
}
