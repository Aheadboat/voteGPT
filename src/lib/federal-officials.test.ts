import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  federalJurisdictionFromDivisions,
  reconcileFederalOfficials,
  type CongressRosterOutcome,
  type FederalDivisionInput,
  type FederalJurisdiction,
  type FederalSeat,
  type FetchCongressRoster,
  type FetchCurrentHouseVacancies,
  type HouseVacancyOutcome,
  type SourceRef,
} from "./federal-officials";
import { createCongressSnapshot } from "./federal-policy";
import { FEDERAL_CENSUS_DATA } from "./federal-policy.generated";

// RED contract: this suite must first fail because the F5 domain module is absent.
// UX-01/02/03/04/06/07/09: deterministic jurisdiction, equal seats, provenance,
// explicit unsupported/unknown states, and no precise residence/provider leakage.

const supported = [
  ["AL", "01"], ["AK", "02"], ["AZ", "04"], ["AR", "05"],
  ["CA", "06"], ["CO", "08"], ["CT", "09"], ["DE", "10"],
  ["FL", "12"], ["GA", "13"], ["HI", "15"], ["ID", "16"],
  ["IL", "17"], ["IN", "18"], ["IA", "19"], ["KS", "20"],
  ["KY", "21"], ["LA", "22"], ["ME", "23"], ["MD", "24"],
  ["MA", "25"], ["MI", "26"], ["MN", "27"], ["MS", "28"],
  ["MO", "29"], ["MT", "30"], ["NE", "31"], ["NV", "32"],
  ["NH", "33"], ["NJ", "34"], ["NM", "35"], ["NY", "36"],
  ["NC", "37"], ["ND", "38"], ["OH", "39"], ["OK", "40"],
  ["OR", "41"], ["PA", "42"], ["RI", "44"], ["SC", "45"],
  ["SD", "46"], ["TN", "47"], ["TX", "48"], ["UT", "49"],
  ["VT", "50"], ["VA", "51"], ["WA", "53"], ["WV", "54"],
  ["WI", "55"], ["WY", "56"],
] as const;

const unsupported = Object.entries(
  FEDERAL_CENSUS_DATA.nonlaunchJurisdictionFips,
);

const supportedCongressSnapshot = createCongressSnapshot(
  new Date("2027-01-03T16:59:59.999Z"),
);
const expiredCongressSnapshot = createCongressSnapshot(
  new Date("2027-01-03T17:00:00.000Z"),
);
const federalJurisdictionAtSupportedCongress = (
  divisions: readonly FederalDivisionInput[],
) => federalJurisdictionFromDivisions(divisions, supportedCongressSnapshot);

const jurisdiction: FederalJurisdiction = {
  stateCode: "CA",
  district: 12,
  divisionIds: [
    "ocd-division/country:us/state:ca",
    "ocd-division/country:us/state:ca/cd:12",
  ],
};

const memberSource: SourceRef = {
  publisher: "Biographical Directory of the United States Congress",
  sourceType: "member",
  publicUrl: "https://bioguide.congress.gov/search/bio/H000001",
  ingestionUrl: "https://api.congress.gov/v3/member/H000001?format=json",
  retrievedAt: "2026-07-16T12:00:00.000Z",
  recordUpdatedAt: "2026-07-15T09:30:00.000Z",
  effectiveAt: null,
};

const clerkListSource: SourceRef = {
  publisher: "Office of the Clerk, U.S. House of Representatives",
  sourceType: "vacancy",
  publicUrl: "https://clerk.house.gov/Members/ViewVacancies",
  ingestionUrl: "https://clerk.house.gov/Members/ViewVacancies",
  retrievedAt: "2026-07-16T12:00:00.000Z",
  recordUpdatedAt: null,
  effectiveAt: null,
};

const clerkSeatSource: SourceRef = {
  ...clerkListSource,
  publicUrl: "https://clerk.house.gov/members/CA12/vacancy",
  ingestionUrl: "https://clerk.house.gov/members/CA12/vacancy",
};

describe("strict federal jurisdiction", () => {
  it("accepts every 50-state OCD and Census mapping without reading names", () => {
    expectTypeOf(federalJurisdictionFromDivisions).toBeFunction();
    const atLargeCodes = new Set(["AK", "DE", "ND", "SD", "VT", "WY"]);

    for (const [stateCode, fips] of supported) {
      const lower = stateCode.toLowerCase();
      const district = atLargeCodes.has(stateCode) ? 0 : 1;
      const ocdIds = [
        `ocd-division/country:us/state:${lower}`,
        `ocd-division/country:us/state:${lower}/cd:${district}`,
      ];
      const censusIds = [fips, `${fips}${String(district).padStart(2, "0")}`];

      expect(
        federalJurisdictionAtSupportedCongress([
          division("state", ocdIds[0], "ocd", "Wrong name"),
          division("congressional_district", ocdIds[1], "ocd", "Also wrong"),
        ]),
        stateCode,
      ).toEqual({
        status: "supported",
        jurisdiction: { stateCode, district, divisionIds: ocdIds },
      });
      expect(
        federalJurisdictionAtSupportedCongress([
          division("state", censusIds[0], "census", "Wrong name"),
          division("congressional_district", censusIds[1], "census", "Also wrong"),
        ]),
        stateCode,
      ).toEqual({
        status: "supported",
        jurisdiction: { stateCode, district, divisionIds: censusIds },
      });
    }
  });

  it("classifies every mapped DC/territory entry as unsupported in both schemes", () => {
    for (const [code, fips] of unsupported) {
      const lower = code.toLowerCase();
      expect(
        federalJurisdictionAtSupportedCongress([
          division("state", `ocd-division/country:us/state:${lower}`, "ocd"),
          division(
            "congressional_district",
            `ocd-division/country:us/state:${lower}/cd:0`,
            "ocd",
          ),
        ]),
      ).toEqual({ status: "unsupported", code });
      expect(
        federalJurisdictionAtSupportedCongress([
          division("state", fips, "census"),
          division("congressional_district", `${fips}00`, "census"),
        ]),
      ).toEqual({ status: "unsupported", code });
    }
  });

  it("fails closed after the Census Congress range expires", () => {
    const california = [
      division("state", "ocd-division/country:us/state:ca", "ocd"),
      division(
        "congressional_district",
        "ocd-division/country:us/state:ca/cd:12",
        "ocd",
      ),
    ];
    const districtOfColumbia = [
      division("state", "ocd-division/country:us/state:dc", "ocd"),
      division(
        "congressional_district",
        "ocd-division/country:us/state:dc/cd:0",
        "ocd",
      ),
    ];

    expect(
      federalJurisdictionFromDivisions(california, supportedCongressSnapshot),
    ).toMatchObject({ status: "supported" });
    expect(
      federalJurisdictionFromDivisions(california, expiredCongressSnapshot),
    ).toEqual({ status: "invalid" });
    expect(federalJurisdictionFromDivisions(california, null)).toEqual({
      status: "invalid",
    });
    expect(
      federalJurisdictionFromDivisions(
        districtOfColumbia,
        supportedCongressSnapshot,
      ),
    ).toEqual({ status: "unsupported", code: "DC" });
    expect(
      federalJurisdictionFromDivisions(
        districtOfColumbia,
        expiredCongressSnapshot,
      ),
    ).toEqual({ status: "invalid" });
    expect(federalJurisdictionFromDivisions(districtOfColumbia, null)).toEqual({
      status: "invalid",
    });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2027-01-03T16:59:59.999Z"));
      expect(federalJurisdictionFromDivisions(california)).toMatchObject({
        status: "supported",
      });

      vi.setSystemTime(new Date("2027-01-03T17:00:00.000Z"));
      expect(federalJurisdictionFromDivisions(california)).toEqual({
        status: "invalid",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid districts for a known nonlaunch jurisdiction", () => {
    const [code, fips] = unsupported[0];
    const lower = code.toLowerCase();

    expect(
      federalJurisdictionAtSupportedCongress([
        division("state", `ocd-division/country:us/state:${lower}`, "ocd"),
        division(
          "congressional_district",
          `ocd-division/country:us/state:${lower}/cd:99`,
          "ocd",
        ),
      ]),
    ).toEqual({ status: "invalid" });
    expect(
      federalJurisdictionAtSupportedCongress([
        division("state", fips, "census"),
        division("congressional_district", `${fips}99`, "census"),
      ]),
    ).toEqual({ status: "invalid" });
  });

  it("preserves at-large district zero and only the qualifying division IDs", () => {
    expect(
      federalJurisdictionAtSupportedCongress([
        division("country", "ocd-division/country:us", "ocd"),
        division("state", "ocd-division/country:us/state:ak", "ocd"),
        division("county", "ocd-division/country:us/state:ak/county:fake", "ocd"),
        division(
          "congressional_district",
          "ocd-division/country:us/state:ak/cd:0",
          "ocd",
        ),
      ]),
    ).toEqual({
      status: "supported",
      jurisdiction: {
        stateCode: "AK",
        district: 0,
        divisionIds: [
          "ocd-division/country:us/state:ak",
          "ocd-division/country:us/state:ak/cd:0",
        ],
      },
    });
  });

  it("fails closed on unknown OCD and Census codes", () => {
    expect(
      federalJurisdictionAtSupportedCongress([
        division("state", "ocd-division/country:us/state:zz", "ocd"),
        division(
          "congressional_district",
          "ocd-division/country:us/state:zz/cd:1",
          "ocd",
        ),
      ]),
    ).toEqual({ status: "invalid" });
    expect(
      federalJurisdictionAtSupportedCongress([
        division("state", "99", "census"),
        division("congressional_district", "9901", "census"),
      ]),
    ).toEqual({ status: "invalid" });
  });

  it("rejects anonymous two-digit district bounds until Census policy admits them", () => {
    expect(
      federalJurisdictionAtSupportedCongress([
        division("state", "06", "census"),
        division("congressional_district", "0600", "census"),
      ]),
    ).toEqual({ status: "invalid" });
    expect(
      federalJurisdictionAtSupportedCongress([
        division("state", "02", "census"),
        division("congressional_district", "0201", "census"),
      ]),
    ).toEqual({ status: "invalid" });
    expect(
      federalJurisdictionAtSupportedCongress([
        division("state", "06", "census"),
        division("congressional_district", "0699", "census"),
      ]),
    ).toEqual({ status: "invalid" });
  });

  it.each([
    ["missing district", [division("state", "06", "census")]],
    [
      "duplicate state",
      [
        division("state", "06", "census"),
        division("state", "06", "census"),
        division("congressional_district", "0612", "census"),
      ],
    ],
    [
      "duplicate district",
      [
        division("state", "06", "census"),
        division("congressional_district", "0612", "census"),
        division("congressional_district", "0612", "census"),
      ],
    ],
    [
      "mixed schemes",
      [
        division("state", "06", "census"),
        division(
          "congressional_district",
          "ocd-division/country:us/state:ca/cd:12",
          "ocd",
        ),
      ],
    ],
    [
      "mixed scheme on an additional division",
      [
        division("country", "06", "census"),
        division("state", "ocd-division/country:us/state:ca", "ocd"),
        division(
          "congressional_district",
          "ocd-division/country:us/state:ca/cd:12",
          "ocd",
        ),
      ],
    ],
    [
      "conflicting Census state",
      [
        division("state", "06", "census"),
        division("congressional_district", "1212", "census"),
      ],
    ],
    [
      "conflicting OCD state",
      [
        division("state", "ocd-division/country:us/state:ca", "ocd"),
        division(
          "congressional_district",
          "ocd-division/country:us/state:or/cd:1",
          "ocd",
        ),
      ],
    ],
    [
      "noncanonical OCD case",
      [
        division("state", "ocd-division/country:us/state:CA", "ocd"),
        division(
          "congressional_district",
          "ocd-division/country:us/state:CA/cd:12",
          "ocd",
        ),
      ],
    ],
    [
      "noncanonical OCD district",
      [
        division("state", "ocd-division/country:us/state:ca", "ocd"),
        division(
          "congressional_district",
          "ocd-division/country:us/state:ca/cd:01",
          "ocd",
        ),
      ],
    ],
    [
      "noncanonical Census state",
      [
        division("state", "6", "census"),
        division("congressional_district", "0612", "census"),
      ],
    ],
    [
      "noncanonical Census district",
      [
        division("state", "06", "census"),
        division("congressional_district", "612", "census"),
      ],
    ],
    [
      "unknown scheme",
      [
        division("state", "06", "invented"),
        division("congressional_district", "0612", "invented"),
      ],
    ],
  ] satisfies ReadonlyArray<readonly [string, readonly FederalDivisionInput[]]>) (
    "returns invalid for %s",
    (_label, divisions) => {
      expect(federalJurisdictionAtSupportedCongress(divisions)).toEqual({
        status: "invalid",
      });
    },
  );
});

describe("federal roster reconciliation", () => {
  it("qualifies one House member and two senators with equal normalized seats", () => {
    expectTypeOf<FetchCongressRoster>().toBeFunction();
    expectTypeOf<FetchCurrentHouseVacancies>().toBeFunction();
    const house = servingSeat("house", "H000001", 12);
    const senate = [
      servingSeat("senate", "S000001", null),
      servingSeat("senate", "S000002", null),
    ];

    const roster = reconcileFederalOfficials(
      jurisdiction,
      availableCongress([house], senate),
      availableClerk([]),
    );

    expect(roster.coverage).toEqual({ house: "verified", senate: "verified" });
    expect(roster.house).toEqual({
      ...house,
      sources: [...house.sources, clerkListSource],
    });
    expect(roster.senate).toEqual(senate);
  });

  it("uses a canonical Clerk entry as qualified vacant evidence", () => {
    const roster = reconcileFederalOfficials(
      jurisdiction,
      availableCongress([], []),
      availableClerk([
        { stateCode: "CA", district: 12, source: clerkSeatSource },
      ]),
    );

    expect(roster.coverage.house).toBe("vacant");
    expect(roster.house).toMatchObject({
      status: "vacant",
      office: { chamber: "house", stateCode: "CA", district: 12 },
      term: { congress: 119, personId: null, status: "vacant" },
      sources: [clerkListSource, clerkSeatSource],
    });
  });

  it("shows conflict when Congress and Clerk both claim the House seat", () => {
    const house = servingSeat("house", "H000001", 12);
    const roster = reconcileFederalOfficials(
      jurisdiction,
      availableCongress([house], []),
      availableClerk([
        { stateCode: "CA", district: 12, source: clerkSeatSource },
      ]),
    );

    expect(roster.coverage.house).toBe("partial");
    expect(roster.house).toEqual({
      ...house,
      status: "conflict",
      sources: [...house.sources, clerkListSource, clerkSeatSource],
    });
  });

  it("keeps missing House evidence unknown and qualifies Clerk outages as partial", () => {
    const noEvidence = reconcileFederalOfficials(
      jurisdiction,
      availableCongress([], []),
      availableClerk([]),
    );
    expect(noEvidence.coverage.house).toBe("unknown");
    expect(noEvidence.house).toMatchObject({
      status: "unknown",
      sources: [clerkListSource],
    });

    const house = servingSeat("house", "H000001", 12);
    const clerkDown = reconcileFederalOfficials(
      jurisdiction,
      availableCongress([house], []),
      { status: "unavailable", reason: "malformed" },
    );
    expect(clerkDown.coverage.house).toBe("partial");
    expect(clerkDown.house).toEqual(house);
  });

  it("does not invent a House vacancy when Congress is unavailable", () => {
    const roster = reconcileFederalOfficials(
      jurisdiction,
      { status: "unavailable", reason: "timeout" },
      availableClerk([
        { stateCode: "CA", district: 12, source: clerkSeatSource },
      ]),
    );

    expect(roster.house).toEqual({
      status: "unknown",
      office: expect.objectContaining({
        chamber: "house",
        stateCode: "CA",
        district: 12,
      }),
      sources: [clerkListSource, clerkSeatSource],
    });
    expect(roster.coverage).toEqual({ house: "partial", senate: "unknown" });
    expect(roster.senate).toEqual([]);
  });

  it("retains all matching Clerk provenance when Congress is unavailable", () => {
    const secondVacancySource: SourceRef = {
      ...clerkSeatSource,
      publicUrl: "https://clerk.house.gov/members/CA12/vacancy-second-record",
      ingestionUrl: "https://clerk.house.gov/members/CA12/vacancy-second-record",
    };
    const roster = reconcileFederalOfficials(
      jurisdiction,
      { status: "unavailable", reason: "timeout" },
      availableClerk([
        { stateCode: "CA", district: 12, source: clerkSeatSource },
        { stateCode: "CA", district: 12, source: secondVacancySource },
      ]),
    );

    expect(roster.house.status).toBe("unknown");
    expect(roster.house.sources).toEqual([
      clerkListSource,
      clerkSeatSource,
      secondVacancySource,
    ]);
    expect(roster.coverage).toEqual({ house: "partial", senate: "unknown" });
  });

  it("retains deduplicated provenance from ambiguous House candidates and Clerk matches", () => {
    const secondMemberSource: SourceRef = {
      ...memberSource,
      publicUrl: "https://bioguide.congress.gov/search/bio/H000002",
      ingestionUrl: "https://api.congress.gov/v3/member/H000002?format=json",
    };
    const secondVacancySource: SourceRef = {
      ...clerkSeatSource,
      publicUrl: "https://clerk.house.gov/members/CA12/vacancy-second-record",
      ingestionUrl: "https://clerk.house.gov/members/CA12/vacancy-second-record",
    };
    const firstCandidate = servingSeat("house", "H000001", 12);
    const secondCandidate: Extract<FederalSeat, { status: "serving" }> = {
      ...servingSeat("house", "H000002", 12),
      sources: [{ ...memberSource }, secondMemberSource],
    };
    const roster = reconcileFederalOfficials(
      jurisdiction,
      availableCongress([firstCandidate, secondCandidate], []),
      availableClerk([
        { stateCode: "CA", district: 12, source: clerkSeatSource },
        { stateCode: "CA", district: 12, source: secondVacancySource },
      ]),
    );

    expect(roster.house.status).toBe("unknown");
    expect(roster.house.sources).toEqual([
      memberSource,
      secondMemberSource,
      clerkListSource,
      clerkSeatSource,
      secondVacancySource,
    ]);
    expect(roster.coverage).toEqual({ house: "partial", senate: "unknown" });
  });

  it("matches only the exact selected district, including at-large district zero", () => {
    const irrelevant = reconcileFederalOfficials(
      jurisdiction,
      availableCongress([], []),
      availableClerk([
        {
          stateCode: "CA",
          district: 11,
          source: {
            ...clerkSeatSource,
            publicUrl: "https://clerk.house.gov/members/CA11/vacancy",
            ingestionUrl: "https://clerk.house.gov/members/CA11/vacancy",
          },
        },
        {
          stateCode: "OR",
          district: 12,
          source: {
            ...clerkSeatSource,
            publicUrl: "https://clerk.house.gov/members/OR12/vacancy",
            ingestionUrl: "https://clerk.house.gov/members/OR12/vacancy",
          },
        },
      ]),
    );
    expect(irrelevant.house).toMatchObject({
      status: "unknown",
      sources: [clerkListSource],
    });

    const atLargeJurisdiction: FederalJurisdiction = {
      stateCode: "AK",
      district: 0,
      divisionIds: ["02", "0200"],
    };
    const atLargeSource: SourceRef = {
      ...clerkSeatSource,
      publicUrl: "https://clerk.house.gov/members/AK00/vacancy",
      ingestionUrl: "https://clerk.house.gov/members/AK00/vacancy",
    };
    const atLarge = reconcileFederalOfficials(
      atLargeJurisdiction,
      { status: "available", currentCongress: 119, house: [], senate: [] },
      availableClerk([
        { stateCode: "AK", district: 0, source: atLargeSource },
      ]),
    );
    expect(atLarge.house).toMatchObject({
      status: "vacant",
      office: { stateCode: "AK", district: 0 },
      sources: [clerkListSource, atLargeSource],
    });
  });

  it("marks one senator partial and zero, excess, or duplicate senators unknown", () => {
    const first = servingSeat("senate", "S000001", null);
    const second = servingSeat("senate", "S000002", null);
    const third = servingSeat("senate", "S000003", null);

    const oneSenator = reconcileFederalOfficials(
      jurisdiction,
      availableCongress([], [first]),
      availableClerk([]),
    );
    expect(oneSenator.coverage.senate).toBe("partial");
    expect(oneSenator.senate).toEqual([first]);
    for (const senate of [[], [first, second, third], [first, first]]) {
      const roster = reconcileFederalOfficials(
        jurisdiction,
        availableCongress([], senate),
        availableClerk([]),
      );
      expect(roster.coverage.senate).toBe("unknown");
      expect(roster.senate).toEqual([]);
      expect(roster.senate.some((seat) => seat.status === "vacant")).toBe(false);
    }
  });

  it("never invents officials when Congress is unavailable", () => {
    const roster = reconcileFederalOfficials(
      jurisdiction,
      { status: "unavailable", reason: "timeout" },
      { status: "unavailable", reason: "timeout" },
    );

    expect(roster.house).toMatchObject({ status: "unknown", sources: [] });
    expect(roster.senate).toEqual([]);
    expect(roster.coverage).toEqual({ house: "unknown", senate: "unknown" });
  });
});

function division(
  type: FederalDivisionInput["type"],
  id: string,
  idScheme: string,
  name = "Ignored provider name",
): FederalDivisionInput {
  return { type, id, idScheme, name };
}

function servingSeat(
  chamber: "house" | "senate",
  bioguideId: string,
  district: number | null,
): Extract<FederalSeat, { status: "serving" }> {
  const officeId = `${chamber}:${jurisdiction.stateCode}:${district ?? bioguideId}`;
  const personId = `bioguide:${bioguideId}` as const;
  return {
    status: "serving",
    office: {
      id: officeId,
      chamber,
      stateCode: jurisdiction.stateCode,
      district,
      title: chamber === "house" ? "U.S. Representative" : "U.S. Senator",
    },
    person: { id: personId, bioguideId, name: `Official ${bioguideId}` },
    term: {
      officeId,
      personId,
      congress: 119,
      startYear: 2025,
      endYear: null,
      status: "serving",
    },
    sources: [memberSource],
  };
}

function availableCongress(
  house: readonly FederalSeat[],
  senate: readonly FederalSeat[],
): CongressRosterOutcome {
  return { status: "available", currentCongress: 119, house, senate };
}

function availableClerk(
  vacancies: Extract<
    HouseVacancyOutcome,
    { status: "available" }
  >["vacancies"],
): HouseVacancyOutcome {
  return {
    status: "available",
    currentCongress: 119,
    source: clerkListSource,
    vacancies,
  };
}
