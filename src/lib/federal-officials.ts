import { FEDERAL_CENSUS_DATA } from "./federal-policy.generated";
import {
  assessCensusDistrict,
  assessClerkJurisdiction,
  createCongressSnapshot,
  FEDERAL_OFFICIAL_FIELD_POLICY,
  isCensusCongressInEffectiveRange,
  type CongressSnapshot,
} from "./federal-policy";
import type { ResolutionResponse } from "./residence";

export type FederalDivisionInput = Readonly<
  Extract<
    ResolutionResponse,
    { status: "matched" | "partial" }
  >["divisions"][number]
>;

export type FederalJurisdiction = Readonly<{
  stateCode: string;
  district: number;
  divisionIds: readonly string[];
}>;

type NonlaunchJurisdictionCode =
  keyof typeof FEDERAL_CENSUS_DATA.nonlaunchJurisdictionFips;

export type FederalJurisdictionResult =
  | Readonly<{ status: "supported"; jurisdiction: FederalJurisdiction }>
  | Readonly<{
      status: "unsupported";
      code: NonlaunchJurisdictionCode;
    }>
  | Readonly<{ status: "invalid" }>;

export type SourceRef = Readonly<{
  publisher:
    | "Biographical Directory of the United States Congress"
    | "Office of the Clerk, U.S. House of Representatives";
  sourceType: "member" | "vacancy";
  publicUrl: string;
  ingestionUrl: string;
  retrievedAt: string;
  recordUpdatedAt: string | null;
  effectiveAt: string | null;
}>;

export type Freshness = Readonly<{
  checkedAt: string;
  refreshAfter: string;
  staleAfter: string;
  state: "fresh" | "stale" | "expired";
}>;

export type Person = Readonly<{
  id: `bioguide:${string}`;
  bioguideId: string;
  name: string;
}>;

export type Office = Readonly<{
  id: string;
  chamber: "house" | "senate";
  stateCode: string;
  district: number | null;
  title: "U.S. Representative" | "U.S. Senator";
}>;

export type Term = Readonly<{
  officeId: string;
  personId: string | null;
  congress: number;
  startYear: number | null;
  endYear: number | null;
  status: "serving" | "vacant";
}>;

export type FederalSeat =
  | Readonly<{
      status: "serving";
      office: Office;
      person: Person;
      term: Term;
      sources: readonly SourceRef[];
    }>
  | Readonly<{
      status: "vacant";
      office: Office;
      term: Term;
      sources: readonly SourceRef[];
    }>
  | Readonly<{
      status: "unknown";
      office: Office;
      sources: readonly SourceRef[];
    }>
  | Readonly<{
      status: "conflict";
      office: Office;
      person: Person;
      term: Term;
      sources: readonly SourceRef[];
    }>;

export type FederalOfficialsRoster = Readonly<{
  jurisdiction: FederalJurisdiction;
  house: FederalSeat;
  senate: readonly FederalSeat[];
  coverage: {
    house: "verified" | "vacant" | "partial" | "unknown";
    senate: "verified" | "partial" | "unknown";
  };
}>;

export type FederalOfficialsView = FederalOfficialsRoster &
  Readonly<{ freshness: Freshness }>;

export type ProviderFailure =
  | "timeout"
  | "quota"
  | "auth"
  | "not_found"
  | "provider_error"
  | "malformed";

export type CongressRosterOutcome =
  | Readonly<{
      status: "available";
      currentCongress: number;
      house: readonly FederalSeat[];
      senate: readonly FederalSeat[];
    }>
  | Readonly<{ status: "unavailable"; reason: ProviderFailure }>;

export type HouseVacancyOutcome =
  | Readonly<{
      status: "available";
      currentCongress: number;
      source: SourceRef;
      vacancies: readonly {
        stateCode: string;
        district: number;
        source: SourceRef;
      }[];
    }>
  | Readonly<{ status: "unavailable"; reason: ProviderFailure }>;

export type FetchCongressRoster = (
  jurisdiction: FederalJurisdiction,
  options: {
    apiKey: string;
    fetch: typeof globalThis.fetch;
    snapshot: CongressSnapshot;
    signal: AbortSignal;
  },
) => Promise<CongressRosterOutcome>;

export type FetchCurrentHouseVacancies = (
  snapshot: CongressSnapshot,
  options: { fetch: typeof globalThis.fetch; signal: AbortSignal },
) => Promise<HouseVacancyOutcome>;

const codeByFips: ReadonlyMap<string, string> = new Map(
  [
    ...FEDERAL_CENSUS_DATA.votingStates.map(
      ({ code, fips }) => [fips, code] as const,
    ),
    ...Object.entries(FEDERAL_CENSUS_DATA.nonlaunchJurisdictionFips).map(
      ([code, fips]) => [fips, code] as const,
    ),
  ],
);
const supportedCodes: ReadonlySet<string> = new Set(
  FEDERAL_CENSUS_DATA.votingStates.map(({ code }) => code),
);

export function federalJurisdictionFromDivisions(
  divisions: readonly FederalDivisionInput[],
  congress: CongressSnapshot | null = createCongressSnapshot(new Date()),
): FederalJurisdictionResult {
  if (
    congress === null ||
    !isCensusCongressInEffectiveRange(congress.currentCongress)
  ) {
    return { status: "invalid" };
  }
  if (
    divisions.some(
      ({ idScheme }) => idScheme !== "ocd" && idScheme !== "census",
    )
  ) {
    return { status: "invalid" };
  }

  const states = divisions.filter(
    ({ type }) => type === FEDERAL_OFFICIAL_FIELD_POLICY.divisionTypes.state,
  );
  const districts = divisions.filter(
    ({ type }) =>
      type ===
      FEDERAL_OFFICIAL_FIELD_POLICY.divisionTypes.congressionalDistrict,
  );
  if (
    states.length !== 1 ||
    districts.length !== 1 ||
    states[0].idScheme !== districts[0].idScheme ||
    divisions.some(({ idScheme }) => idScheme !== states[0].idScheme)
  ) {
    return { status: "invalid" };
  }

  const stateCode = parseState(states[0]);
  const district = parseDistrict(districts[0]);
  if (
    stateCode === null ||
    district === null ||
    district.stateCode !== stateCode
  ) {
    return { status: "invalid" };
  }

  const clerkJurisdiction = assessClerkJurisdiction(stateCode);
  if (
    clerkJurisdiction.status === "known_nonlaunch" &&
    clerkJurisdiction.allowedDistricts.some(
      (allowedDistrict) => allowedDistrict === district.number,
    )
  ) {
    if (!isNonlaunchJurisdictionCode(stateCode)) {
      return { status: "invalid" };
    }
    return {
      status: "unsupported",
      code: stateCode,
    };
  }
  if (clerkJurisdiction.status !== "voting_state") {
    return { status: "invalid" };
  }
  const censusDistrict = assessCensusDistrict(
    stateCode,
    district.number,
    congress.currentCongress,
  );
  if (censusDistrict.status !== "valid") {
    return { status: "invalid" };
  }

  return {
    status: "supported",
    jurisdiction: {
      stateCode,
      district: district.number,
      divisionIds: [states[0].id, districts[0].id],
    },
  };
}

export function reconcileFederalOfficials(
  jurisdiction: FederalJurisdiction,
  congress: CongressRosterOutcome,
  clerk: HouseVacancyOutcome,
): FederalOfficialsRoster {
  const houseOffice = office("house", jurisdiction, null);
  if (congress.status === "unavailable") {
    const availableClerk = clerk.status === "available" ? clerk : null;
    const vacancyMatches = availableClerk
      ? availableClerk.vacancies.filter(
          ({ stateCode, district }) =>
            stateCode === jurisdiction.stateCode &&
            district === jurisdiction.district,
        )
      : [];
    return {
      jurisdiction,
      house: {
        status: "unknown",
        office: houseOffice,
        sources: availableClerk
          ? deduplicateSources([
              availableClerk.source,
              ...vacancyMatches.map(({ source }) => source),
            ])
          : [],
      },
      senate: [],
      coverage: {
        house: availableClerk ? "partial" : "unknown",
        senate: "unknown",
      },
    };
  }
  const houseMembers =
    congress.house.filter(
      (seat): seat is Extract<FederalSeat, { status: "serving" }> =>
        seat.status === "serving" &&
        seat.office.chamber === "house" &&
        seat.office.stateCode === jurisdiction.stateCode &&
        seat.office.district === jurisdiction.district &&
        seat.term.congress === congress.currentCongress,
    );
  const houseMember = houseMembers.length === 1 ? houseMembers[0] : null;
  const availableClerk = clerk.status === "available" ? clerk : null;
  const qualifyingClerk =
    availableClerk !== null &&
    availableClerk.currentCongress === congress.currentCongress
      ? availableClerk
      : null;
  const vacancyMatches = qualifyingClerk
    ? qualifyingClerk.vacancies.filter(
        ({ stateCode, district }) =>
          stateCode === jurisdiction.stateCode &&
          district === jurisdiction.district,
      )
    : [];
  const vacancy = vacancyMatches.length === 1 ? vacancyMatches[0] : null;

  let house: FederalSeat;
  let houseCoverage: FederalOfficialsRoster["coverage"]["house"];
  if (houseMembers.length > 1 || vacancyMatches.length > 1) {
    house = {
      status: "unknown",
      office: houseOffice,
      sources: deduplicateSources([
        ...houseMembers.flatMap(({ sources }) => sources),
        ...(qualifyingClerk
          ? [
              qualifyingClerk.source,
              ...vacancyMatches.map(({ source }) => source),
            ]
          : []),
      ]),
    };
    houseCoverage = "partial";
  } else if (houseMember && vacancy && qualifyingClerk) {
    house = {
      ...houseMember,
      status: "conflict",
      sources: [
        ...houseMember.sources,
        qualifyingClerk.source,
        vacancy.source,
      ],
    };
    houseCoverage = "partial";
  } else if (houseMember) {
    house = qualifyingClerk
      ? {
          ...houseMember,
          sources: [...houseMember.sources, qualifyingClerk.source],
        }
      : houseMember;
    houseCoverage = qualifyingClerk ? "verified" : "partial";
  } else if (vacancy && qualifyingClerk) {
    const term: Term = {
      officeId: houseOffice.id,
      personId: null,
      congress: qualifyingClerk.currentCongress,
      startYear: null,
      endYear: null,
      status: "vacant",
    };
    house = {
      status: "vacant",
      office: houseOffice,
      term,
      sources: [qualifyingClerk.source, vacancy.source],
    };
    houseCoverage = "vacant";
  } else {
    house = {
      status: "unknown",
      office: houseOffice,
      sources: qualifyingClerk ? [qualifyingClerk.source] : [],
    };
    houseCoverage = "unknown";
  }

  const senateCandidates =
    congress.senate.filter(
      (seat): seat is Extract<FederalSeat, { status: "serving" }> =>
        seat.status === "serving" &&
        seat.office.chamber === "senate" &&
        seat.office.stateCode === jurisdiction.stateCode &&
        seat.office.district === null &&
        seat.term.congress === congress.currentCongress,
    );
  const senatorIds = senateCandidates.map(({ person }) => person.bioguideId);
  const distinctSenators = new Set(senatorIds).size === senatorIds.length;
  const senateCoverage =
    senateCandidates.length === 2 && distinctSenators
      ? "verified"
      : senateCandidates.length === 1
        ? "partial"
        : "unknown";
  const senate =
    senateCandidates.length <= 2 && distinctSenators ? senateCandidates : [];

  return {
    jurisdiction,
    house,
    senate,
    coverage: { house: houseCoverage, senate: senateCoverage },
  };
}

function deduplicateSources(sources: readonly SourceRef[]): readonly SourceRef[] {
  return sources.filter(
    (source, index) =>
      sources.findIndex(
        (candidate) =>
          candidate.publisher === source.publisher &&
          candidate.sourceType === source.sourceType &&
          candidate.ingestionUrl === source.ingestionUrl &&
          candidate.publicUrl === source.publicUrl &&
          candidate.retrievedAt === source.retrievedAt &&
          candidate.recordUpdatedAt === source.recordUpdatedAt &&
          candidate.effectiveAt === source.effectiveAt,
      ) === index,
  );
}

function parseState(
  division: FederalDivisionInput,
): string | null {
  if (division.idScheme === "ocd") {
    const match = /^ocd-division\/country:us\/state:([a-z]{2})$/.exec(
      division.id,
    );
    const code = match?.[1].toUpperCase();
    return code && (supportedCodes.has(code) || isNonlaunchJurisdictionCode(code))
      ? code
      : null;
  }

  if (!/^\d{2}$/.test(division.id)) {
    return null;
  }
  return codeByFips.get(division.id) ?? null;
}

function parseDistrict(
  division: FederalDivisionInput,
): { stateCode: string; number: number } | null {
  if (division.idScheme === "ocd") {
    const match =
      /^ocd-division\/country:us\/state:([a-z]{2})\/cd:(0|[1-9][0-9]?)$/.exec(
        division.id,
      );
    if (!match) {
      return null;
    }
    const stateCode = match[1].toUpperCase();
    if (
      !stateCode ||
      !(supportedCodes.has(stateCode) || isNonlaunchJurisdictionCode(stateCode))
    ) {
      return null;
    }
    return { stateCode, number: Number(match[2]) };
  }

  const match = /^(\d{2})(\d{2})$/.exec(division.id);
  const stateCode = match ? codeByFips.get(match[1]) : undefined;
  return match && stateCode
    ? { stateCode, number: Number(match[2]) }
    : null;
}

function isNonlaunchJurisdictionCode(
  code: string,
): code is NonlaunchJurisdictionCode {
  return Object.hasOwn(FEDERAL_CENSUS_DATA.nonlaunchJurisdictionFips, code);
}

function office(
  chamber: "house" | "senate",
  jurisdiction: FederalJurisdiction,
  bioguideId: string | null,
): Office {
  const seat =
    chamber === "house"
      ? String(jurisdiction.district)
      : (bioguideId ?? "unknown");
  return {
    id: `federal:${chamber}:${jurisdiction.stateCode}:${seat}`,
    chamber,
    stateCode: jurisdiction.stateCode,
    district: chamber === "house" ? jurisdiction.district : null,
    title: chamber === "house" ? "U.S. Representative" : "U.S. Senator",
  };
}
