import { describe, expect, it, vi } from "vitest";
import type { ElectionGraph, ElectionRepository, ElectionReadScope } from "./elections";
import { createElectionService, getStatewideElections } from "./election-service";
import { DISTRICT, fixturePackage, fixturePolicy, NOW, STATE } from "../../tests/fixtures/elections/domain";

function graph(): ElectionGraph {
  const { schema_version, policy_version, ...ledger } = fixturePackage();
  void schema_version;
  void policy_version;
  return { ledger, policy: fixturePolicy(), contest_id: "contest-house",
    completeness: { current: "complete", supersession: "complete", history: "complete" },
    history_page: { offset: 0, limit: 100 } };
}
const scope: ElectionReadScope = { level: "federal", jurisdiction_id: STATE, division_ids: [STATE] };
function setup(records: readonly ElectionGraph[] = [graph()]) {
  const repository: ElectionRepository = {
    readUpcoming: vi.fn(async () => records), readContest: vi.fn(async () => records[0] ?? null),
    importReviewedPackage: vi.fn(async () => ({ status: "unavailable" as const })),
  };
  return { repository, service: createElectionService({ repository, now: () => NOW }) };
}
describe("election reads", () => {
  it("returns source-backed district contests for public jurisdiction browsing without providers or AI", async () => {
    const { service, repository } = setup();
    const result = await service.getUpcoming(scope);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Missing public contests");
    expect(result.contests.map((contest) => contest.contest_id)).toEqual(["contest-house"]);
    expect(repository.readUpcoming).toHaveBeenCalledWith(scope, NOW);
    expect(repository.importReviewedPackage).not.toHaveBeenCalled();
  });
  it("does not treat an empty inventory as proof that no election exists", async () => {
    expect(await setup([]).service.getUpcoming(scope)).toEqual({ status: "available", contests: [], unverified_count: 0 });
  });
  it("fails closed on storage errors", async () => {
    const { service, repository } = setup();
    vi.mocked(repository.readUpcoming).mockRejectedValue(new Error("private address sentinel"));
    vi.mocked(repository.readContest).mockRejectedValue(new Error("private address sentinel"));
    expect(await service.getUpcoming(scope)).toEqual({ status: "unavailable" });
    expect(await service.getContest("contest-house")).toEqual({ status: "unavailable" });
  });
  it("rejects invalid IDs and history pagination before reading storage", async () => {
    const { service, repository } = setup();
    expect(await service.getContest("../private?address=sentinel")).toEqual({ status: "missing" });
    expect(await service.getContest("contest-house", { offset: -1, limit: 100 })).toEqual({ status: "missing" });
    expect(await service.getContest("contest-house", { offset: 0, limit: 101 })).toEqual({ status: "missing" });
    expect(repository.readContest).not.toHaveBeenCalled();
  });
  it("keeps invalid stored projections out of the available inventory with an honest count", async () => {
    const invalid = { ...graph(), completeness: { current: "incomplete", supersession: "complete", history: "complete" } } as const;
    expect(await setup([invalid]).service.getUpcoming(scope)).toEqual({ status: "available", contests: [], unverified_count: 1 });
  });
  it("keeps historical details accessible while filtering past election dates from upcoming", async () => {
    const record = graph();
    const ledger = { ...record.ledger, evidence: record.ledger.evidence.map((entry) => entry.kind === "stage_metadata"
      ? { ...entry, value: { ...entry.value, date: "2026-09-11" } } : entry) };
    const { service } = setup([{ ...record, ledger }]);
    expect(await service.getUpcoming(scope)).toEqual({ status: "available", contests: [], unverified_count: 0 });
    expect((await service.getContest("contest-house")).status).toBe("available");
  });
  it.each([
    ["2026-09-13T06:59:59.000Z", "2026-09-12", true],
    ["2026-09-13T07:00:00.000Z", "2026-09-12", false],
    ["2026-11-02T07:59:59.000Z", "2026-11-01", true],
    ["2026-11-02T08:00:00.000Z", "2026-11-01", false],
  ])("uses reviewed local civil date at %s for upcoming inclusion", async (timestamp, electionDate, included) => {
    const record = graph();
    const now = new Date(timestamp);
    const ledger = { ...record.ledger, evidence: record.ledger.evidence.map((entry) => ({
      ...entry, retrieved_at: new Date(+now - 7_200_000).toISOString(),
      verified_at: new Date(+now - 3_600_000).toISOString(), current_until: new Date(+now + 3_600_000).toISOString(),
      effective: { precision: "instant" as const, start: new Date(+now - 86_400_000).toISOString(), end: null },
      ...(entry.kind === "stage_metadata" ? { value: { ...entry.value, date: electionDate } } : {}),
    })) } as ElectionGraph["ledger"];
    const { repository } = setup([{ ...record, ledger }]);
    const result = await createElectionService({ repository, now: () => now }).getUpcoming(scope);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Missing date coverage");
    expect(result.contests).toHaveLength(included ? 1 : 0);
    expect(result.unverified_count).toBe(0);
  });
  it("never treats unknown election date or timezone as verified upcoming coverage", async () => {
    for (const field of ["date", "time_zone"] as const) {
      const record = graph();
      const ledger = { ...record.ledger, evidence: record.ledger.evidence.map((entry) => entry.kind === "stage_metadata"
        ? { ...entry, value: { ...entry.value, [field]: null } } : entry) };
      const result = await setup([{ ...record, ledger }]).service.getUpcoming(scope);
      expect(result).toEqual({ status: "available", contests: [], unverified_count: 1 });
    }
  });
  it("requests only validated saved state and rejects both normal and mixed district metadata for personalization", async () => {
    const record = graph();
    const statewide = { ...record, ledger: { ...record.ledger, evidence: record.ledger.evidence.map((entry) => entry.kind === "contest_metadata"
      ? { ...entry, value: { ...entry.value, division_ids: [STATE] } } : entry) } };
    const mixed = { ...record, ledger: { ...record.ledger, evidence: record.ledger.evidence.map((entry) => entry.kind === "contest_metadata"
      ? { ...entry, value: { ...entry.value, division_ids: [STATE, DISTRICT] } } : entry) } };
    const divisions = [
      { id: STATE, idScheme: "ocd", name: "California", type: "state" },
      { id: DISTRICT, idScheme: "ocd", name: "District 12", type: "congressional_district" },
    ];
    for (const [recordToRead, expectedCount] of [[statewide, 1], [record, 0], [mixed, 0]] as const) {
      const { service, repository } = setup([recordToRead]);
      const result = await getStatewideElections(service, divisions, "federal");
      expect(result.status).toBe("available");
      if (result.status !== "available") throw new Error("Missing personalized scope");
      expect(result.contests).toHaveLength(expectedCount);
      expect(repository.readUpcoming).toHaveBeenCalledWith(scope, NOW);
    }
  });
  it("does not read storage for absent, invalid, unsupported or conflicting saved state", async () => {
    const { service, repository } = setup();
    expect(await getStatewideElections(service, [], "state")).toEqual({ status: "missing" });
    expect(await getStatewideElections(service, [{ id: DISTRICT, idScheme: "ocd", name: "District", type: "congressional_district" }], "federal")).toEqual({ status: "invalid" });
    expect(await getStatewideElections(service, [{ id: STATE, idScheme: "ocd", name: "California", type: "state" }], "local")).toEqual({ status: "unsupported" });
    expect(repository.readUpcoming).not.toHaveBeenCalled();
  });
});
