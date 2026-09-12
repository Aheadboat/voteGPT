import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { projectContest, type ContestField, type ContestResult, type ContestView } from "@/lib/elections";
import { evidence, fixturePackage, fixturePolicy, NOW, VERIFIED_AT } from "../../tests/fixtures/elections/domain";
import { ElectionContest } from "./elections";

function view(): ContestView {
  const { schema_version, policy_version, ...ledger } = fixturePackage();
  void schema_version;
  void policy_version;
  const result = projectContest({
    ledger, policy: fixturePolicy(), contest_id: "contest-house",
    completeness: { current: "complete", supersession: "complete", history: "complete" },
    history_page: { offset: 0, limit: 100 },
  }, NOW);
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
