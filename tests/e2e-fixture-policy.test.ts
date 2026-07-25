import { describe, expect, it } from "vitest";

const fixturePolicyPath = "../e2e/fixture-policy.mts";
const { createFederalFixtureClock } = await import(fixturePolicyPath);

describe("federal E2E fixture clock", () => {
  it("derives Congress, terms, and cache ages from one explicit clock", () => {
    const clock = createFederalFixtureClock(
      new Date("2026-07-24T12:00:00.000Z"),
    );

    expect(clock).toEqual({
      snapshot: {
        checkedAt: "2026-07-24T12:00:00.000Z",
        currentCongress: 119,
        startYear: 2025,
        endYear: 2026,
      },
      servingTerm: {
        start: "2025-01-03T17:00:00.000Z",
        end: "2027-01-03T17:00:00.000Z",
      },
      freshRetrievedAt: "2026-07-24T11:00:00.000Z",
      staleRetrievedAt: "2026-07-23T11:00:00.000Z",
      expiredRetrievedAt: "2026-07-21T11:00:00.000Z",
    });
  });

  it("rejects an invalid fixture clock", () => {
    expect(() => createFederalFixtureClock(new Date(Number.NaN))).toThrow(
      "Federal fixtures require a valid clock.",
    );
  });
});
