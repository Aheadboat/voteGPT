import type { ReactNode } from "react";
import type {
  BallotLineView, CandidateTracks, CandidacyView, ContestField, ContestResult,
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
    <span>Source type: {source.source_type.replaceAll("_", " ")}. Location: {source.locator}.</span>
    {source.original_term !== shownTerm && <span>Original source term: <span>{source.original_term}</span></span>}
    <span>Retrieved <Time value={source.retrieved_at} />. Reviewed <Time value={source.verified_at} />.</span>
    <span>{source.effective.precision === "unknown" ? "Effective time unknown." :
      `Effective ${source.effective.start ?? "start unknown"} to ${source.effective.end ?? "end unspecified"}${source.effective.precision === "date" ? " (source-stated civil dates)" : ""}.`}
      {" "}Verification expires <Time value={source.current_until} />.</span>
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
function nameOf(item: CandidacyView | BallotLineView) {
  return item.metadata.state === "verified" ? item.metadata.value.name : `Unverified identity ${item.id}`;
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
    <h1>{result.contest.state === "verified" ? result.contest.value.name : "Election contest"}</h1>
    {result.verification === "historical" && <p className={styles.notice}>Historical contest — prior evidence is not current verification.</p>}
    <section aria-label="Election and stage"><h2>Election and stage</h2>
      <Claim state={result.election} renderValue={(election) => <>{election.name}. {election.kind} election. Coverage: {election.coverage.state === "partial" ? "Partial" : "Complete only within admitted contests"}. {election.coverage.notes.join(" ")}</>} />
      <Claim state={result.stage} renderValue={(stage) => <>{stage.name}. Stage: {stage.kind}. Election date: {stage.date ?? "Unknown"}. Time zone: {stage.time_zone ?? "Unknown"}. An election date does not establish polling hours.</>} />
    </section>
    <section aria-label="Contest facts"><h2>Contest facts</h2>
      {result.contest.state === "verified" ? <dl>{(Object.keys(fieldLabels) as ContestField[]).map((field) => <div key={field} data-testid={`contest-fact-${field}`} className={styles.fact}>
        <dt>{fieldLabels[field]}</dt><dd><p>{["form", "level", "partisanship"].includes(field) ? readableValue(result.contest.state === "verified" ? result.contest.value[field] : null) : valueText(result.contest.state === "verified" ? result.contest.value[field] : null)}</p>
          <Sources evidence={result.contest.state === "verified" ? result.contest.evidence.flatMap((entry: EvidenceRef) => entry.field_sources?.[field] ?? []) : []} />
        </dd>
      </div>)}</dl> : <Claim state={result.contest} />}
    </section>
    <section aria-label="Candidates"><h2>Candidates</h2>
      <p>Names appear alphabetically, then by explicit identifier. Each candidate has the same evidence tracks. Finance filings do not establish ballot qualification.</p>
      {result.candidates.length === 0 && <p>No verified candidate identities are available. This does not establish that there are no candidates.</p>}
      {[...result.candidates].sort(compareNames).map((candidate) => <Candidate key={candidate.id} candidate={candidate} />)}
    </section>
    {!!result.retired_candidates.length && <section aria-label="Retired candidate identities"><h2>Retired candidate identities</h2>{[...result.retired_candidates].sort(compareNames).map((candidate) => <Candidate key={candidate.id} candidate={candidate} retired />)}</section>}
    <History entries={history} page={result.history_page} contestId={result.contest_id} />
  </section>;
}
