import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectContest } from "@/lib/elections";
import { fixturePackage, fixturePolicy, NOW, STATE } from "../../../tests/fixtures/elections/domain";
import ElectionsPage, { dynamic, revalidate } from "./page";

const { getUpcoming, getRuntimeElectionService } = vi.hoisted(() => ({ getUpcoming: vi.fn(), getRuntimeElectionService: vi.fn() }));
vi.mock("@/lib/election-service", () => ({ getRuntimeElectionService }));
vi.mock("@/lib/auth", () => ({ getRuntimeAuth: vi.fn(() => { throw new Error("Public election browsing must not authenticate"); }) }));
vi.mock("@/lib/saved-residence", () => ({ getSavedResidenceDivisions: vi.fn(() => { throw new Error("Public browsing must not read residence"); }) }));

describe("anonymous public election index", () => {
  beforeEach(() => {
    getRuntimeElectionService.mockResolvedValue({ getUpcoming });
    getUpcoming.mockResolvedValue({ status: "available", contests: [], unverified_count: 0 });
  });
  it("disables cached HTML and gives honest empty coverage without signing in", async () => {
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    render(await ElectionsPage());
    expect(screen.getByRole("heading", { level: 1, name: "Elections" })).toBeInTheDocument();
    expect(screen.getByText(/does not mean there are no elections/)).toBeInTheDocument();
    expect(screen.getByText(/district matching.*not verified/i)).toBeInTheDocument();
    expect(getUpcoming).toHaveBeenCalledWith({ level: "state", jurisdiction_id: STATE, division_ids: [STATE] });
    expect(getUpcoming).toHaveBeenCalledWith({ level: "federal", jurisdiction_id: STATE, division_ids: [STATE] });
  });
  it("provides native district contest links and near-fact sources in static HTML", async () => {
    const { schema_version, policy_version, ...ledger } = fixturePackage();
    void schema_version;
    void policy_version;
    const contest = projectContest({ ledger, policy: fixturePolicy(), contest_id: "contest-house", completeness: { current: "complete", supersession: "complete", history: "complete" }, history_page: { offset: 0, limit: 100 } }, NOW);
    expect(contest.status).toBe("available");
    getUpcoming.mockResolvedValue({ status: "available", contests: [contest], unverified_count: 0 });
    const page = await ElectionsPage();
    render(page);
    expect(screen.getByRole("link", { name: "Synthetic House contest" })).toHaveAttribute("href", "/elections/contests/contest-house");
    expect(screen.getAllByRole("link", { name: "Synthetic election office list" }).length).toBeGreaterThan(0);
    const markup = renderToStaticMarkup(page);
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("sign-in?next=");
  });
  it("explains unavailable storage without exposing internal errors", async () => {
    getRuntimeElectionService.mockResolvedValue(null);
    render(await ElectionsPage());
    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /official election office/i })).toBeInTheDocument();
  });
});
