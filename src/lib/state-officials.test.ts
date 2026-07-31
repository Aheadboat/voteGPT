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
  publicUrl: "https://legislature.example.gov/members/alex-rivera",
  retrievedAt: "2026-07-31T12:00:00.000Z",
  effectiveAt: "2026-01-01T00:00:00.000Z",
};

const vacancySource = {
  sourceType: "vacancy" as const,
  publicUrl: "https://legislature.example.gov/vacancies/upper-2",
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
            divisionId: "ocd-division/country:us/state:ex/sldu:2",
          },
          {
            chamber: "lower",
            district: "10",
            divisionId: "ocd-division/country:us/state:ex/sldl:10",
          },
        ],
      },
    });
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

  it("keeps multi-member seats and people in deterministic chamber, district, seat, and person order", () => {
    const result = stateJurisdictionFromDivisions([
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
        type: "state_lower",
        name: "District 10",
        id: "ocd-division/country:us/state:ex/sldl:10",
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
              sources: [officialSource],
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
              sources: [officialSource],
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
              sources: [officialSource],
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
