import { describe, expect, it } from "vitest";
import {
  reconcileStateOfficials,
  stateJurisdictionFromDivisions,
  type StateJurisdiction,
  type StateOfficialsView,
} from "./state-officials";

const freshness = {
  checkedAt: "2026-07-31T12:00:00.000Z",
  refreshAfter: "2026-08-01T12:00:00.000Z",
  staleAfter: "2026-08-03T12:00:00.000Z",
  state: "fresh" as const,
};

const officialSource = {
  sourceType: "official" as const,
  publicUrl: "https://nebraskalegislature.gov/senators/alex-rivera",
  retrievedAt: "2026-07-31T12:00:00.000Z",
  effectiveAt: "2026-01-01T00:00:00.000Z",
};

const vacancySource = {
  sourceType: "vacancy" as const,
  publicUrl: "https://nebraskalegislature.gov/vacancies/upper-2",
  retrievedAt: "2026-07-31T12:00:00.000Z",
  effectiveAt: null,
};

describe("stateJurisdictionFromDivisions", () => {
  it("derives a canonical bicameral jurisdiction from saved public divisions", () => {
    expect(
      stateJurisdictionFromDivisions([
        {
          type: "country",
          name: "United States",
          id: "ocd-division/country:us",
          idScheme: "ocd",
        },
        {
          type: "state_lower",
          name: "Example House District 10",
          id: "ocd-division/country:us/state:ex/sldl:10",
          idScheme: "ocd",
        },
        {
          type: "state",
          name: "Example",
          id: "ocd-division/country:us/state:ex",
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "Example Senate District 2",
          id: "ocd-division/country:us/state:ex/sldu:2",
          idScheme: "ocd",
        },
      ]),
    ).toEqual({
      status: "available",
      jurisdiction: {
        stateCode: "EX",
        stateDivisionId: "ocd-division/country:us/state:ex",
        jurisdictionId: "ocd-jurisdiction/country:us/state:ex/government",
        legislature: "bicameral",
        districts: [
          {
            chamber: "upper",
            district: "2",
            providerTargets: [{
              label: "2",
              divisionId: "ocd-division/country:us/state:ex/sldu:2",
            }],
            divisionId: "ocd-division/country:us/state:ex/sldu:2",
          },
          {
            chamber: "lower",
            district: "10",
            providerTargets: [{
              label: "10",
              divisionId: "ocd-division/country:us/state:ex/sldl:10",
            }],
            divisionId: "ocd-division/country:us/state:ex/sldl:10",
          },
        ],
      },
    });
  });

  it.each([
    ["AK", "a", "A", "1", "1"],
    ["MA", "worcester_and_middlesex", "Worcester and Middlesex", "3rd_suffolk", "3rd Suffolk"],
    ["MD", "1", "1", "11a", "11A"],
    ["MN", "1", "1", "62a", "62A"],
    ["ND", "4", "4", "4a", "4A"],
    ["ND", "4", "4", "4b", "4B"],
    ["NH", "1", "1", "belknap_1", "Belknap 1"],
    ["SD", "26", "26", "26a", "26A"],
    ["VT", "addison", "Addison", "addison-rutland", "Addison-Rutland"],
  ] as const)(
    "keeps %s OCD district tokens canonical while deriving provider labels",
    (stateCode, upperDistrict, upperProviderDistrict, lowerDistrict, lowerProviderDistrict) => {
      const state = stateCode.toLowerCase();

      expect(
        stateJurisdictionFromDivisions([
          {
            type: "state",
            name: stateCode,
            id: `ocd-division/country:us/state:${state}`,
            idScheme: "ocd",
          },
          {
            type: "state_upper",
            name: upperProviderDistrict,
            id: `ocd-division/country:us/state:${state}/sldu:${upperDistrict}`,
            idScheme: "ocd",
          },
          {
            type: "state_lower",
            name: lowerProviderDistrict,
            id: `ocd-division/country:us/state:${state}/sldl:${lowerDistrict}`,
            idScheme: "ocd",
          },
        ]),
      ).toMatchObject({
        status: "available",
        jurisdiction: {
          districts: [
            {
              chamber: "upper",
              district: upperDistrict,
              providerTargets: [{
                label: upperProviderDistrict,
                divisionId: `ocd-division/country:us/state:${state}/sldu:${upperDistrict}`,
              }],
              divisionId: `ocd-division/country:us/state:${state}/sldu:${upperDistrict}`,
            },
            {
              chamber: "lower",
              district: lowerDistrict,
              providerTargets: [{
                label: lowerProviderDistrict,
                divisionId: `ocd-division/country:us/state:${state}/sldl:${lowerDistrict}`,
              }],
              divisionId: `ocd-division/country:us/state:${state}/sldl:${lowerDistrict}`,
            },
          ],
        },
      });
    },
  );

  it.each([
    ["hampden_hampshire_and_worcester", "Hampden, Hampshire and Worcester"],
    ["hampshire_franklin_and_worcester", "Hampshire, Franklin and Worcester"],
    ["berkshire_hampden_franklin_and_hampshire", "Berkshire, Hampden, Franklin and Hampshire"],
    ["norfolk_plymouth_and_bristol", "Norfolk, Plymouth and Bristol"],
    ["norfolk_worcester_and_middlesex", "Norfolk, Worcester and Middlesex"],
  ] as const)("punctuates current Massachusetts upper district %s", (district, label) => {
    expect(stateJurisdictionFromDivisions([
      { type: "state", name: "Massachusetts", id: "ocd-division/country:us/state:ma", idScheme: "ocd" },
      { type: "state_upper", name: label, id: `ocd-division/country:us/state:ma/sldu:${district}`, idScheme: "ocd" },
      { type: "state_lower", name: "3rd Suffolk", id: "ocd-division/country:us/state:ma/sldl:3rd_suffolk", idScheme: "ocd" },
    ])).toMatchObject({
      status: "available",
      jurisdiction: { districts: [{ providerTargets: [{ label }] }, {}] },
    });
  });

  it("maps literal Massachusetts upper ordinals and Idaho lower subdistricts", () => {
    expect(
      stateJurisdictionFromDivisions([
        {
          type: "state",
          name: "Massachusetts",
          id: "ocd-division/country:us/state:ma",
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "First Bristol and Plymouth",
          id: "ocd-division/country:us/state:ma/sldu:1st_bristol_and_plymouth",
          idScheme: "ocd",
        },
        {
          type: "state_lower",
          name: "3rd Suffolk",
          id: "ocd-division/country:us/state:ma/sldl:3rd_suffolk",
          idScheme: "ocd",
        },
      ]),
    ).toMatchObject({
      status: "available",
      jurisdiction: {
        districts: [
          {
            chamber: "upper",
            district: "1st_bristol_and_plymouth",
            providerTargets: [{
              label: "First Bristol and Plymouth",
              divisionId: "ocd-division/country:us/state:ma/sldu:1st_bristol_and_plymouth",
            }],
          },
          {
            chamber: "lower",
            district: "3rd_suffolk",
            providerTargets: [{
              label: "3rd Suffolk",
              divisionId: "ocd-division/country:us/state:ma/sldl:3rd_suffolk",
            }],
          },
        ],
      },
    });

    expect(
      stateJurisdictionFromDivisions([
        {
          type: "state",
          name: "Idaho",
          id: "ocd-division/country:us/state:id",
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "1",
          id: "ocd-division/country:us/state:id/sldu:1",
          idScheme: "ocd",
        },
        {
          type: "state_lower",
          name: "1",
          id: "ocd-division/country:us/state:id/sldl:1",
          idScheme: "ocd",
        },
      ]),
    ).toMatchObject({
      status: "available",
      jurisdiction: {
        districts: [
          {
            chamber: "upper",
            district: "1",
            providerTargets: [{
              label: "1",
              divisionId: "ocd-division/country:us/state:id/sldu:1",
            }],
          },
          {
            chamber: "lower",
            district: "1",
            providerTargets: [
              { label: "1A", divisionId: "ocd-division/country:us/state:id/sldl:1a" },
              { label: "1B", divisionId: "ocd-division/country:us/state:id/sldl:1b" },
            ],
          },
        ],
      },
    });
  });

  it.each([
    ["2nd_essex", "Second Essex"],
    ["3rd_essex", "Third Essex"],
    ["4th_essex", "Fourth Essex"],
    ["5th_essex", "Fifth Essex"],
  ] as const)("maps the Massachusetts upper ordinal in %s", (district, label) => {
    expect(stateJurisdictionFromDivisions([
      { type: "state", name: "Massachusetts", id: "ocd-division/country:us/state:ma", idScheme: "ocd" },
      { type: "state_upper", name: label, id: `ocd-division/country:us/state:ma/sldu:${district}`, idScheme: "ocd" },
      { type: "state_lower", name: "3rd Suffolk", id: "ocd-division/country:us/state:ma/sldl:3rd_suffolk", idScheme: "ocd" },
    ])).toMatchObject({
      status: "available",
      jurisdiction: { districts: [{ providerTargets: [{ label }] }, {}] },
    });
  });

  it.each(["1c", "27c", "29c", "33c", "38c", "42c"])(
    "accepts supported Maryland lower C subdistrict %s",
    (district) => {
      expect(stateJurisdictionFromDivisions(marylandDivisions(district))).toMatchObject({
        status: "available",
        jurisdiction: {
          districts: [{}, {
            chamber: "lower",
            district,
            providerTargets: [{
              label: district.toUpperCase(),
              divisionId: `ocd-division/country:us/state:md/sldl:${district}`,
            }],
          }],
        },
      });
    },
  );

  it.each(["2c", "1d"])("rejects unsupported Maryland lower subdistrict %s", (district) => {
    expect(stateJurisdictionFromDivisions(marylandDivisions(district))).toEqual({ status: "invalid" });
  });

  it("keeps Maryland upper and lower canonical identities separate", () => {
    expect(stateJurisdictionFromDivisions(marylandDivisions("1c"))).toMatchObject({
      status: "available",
      jurisdiction: {
        districts: [
          {
            chamber: "upper",
            district: "1",
            providerTargets: [{
              label: "1",
              divisionId: "ocd-division/country:us/state:md/sldu:1",
            }],
          },
          {
            chamber: "lower",
            district: "1c",
            providerTargets: [{
              label: "1C",
              divisionId: "ocd-division/country:us/state:md/sldl:1c",
            }],
          },
        ],
      },
    });
  });

  it("derives exact Massachusetts punctuation and Vermont provider division drift", () => {
    expect(stateJurisdictionFromDivisions([
      { type: "state", name: "Massachusetts", id: "ocd-division/country:us/state:ma", idScheme: "ocd" },
      { type: "state_upper", name: "Hampden, Hampshire and Worcester", id: "ocd-division/country:us/state:ma/sldu:hampden_hampshire_and_worcester", idScheme: "ocd" },
      { type: "state_lower", name: "Barnstable, Dukes and Nantucket", id: "ocd-division/country:us/state:ma/sldl:barnstable_dukes_and_nantucket", idScheme: "ocd" },
    ])).toMatchObject({
      status: "available",
      jurisdiction: { districts: [
        { providerTargets: [{ label: "Hampden, Hampshire and Worcester" }] },
        { providerTargets: [{ label: "Barnstable, Dukes and Nantucket" }] },
      ] },
    });

    expect(stateJurisdictionFromDivisions([
      { type: "state", name: "Vermont", id: "ocd-division/country:us/state:vt", idScheme: "ocd" },
      { type: "state_upper", name: "Chittenden Central", id: "ocd-division/country:us/state:vt/sldu:chittenden-central", idScheme: "ocd" },
      { type: "state_lower", name: "Windham-Windsor-Bennington", id: "ocd-division/country:us/state:vt/sldl:windham-windsor-bennington", idScheme: "ocd" },
    ])).toMatchObject({
      status: "available",
      jurisdiction: { districts: [
        { providerTargets: [{ label: "Chittenden Central" }] },
        { providerTargets: [{
          label: "Windham-Windsor-Bennington",
          divisionId: "ocd-division/country:us/state:vt/sldl:windham-bennington-windsor",
        }] },
      ] },
    });
  });

  it.each([
    ["chittenden-central", "Chittenden Central"],
    ["chittenden-north", "Chittenden North"],
    ["chittenden-southeast", "Chittenden Southeast"],
  ] as const)("uses spaces for Vermont upper district %s", (district, label) => {
    expect(stateJurisdictionFromDivisions([
      { type: "state", name: "Vermont", id: "ocd-division/country:us/state:vt", idScheme: "ocd" },
      { type: "state_upper", name: label, id: `ocd-division/country:us/state:vt/sldu:${district}`, idScheme: "ocd" },
      { type: "state_lower", name: "Addison-1", id: "ocd-division/country:us/state:vt/sldl:addison-1", idScheme: "ocd" },
    ])).toMatchObject({
      status: "available",
      jurisdiction: { districts: [{ providerTargets: [{ label }] }, {}] },
    });
  });

  it("maps the current Vermont Grand Isle-Chittenden canonical district to its provider target", () => {
    expect(stateJurisdictionFromDivisions([
      { type: "state", name: "Vermont", id: "ocd-division/country:us/state:vt", idScheme: "ocd" },
      { type: "state_upper", name: "Grand Isle-Chittenden", id: "ocd-division/country:us/state:vt/sldu:grand_isle-chittenden", idScheme: "ocd" },
      { type: "state_lower", name: "Addison-1", id: "ocd-division/country:us/state:vt/sldl:addison-1", idScheme: "ocd" },
    ])).toMatchObject({
      status: "available",
      jurisdiction: { districts: [{
        chamber: "upper",
        district: "grand_isle-chittenden",
        providerTargets: [{
          label: "Grand Isle",
          divisionId: "ocd-division/country:us/state:vt/sldu:grand_isle",
        }],
        divisionId: "ocd-division/country:us/state:vt/sldu:grand_isle-chittenden",
      }, {}] },
    });
  });

  it("rejects the obsolete Vermont Grand Isle canonical district", () => {
    expect(stateJurisdictionFromDivisions([
      { type: "state", name: "Vermont", id: "ocd-division/country:us/state:vt", idScheme: "ocd" },
      { type: "state_upper", name: "Grand Isle", id: "ocd-division/country:us/state:vt/sldu:grand_isle", idScheme: "ocd" },
      { type: "state_lower", name: "Addison-1", id: "ocd-division/country:us/state:vt/sldl:addison-1", idScheme: "ocd" },
    ])).toEqual({ status: "invalid" });
  });

  it.each(["chittenden-west", "grand_isle-extra"])(
    "rejects unverified Vermont upper district token %s",
    (district) => {
      expect(stateJurisdictionFromDivisions([
        { type: "state", name: "Vermont", id: "ocd-division/country:us/state:vt", idScheme: "ocd" },
        { type: "state_upper", name: district, id: `ocd-division/country:us/state:vt/sldu:${district}`, idScheme: "ocd" },
        { type: "state_lower", name: "Addison-1", id: "ocd-division/country:us/state:vt/sldl:addison-1", idScheme: "ocd" },
      ])).toEqual({ status: "invalid" });
    },
  );

  it("preserves Vermont lower hyphens while changing underscores to spaces", () => {
    expect(stateJurisdictionFromDivisions([
      { type: "state", name: "Vermont", id: "ocd-division/country:us/state:vt", idScheme: "ocd" },
      { type: "state_upper", name: "Addison", id: "ocd-division/country:us/state:vt/sldu:addison", idScheme: "ocd" },
      { type: "state_lower", name: "Grand Isle-Chittenden", id: "ocd-division/country:us/state:vt/sldl:grand_isle-chittenden", idScheme: "ocd" },
    ])).toMatchObject({
      status: "available",
      jurisdiction: { districts: [{}, { providerTargets: [{ label: "Grand Isle-Chittenden" }] }] },
    });
  });

  it("maps only the evidenced Maine tribal provider target", () => {
    const divisions = (district: string) => [
      { type: "state" as const, name: "Maine", id: "ocd-division/country:us/state:me", idScheme: "ocd" as const },
      { type: "state_upper" as const, name: "1", id: "ocd-division/country:us/state:me/sldu:1", idScheme: "ocd" as const },
      { type: "state_lower" as const, name: district, id: `ocd-division/country:us/state:me/sldl:${district}`, idScheme: "ocd" as const },
    ];

    expect(stateJurisdictionFromDivisions(divisions("passamaquoddy_tribe"))).toMatchObject({
      status: "available",
      jurisdiction: { districts: [{}, { providerTargets: [{
        label: "Passamaquoddy Tribe",
        divisionId: "ocd-division/country:us/state:me/sldl:passamaquoddy-tribe",
      }] }] },
    });
    expect(stateJurisdictionFromDivisions(divisions("penobscot_nation"))).toEqual({ status: "invalid" });
  });

  it.each([
    ["GA", "named_district"],
    ["ID", "36"],
    ["ME", "penobscot_nation"],
    ["ND", "9a"],
    ["ND", "9b"],
    ["NV", "central_nevada"],
    ["SD", "27a"],
    ["MA", "3rd__suffolk"],
    ["VT", "addison--rutland"],
  ] as const)("rejects unverified or malformed %s district token %s", (stateCode, district) => {
    const state = stateCode.toLowerCase();
    expect(
      stateJurisdictionFromDivisions([
        {
          type: "state",
          name: stateCode,
          id: `ocd-division/country:us/state:${state}`,
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "District 1",
          id: `ocd-division/country:us/state:${state}/sldu:1`,
          idScheme: "ocd",
        },
        {
          type: "state_lower",
          name: district,
          id: `ocd-division/country:us/state:${state}/sldl:${district}`,
          idScheme: "ocd",
        },
      ]),
    ).toEqual({ status: "invalid" });
  });

  it("derives a unicameral jurisdiction without inventing a lower chamber", () => {
    expect(
      stateJurisdictionFromDivisions([
        {
          type: "state",
          name: "Nebraska",
          id: "ocd-division/country:us/state:ne",
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "Nebraska Legislative District 8",
          id: "ocd-division/country:us/state:ne/sldu:8",
          idScheme: "ocd",
        },
      ]),
    ).toEqual({
      status: "available",
      jurisdiction: {
        stateCode: "NE",
        stateDivisionId: "ocd-division/country:us/state:ne",
        jurisdictionId: "ocd-jurisdiction/country:us/state:ne/government",
        legislature: "unicameral",
        districts: [
          {
            chamber: "upper",
            district: "8",
            providerTargets: [{
              label: "8",
              divisionId: "ocd-division/country:us/state:ne/sldu:8",
            }],
            divisionId: "ocd-division/country:us/state:ne/sldu:8",
          },
        ],
      },
    });
  });

  it("rejects a lone upper or lower district for a bicameral state", () => {
    for (const division of [
      {
        type: "state_upper" as const,
        name: "Example Senate District 2",
        id: "ocd-division/country:us/state:ex/sldu:2",
        idScheme: "ocd",
      },
      {
        type: "state_lower" as const,
        name: "Example House District 2",
        id: "ocd-division/country:us/state:ex/sldl:2",
        idScheme: "ocd",
      },
    ]) {
      expect(
        stateJurisdictionFromDivisions([
          {
            type: "state",
            name: "Example",
            id: "ocd-division/country:us/state:ex",
            idScheme: "ocd",
          },
          division,
        ]),
      ).toEqual({ status: "invalid" });
    }
  });

  it.each([
    [
      "duplicate state division",
      [
        {
          type: "state",
          name: "Example",
          id: "ocd-division/country:us/state:ex",
          idScheme: "ocd",
        },
        {
          type: "state",
          name: "Example",
          id: "ocd-division/country:us/state:ex",
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "District 2",
          id: "ocd-division/country:us/state:ex/sldu:2",
          idScheme: "ocd",
        },
      ],
    ],
    [
      "conflicting districts for one chamber",
      [
        {
          type: "state",
          name: "Example",
          id: "ocd-division/country:us/state:ex",
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "District 2",
          id: "ocd-division/country:us/state:ex/sldu:2",
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "District 3",
          id: "ocd-division/country:us/state:ex/sldu:3",
          idScheme: "ocd",
        },
      ],
    ],
    [
      "mismatched state path",
      [
        {
          type: "state",
          name: "Example",
          id: "ocd-division/country:us/state:ex",
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "Other District 2",
          id: "ocd-division/country:us/state:ot/sldu:2",
          idScheme: "ocd",
        },
      ],
    ],
    [
      "malformed identifier",
      [
        {
          type: "state",
          name: "Example",
          id: "ocd-division/country:us/state:EX",
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "District 2",
          id: "ocd-division/country:us/state:ex/sldu:2",
          idScheme: "ocd",
        },
      ],
    ],
    [
      "unsupported identifier scheme",
      [
        {
          type: "state",
          name: "Example",
          id: "ocd-division/country:us/state:ex",
          idScheme: "census",
        },
        {
          type: "state_upper",
          name: "District 2",
          id: "ocd-division/country:us/state:ex/sldu:2",
          idScheme: "ocd",
        },
      ],
    ],
    ["empty input", []],
  ] as const)("rejects %s", (_label, divisions) => {
    expect(stateJurisdictionFromDivisions(divisions)).toEqual({
      status: "invalid",
    });
  });
});

describe("reconcileStateOfficials", () => {
  it("accepts a valid jurisdiction with reordered object keys", () => {
    const result = stateJurisdictionFromDivisions([
      {
        type: "state",
        name: "Nebraska",
        id: "ocd-division/country:us/state:ne",
        idScheme: "ocd",
      },
      {
        type: "state_upper",
        name: "Nebraska Legislative District 8",
        id: "ocd-division/country:us/state:ne/sldu:8",
        idScheme: "ocd",
      },
    ]);
    if (result.status !== "available") {
      throw new Error("fixture requires a jurisdiction");
    }
    const reordered: StateJurisdiction = {
      districts: result.jurisdiction.districts,
      legislature: result.jurisdiction.legislature,
      jurisdictionId: result.jurisdiction.jurisdictionId,
      stateDivisionId: result.jurisdiction.stateDivisionId,
      stateCode: result.jurisdiction.stateCode,
    };
    const roster = {
      freshness,
      seats: [
        {
          chamber: "upper" as const,
          district: "8",
          seat: "1",
          people: [],
          vacancySources: [],
        },
      ],
    };

    expect(reconcileStateOfficials(reordered, roster)).toEqual(
      reconcileStateOfficials(result.jurisdiction, roster),
    );
  });

  it("rejects a reordered jurisdiction with an extra district field", () => {
    const result = stateJurisdictionFromDivisions([
      {
        type: "state",
        name: "Nebraska",
        id: "ocd-division/country:us/state:ne",
        idScheme: "ocd",
      },
      {
        type: "state_upper",
        name: "Nebraska Legislative District 8",
        id: "ocd-division/country:us/state:ne/sldu:8",
        idScheme: "ocd",
      },
    ]);
    if (result.status !== "available") {
      throw new Error("fixture requires a jurisdiction");
    }
    const malformed = {
      districts: result.jurisdiction.districts.map((district) => ({
        userId: "private-user-id",
        ...district,
      })),
      legislature: result.jurisdiction.legislature,
      jurisdictionId: result.jurisdiction.jurisdictionId,
      stateDivisionId: result.jurisdiction.stateDivisionId,
      stateCode: result.jurisdiction.stateCode,
    } as StateJurisdiction;

    expect(
      reconcileStateOfficials(malformed, {
        freshness,
        seats: [
          {
            chamber: "upper",
            district: "8",
            seat: "1",
            people: [],
            vacancySources: [],
          },
        ],
      }),
    ).toBeNull();
  });

  it("keeps multi-member seats and people in deterministic chamber, district, seat, and person order", () => {
    const result = stateJurisdictionFromDivisions([
      {
        type: "state",
        name: "California",
        id: "ocd-division/country:us/state:ca",
        idScheme: "ocd",
      },
      {
        type: "state_upper",
        name: "District 2",
        id: "ocd-division/country:us/state:ca/sldu:2",
        idScheme: "ocd",
      },
      {
        type: "state_lower",
        name: "District 10",
        id: "ocd-division/country:us/state:ca/sldl:10",
        idScheme: "ocd",
      },
    ]);
    if (result.status !== "available") {
      throw new Error("fixture requires a jurisdiction");
    }

    const view: StateOfficialsView | null = reconcileStateOfficials(result.jurisdiction, {
      freshness,
      seats: [
        {
          chamber: "lower",
          district: "10",
          seat: "2",
          people: [
            {
              id: "openstates:zoe",
              name: "Zoe Stone",
              role: { chamber: "lower", district: "10", seat: "2", current: true },
              sources: [{ ...officialSource, publicUrl: "https://senate.ca.gov/members/zoe-stone" }],
            },
          ],
          vacancySources: [],
        },
        {
          chamber: "upper",
          district: "2",
          seat: "1",
          people: [
            {
              id: "openstates:alex",
              name: "Alex Rivera",
              role: { chamber: "upper", district: "2", seat: "1", current: true },
              sources: [{ ...officialSource, publicUrl: "https://senate.ca.gov/members/alex-rivera" }],
            },
          ],
          vacancySources: [],
        },
        {
          chamber: "lower",
          district: "10",
          seat: "1",
          people: [
            {
              id: "openstates:bea",
              name: "Bea Adams",
              role: { chamber: "lower", district: "10", seat: "1", current: true },
              sources: [{ ...officialSource, publicUrl: "https://assembly.ca.gov/members/bea-adams" }],
            },
          ],
          vacancySources: [],
        },
      ],
    });

    expect(view).toMatchObject({
      freshness,
      chambers: [
        { chamber: "upper", districts: [{ district: "2", seats: [{ seat: "1" }] }] },
        {
          chamber: "lower",
          districts: [
            {
              district: "10",
              seats: [
                { seat: "1", people: [{ id: "openstates:bea" }] },
                { seat: "2", people: [{ id: "openstates:zoe" }] },
              ],
            },
          ],
        },
      ],
    });
  });

  it("keeps distinct people who share an OpenStates role title in one ordered serving seat", () => {
    const result = stateJurisdictionFromDivisions([
      {
        type: "state",
        name: "Nebraska",
        id: "ocd-division/country:us/state:ne",
        idScheme: "ocd",
      },
      {
        type: "state_upper",
        name: "Nebraska Legislative District 8",
        id: "ocd-division/country:us/state:ne/sldu:8",
        idScheme: "ocd",
      },
    ]);
    if (result.status !== "available") {
      throw new Error("fixture requires a jurisdiction");
    }

    expect(
      reconcileStateOfficials(result.jurisdiction, {
        freshness,
        seats: [
          {
            chamber: "upper",
            district: "8",
            seat: "Senator",
            people: [
              {
                id: "openstates:zoe",
                name: "Zoe Stone",
                role: {
                  chamber: "upper",
                  district: "8",
                  seat: "Senator",
                  current: true,
                },
                sources: [
                  {
                    ...officialSource,
                    publicUrl:
                      "https://nebraskalegislature.gov/senators/zoe-stone",
                  },
                ],
              },
              {
                id: "openstates:alex",
                name: "Alex Rivera",
                role: {
                  chamber: "upper",
                  district: "8",
                  seat: "Senator",
                  current: true,
                },
                sources: [officialSource],
              },
            ],
            vacancySources: [],
          },
        ],
      }),
    ).toMatchObject({
      chambers: [
        {
          chamber: "upper",
          districts: [
            {
              district: "8",
              seats: [
                {
                  status: "serving",
                  seat: "Senator",
                  people: [
                    { id: "openstates:alex", name: "Alex Rivera" },
                    { id: "openstates:zoe", name: "Zoe Stone" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("orders equal-name people by strict ID independent of provider order", () => {
    const result = stateJurisdictionFromDivisions([
      {
        type: "state",
        name: "Nebraska",
        id: "ocd-division/country:us/state:ne",
        idScheme: "ocd",
      },
      {
        type: "state_upper",
        name: "Nebraska Legislative District 8",
        id: "ocd-division/country:us/state:ne/sldu:8",
        idScheme: "ocd",
      },
    ]);
    if (result.status !== "available") {
      throw new Error("fixture requires a jurisdiction");
    }
    const personTwo = {
      id: "openstates:2",
      name: "Alex Rivera",
      role: {
        chamber: "upper" as const,
        district: "8",
        seat: "Senator",
        current: true,
      },
      sources: [
        {
          ...officialSource,
          publicUrl: "https://nebraskalegislature.gov/senators/alex-rivera-2",
        },
      ],
    };
    const personTen = {
      ...personTwo,
      id: "openstates:10",
      sources: [
        {
          ...officialSource,
          publicUrl: "https://nebraskalegislature.gov/senators/alex-rivera-10",
        },
      ],
    };
    const roster = (people: readonly [typeof personTwo, typeof personTwo]) => ({
      freshness,
      seats: [
        {
          chamber: "upper" as const,
          district: "8",
          seat: "Senator",
          people,
          vacancySources: [],
        },
      ],
    });

    const forward = reconcileStateOfficials(
      result.jurisdiction,
      roster([personTwo, personTen]),
    );
    const reversed = reconcileStateOfficials(
      result.jurisdiction,
      roster([personTen, personTwo]),
    );

    expect(forward).toEqual(reversed);
    expect(forward).toMatchObject({
      chambers: [
        {
          districts: [
            {
              seats: [
                {
                  people: [
                    { id: "openstates:10", name: "Alex Rivera" },
                    { id: "openstates:2", name: "Alex Rivera" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("marks serving, explicit vacancy, and absent evidence without inferring a vacancy", () => {
    const result = stateJurisdictionFromDivisions([
      {
        type: "state",
        name: "Nebraska",
        id: "ocd-division/country:us/state:ne",
        idScheme: "ocd",
      },
      {
        type: "state_upper",
        name: "Nebraska Legislative District 2",
        id: "ocd-division/country:us/state:ne/sldu:2",
        idScheme: "ocd",
      },
    ]);
    if (result.status !== "available") {
      throw new Error("fixture requires a jurisdiction");
    }

    expect(
      reconcileStateOfficials(result.jurisdiction, {
        freshness: { ...freshness, state: "stale" },
        seats: [
          {
            chamber: "upper",
            district: "2",
            seat: "1",
            people: [
              {
                id: "openstates:alex",
                name: "Alex Rivera",
                role: { chamber: "upper", district: "2", seat: "1", current: true },
                sources: [officialSource],
              },
            ],
            vacancySources: [],
          },
          {
            chamber: "upper",
            district: "2",
            seat: "2",
            people: [],
            vacancySources: [vacancySource],
          },
          {
            chamber: "upper",
            district: "2",
            seat: "3",
            people: [],
            vacancySources: [],
          },
        ],
      }),
    ).toMatchObject({
      freshness: { ...freshness, state: "stale" },
      chambers: [
        {
          chamber: "upper",
          districts: [
            {
              district: "2",
              seats: [
                { seat: "1", status: "serving", people: [{ id: "openstates:alex" }] },
                { seat: "2", status: "vacant", people: [] },
                { seat: "3", status: "unknown", people: [] },
              ],
            },
          ],
        },
      ],
    });
  });

  it.each([
    ["wrong-state host", "https://senate.ca.gov/member"],
    ["unvetted host", "https://georgia.gov/legislator"],
    ["privacy-bearing query", "https://www.legis.ga.gov/member?address=1-main"],
    ["unapproved query", "https://www.legis.ga.gov/member?sort=alpha"],
  ])("rejects a cached %s", (_label, publicUrl) => {
    const result = stateJurisdictionFromDivisions([
      {
        type: "state",
        name: "Georgia",
        id: "ocd-division/country:us/state:ga",
        idScheme: "ocd",
      },
      {
        type: "state_upper",
        name: "Georgia Senate District 13",
        id: "ocd-division/country:us/state:ga/sldu:13",
        idScheme: "ocd",
      },
      {
        type: "state_lower",
        name: "Georgia House District 25",
        id: "ocd-division/country:us/state:ga/sldl:25",
        idScheme: "ocd",
      },
    ]);
    if (result.status !== "available") throw new Error("fixture requires Georgia jurisdiction");

    expect(reconcileStateOfficials(result.jurisdiction, vacancyRoster(publicUrl))).toBeNull();
  });

  it("accepts a cached source that satisfies the state host and public-query policy", () => {
    const result = stateJurisdictionFromDivisions([
      {
        type: "state",
        name: "Georgia",
        id: "ocd-division/country:us/state:ga",
        idScheme: "ocd",
      },
      {
        type: "state_upper",
        name: "Georgia Senate District 13",
        id: "ocd-division/country:us/state:ga/sldu:13",
        idScheme: "ocd",
      },
      {
        type: "state_lower",
        name: "Georgia House District 25",
        id: "ocd-division/country:us/state:ga/sldl:25",
        idScheme: "ocd",
      },
    ]);
    if (result.status !== "available") throw new Error("fixture requires Georgia jurisdiction");

    expect(
      reconcileStateOfficials(
        result.jurisdiction,
        vacancyRoster("https://www.legis.ga.gov/member?district=13&session=2026"),
      ),
    ).toMatchObject({ chambers: [{ districts: [{ seats: [{ status: "vacant" }] }] }] });
  });

  it.each([
    ["malformed source URL", { ...officialSource, publicUrl: "http://example.gov/member" }],
    ["malformed source time", { ...officialSource, retrievedAt: "not-a-time" }],
  ])("fails closed on %s", (_label, source) => {
    const result = stateJurisdictionFromDivisions([
      {
        type: "state",
        name: "Nebraska",
        id: "ocd-division/country:us/state:ne",
        idScheme: "ocd",
      },
      {
        type: "state_upper",
        name: "Nebraska Legislative District 2",
        id: "ocd-division/country:us/state:ne/sldu:2",
        idScheme: "ocd",
      },
    ]);
    if (result.status !== "available") {
      throw new Error("fixture requires a jurisdiction");
    }

    expect(
      reconcileStateOfficials(result.jurisdiction, {
        freshness,
        seats: [
          {
            chamber: "upper",
            district: "2",
            seat: "1",
            people: [
              {
                id: "openstates:alex",
                name: "Alex Rivera",
                role: { chamber: "upper", district: "2", seat: "1", current: true },
                sources: [source],
              },
            ],
            vacancySources: [],
          },
        ],
      }),
    ).toBeNull();
  });

  it("fails closed on a mismatched role, district, duplicate identity, duplicate role, or contradictory evidence", () => {
    const result = stateJurisdictionFromDivisions([
      {
        type: "state",
        name: "Nebraska",
        id: "ocd-division/country:us/state:ne",
        idScheme: "ocd",
      },
      {
        type: "state_upper",
        name: "Nebraska Legislative District 2",
        id: "ocd-division/country:us/state:ne/sldu:2",
        idScheme: "ocd",
      },
    ]);
    if (result.status !== "available") {
      throw new Error("fixture requires a jurisdiction");
    }
    const person = {
      id: "openstates:alex",
      name: "Alex Rivera",
      role: { chamber: "upper" as const, district: "2", seat: "1", current: true },
      sources: [officialSource],
    };

    for (const seats of [
      [
        {
          chamber: "upper" as const,
          district: "2",
          seat: "1",
          people: [{ ...person, role: { ...person.role, district: "3" } }],
          vacancySources: [],
        },
      ],
      [
        { chamber: "upper" as const, district: "2", seat: "1", people: [person], vacancySources: [] },
        { chamber: "upper" as const, district: "2", seat: "2", people: [person], vacancySources: [] },
      ],
      [
        { chamber: "upper" as const, district: "2", seat: "1", people: [person], vacancySources: [] },
        {
          chamber: "upper" as const,
          district: "2",
          seat: "1",
          people: [{ ...person, id: "openstates:bea", name: "Bea Adams" }],
          vacancySources: [],
        },
      ],
      [
        {
          chamber: "upper" as const,
          district: "2",
          seat: "1",
          people: [person],
          vacancySources: [vacancySource],
        },
      ],
    ]) {
      expect(reconcileStateOfficials(result.jurisdiction, { freshness, seats })).toBeNull();
    }
  });
});

function marylandDivisions(district: string) {
  return [
    {
      type: "state" as const,
      name: "Maryland",
      id: "ocd-division/country:us/state:md",
      idScheme: "ocd" as const,
    },
    {
      type: "state_upper" as const,
      name: "1",
      id: "ocd-division/country:us/state:md/sldu:1",
      idScheme: "ocd" as const,
    },
    {
      type: "state_lower" as const,
      name: district,
      id: `ocd-division/country:us/state:md/sldl:${district}`,
      idScheme: "ocd" as const,
    },
  ];
}

function vacancyRoster(publicUrl: string) {
  return {
    freshness,
    seats: [
      {
        chamber: "upper" as const,
        district: "13",
        seat: "State Senator",
        people: [],
        vacancySources: [
          {
            sourceType: "vacancy" as const,
            publicUrl,
            retrievedAt: freshness.checkedAt,
            effectiveAt: null,
          },
        ],
      },
    ],
  };
}
