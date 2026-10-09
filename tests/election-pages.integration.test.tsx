import { cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ElectionsPage from "@/app/elections/page";
import ContestPage from "@/app/elections/contests/[contestId]/page";
import { createElectionService } from "@/lib/election-service";
import type { ElectionGraph, ElectionRepository } from "@/lib/elections";
import { evidence, fixtureCalendarGraph, fixtureGraph, NOW, VERIFIED_AT } from "./fixtures/elections/domain";

const { runtime } = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("@/lib/election-service", async (original) => ({ ...await original<typeof import("@/lib/election-service")>(), getRuntimeElectionService: runtime }));
vi.mock("@/lib/auth", () => ({ getRuntimeAuth: () => { throw new Error("Public browsing must not authenticate"); } }));
vi.mock("@/lib/saved-residence", () => ({ getSavedResidenceDivisions: () => { throw new Error("Public browsing must not read residence"); } }));

// Replace only the storage boundary: routes, service, projection and HTML render together.
function setup(fixture = fixtureGraph(), now = NOW) {
  const { schema_version, policy_version, ...ledger } = fixture.package;
  void schema_version; void policy_version;
  const graph: ElectionGraph = { ledger, policy: fixture.policy, contest_id: fixture.contest_id,
    completeness: { current: "complete", supersession: "complete", history: "complete" }, history_page: { offset: 0, limit: 100 } };
  const repository: ElectionRepository = {
    readUpcoming: vi.fn(async (scope) => scope.level === "federal" ? [graph] : []),
    readContest: vi.fn(async (id) => id === graph.contest_id ? graph : null),
    importReviewedPackage: vi.fn(async () => { throw new Error("Page reads must never write"); }),
  };
  runtime.mockResolvedValue(createElectionService({ repository, now: () => now }));
  return repository;
}
const detail = (history?: string) => ContestPage({ params: Promise.resolve({ contestId: "contest-house" }), searchParams: Promise.resolve({ history }) });
beforeEach(() => vi.clearAllMocks());

describe("anonymous source-backed election journey", () => {
  it("browses index to detail with equal candidates, independent status and source links", async () => {
    const fixture = fixtureGraph();
    fixture.package.evidence.push(evidence("intent", "withdrawn"), evidence("ballot_qualification", "certified"), evidence("finance", "filed"));
    const repository = setup(fixture);
    render(await ElectionsPage());
    expect(screen.getByRole("link", { name: "Synthetic House contest" })).toHaveAttribute("href", "/elections/contests/contest-house");
    expect(screen.getByText(/district matching.*not verified/i)).toBeInTheDocument();
    const row = screen.getByRole("link", { name: "Synthetic House contest" }).closest("li") as HTMLElement;
    expect(within(row).getAllByRole("link", { name: "Synthetic election office list" })[0]).toHaveAttribute("href", "https://elections.example.test/2026/candidates");
    cleanup();
    const page = await detail();
    render(page);
    const avery = screen.getByRole("article", { name: "Avery Example" });
    const blair = screen.getByRole("article", { name: "Blair Sample" });
    for (const candidate of [avery, blair]) for (const track of ["Intent", "Filing", "Ballot qualification", "Ballot appearance", "Outcome", "Finance filing"]) {
      expect(within(candidate.querySelector(":scope > dl") as HTMLElement).getByText(track, { exact: true })).toBeInTheDocument();
    }
    expect(within(avery).getByText("Withdrawn", { exact: true })).toBeInTheDocument();
    expect(within(avery).getByText("Certified", { exact: true })).toBeInTheDocument();
    expect(within(avery).getAllByRole("link", { name: "Synthetic election office list" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "FEC ballot access guidance" })).toHaveAttribute("href", "https://www.fec.gov/help-candidates-and-committees/registering-candidate/gaining-ballot-access/");
    const term = screen.getByTestId("contest-fact-term");
    expect(within(term).getByRole("link", { name: "Synthetic election office list" })).toHaveAttribute("href", "https://elections.example.test/2026/candidates");
    expect(term.querySelector(`time[datetime="${VERIFIED_AT}"]`)).not.toBeNull();
    const html = renderToStaticMarkup(page);
    expect(html).toContain(`dateTime="${VERIFIED_AT}"`);
    expect(html).not.toMatch(/<script|sign-in\?next=|receipt_id|access_approval/);
    for (const link of screen.getAllByRole("link")) expect(link.getAttribute("href")).not.toMatch(/ocd-division|address|latitude|longitude/);
    expect(repository.importReviewedPackage).not.toHaveBeenCalled();
  });

  it("keeps contradictory current statuses visible and retains separately sourced calendar provenance", async () => {
    const fixture = fixtureCalendarGraph();
    fixture.package.evidence.push(evidence("ballot_qualification", "certified"), evidence("ballot_qualification", "removed", { id: "conflicting-qualification" }));
    setup(fixture);
    render(await detail());
    const avery = screen.getByRole("article", { name: "Avery Example" });
    expect(within(avery).getByText(/Conflicting evidence/)).toBeInTheDocument();
    const tracks = avery.querySelector(":scope > dl") as HTMLElement;
    expect(within(tracks).getByText("Certified", { exact: true }).closest("details")).toBeNull();
    expect(within(tracks).getByText("Removed", { exact: true }).closest("details")).toBeNull();
    const stage = screen.getByRole("region", { name: "Election and stage" });
    expect(within(stage).getByRole("link", { name: "Synthetic timezone reference" })).toHaveAttribute("href", "https://time.example.test/northamerica");
    expect(within(stage).getByRole("link", { name: "Synthetic civil boundary reference" })).toHaveAttribute("href", "https://time.example.test/pacific-boundary");
  });

  it("shows conflicting metadata sources outside collapsed history with public recovery", async () => {
    const fixture = fixtureGraph();
    const metadata = fixture.package.evidence.find((entry) => entry.kind === "contest_metadata")!;
    fixture.package.documents.push({ ...fixture.package.documents[0], id: "conflict-document", label: "Synthetic conflicting source" });
    fixture.package.evidence.push({ ...metadata, id: "conflicting-contest", document_id: "conflict-document", value: { ...metadata.value, office: "Different office" } });
    setup(fixture);
    render(await detail());
    expect(screen.getByText(/not verified/)).toBeInTheDocument();
    for (const label of ["Synthetic election office list", "Synthetic conflicting source"]) {
      expect(screen.getAllByRole("link", { name: label }).some((link) => link.closest("details") === null)).toBe(true);
    }
    expect(screen.getByRole("link", { name: "Browse elections" })).toHaveAttribute("href", "/elections");
  });

  it("removes expired facts from upcoming coverage while retaining clearly historical detail", async () => {
    setup(fixtureGraph(), new Date("2026-09-13T12:00:00.000Z"));
    render(await ElectionsPage());
    expect(screen.queryByRole("link", { name: "Synthetic House contest" })).not.toBeInTheDocument();
    expect(screen.getByText(/does not mean there are no elections/)).toBeInTheDocument();
    cleanup();
    render(await detail());
    expect(screen.getByText(/Historical contest/)).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Avery Example" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Synthetic election office list" }).length).toBeGreaterThan(0);
  });

  it("bounds history input before storage and gives public recovery when storage fails", async () => {
    const repository = setup();
    render(await detail("private-address-sentinel"));
    expect(repository.readContest).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Browse elections" })).toHaveAttribute("href", "/elections");
    cleanup();
    await detail("100");
    expect(repository.readContest).toHaveBeenCalledWith("contest-house", { offset: 100, limit: 100 });
    vi.mocked(repository.readContest).mockRejectedValue(new Error("private-address-sentinel"));
    const page = await detail();
    render(page);
    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(renderToStaticMarkup(page)).not.toContain("private-address-sentinel");
    cleanup();
    vi.mocked(repository.readUpcoming).mockRejectedValue(new Error("private-address-sentinel"));
    const index = await ElectionsPage();
    render(index);
    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /official election office/i })).toHaveAttribute("href", "https://www.sos.ca.gov/elections");
    expect(renderToStaticMarkup(index)).not.toContain("private-address-sentinel");
  });
});
