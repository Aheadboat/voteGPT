import { describe, expect, it, vi } from "vitest";
import bicameralPage1 from "../../tests/fixtures/openstates/bicameral-page-1.json";
import bicameralPage2 from "../../tests/fixtures/openstates/bicameral-page-2.json";
import emptyPage from "../../tests/fixtures/openstates/empty.json";
import multiMemberPage from "../../tests/fixtures/openstates/multi-member.json";
import multipagePage1 from "../../tests/fixtures/openstates/multipage-page-1.json";
import multipagePage2 from "../../tests/fixtures/openstates/multipage-page-2.json";
import {
  fetchStateLegislators,
  type FetchStateLegislators,
} from "./openstates";
import type { StateJurisdiction } from "./state-officials";

vi.mock("server-only", () => ({}));

const CHECKED_AT = "2026-07-31T12:00:00.000Z";
const API_KEY = "test-openstates-key";

const bicameral: StateJurisdiction = {
  stateCode: "CA",
  stateDivisionId: "ocd-division/country:us/state:ca",
  jurisdictionId: "ocd-jurisdiction/country:us/state:ca/government",
  legislature: "bicameral",
  districts: [
    { chamber: "upper", district: "2", divisionId: "ocd-division/country:us/state:ca/sldu:2" },
    { chamber: "lower", district: "10", divisionId: "ocd-division/country:us/state:ca/sldl:10" },
  ],
};

const unicameral: StateJurisdiction = {
  ...bicameral,
  stateCode: "NE",
  stateDivisionId: "ocd-division/country:us/state:ne",
  jurisdictionId: "ocd-jurisdiction/country:us/state:ne/government",
  legislature: "unicameral",
  districts: [
    { chamber: "upper", district: "8", divisionId: "ocd-division/country:us/state:ne/sldu:8" },
  ],
};

const VETTED_LEGISLATIVE_HOSTS = {
  AK: ["akleg.gov"],
  AL: ["legislature.state.al.us"],
  AR: ["arkleg.state.ar.us"],
  AZ: ["azleg.gov"],
  CA: ["assembly.ca.gov", "senate.ca.gov"],
  CO: ["leg.colorado.gov"],
  CT: ["cga.ct.gov"],
  DE: ["legis.delaware.gov"],
  FL: ["flsenate.gov", "myfloridahouse.gov", "flhouse.gov"],
  GA: ["legis.ga.gov", "house.ga.gov", "senate.ga.gov"],
  HI: ["capitol.hawaii.gov"],
  IA: ["legis.iowa.gov", "senate.iowa.gov"],
  ID: ["legislature.idaho.gov"],
  IL: ["ilga.gov"],
  IN: ["iga.in.gov"],
  KS: ["kslegislature.gov", "kslegislature.org"],
  KY: ["legislature.ky.gov", "lrc.ky.gov"],
  LA: ["house.louisiana.gov", "senate.la.gov"],
  MA: ["malegislature.gov"],
  MD: ["mgaleg.maryland.gov"],
  ME: ["legislature.maine.gov"],
  MI: ["house.mi.gov", "senate.michigan.gov"],
  MN: ["house.mn.gov", "house.leg.state.mn.us", "senate.mn"],
  MO: ["house.mo.gov", "senate.mo.gov"],
  MS: ["billstatus.ls.state.ms.us", "legislature.ms.gov"],
  MT: ["leg.mt.gov", "legmt.gov"],
  NC: ["ncleg.gov", "ncga.state.nc.us"],
  ND: ["legis.nd.gov", "ndlegis.gov"],
  NE: ["nebraskalegislature.gov"],
  NH: ["gencourt.state.nh.us", "gc.nh.gov"],
  NJ: ["njleg.state.nj.us"],
  NM: ["nmlegis.gov"],
  NV: ["leg.state.nv.us"],
  NY: ["assembly.state.ny.us", "nyassembly.gov", "nysenate.gov"],
  OH: ["legislature.ohio.gov", "ohiohouse.gov", "ohiosenate.gov"],
  OK: ["okhouse.gov", "oksenate.gov", "oklegislature.gov"],
  OR: ["oregonlegislature.gov"],
  PA: ["legis.state.pa.us", "palegis.us"],
  RI: ["rilegislature.gov", "rilin.state.ri.us"],
  SC: ["scstatehouse.gov"],
  SD: ["sdlegislature.gov", "legis.sd.gov"],
  TN: ["capitol.tn.gov", "legislature.state.tn.us"],
  TX: ["house.texas.gov", "senate.texas.gov", "capitol.texas.gov"],
  UT: ["le.utah.gov", "house.utah.gov", "house.utleg.gov", "senate.utah.gov"],
  VA: ["virginiageneralassembly.gov", "lis.virginia.gov", "senate.virginia.gov", "house.vga.virginia.gov"],
  VT: ["legislature.vermont.gov"],
  WA: ["leg.wa.gov"],
  WI: ["legis.wisconsin.gov"],
  WV: ["wvlegislature.gov", "legis.state.wv.us"],
  WY: ["wyoleg.gov", "legisweb.state.wy.us"],
} as const;

describe("fetchStateLegislators", () => {
  it("uses only public division filters and returns a deterministic bicameral roster", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const result = await fetchStateLegislators(bicameral, {
      apiKey: API_KEY,
      checkedAt: CHECKED_AT,
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return jsonResponse(requests.length === 1 ? bicameralPage1 : bicameralPage2);
      },
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      status: "available",
      roster: {
        freshness: { checkedAt: CHECKED_AT, refreshAfter: CHECKED_AT, staleAfter: CHECKED_AT, state: "fresh" },
        seats: [
          {
            chamber: "upper", district: "2", seat: "State Senator", vacancySources: [],
            people: [{
              id: "ocd-person/alex-rivera", name: "Alex Rivera",
              role: { chamber: "upper", district: "2", seat: "State Senator", current: true },
              sources: [{ sourceType: "official", publicUrl: "https://www.senate.ca.gov/members/alex-rivera", retrievedAt: CHECKED_AT, effectiveAt: "2026-07-01T00:00:00.000Z" }],
            }],
          },
          {
            chamber: "lower", district: "10", seat: "State Representative", vacancySources: [],
            people: [{
              id: "ocd-person/blair-chen", name: "Blair Chen",
              role: { chamber: "lower", district: "10", seat: "State Representative", current: true },
              sources: [{ sourceType: "official", publicUrl: "https://www.assembly.ca.gov/members/blair-chen", retrievedAt: CHECKED_AT, effectiveAt: "2026-07-02T00:00:00.000Z" }],
            }],
          },
        ],
      },
    });
    expect(requests.map(({ url }) => url)).toEqual([
      "https://v3.openstates.org/people?jurisdiction=ocd-jurisdiction%2Fcountry%3Aus%2Fstate%3Aca%2Fgovernment&org_classification=upper&district=2&include=sources&page=1&per_page=20",
      "https://v3.openstates.org/people?jurisdiction=ocd-jurisdiction%2Fcountry%3Aus%2Fstate%3Aca%2Fgovernment&org_classification=lower&district=10&include=sources&page=1&per_page=20",
    ]);
    expect(requests.every(({ url, init }) =>
      !/people\.geo|apikey|address|lat|lng|residence|user/i.test(url) &&
      !url.includes(API_KEY) &&
      new Headers(init?.headers).get("X-API-KEY") === API_KEY,
    )).toBe(true);
  });

  it("normalizes unicameral, multi-member, and verified-empty coverage without inventing a vacancy", async () => {
    const unicameralPage = mutate(bicameralPage1, (page) => {
      page.results[0].jurisdiction.id = unicameral.jurisdictionId;
      page.results[0].current_role.district = "8";
      page.results[0].current_role.division_id = "ocd-division/country:us/state:ne/sldu:8";
      page.results[0].sources[0].url = "https://nebraskalegislature.gov/senators/landing-pages/index.php?District=8";
    });
    const unicameralResult = await run(unicameral, [unicameralPage]);
    const multiMemberResult = await run(
      bicameral,
      [emptyPage, multiMemberPage],
    );
    const emptyResult = await run(unicameral, [emptyPage]);

    expect(unicameralResult).toMatchObject({
      status: "available",
      roster: { seats: [{ chamber: "upper", district: "8", seat: "State Senator" }] },
    });
    expect(multiMemberResult).toMatchObject({
      status: "available",
      roster: { seats: [{
        chamber: "lower", district: "10", seat: "Delegate",
        people: [
          { id: "ocd-person/avery-morgan", name: "Avery Morgan" },
          { id: "ocd-person/casey-lee", name: "Casey Lee" },
        ],
      }] },
    });
    expect(emptyResult).toEqual({
      status: "available",
      roster: { freshness: { checkedAt: CHECKED_AT, refreshAfter: CHECKED_AT, staleAfter: CHECKED_AT, state: "fresh" }, seats: [] },
    });
  });

  it("requires complete bounded pagination and rejects contradictory, missing, or oversized coverage", async () => {
    const complete = await run(bicameral, [emptyPage, multipagePage1, multipagePage2]);
    const wrongPage = clonePage(multipagePage2);
    wrongPage.pagination.page = 1;
    const overLimit = clonePage(multipagePage1);
    overLimit.pagination.max_page = 6;
    overLimit.pagination.total_items = 101;
    const contradictoryPage1 = clonePage(multiMemberPage);
    contradictoryPage1.pagination = { per_page: 20, page: 1, max_page: 2, total_items: 3 };
    const contradictoryPage2 = clonePage(multipagePage2);
    contradictoryPage2.pagination = { per_page: 20, page: 2, max_page: 2, total_items: 3 };
    const shortPage1 = clonePage(multipagePage1);
    const movedPerson = shortPage1.results.pop()!;
    const shortPage2 = clonePage(multipagePage2);
    shortPage2.results.push(movedPerson);

    expect(complete).toMatchObject({
      status: "available",
      roster: { seats: [{ seat: "Delegate", people: expect.any(Array) }] },
    });
    if (complete.status !== "available") throw new Error("Expected complete roster.");
    expect(complete.roster.seats[0]?.people).toHaveLength(21);
    await expect(run(bicameral, [emptyPage, multipagePage1, wrongPage]))
      .resolves.toEqual({ status: "unavailable", reason: "partial" });
    await expect(run(bicameral, [emptyPage, overLimit]))
      .resolves.toEqual({ status: "unavailable", reason: "oversize" });
    await expect(run(bicameral, [emptyPage, contradictoryPage1, contradictoryPage2]))
      .resolves.toEqual({ status: "unavailable", reason: "partial" });
    await expect(run(bicameral, [emptyPage, shortPage1, shortPage2]))
      .resolves.toEqual({ status: "unavailable", reason: "partial" });
  });

  it("normalizes valid RFC 3339 provider times while keeping checkedAt canonical", async () => {
    const offsetPage = mutate(bicameralPage1, (page) => {
      page.results[0].updated_at = "2026-07-01T05:30:00-04:00";
    });
    const microsecondPage = mutate(bicameralPage2, (page) => {
      page.results[0].updated_at = "2026-07-02T00:00:00.123456Z";
    });

    await expect(run(bicameral, [offsetPage, microsecondPage])).resolves.toMatchObject({
      status: "available",
      roster: { seats: [
        { people: [{ sources: [{ effectiveAt: "2026-07-01T09:30:00.000Z" }] }] },
        { people: [{ sources: [{ effectiveAt: "2026-07-02T00:00:00.123Z" }] }] },
      ] },
    });
    await expect(run(unicameral, [emptyPage], "2026-07-31T08:00:00-04:00"))
      .resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("retains only bounded, deduplicated institutional sources without rejecting well-formed extras", async () => {
    const officialUrl = "https://www.senate.ca.gov/members/alex-rivera?session=2025-2026&id=42";
    const mixedSources = mutate(bicameralPage1, (page) => {
      page.results[0].sources = [
        { url: "https://x.com/example-legislator" },
        { url: officialUrl },
        { url: "https://www.whitehouse.gov/briefing-room/" },
        { url: officialUrl, note: "duplicate official profile" },
        ...Array.from({ length: 8 }, (_, index) => ({ url: `https://example.com/reference-${index}` })),
      ];
    });

    const result = await run(bicameral, [mixedSources, bicameralPage2]);

    expect(result).toMatchObject({ status: "available" });
    if (result.status !== "available") throw new Error("Expected trusted-source filtering to succeed.");
    expect(result.roster.seats[0]?.people[0]?.sources).toEqual([
      expect.objectContaining({ publicUrl: officialUrl }),
    ]);
  });

  it("uses the complete state-scoped legislative host policy, including vetted non-.gov roots", async () => {
    expect(Object.keys(VETTED_LEGISLATIVE_HOSTS)).toHaveLength(50);
    for (const [state, hosts] of Object.entries(VETTED_LEGISLATIVE_HOSTS)) {
      const jurisdiction = jurisdictionFor(state);
      for (const host of hosts) {
        const page = officialPageFor(jurisdiction, `https://${host}/member?session=2026`);
        const result = await run(jurisdiction, jurisdiction.legislature === "unicameral" ? [page] : [page, emptyPage]);
        expect(result, `${state} should trust ${host}`).toMatchObject({ status: "available" });
      }
    }

    const kansas = jurisdictionFor("KS");
    await expect(run(kansas, [
      officialPageFor(kansas, "https://www.kslegislature.org/li/b2025_26/members/rep_example_1/"),
      emptyPage,
    ])).resolves.toMatchObject({ status: "available" });
  });

  it("fails closed without a state-matched institutional source and protects trusted URLs", async () => {
    for (const sourceUrl of [
      "https://www.nysenate.gov/legislators/bio/example",
      "https://www.whitehouse.gov/briefing-room/",
      "https://housedems.ct.gov/example",
    ]) {
      const page = mutate(bicameralPage1, (value) => {
        value.results[0].sources = [{ url: sourceUrl }];
      });
      await expect(run(bicameral, [page, bicameralPage2]))
        .resolves.toEqual({ status: "unavailable", reason: "malformed" });
    }

    for (const sourceUrl of [
      "http://senate.ca.gov/member",
      "https://user:secret@senate.ca.gov/member",
      "https://senate.ca.gov:444/member",
      "https://senate.ca.gov/member#private",
      "https://SENATE.CA.GOV/member",
      `https://senate.ca.gov/member?value=${"x".repeat(1_025)}`,
    ]) {
      const page = mutate(bicameralPage1, (value) => {
        value.results[0].sources = [{ url: sourceUrl }];
      });
      await expect(run(bicameral, [page, bicameralPage2]))
        .resolves.toEqual({ status: "unavailable", reason: "malformed" });
    }

    const tooManyOfficialSources = mutate(bicameralPage1, (page) => {
      page.results[0].sources = Array.from(
        { length: 9 },
        (_, index) => ({ url: `https://senate.ca.gov/member/${index}` }),
      );
    });
    await expect(run(bicameral, [tooManyOfficialSources, bicameralPage2]))
      .resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("fails closed for malformed or privacy-bearing people data", async () => {
    const cases: Array<[string, unknown]> = [
      ["invalid JSON", "not-json"],
      ["missing identity", mutate(bicameralPage1, (page) => { Reflect.deleteProperty(page.results[0]!, "id"); })],
      ["duplicate identity", duplicatePersonPage()],
      ["wrong role", mutate(bicameralPage1, (page) => { page.results[0].current_role.org_classification = "lower"; })],
      ["wrong district", mutate(bicameralPage1, (page) => { page.results[0].current_role.district = "9"; })],
      ["missing current role", mutate(bicameralPage1, (page) => { Reflect.deleteProperty(page.results[0]!, "current_role"); })],
      ["future update", mutate(bicameralPage1, (page) => { page.results[0].updated_at = "2026-08-01T00:00:00.000Z"; })],
      ["unsafe source", mutate(bicameralPage1, (page) => { page.results[0].sources[0].url = "http://senate.ca.gov/member"; })],
      ["office address", mutate(bicameralPage1, (page) => { Object.assign(page.results[0]!, { offices: [{ address: "1 Main Street" }] }); })],
    ];

    for (const [, body] of cases) {
      await expect(run(bicameral, [body, bicameralPage2])).resolves.toEqual({ status: "unavailable", reason: "malformed" });
    }
  });

  it("classifies authentication, quota, provider, abort, and body-limit failures without leaking its key", async () => {
    const rejectedFetch: typeof globalThis.fetch = async () => { throw new TypeError("offline"); };
    const aborted = new AbortController();
    aborted.abort();
    const noKey = await fetchStateLegislators(unicameral, {
      apiKey: "  ", checkedAt: CHECKED_AT,
      fetch: async () => { throw new Error("fetch must not run"); }, signal: new AbortController().signal,
    });

    expect(noKey).toEqual({ status: "unavailable", reason: "auth" });
    await expect(run(unicameral, [new Response("", { status: 401 })])).resolves.toEqual({ status: "unavailable", reason: "auth" });
    await expect(run(unicameral, [new Response("", { status: 429 })])).resolves.toEqual({ status: "unavailable", reason: "quota" });
    await expect(run(unicameral, [new Response("", { status: 503 })])).resolves.toEqual({ status: "unavailable", reason: "provider_error" });
    await expect(fetchStateLegislators(unicameral, { apiKey: API_KEY, checkedAt: CHECKED_AT, fetch: rejectedFetch, signal: new AbortController().signal }))
      .resolves.toEqual({ status: "unavailable", reason: "provider_error" });
    await expect(fetchStateLegislators(unicameral, { apiKey: API_KEY, checkedAt: CHECKED_AT, fetch: rejectedFetch, signal: aborted.signal }))
      .resolves.toEqual({ status: "unavailable", reason: "timeout" });
    const readAbort = new AbortController();
    await expect(fetchStateLegislators(unicameral, {
      apiKey: API_KEY,
      checkedAt: CHECKED_AT,
      fetch: async () => new Response(new ReadableStream({ pull: () => readAbort.abort() }), { headers: { "content-type": "application/json" } }),
      signal: readAbort.signal,
    })).resolves.toEqual({ status: "unavailable", reason: "timeout" });
    await expect(run(unicameral, [new Response("{}", { headers: { "content-type": "application/json", "content-length": "262145" } })]))
      .resolves.toEqual({ status: "unavailable", reason: "oversize" });
  });
});

function run(
  jurisdiction: StateJurisdiction,
  responses: readonly unknown[],
  checkedAt = CHECKED_AT,
) {
  let index = 0;
  return fetchStateLegislators(jurisdiction, {
    apiKey: API_KEY,
    checkedAt,
    fetch: async () => jsonResponse(responses[index++] ?? emptyPage),
    signal: new AbortController().signal,
  });
}

function jurisdictionFor(state: string): StateJurisdiction {
  if (!Object.hasOwn(VETTED_LEGISLATIVE_HOSTS, state)) {
    throw new Error(`Missing vetted host fixture for ${state}.`);
  }
  const lowerState = state.toLowerCase();
  const upper = {
    chamber: "upper" as const,
    district: "1",
    divisionId: `ocd-division/country:us/state:${lowerState}/sldu:1`,
  };
  return {
    stateCode: state,
    stateDivisionId: `ocd-division/country:us/state:${lowerState}`,
    jurisdictionId: `ocd-jurisdiction/country:us/state:${lowerState}/government`,
    legislature: state === "NE" ? "unicameral" : "bicameral",
    districts: state === "NE"
      ? [upper]
      : [
          upper,
          {
            chamber: "lower",
            district: "1",
            divisionId: `ocd-division/country:us/state:${lowerState}/sldl:1`,
          },
        ],
  };
}

function officialPageFor(jurisdiction: StateJurisdiction, sourceUrl: string): MutableFixturePage {
  return mutate(bicameralPage1, (page) => {
    const district = jurisdiction.districts[0]!;
    page.results[0].jurisdiction.id = jurisdiction.jurisdictionId;
    page.results[0].current_role.org_classification = district.chamber;
    page.results[0].current_role.district = district.district;
    page.results[0].current_role.division_id = district.divisionId;
    page.results[0].sources = [{ url: sourceUrl }];
  });
}

function jsonResponse(body: unknown) {
  if (body instanceof Response) return body;
  if (typeof body === "string") return new Response(body, { headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function mutate(value: unknown, change: (copy: MutableFixturePage) => void): MutableFixturePage {
  const copy = clonePage(value);
  change(copy);
  return copy;
}
function duplicatePersonPage() {
  const page = clonePage(multiMemberPage);
  page.results[1].id = page.results[0].id;
  return page;
}
type MutableFixturePage = {
  results: MutableFixturePerson[];
  pagination: { per_page: number; page: number; max_page: number; total_items: number };
};
type MutableFixturePerson = {
  id: string;
  name: string;
  jurisdiction: { id: string; name: string; classification: string };
  current_role: { title: string; org_classification: string; district: string | number; division_id: string };
  sources: Array<{ url: string; note?: string }>;
  updated_at: string;
  [key: string]: unknown;
};
function clonePage(value: unknown): MutableFixturePage { return structuredClone(value) as MutableFixturePage; }

const adapterContract: FetchStateLegislators = fetchStateLegislators;
void adapterContract;
