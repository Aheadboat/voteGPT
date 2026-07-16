import type {
  Freshness,
  Office,
  Person,
  SourceRef,
  Term,
} from "@/lib/federal-officials";

import styles from "./federal-officials.module.css";

type CurrentProfile = Readonly<{
  person: Person;
  office: Office;
  term: Term;
  sources: readonly SourceRef[];
  freshness: Freshness;
}>;

export type FederalProfileResult =
  | Readonly<{ status: "available"; profile: CurrentProfile }>
  | Readonly<{ status: "unavailable" }>;

export function FederalProfile({ result }: { result: FederalProfileResult }) {
  if (result.status === "unavailable" || !isCurrentProfile(result.profile)) {
    return <ProfileRecovery message="Federal profile information is unavailable." />;
  }

  const { profile } = result;
  if (profile.freshness.state === "expired") {
    return (
      <ProfileRecovery
        checkedAt={profile.freshness.checkedAt}
        message="Federal profile data has expired. Refresh before relying on this officeholder."
      />
    );
  }

  const label = `${profile.person.name} — ${profile.office.title}`;
  return (
    <article aria-label={label} className={styles.profile}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Verified federal profile</p>
        <h2>{profile.person.name}</h2>
      </header>

      {profile.freshness.state === "stale" ? (
        <p className={styles.status} role="status">
          This profile is stale but not expired. Verify it with the linked official
          source.
        </p>
      ) : null}

      <dl className={styles.details}>
        <div>
          <dt>Office</dt>
          <dd>{profile.office.title}</dd>
        </div>
        <div>
          <dt>Jurisdiction</dt>
          <dd>{officeLocation(profile.office)}</dd>
        </div>
        <div>
          <dt>Congress</dt>
          <dd>{profile.term.congress}{ordinalSuffix(profile.term.congress)} Congress</dd>
        </div>
        <div>
          <dt>Term</dt>
          <dd>{termYears(profile.term)}</dd>
        </div>
      </dl>

      <p className={styles.freshness}>
        Checked {" "}
        <time dateTime={profile.freshness.checkedAt}>
          {profile.freshness.checkedAt}
        </time>. {" "}
        {profile.freshness.state === "fresh"
          ? "Fresh at last check."
          : "Stale but not expired; verify before use."}
      </p>

      <section aria-label="Profile sources" className={styles.sources}>
        <h3>Sources and retrieval times</h3>
        <ul>
          {profile.sources.map((source) => (
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
      </section>
    </article>
  );
}

function ProfileRecovery({
  checkedAt,
  message,
}: {
  checkedAt?: string;
  message: string;
}) {
  return (
    <section aria-label="Federal official profile" className={styles.profile}>
      <h2>Federal official profile</h2>
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

function isCurrentProfile(profile: CurrentProfile) {
  return (
    profile.term.status === "serving" &&
    profile.term.personId === profile.person.id &&
    profile.term.officeId === profile.office.id &&
    profile.sources.length > 0
  );
}

function officeLocation(office: Office) {
  if (office.chamber === "senate") {
    return office.stateCode;
  }
  return office.district === 0
    ? `${office.stateCode} At-large`
    : `${office.stateCode} District ${office.district}`;
}

function termYears(term: Term) {
  return term.startYear === null || term.endYear === null
    ? "Dates unavailable"
    : `${term.startYear}–${term.endYear}`;
}

function ordinalSuffix(value: number) {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return "th";
  }
  return value % 10 === 1
    ? "st"
    : value % 10 === 2
      ? "nd"
      : value % 10 === 3
        ? "rd"
        : "th";
}
