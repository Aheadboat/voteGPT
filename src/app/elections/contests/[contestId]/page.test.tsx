import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContestPage, { dynamic, revalidate } from "./page";

const { getContest, getRuntimeElectionService } = vi.hoisted(() => ({ getContest: vi.fn(), getRuntimeElectionService: vi.fn() }));
vi.mock("@/lib/election-service", () => ({ getRuntimeElectionService }));
vi.mock("@/lib/auth", () => ({ getRuntimeAuth: vi.fn(() => { throw new Error("Public detail must not authenticate"); }) }));
vi.mock("@/lib/saved-residence", () => ({ getSavedResidenceDivisions: vi.fn(() => { throw new Error("Public detail must not read residence"); }) }));

describe("anonymous contest route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRuntimeElectionService.mockResolvedValue({ getContest });
    getContest.mockResolvedValue({ status: "missing" });
  });
  it("disables cached HTML and keeps missing contests navigable", async () => {
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    render(await ContestPage({ params: Promise.resolve({ contestId: "contest-house" }) }));
    expect(screen.getByRole("heading", { name: "Contest not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse elections" })).toHaveAttribute("href", "/elections");
    expect(getContest).toHaveBeenCalledWith("contest-house", { offset: 0, limit: 100 });
  });
  it("passes bounded native history pagination without residence data", async () => {
    await ContestPage({ params: Promise.resolve({ contestId: "contest-house" }), searchParams: Promise.resolve({ history: "100" }) });
    expect(getContest).toHaveBeenCalledWith("contest-house", { offset: 100, limit: 100 });
  });
  it.each([["-1"], ["1.5"], ["1e2"], ["address sentinel"], [["0", "100"]]])("rejects invalid history %j without querying a contest", async (history) => {
    render(await ContestPage({ params: Promise.resolve({ contestId: "contest-house" }), searchParams: Promise.resolve({ history }) }));
    expect(getContest).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Browse elections" })).toBeInTheDocument();
  });
  it("renders unavailable storage with public recovery", async () => {
    getRuntimeElectionService.mockResolvedValue(null);
    render(await ContestPage({ params: Promise.resolve({ contestId: "contest-house" }) }));
    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument();
  });
});
