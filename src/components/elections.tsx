import type { ReactNode } from "react";
import type {
  BallotLineView, CandidateTracks, CandidacyView, ContestField, ContestMetadata, ContestResult, ContestView, ElectionIndexResult,
  EvidenceHistory, EvidenceRef, EvidenceState, HistoryPage, SourceReference,
} from "@/lib/elections";
import styles from "./elections.module.css";

const trackLabels = {
  intent: "Intent", filing: "Filing", ballot_qualification: "Ballot qualification",
  ballot_appearance: "Ballot appearance", outcome: "Outcome", finance: "Finance filing",
  continued_ballot_label: "Continued ballot label",
} as const;
const fieldLabels: Record<ContestField, string> = {
  name: "Contest", office: "Office", district: "District", term: "Term", seats: "Seats",
  form: "Contest form", level: "Government level", jurisdiction_id: "Jurisdiction identifier",
  division_ids: "Division identifiers", partisanship: "Partisanship",
};
function valueText(value: unknown): string {
  if (value === null) return "Unknown";
  if (Array.isArray(value)) return value.map(valueText).join(", ");
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${key.replaceAll("_", " ")}: ${valueText(item)}`).join("; ");
  return String(value);
}
function readableValue(value: unknown): string {
  const text = valueText(value).replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function Time({ value }: { value: string }) {
  return <time dateTime={value}>{value.replace("T", " ").replace(".000Z", " UTC").replace(/Z$/, " UTC")}</time>;
}
function Source({ source, shownTerm }: { source: SourceReference; shownTerm?: string }) {
  return <div className={styles.source}>
    <a href={source.source_url}>{source.source_label}</a>
    {source.original_term !== shownTerm && <span>Original source term: <span>{source.original_term}</span></span>}
    <span>Reviewed <Time value={source.verified_at} />.</span>
    <details><summary>Source timing and location</summary>
    <p>Source type: {source.source_type.replaceAll("_", " ")}. Location: {source.locator}.</p>
    <p>Retrieved <Time value={source.retrieved_at} />.</p>
    <p>{source.effective.precision === "unknown" ? "Effective time unknown." :
      `Effective ${source.effective.start ?? "start unknown"} to ${source.effective.end ?? "end unspecified"}${source.effective.precision === "date" ? " (source-stated civil dates)" : ""}.`}
      {" "}Verification expires <Time value={source.current_until} />.</p>
    </details>
    {source.calendar_basis && <details><summary>Calendar normalization</summary>
      <p>References used to interpret the election date in time zone {source.calendar_basis.time_zone}.</p>
      {source.calendar_basis.references.map((reference, index) => <div key={`${reference.source_url}-${reference.locator}-${index}`}>
        <a href={reference.source_url}>{reference.source_label}</a>
        <p>Original source term: {reference.original_term}. Location: {reference.locator}.</p>
        <p>Retrieved <Time value={reference.retrieved_at} />.</p>
        <p>Reviewed <Time value={reference.verified_at} />.</p>
        <p>Verification expires <Time value={reference.current_until} />.</p>
      </div>)}
    </details>}
  </div>;
}
function Sources({ evidence, shownTerm }: { evidence: readonly SourceReference[]; shownTerm?: string }) {
  return <>{evidence.map((source, i) => <Source key={`${source.source_url}-${source.locator}-${i}`} source={source} shownTerm={shownTerm} />)}</>;
}
function Claim<T>({ state, renderValue = valueText }: { state: EvidenceState<T>; renderValue?: (value: T) => ReactNode }) {
  if (state.state === "unknown") return <p>Not verified. {state.last_checked_at ? <>Last checked <Time value={state.last_checked_at} />.</> : "Last checked time unknown."}</p>;
  if (state.state === "verified") {
    const displayed = renderValue(state.value);
    return <><p>{displayed}</p><Sources evidence={state.evidence} shownTerm={typeof displayed === "string" ? displayed : undefined} /></>;
  }
  const assertions = state.state === "conflict" ? state.assertions : state.previous;
  return <div><p className={styles.notice}>{state.state === "conflict" ? "Conflicting evidence — no current status selected." : "Stale evidence — previous status is not currently verified."}</p>
    {assertions.map(({ value, evidence }, index) => <div key={`${evidence.id}-${index}`}><p>{renderValue(value)}</p><Source source={evidence} /></div>)}
  </div>;
}
function Tracks({ tracks }: { tracks: CandidateTracks }) {
  return <dl className={styles.tracks}>{(Object.keys(trackLabels) as (keyof CandidateTracks)[]).map((kind) => {
    const state = tracks[kind];
    if (state === null) return null;
    return <div key={kind}><dt>{trackLabels[kind]}</dt><dd><Claim state={state as EvidenceState<unknown>} renderValue={readableValue} /></dd></div>;
  })}</dl>;
}
function historicalValue<T>(state: EvidenceState<T>): T | null {
  if (state.state === "verified") return state.value;
  if (state.state === "stale") return state.previous[0]?.value ?? null;
  return null;
}
function nameOf(item: CandidacyView | BallotLineView) {
  return historicalValue<Readonly<{ name: string }>>(item.metadata)?.name ?? `Unverified identity ${item.id}`;
}
function compareNames(a: CandidacyView | BallotLineView, b: CandidacyView | BallotLineView) {
  return nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base" }) || a.id.localeCompare(b.id, "en");
}
function BallotLine({ line, retired = false }: { line: BallotLineView; retired?: boolean }) {
  return <section aria-label={`${retired ? "Retired " : ""}ballot line ${nameOf(line)}`} className={styles.line}>
    <h4>{retired ? "Retired ballot line: " : "Ballot line: "}{nameOf(line)}</h4>
    <Claim state={line.metadata} renderValue={(metadata) => <>{metadata.name}. Party label: {metadata.party_label ?? "Not stated"}.</>} />
    <Tracks tracks={line.tracks} />
  </section>;
}
function Candidate({ candidate, retired = false }: { candidate: CandidacyView; retired?: boolean }) {
  return <article aria-label={nameOf(candidate)} className={styles.candidate}>
    <h3>{nameOf(candidate)}</h3>
    {retired && <p className={styles.notice}>Retired identity — evidence does not transfer to a replacement candidate.</p>}
    <Claim state={candidate.metadata} renderValue={(metadata) => <>{metadata.official_person_id ? `Official person identifier: ${metadata.official_person_id.issuer}: ${metadata.official_person_id.value}` : "Official person identifier not stated."}</>} />
    <Tracks tracks={candidate.tracks} />
    <details><summary>Ballot line identities ({candidate.ballot_lines.length})</summary>
      <p>Separate ballot lines do not imply separate people. Each line retains its own source-backed status.</p>
      {candidate.ballot_lines.length === 0 && <p>No verified ballot line identities are available.</p>}
      {[...candidate.ballot_lines].sort(compareNames).map((line) => <p key={line.id}>{nameOf(line)} — {line.id}</p>)}
    </details>
    {[...candidate.ballot_lines].sort(compareNames).map((line) => <BallotLine key={line.id} line={line} />)}
    {[...candidate.retired_ballot_lines].sort(compareNames).map((line) => <BallotLine key={line.id} line={line} retired />)}
  </article>;
}
function HistoryEntry({ entry }: { entry: EvidenceHistory }) {
  return <li><p>{entry.kind.replaceAll("_", " ")} — {entry.subject.kind.replaceAll("_", " ")} {entry.subject.id}. {entry.applicability}{entry.superseded ? "; superseded" : ""}.</p>
    <p>Value: {valueText(entry.value)}</p>
    {entry.kind === "contest_metadata" && entry.evidence.field_sources ? Object.entries(entry.evidence.field_sources).map(([field, sources]) => <div key={field}><p>{fieldLabels[field as ContestField]}</p><Sources evidence={sources} /></div>) : <Source source={entry.evidence} />}
  </li>;
}
function History({ entries, page, contestId }: { entries: readonly EvidenceHistory[]; page?: HistoryPage; contestId?: string }) {
  return <><details><summary>Evidence history{page ? ` (${page.total} retained assertions)` : ""}</summary>
    {page && <p>Showing retained assertions {page.total === 0 ? 0 : page.offset + 1}–{Math.min(page.offset + page.limit, page.total)} of {page.total}. Current conflicts remain visible above.</p>}
    <ol>{[...entries].sort((a, b) => a.evidence.id.localeCompare(b.evidence.id, "en")).map((entry) => <HistoryEntry key={entry.evidence.id} entry={entry} />)}</ol>
    {entries.length === 0 && <p>No history entries on this page.</p>}
  </details>
  {page && contestId && <nav aria-label="Evidence history pages">
    {page.offset > 0 && <a href={`/elections/contests/${encodeURIComponent(contestId)}?history=${Math.max(0, page.offset - page.limit)}`}>Previous history page</a>}
    {page.next_offset !== null && <a href={`/elections/contests/${encodeURIComponent(contestId)}?history=${page.next_offset}`}>Next history page</a>}
  </nav>}</>;
}
function ContestFacts({ state }: { state: EvidenceState<ContestMetadata> }) {
  const assertions = state.state === "verified" ? [{ value: state.value, evidence: state.evidence }] :
    state.state === "stale" ? state.previous.map(({ value, evidence }) => ({ value, evidence: [evidence] })) : [];
  if (assertions.length === 0) return <Claim state={state} />;
  return <>{state.state === "stale" && <p className={styles.notice}>Stale contest facts — previously reviewed information, not current verification.</p>}
    {assertions.map(({ value, evidence }, index) => <dl key={index}>{(Object.keys(fieldLabels) as ContestField[]).map((field) => <div key={field} data-testid={`contest-fact-${field}`} className={styles.fact}>
      <dt>{fieldLabels[field]}</dt><dd><p>{["form", "level", "partisanship"].includes(field) ? readableValue(value[field]) : valueText(value[field])}</p>
        <Sources evidence={evidence.flatMap((entry: EvidenceRef) => entry.field_sources?.[field] ?? [])} />
      </dd>
    </div>)}</dl>)}
  </>;
}
export function ElectionContest({ result }: { result: ContestResult }) {
  if (result.status !== "available") return <section className={styles.shell}>
    <h1>{result.status === "missing" ? "Contest not found" : "Contest information"}</h1>
    <p role="status">{result.status === "missing" ? "Check the contest link or browse available elections." : result.status === "unavailable" ? "Election information is temporarily unavailable. Try again later or consult the official election office." : "This contest is not verified. Source information needs review before current facts can be shown."}</p>
    {result.status === "unverified" && <>
      {!!result.metadata_conflicts?.length && <><p className={styles.notice}>Conflicting metadata — current contest facts cannot be selected.</p><ul>{result.metadata_conflicts.map((entry) => <HistoryEntry key={entry.evidence.id} entry={entry} />)}</ul></>}
      <History entries={result.history ?? []} page={result.history_page} contestId={result.contest_id} />
    </>}
    <a href="/elections">Browse elections</a>
  </section>;
  const history = [...result.history, ...[...result.candidates, ...result.retired_candidates].flatMap((candidate) => [
    ...candidate.history, ...[...candidate.ballot_lines, ...candidate.retired_ballot_lines].flatMap((line) => line.history),
  ])];
  return <section className={styles.shell}>
    <a href="/elections">Browse elections</a>
    <h1>{historicalValue(result.contest)?.name ?? "Election contest"}</h1>
    {result.verification === "historical" && <p className={styles.notice}>Historical contest — prior evidence is not current verification.</p>}
    <section aria-label="Election and stage"><h2>Election and stage</h2>
      <Claim state={result.election} renderValue={(election) => <>{election.name}. {election.kind} election. Coverage: {election.coverage.state === "partial" ? "Partial" : "Complete only within admitted contests"}. {election.coverage.notes.join(" ")}</>} />
      <Claim state={result.stage} renderValue={(stage) => <>{stage.name}. Stage: {stage.kind}. Election date: {stage.date ?? "Unknown"}. Time zone: {stage.time_zone ?? "Unknown"}. An election date does not establish polling hours.</>} />
    </section>
    <section aria-label="Contest facts"><h2>Contest facts</h2>
      <ContestFacts state={result.contest} />
    </section>
    <section aria-label="Candidates"><h2>Candidates</h2>
      <p>Names appear alphabetically, then by explicit identifier. Each candidate has the same evidence tracks. Finance filings do not establish ballot qualification. <a href="https://www.fec.gov/help-candidates-and-committees/registering-candidate/gaining-ballot-access/">FEC ballot access guidance</a>.</p>
      {result.candidates.length === 0 && <p>No verified candidate identities are available. This does not establish that there are no candidates.</p>}
      {[...result.candidates].sort(compareNames).map((candidate) => <Candidate key={candidate.id} candidate={candidate} />)}
    </section>
    {!!result.retired_candidates.length && <section aria-label="Retired candidate identities"><h2>Retired candidate identities</h2>{[...result.retired_candidates].sort(compareNames).map((candidate) => <Candidate key={candidate.id} candidate={candidate} retired />)}</section>}
    <History entries={history} page={result.history_page} contestId={result.contest_id} />
  </section>;
}

export function ElectionIndex({ result }: { result: ElectionIndexResult }) {
  if (result.status !== "available") return <section className={styles.shell}>
    <p role="status">{result.status === "unavailable" ? "Election information is temporarily unavailable. Try again later." : "Election coverage is unavailable for this scope."}</p>
    <a href="https://www.sos.ca.gov/elections">California official election office</a>
  </section>;
  const contests = [...new Map(result.contests.map((contest) => [contest.contest_id, contest])).values()];
  contests.sort((a, b) => {
    const stageA = historicalValue(a.stage);
    const stageB = historicalValue(b.stage);
    return (stageA?.date ?? "").localeCompare(stageB?.date ?? "", "en") ||
      (historicalValue(a.contest)?.office ?? "").localeCompare(historicalValue(b.contest)?.office ?? "", "en") || a.contest_id.localeCompare(b.contest_id, "en");
  });
  const groups = new Map<string, ContestView[]>();
  for (const contest of contests) {
    const election = historicalValue(contest.election);
    const stage = historicalValue(contest.stage);
    const key = JSON.stringify([
      contest.election.state === "verified" ? contest.election.evidence.map((entry) => entry.id) : [],
      contest.stage.state === "verified" ? contest.stage.evidence.map((entry) => entry.id) : [],
      election?.name, stage?.name, stage?.date, stage?.time_zone,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), contest]);
  }
  return <section aria-label="Upcoming contests" className={styles.shell}>
    {result.unverified_count > 0 && <p className={styles.notice}>{result.unverified_count} contest records are not verified for upcoming display. Dates, coverage or evidence need review.</p>}
    {contests.length === 0 && <p>No currently verified upcoming contest records are available for this scope. This does not mean there are no elections or candidates. Check the official election office.</p>}
    {[...groups].map(([key, group]) => {
      const first = group[0];
      return <section key={key}>
        <h2>{historicalValue(first.election)?.name ?? "Election information"}</h2>
        <Claim state={first.election} renderValue={(election) => <>Coverage: {election.coverage.state === "partial" ? "Partial" : "Complete only within admitted contests"}. {election.coverage.notes.join(" ")}</>} />
        <h3>{historicalValue(first.stage)?.name ?? "Election stage"}</h3>
        <Claim state={first.stage} renderValue={(stage) => <>Election date: {stage.date ?? "Unknown"}. Time zone: {stage.time_zone ?? "Unknown"}. This date does not establish polling hours.</>} />
        <ul>{group.map((contest) => {
          const metadata = historicalValue(contest.contest);
          const evidence = contest.contest.state === "verified" ? contest.contest.evidence :
            contest.contest.state === "stale" ? contest.contest.previous.map((entry) => entry.evidence) : [];
          return <li key={contest.contest_id} className={styles.fact}>
            <h4><a href={`/elections/contests/${encodeURIComponent(contest.contest_id)}`}>{metadata?.name ?? "Contest information"}</a></h4>
            {contest.verification === "historical" && <p className={styles.notice}>Historical contest — previous facts are not current verification.</p>}
            <Sources evidence={evidence.flatMap((entry) => entry.field_sources?.name ?? [])} />
            <p>Office: {metadata?.office ?? "Not verified"}.</p>
            <Sources evidence={evidence.flatMap((entry) => entry.field_sources?.office ?? [])} />
          </li>;
        })}</ul>
      </section>;
    })}
  </section>;
}
