import {
  CONGRESS_CALENDAR_POLICY,
  FEDERAL_CACHE_POLICY,
  FEDERAL_MILLISECONDS_PER_HOUR,
  createCongressSnapshot,
  isCensusCongressInEffectiveRange,
  type CongressSnapshot,
} from "../src/lib/federal-policy.ts";

export {
  FEDERAL_CACHE_POLICY,
  bioguidePublicUrl,
  canonicalCongressIngestionUrl,
  clerkNationalVacancyUrl,
  clerkVacancyPublicUrl,
  congressMemberDetailUrl,
} from "../src/lib/federal-policy.ts";

export type FederalFixtureClock = Readonly<{
  snapshot: CongressSnapshot;
  servingTerm: Readonly<{ start: string; end: string }>;
  freshRetrievedAt: string;
  staleRetrievedAt: string;
  expiredRetrievedAt: string;
}>;

export function createFederalFixtureClock(now: Date): FederalFixtureClock {
  const snapshot = createCongressSnapshot(now);
  if (snapshot === null) {
    throw new Error("Federal fixtures require a valid clock.");
  }
  if (!isCensusCongressInEffectiveRange(snapshot.currentCongress)) {
    throw new Error(
      `Federal fixture policy expired: checked-in Census coverage does not include Congress ${snapshot.currentCongress}.`,
    );
  }
  const termStart = Date.UTC(
    snapshot.startYear,
    CONGRESS_CALENDAR_POLICY.turnoverUtc.monthIndex,
    CONGRESS_CALENDAR_POLICY.turnoverUtc.dayOfMonth,
    CONGRESS_CALENDAR_POLICY.turnoverUtc.hour,
  );
  const oneHour = FEDERAL_MILLISECONDS_PER_HOUR;

  return {
    snapshot,
    servingTerm: {
      start: new Date(termStart).toISOString(),
      end: new Date(
        Date.UTC(
          snapshot.startYear + CONGRESS_CALENDAR_POLICY.termLengthYears,
          CONGRESS_CALENDAR_POLICY.turnoverUtc.monthIndex,
          CONGRESS_CALENDAR_POLICY.turnoverUtc.dayOfMonth,
          CONGRESS_CALENDAR_POLICY.turnoverUtc.hour,
        ),
      ).toISOString(),
    },
    freshRetrievedAt: new Date(now.getTime() - oneHour).toISOString(),
    staleRetrievedAt: new Date(
      now.getTime() - FEDERAL_CACHE_POLICY.refreshAgeMs - oneHour,
    ).toISOString(),
    expiredRetrievedAt: new Date(
      now.getTime() - FEDERAL_CACHE_POLICY.staleAgeMs - oneHour,
    ).toISOString(),
  };
}
