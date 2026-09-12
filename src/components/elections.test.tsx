import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { projectContest, type ContestField, type ContestResult, type ContestView, type EvidenceHistory, type EvidenceRef } from "@/lib/elections";
import { evidence, fixturePackage, fixturePolicy, NOW, VERIFIED_AT } from "../../tests/fixtures/elections/domain";
import { ElectionContest, ElectionIndex } from "./elections";

function view(now = NOW, corroborate = false): ContestView {
  const { schema_version, policy_version, ...ledger } = fixturePackage();
  void schema_version;
  void policy_version;
  if (corroborate) {
    const metadata = ledger.evidence.find((entry) => entry.kind === "contest_metadata");
    if (!metadata) throw new Error("Invalid test setup");
    ledger.evidence.push({ ...metadata, id: "corroborating-contest-metadata", locator: "Synthetic row 2", original_term: "Corroborating original term" });
  }
  const result = projectContest({
    ledger, policy: fixturePolicy(), contest_id: "contest-house",
    completeness: { current: "complete", supersession: "complete", history: "complete" },
    history_page: { offset: 0, limit: 100 },
  }, now);
  if (result.status !== "available") throw new Error("Invalid test setup");
  return result;
}

describe("source-backed election contest", () => {
  it("renders equal candidates and independent status evidence in HTML without client interaction", () => {
    const { schema_version, policy_version, ...ledger } = fixturePackage();
    void schema_version;
    void policy_version;
    ledger.evidence.push(
      evidence("filing", "accepted"),
      evidence("ballot_qualification", "certified"),
      evidence("intent", "withdrawn"),
      evidence("ballot_appearance", "listed_for_ballot"),
    );
    const result = projectContest({
      ledger, policy: fixturePolicy(), contest_id: "contest-house",
      completeness: { current: "complete", supersession: "complete", history: "complete" },
      history_page: { offset: 0, limit: 100 },
    }, NOW);
    expect(result.status).toBe("available");
    render(<ElectionContest result={result} />);
    const avery = screen.getByRole("article", { name: "Avery Example" });
    const blair = screen.getByRole("article", { name: "Blair Sample" });
    for (const candidate of [avery, blair]) {
      const candidateTracks = candidate.querySelector(":scope > dl") as HTMLElement;
      for (const track of ["Intent", "Filing", "Ballot qualification", "Ballot appearance", "Outcome", "Finance filing"]) {
        expect(within(candidateTracks).getByText(track, { exact: true })).toBeInTheDocument();
      }
    }
    for (const status of ["Accepted", "Certified", "Withdrawn", "Listed for ballot"]) {
      expect(within(avery).getByText(status, { exact: true })).toBeInTheDocument();
    }
    expect(within(avery).getAllByRole("link", { name: "Synthetic election office list" }).length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(<ElectionContest result={result} />);
    expect(html).toContain(`dateTime="${VERIFIED_AT}"`);
    expect(html).toContain("<details");
    expect(html).not.toContain("<script");
    expect(html.indexOf("Avery Example")).toBeLessThan(html.indexOf("Blair Sample"));
  });

  it("attributes every contest field to its actual field sources and review time", () => {
    const result = view();
    if (result.contest.state !== "verified") throw new Error("Invalid test setup");
    const original = result.contest.evidence[0];
    const fields = Object.keys(result.contest.value) as ContestField[];
    const field_sources = Object.fromEntries(fields.map((field) => [field, [{
      ...original, group_id: field, source_label: `Source for ${field}`,
      source_url: `https://elections.example.test/${field}`,
      original_term: `Original ${field}`, verified_at: "2026-09-12T10:00:00.000Z",
    }]])) as unknown as NonNullable<typeof original.field_sources>;
    render(<ElectionContest result={{ ...result, contest: {
      ...result.contest, evidence: [{ ...original, field_sources }],
    } }} />);
    for (const field of fields) {
      const fact = screen.getByTestId(`contest-fact-${field}`);
      expect(within(fact).getByRole("link", { name: `Source for ${field}` })).toHaveAttribute("href", `https://elections.example.test/${field}`);
      expect(within(fact).queryByRole("link", { name: original.source_label })).not.toBeInTheDocument();
      expect(fact.querySelector('time[datetime="2026-09-12T10:00:00.000Z"]')).not.toBeNull();
      expect(within(fact).getByText(`Original ${field}`, { exact: true })).toBeInTheDocument();
    }
  });

  it("keeps all current conflicting assertions visible outside closed history", () => {
    const result = view();
    if (result.contest.state !== "verified") throw new Error("Invalid test setup");
    const source = result.contest.evidence[0];
    const assertions = Array.from({ length: 101 }, (_, i) => ({
      value: i % 2 ? "removed" as const : "certified" as const,
      evidence: { ...source, id: `conflict-${i}`, source_label: `Conflict source ${i}` },
    }));
    render(<ElectionContest result={{ ...result, candidates: [{
      ...result.candidates[0], tracks: { ...result.candidates[0].tracks,
        ballot_qualification: { state: "conflict", assertions },
      },
    }], history_page: { ...result.history_page, total: 201, next_offset: 100 } }} />);
    const candidate = screen.getByRole("article", { name: "Avery Example" });
    expect(within(candidate).getByText(/Conflicting evidence/)).toBeInTheDocument();
    for (let i = 0; i < 101; i++) {
      expect(within(candidate).getByRole("link", { name: `Conflict source ${i}` }).closest("details")).toBeNull();
    }
    expect(screen.getByRole("link", { name: /Next history page/ })).toHaveAttribute("href", "/elections/contests/contest-house?history=100");
  });

  it("renders metadata conflicts outside disclosure even when no contest projection is available", () => {
    const result = view();
    const conflict = { ...result.history[0], evidence: { ...result.history[0].evidence, source_label: "Conflicting metadata source" } };
    render(<ElectionContest result={{ status: "unverified", reason: "unverified_metadata", contest_id: result.contest_id, metadata_conflicts: [conflict], history: [], history_page: result.history_page }} />);
    expect(screen.getByRole("link", { name: "Conflicting metadata source" }).closest("details")).toBeNull();
  });

  it.each([
    [{ status: "missing" }, /Contest not found/],
    [{ status: "unavailable" }, /temporarily unavailable/],
    [{ status: "unverified", reason: "invalid_graph" }, /not verified/],
  ] as const)("explains %j and offers native public recovery", (result, message) => {
    render(<ElectionContest result={result as ContestResult} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse elections/ })).toHaveAttribute("href", "/elections");
  });

  it("marks historical evidence stale without presenting prior status as current", () => {
    const result = view();
    if (result.contest.state !== "verified") throw new Error("Invalid test setup");
    render(<ElectionContest result={{ ...result, verification: "historical", candidates: [{
      ...result.candidates[0], tracks: { ...result.candidates[0].tracks, filing: {
        state: "stale", previous: [{ value: "accepted", evidence: result.contest.evidence[0] }],
      } },
    }] }} />);
    expect(screen.getByText(/Historical contest/)).toBeInTheDocument();
    expect(screen.getByText(/Stale evidence/)).toBeInTheDocument();
  });

  it("escapes source text and uses no personalized division IDs in links", () => {
    const result = view();
    const candidate = result.candidates[0];
    if (candidate.metadata.state !== "verified") throw new Error("Invalid test setup");
    const markup = renderToStaticMarkup(<ElectionContest result={{ ...result, candidates: [{
      ...candidate, metadata: { ...candidate.metadata, value: { ...candidate.metadata.value, name: '<script>alert("private")</script>' } },
    }] }} />);
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script");
    render(<ElectionContest result={result} />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/ocd-division|address|latitude|longitude/);
    }
  });

  it("retains historical names and field-specific provenance when metadata becomes stale", () => {
    const result = view();
    if (result.contest.state !== "verified" || result.candidates[0].metadata.state !== "verified") throw new Error("Invalid test setup");
    const contest = result.contest;
    const candidate = result.candidates[0];
    const metadata = candidate.metadata;
    if (metadata.state !== "verified") throw new Error("Invalid test setup");
    render(<ElectionContest result={{ ...result, verification: "historical", contest: {
      state: "stale", previous: [{ value: contest.value, evidence: contest.evidence[0] }],
    }, candidates: [{ ...candidate, metadata: { state: "stale", previous: [{ value: metadata.value, evidence: metadata.evidence[0] }] } }] }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Synthetic House contest" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Avery Example" })).toBeInTheDocument();
    expect(screen.getByTestId("contest-fact-term")).toHaveTextContent("2027-2029");
    expect(within(screen.getByTestId("contest-fact-term")).getByRole("link", { name: "Synthetic election office list" })).toBeInTheDocument();
  });

  it("keeps current ballot-line conflicts visible outside disclosure", () => {
    const result = view();
    if (result.contest.state !== "verified") throw new Error("Invalid test setup");
    const candidate = result.candidates[0];
    const line = candidate.ballot_lines[0];
    const source = result.contest.evidence[0];
    render(<ElectionContest result={{ ...result, candidates: [{ ...candidate, ballot_lines: [{ ...line, tracks: {
      ...line.tracks, ballot_appearance: { state: "conflict", assertions: [
        { value: "listed_for_ballot", evidence: { ...source, source_label: "Listed source" } },
        { value: "not_on_ballot", evidence: { ...source, source_label: "Removed source" } },
      ] },
    } }] }] }} />);
    for (const label of ["Listed source", "Removed source"]) expect(screen.getByRole("link", { name: label }).closest("details")).toBeNull();
  });

  it("links the separate ballot-access explanation to the official source", () => {
    render(<ElectionContest result={view()} />);
    expect(screen.getByRole("link", { name: "FEC ballot access guidance" })).toHaveAttribute("href", "https://www.fec.gov/help-candidates-and-committees/registering-candidate/gaining-ballot-access/");
  });
});

describe("public election index display", () => {
  it.each([false, true])("keeps all corroborating field sources on an index row (expired: %s)", (expired) => {
    const contest = view(expired ? new Date("2026-09-13T12:00:00.000Z") : NOW, true);
    expect(contest.contest.state).toBe(expired ? "stale" : "verified");
    render(<ElectionIndex result={{ status: "available", contests: [contest], unverified_count: 0 }} />);
    const row = screen.getByRole("link", { name: "Synthetic House contest" }).closest("li") as HTMLElement;
    expect(within(row).getAllByRole("link", { name: "Synthetic election office list" })).toHaveLength(4);
    expect(within(row).getAllByText("Corroborating original term", { exact: true })).toHaveLength(2);
    expect(row.querySelectorAll(`time[datetime="${VERIFIED_AT}"]`)).toHaveLength(4);
    if (expired) expect(within(row).getByText(/Historical contest.*not current/i)).toBeInTheDocument();
    else expect(within(row).queryByText(/Historical contest/)).not.toBeInTheDocument();
  });
  it("groups native contest links under sourced election and stage facts", () => {
    const contest = view();
    render(<ElectionIndex result={{ status: "available", contests: [contest], unverified_count: 0 }} />);
    expect(screen.getByRole("link", { name: "Synthetic House contest" })).toHaveAttribute("href", "/elections/contests/contest-house");
    expect(screen.getByText(/Synthetic 2026 election/)).toBeInTheDocument();
    expect(screen.getByText(/Synthetic general election/)).toBeInTheDocument();
    expect(screen.getByText(/2026-11-03/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Synthetic election office list" }).length).toBeGreaterThan(0);
  });
  it("does not turn empty or unverified inventories into absence claims", () => {
    render(<ElectionIndex result={{ status: "available", contests: [], unverified_count: 3 }} />);
    expect(screen.getByText(/does not mean there are no elections/)).toBeInTheDocument();
    expect(screen.getByText(/3.*not verified/)).toBeInTheDocument();
  });
  it.each(["unsupported", "unavailable"] as const)("explains %s with an official recovery resource", (status) => {
    render(<ElectionIndex result={{ status }} />);
    expect(screen.getByText(status === "unavailable" ? /temporarily unavailable/ : /coverage is unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /official election office/i })).toHaveAttribute("href", "https://www.sos.ca.gov/elections");
  });
});

// Published synthetic DTOs keep calendar presentation independent of active T1 validation work.
const calendarStageSource = {
  id: "synthetic-stage-date", source_url: "https://elections.example.test/date-only",
  source_type: "official_election_authority", authority_id: "synthetic-election-authority",
  source_label: "Synthetic date-only election source", original_term: "November 3, 2026",
  document_sha256: "a".repeat(64), locator: "Synthetic election calendar, row 1",
  retrieved_at: "2026-09-12T11:00:00.000Z", verified_at: VERIFIED_AT,
  effective: { precision: "unknown", reason: "not_published" },
  current_until: "2026-09-13T12:00:00.000Z",
  calendar_basis: {
    basis_id: "internal-calendar-basis-sentinel", mapping_id: "internal-calendar-mapping-sentinel",
    jurisdiction_id: "ocd-division/country:us/state:ca", time_zone: "America/Los_Angeles",
    references: [
      {
        basis_id: "internal-calendar-basis-sentinel", kind: "iana_tzdb",
        locator: "Synthetic zone table, western jurisdiction row", original_term: "America/Los_Angeles",
        retrieved_at: "2026-09-12T08:00:00.000Z", verified_at: "2026-09-12T10:00:00.000Z",
        current_until: "2026-09-13T10:00:00.000Z", source_url: "https://time.example.test/zone-table",
        source_label: "Synthetic time zone database", document_sha256: "b".repeat(64), authority_id: "internal-zone-authority-sentinel",
      },
      {
        basis_id: "internal-calendar-basis-sentinel", kind: "time_zone_regulation",
        locator: "Synthetic time rule, section 2", original_term: "Synthetic western time boundary",
        retrieved_at: "2026-09-12T09:00:00.000Z", verified_at: "2026-09-12T11:00:00.000Z",
        current_until: "2026-09-13T11:00:00.000Z", source_url: "https://time.example.test/regulation",
        source_label: "Synthetic time boundary reference", document_sha256: "c".repeat(64), authority_id: "internal-rule-authority-sentinel",
      },
    ],
  },
} satisfies EvidenceRef;
const { calendar_basis: calendarBasis, ...dateOnlySource } = calendarStageSource;
function calendarView(): ContestView {
  const fieldSource = { ...dateOnlySource, source_label: "Synthetic contest metadata source", group_id: "synthetic-contest-metadata" };
  const contestSource: EvidenceRef = { ...dateOnlySource, source_label: "Synthetic contest metadata source", id: "synthetic-contest-metadata", field_sources: {
    name: [fieldSource], office: [fieldSource], district: [fieldSource], term: [fieldSource],
    seats: [fieldSource], form: [fieldSource], level: [fieldSource], jurisdiction_id: [fieldSource],
    division_ids: [fieldSource], partisanship: [fieldSource],
  } };
  return {
    status: "available", contest_id: "synthetic-calendar-contest", verification: "current", upcoming: true,
    election: { state: "verified", value: { name: "Synthetic calendar election", jurisdiction_id: "ocd-division/country:us/state:ca", kind: "regular", coverage: { state: "partial", contest_ids: ["synthetic-calendar-contest"], notes: ["Synthetic test data only."] } }, evidence: [{ ...dateOnlySource, source_label: "Synthetic election metadata source", id: "synthetic-election-metadata" }], verified_at: VERIFIED_AT },
    stage: { state: "verified", value: { name: "Synthetic general stage", kind: "general", date: "2026-11-03", time_zone: "America/Los_Angeles", successor_stage_ids: [] }, evidence: [calendarStageSource], verified_at: "2026-09-12T10:00:00.000Z" },
    contest: { state: "verified", value: { name: "Synthetic calendar contest", office: "Synthetic office", district: "Statewide", term: "Synthetic term", seats: 1, form: "candidate_single_seat", level: "state", jurisdiction_id: "ocd-division/country:us/state:ca", division_ids: ["ocd-division/country:us/state:ca"], partisanship: "nonpartisan" }, evidence: [contestSource], verified_at: VERIFIED_AT },
    candidates: [], retired_candidates: [], history: [],
    history_page: { offset: 0, limit: 100, total: 0, next_offset: null, completeness: "complete" },
  };
}
function expectCalendarReferences(container: HTMLElement) {
  const label = within(container).getByText("Calendar normalization", { exact: true });
  const group = label.closest("details") ?? label.closest("section");
  expect(group).not.toBeNull();
  if (!(group instanceof HTMLElement)) throw new Error("Calendar normalization must have a named source disclosure");
  expect(group).toHaveTextContent("America/Los_Angeles");
  for (const reference of calendarBasis.references) {
    expect(within(group).getByText(reference.source_label, { exact: true }).closest("a")).toHaveAttribute("href", reference.source_url);
    expect(group).toHaveTextContent(reference.locator);
    expect(group).toHaveTextContent(reference.original_term);
    for (const timestamp of [reference.retrieved_at, reference.verified_at, reference.current_until]) {
      expect(group.querySelector(`time[datetime="${timestamp}"]`)).not.toBeNull();
    }
  }
  expect(group).not.toHaveTextContent("internal-calendar-basis-sentinel");
  expect(group).not.toHaveTextContent("internal-calendar-mapping-sentinel");
}
describe("calendar normalization provenance", () => {
  it("separates normalization references from the date-only source beside the current stage fact", () => {
    const result = calendarView();
    render(<ElectionContest result={result} />);
    const stage = screen.getByRole("region", { name: "Election and stage" });
    expect(stage).toHaveTextContent("Election date: 2026-11-03");
    expectCalendarReferences(stage);
    const primary = within(stage).getByRole("link", { name: calendarStageSource.source_label }).parentElement;
    expect(primary?.querySelector(`time[datetime="${VERIFIED_AT}"]`)).not.toBeNull();
  });
  it("shows the same reference provenance beside an index stage date", () => {
    render(<ElectionIndex result={{ status: "available", contests: [calendarView()], unverified_count: 0 }} />);
    expectCalendarReferences(screen.getByRole("region", { name: "Upcoming contests" }));
  });
  it("retains separately dated normalization evidence when the stage is stale", () => {
    const result = calendarView();
    if (result.stage.state !== "verified") throw new Error("Invalid synthetic DTO setup");
    render(<ElectionContest result={{ ...result, verification: "historical", upcoming: null, stage: { state: "stale", previous: [{ value: result.stage.value, evidence: calendarStageSource }] } }} />);
    const stage = screen.getByRole("region", { name: "Election and stage" });
    expect(stage).toHaveTextContent("Stale evidence");
    expectCalendarReferences(stage);
  });
  it("keeps calendar provenance with current metadata conflicts outside the history page", () => {
    const result = calendarView();
    if (result.stage.state !== "verified") throw new Error("Invalid synthetic DTO setup");
    const entry: EvidenceHistory = { kind: "stage_metadata", subject: { kind: "stage", id: "synthetic-stage" }, value: result.stage.value, evidence: calendarStageSource, applicability: "current", superseded: false };
    render(<ElectionContest result={{ status: "unverified", reason: "unverified_metadata", contest_id: result.contest_id, history: [], history_page: result.history_page, metadata_conflicts: [entry, { ...entry, value: { ...result.stage.value, date: "2026-11-04" }, evidence: { ...dateOnlySource, id: "synthetic-conflict", source_label: "Conflicting synthetic date source" } }] }} />);
    const primary = screen.getByRole("link", { name: "Synthetic date-only election source" });
    const assertion = primary.closest("li");
    expect(assertion?.closest("details")).toBeNull();
    if (!(assertion instanceof HTMLElement)) throw new Error("Current conflict must remain visible");
    expectCalendarReferences(assertion);
  });
  it("retains normalization references in bounded historical evidence", () => {
    const result = calendarView();
    if (result.stage.state !== "verified") throw new Error("Invalid synthetic DTO setup");
    const entry: EvidenceHistory = { kind: "stage_metadata", subject: { kind: "stage", id: "synthetic-stage" }, value: result.stage.value, evidence: calendarStageSource, applicability: "historical", superseded: true };
    render(<ElectionContest result={{ ...result, stage: { ...result.stage, evidence: [dateOnlySource], verified_at: dateOnlySource.verified_at }, history: [entry], history_page: { ...result.history_page, total: 1 } }} />);
    const history = screen.getByText("Evidence history (1 retained assertions)").closest("details");
    if (!(history instanceof HTMLElement)) throw new Error("Historical evidence must retain native disclosure");
    expectCalendarReferences(history);
  });
  it("keeps reference links in static HTML without publishing internal identifiers or approval fields", () => {
    const markup = renderToStaticMarkup(<ElectionContest result={calendarView()} />);
    expect(markup).toContain("Calendar normalization");
    expect(markup).toContain("https://time.example.test/zone-table");
    for (const hidden of ["internal-calendar-basis-sentinel", "internal-calendar-mapping-sentinel", "internal-zone-authority-sentinel", "internal-rule-authority-sentinel", "access_approval", "retention_approval", "receipt_id", "reviewer_id", "<script"]) expect(markup).not.toContain(hidden);
  });
});
