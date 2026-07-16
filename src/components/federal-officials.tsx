import type {
  FederalOfficialsView,
  FederalSeat,
  Freshness,
  SourceRef,
} from "@/lib/federal-officials";

import styles from "./federal-officials.module.css";

type UnsupportedCode = "DC" | "AS" | "GU" | "MP" | "PR" | "VI";

export type FederalOfficialsResult =
  | Readonly<{ status: "available"; view: FederalOfficialsView }>
  | Readonly<{ status: "unsupported"; code: UnsupportedCode }>
  | Readonly<{ status: "unavailable" }>;

export function FederalOfficials({ result }: { result: FederalOfficialsResult }) {
  if (result.status === "unsupported") {
    return (
      <RecoveryState
        message={`Federal roster coverage is not supported for ${result.code}.`}
      />
    );
  }
  if (result.status === "unavailable") {
    return <RecoveryState message="Federal roster information is unavailable." />;
  }

  const { view } = result;
  const jurisdiction = jurisdictionLabel(view);
  if (view.freshness.state === "expired") {
    return (
      <RecoveryState
        checkedAt={view.freshness.checkedAt}
        label={`Federal officials for ${jurisdiction}`}
        message="Federal roster data has expired. Refresh before relying on current officeholders."
      />
    );
  }

  const senators = view.senate.slice(0, 2);
  const coverageNotes = coverageNotesFor(view);
  return (
    <section
      aria-label={`Federal officials for ${jurisdiction}`}
      className={styles.shell}
    >
      <header className={styles.header}>
        <p className={styles.eyebrow}>Federal roster</p>
        <h2>Federal officials</h2>
        <p className={styles.intro}>
          House and Senate offices use the same factual presentation.
        </p>
      </header>

      {view.freshness.state === "stale" ? (
        <p className={styles.status} role="status">
          This roster is stale but not expired.
        </p>
      ) : null}

      {coverageNotes.length > 0 ? (
        <section aria-label="Coverage notes" className={styles.notices}>
          <h3>Coverage notes</h3>
          {coverageNotes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </section>
      ) : null}

      <ol aria-label="Federal offices" className={styles.grid}>
        {[view.house, ...senators].map((seat) => (
          <li className={styles.gridItem} key={seat.office.id}>
            <SeatCard freshness={view.freshness} seat={seat} />
          </li>
        ))}
        {Array.from({ length: 2 - senators.length }, (_, index) => (
          <li className={styles.gridItem} key={`unknown-senator-${index}`}>
            <UnknownSenateCard freshness={view.freshness} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function UnknownSenateCard({ freshness }: { freshness: Freshness }) {
  return (
    <article
      aria-label="U.S. Senator: officeholder unknown"
      className={styles.card}
    >
      <h3>U.S. Senator</h3>
      <p className={styles.fact}>
        Current Senate officeholder is unknown.
      </p>
      <p className={styles.freshness}>
        Checked {" "}
        <time dateTime={freshness.checkedAt}>{freshness.checkedAt}</time>. {" "}
        {freshness.state === "fresh"
          ? "Fresh at last check."
          : "Stale but not expired; verify before use."}
      </p>
      <SourceEvidence heading="U.S. Senator" sources={[]} />
    </article>
  );
}

function SeatCard({
  freshness,
  seat,
}: {
  freshness: Freshness;
  seat: FederalSeat;
}) {
  const heading = officeHeading(seat);
  return (
    <article aria-label={cardLabel(seat)} className={styles.card}>
      <h3>{heading}</h3>
      <SeatFact seat={seat} />
      <p className={styles.freshness}>
        Checked {" "}
        <time dateTime={freshness.checkedAt}>{freshness.checkedAt}</time>. {" "}
        {freshness.state === "fresh"
          ? "Fresh at last check."
          : "Stale but not expired; verify before use."}
      </p>
      <SourceEvidence heading={heading} sources={seat.sources} />
    </article>
  );
}

function SeatFact({ seat }: { seat: FederalSeat }) {
  if (seat.status === "serving") {
    return (
      <div className={styles.fact}>
        <strong>
          <a
            className={styles.profileLink}
            href={`/officials/federal/${seat.person.bioguideId}`}
          >
            {seat.person.name}
          </a>
        </strong>
        <span>Verified current officeholder</span>
      </div>
    );
  }
  if (seat.status === "vacant") {
    return <p className={styles.fact}>This seat is verified vacant.</p>;
  }
  if (seat.status === "unknown") {
    const chamber = seat.office.chamber === "house" ? "House" : "Senate";
    return (
      <p className={styles.fact}>
        Current {chamber} officeholder is unknown. Check an official source before
        relying on this seat.
      </p>
    );
  }
  return (
    <p className={styles.fact}>
      Sources conflict on current House seat status. Congress.gov lists {seat.person.name};
      Clerk vacancy evidence disagrees.
    </p>
  );
}

function SourceEvidence({
  heading,
  sources,
}: {
  heading: string;
  sources: readonly SourceRef[];
}) {
  return (
    <section aria-label={`Sources for ${heading}`} className={styles.sources}>
      <h4>Sources and retrieval times</h4>
      {sources.length > 0 ? (
        <ul>
          {sources.map((source) => (
            <li key={`${source.url}:${source.retrievedAt}`}>
              <a className={styles.sourceLink} href={source.url}>
                {source.publisher} {source.sourceType} source
              </a>
              <span>
                Retrieved {" "}
                <time dateTime={source.retrievedAt}>{source.retrievedAt}</time>
              </span>
              {source.effectiveAt ? (
                <span>
                  Effective {" "}
                  <time dateTime={source.effectiveAt}>{source.effectiveAt}</time>
                </span>
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
  label = "Federal officials",
  message,
}: {
  checkedAt?: string;
  label?: string;
  message: string;
}) {
  return (
    <section aria-label={label} className={styles.shell}>
      <h2>Federal officials</h2>
      <p className={styles.status} role="status">
        {message}
      </p>
      {checkedAt ? (
        <p>
          Last checked <time dateTime={checkedAt}>{checkedAt}</time>.
        </p>
      ) : null}
      <a
        className={styles.recoveryLink}
        href="https://www.congress.gov/members"
      >
        Check Congress.gov
      </a>
    </section>
  );
}

function jurisdictionLabel(view: FederalOfficialsView) {
  const { district, stateCode } = view.jurisdiction;
  return district === 0
    ? `${stateCode} at-large`
    : `${stateCode} District ${district}`;
}

function officeHeading(seat: FederalSeat) {
  if (seat.office.chamber === "senate") {
    return seat.office.title;
  }
  return seat.office.district === 0
    ? `${seat.office.title} — At-large`
    : `${seat.office.title} — District ${seat.office.district}`;
}

function cardLabel(seat: FederalSeat) {
  const heading = officeHeading(seat);
  if (seat.status === "serving") {
    return `${heading}: ${seat.person.name}`;
  }
  if (seat.status === "vacant") {
    return `${heading}: vacant`;
  }
  if (seat.status === "unknown") {
    return `${heading}: officeholder unknown`;
  }
  return `${heading}: conflicting evidence`;
}

function coverageNotesFor(view: FederalOfficialsView) {
  const notes: string[] = [];
  if (view.coverage.house === "partial") {
    notes.push("House coverage is partial. Some current-seat evidence is unavailable.");
  } else if (view.coverage.house === "unknown") {
    notes.push("House coverage is unknown. No current officeholder is verified.");
  }
  if (view.coverage.senate === "partial") {
    notes.push(
      "Senate coverage is partial. One current seat is verified; another may be unavailable.",
    );
  } else if (view.coverage.senate === "unknown") {
    notes.push("Senate coverage is unknown. Current senators are not verified.");
  }
  return notes;
}
