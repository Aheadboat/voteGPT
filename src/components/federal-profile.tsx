import type {
  Freshness,
  Office,
  Person,
  SourceRef,
  Term,
} from "@/lib/federal-officials";

import styles from "./federal-officials.module.css";

const clerkListUrl = "https://clerk.house.gov/Members/ViewVacancies";
const firstCongressYear = 1789;

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
        <h1>{profile.person.name}</h1>
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
        <h2>Sources and retrieval times</h2>
        <ul>
          {profile.sources.map((source) => (
            <li key={`${source.url}:${source.retrievedAt}`}>
              <a className={styles.sourceLink} href={source.url}>
                {sourceLinkName(source)}
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
      <h1>Federal official profile</h1>
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
  const checkedAt = Date.parse(profile.freshness.checkedAt);
  const currentCongress = congressAt(checkedAt);
  const memberUrl =
    `https://api.congress.gov/v3/member/${profile.person.bioguideId}?format=json`;
  const isMemberSource = (source: SourceRef) =>
    source.publisher === "Congress.gov" &&
    source.sourceType === "member" &&
    source.url === memberUrl;
  const isClerkListSource = (source: SourceRef) =>
    source.publisher ===
      "Office of the Clerk, U.S. House of Representatives" &&
    source.sourceType === "vacancy" &&
    source.url === clerkListUrl;
  const validSources =
    profile.office.chamber === "house"
      ? profile.sources.some(isMemberSource) &&
        profile.sources.some(isClerkListSource) &&
        profile.sources.every(
          (source) => isMemberSource(source) || isClerkListSource(source),
        )
      : profile.sources.some(isMemberSource) &&
        profile.sources.every(isMemberSource);
  return (
    currentCongress !== null &&
    profile.person.id === `bioguide:${profile.person.bioguideId}` &&
    profile.office.id ===
      `federal:${profile.office.chamber}:${profile.office.stateCode}:${
        profile.office.chamber === "house"
          ? profile.office.district
          : profile.person.bioguideId
      }` &&
    profile.term.status === "serving" &&
    profile.term.personId === profile.person.id &&
    profile.term.officeId === profile.office.id &&
    validCurrentTerm(profile.term, profile.office.chamber, currentCongress) &&
    validSources
  );
}

function congressAt(time: number) {
  if (!Number.isFinite(time)) {
    return null;
  }
  const date = new Date(time);
  let startYear = date.getUTCFullYear();
  if (startYear % 2 === 0) {
    startYear -= 1;
  } else if (time < Date.UTC(startYear, 0, 3, 17)) {
    startYear -= 2;
  }
  const congress = (startYear - firstCongressYear) / 2 + 1;
  return Number.isSafeInteger(congress) && congress > 0 ? congress : null;
}

function validCurrentTerm(
  term: Term,
  chamber: "house" | "senate",
  currentCongress: number,
) {
  if (
    term.congress !== currentCongress ||
    !Number.isSafeInteger(term.congress) ||
    !Number.isSafeInteger(term.startYear) ||
    (term.endYear !== null && !Number.isSafeInteger(term.endYear))
  ) {
    return false;
  }
  const congressStart = firstCongressYear + (currentCongress - 1) * 2;
  const congressEnd = congressStart + 2;
  return (
    (term.startYear as number) >= firstCongressYear &&
    (term.startYear as number) < congressEnd &&
    (chamber === "senate" || (term.startYear as number) >= congressStart) &&
    (term.endYear === null ||
      (term.endYear > (term.startYear as number) &&
        term.endYear > congressStart &&
        term.endYear <= congressEnd + (chamber === "senate" ? 4 : 0)))
  );
}

function sourceLinkName(source: SourceRef) {
  if (
    source.publisher === "Office of the Clerk, U.S. House of Representatives"
  ) {
    const record = source.url === "https://clerk.house.gov/Members/ViewVacancies"
      ? "current vacancies list"
      : "district vacancy record";
    return `${source.publisher} ${record} source`;
  }
  return `${source.publisher} ${source.sourceType} source`;
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
