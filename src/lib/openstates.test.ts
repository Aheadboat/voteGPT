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
import {
  stateJurisdictionFromDivisions,
  type StateJurisdiction,
} from "./state-officials";

vi.mock("server-only", () => ({}));

const CHECKED_AT = "2026-07-31T12:00:00.000Z";
const API_KEY = "test-openstates-key";
const pinnedProfileUrls = {
  AZ: "https://www.azleg.gov/house-member/?legislature=57&session=129&legislator=2355",
  KY: "https://legislature.ky.gov/Legislators/Pages/Legislator-Profile.aspx?DistrictNumber=80",
  MT: "https://legislators.legmt.gov/#/legislator/1553",
  NM: "https://www.nmlegis.gov/Members/Legislator?SponCode=HREGA",
  TX: "https://senate.texas.gov/member.php?d=14",
} as const;

const bicameral: StateJurisdiction = {
  stateCode: "CA",
  stateDivisionId: "ocd-division/country:us/state:ca",
  jurisdictionId: "ocd-jurisdiction/country:us/state:ca/government",
  legislature: "bicameral",
  districts: [
    { chamber: "upper", district: "2", providerTargets: [{ label: "2", divisionId: "ocd-division/country:us/state:ca/sldu:2" }], divisionId: "ocd-division/country:us/state:ca/sldu:2" },
    { chamber: "lower", district: "10", providerTargets: [{ label: "10", divisionId: "ocd-division/country:us/state:ca/sldl:10" }], divisionId: "ocd-division/country:us/state:ca/sldl:10" },
  ],
};

const unicameral: StateJurisdiction = {
  ...bicameral,
  stateCode: "NE",
  stateDivisionId: "ocd-division/country:us/state:ne",
  jurisdictionId: "ocd-jurisdiction/country:us/state:ne/government",
  legislature: "unicameral",
  districts: [
    { chamber: "upper", district: "8", providerTargets: [{ label: "8", divisionId: "ocd-division/country:us/state:ne/sldu:8" }], divisionId: "ocd-division/country:us/state:ne/sldu:8" },
  ],
};

const namedMassachusetts: StateJurisdiction = {
  stateCode: "MA",
  stateDivisionId: "ocd-division/country:us/state:ma",
  jurisdictionId: "ocd-jurisdiction/country:us/state:ma/government",
  legislature: "bicameral",
  districts: [
    {
      chamber: "upper",
      district: "worcester_and_middlesex",
      providerTargets: [{
        label: "Worcester and Middlesex",
        divisionId: "ocd-division/country:us/state:ma/sldu:worcester_and_middlesex",
      }],
      divisionId: "ocd-division/country:us/state:ma/sldu:worcester_and_middlesex",
    },
    {
      chamber: "lower",
      district: "3rd_suffolk",
      providerTargets: [{
        label: "3rd Suffolk",
        divisionId: "ocd-division/country:us/state:ma/sldl:3rd_suffolk",
      }],
      divisionId: "ocd-division/country:us/state:ma/sldl:3rd_suffolk",
    },
  ],
};

const VETTED_LEGISLATIVE_HOSTS = {
  AK: { name: "Alaska", hosts: ["akleg.gov"] },
  AL: { name: "Alabama", hosts: ["legislature.state.al.us"] },
  AR: { name: "Arkansas", hosts: ["arkleg.state.ar.us"] },
  AZ: { name: "Arizona", hosts: ["azleg.gov"] },
  CA: { name: "California", hosts: ["assembly.ca.gov", "senate.ca.gov"] },
  CO: { name: "Colorado", hosts: ["leg.colorado.gov"] },
  CT: { name: "Connecticut", hosts: ["cga.ct.gov"] },
  DE: { name: "Delaware", hosts: ["legis.delaware.gov"] },
  FL: { name: "Florida", hosts: ["flsenate.gov", "myfloridahouse.gov", "flhouse.gov"] },
  GA: { name: "Georgia", hosts: ["legis.ga.gov", "house.ga.gov", "senate.ga.gov"] },
  HI: { name: "Hawaii", hosts: ["capitol.hawaii.gov"] },
  IA: { name: "Iowa", hosts: ["legis.iowa.gov", "senate.iowa.gov"] },
  ID: { name: "Idaho", hosts: ["legislature.idaho.gov"] },
  IL: { name: "Illinois", hosts: ["ilga.gov"] },
  IN: { name: "Indiana", hosts: ["iga.in.gov"] },
  KS: { name: "Kansas", hosts: ["kslegislature.gov", "kslegislature.org"] },
  KY: { name: "Kentucky", hosts: ["legislature.ky.gov", "lrc.ky.gov"] },
  LA: { name: "Louisiana", hosts: ["house.louisiana.gov", "senate.la.gov"] },
  MA: { name: "Massachusetts", hosts: ["malegislature.gov"] },
  MD: { name: "Maryland", hosts: ["mgaleg.maryland.gov"] },
  ME: { name: "Maine", hosts: ["legislature.maine.gov"] },
  MI: { name: "Michigan", hosts: ["house.mi.gov", "senate.michigan.gov"] },
  MN: { name: "Minnesota", hosts: ["house.mn.gov", "house.leg.state.mn.us", "senate.mn"] },
  MO: { name: "Missouri", hosts: ["house.mo.gov", "senate.mo.gov"] },
  MS: { name: "Mississippi", hosts: ["billstatus.ls.state.ms.us", "legislature.ms.gov"] },
  MT: { name: "Montana", hosts: ["leg.mt.gov", "legmt.gov"] },
  NC: { name: "North Carolina", hosts: ["ncleg.gov", "ncga.state.nc.us"] },
  ND: { name: "North Dakota", hosts: ["legis.nd.gov", "ndlegis.gov"] },
  NE: { name: "Nebraska", hosts: ["nebraskalegislature.gov"] },
  NH: { name: "New Hampshire", hosts: ["gencourt.state.nh.us", "gc.nh.gov"] },
  NJ: { name: "New Jersey", hosts: ["njleg.state.nj.us"] },
  NM: { name: "New Mexico", hosts: ["nmlegis.gov"] },
  NV: { name: "Nevada", hosts: ["leg.state.nv.us"] },
  NY: { name: "New York", hosts: ["assembly.state.ny.us", "nyassembly.gov", "nysenate.gov"] },
  OH: { name: "Ohio", hosts: ["legislature.ohio.gov", "ohiohouse.gov", "ohiosenate.gov"] },
  OK: { name: "Oklahoma", hosts: ["okhouse.gov", "oksenate.gov", "oklegislature.gov"] },
  OR: { name: "Oregon", hosts: ["oregonlegislature.gov"] },
  PA: { name: "Pennsylvania", hosts: ["legis.state.pa.us", "palegis.us"] },
  RI: { name: "Rhode Island", hosts: ["rilegislature.gov", "rilin.state.ri.us"] },
  SC: { name: "South Carolina", hosts: ["scstatehouse.gov"] },
  SD: { name: "South Dakota", hosts: ["sdlegislature.gov", "legis.sd.gov"] },
  TN: { name: "Tennessee", hosts: ["capitol.tn.gov", "legislature.state.tn.us"] },
  TX: { name: "Texas", hosts: ["house.texas.gov", "senate.texas.gov", "capitol.texas.gov"] },
  UT: { name: "Utah", hosts: ["le.utah.gov", "house.utah.gov", "house.utleg.gov", "senate.utah.gov"] },
  VA: { name: "Virginia", hosts: ["virginiageneralassembly.gov", "lis.virginia.gov", "senate.virginia.gov", "house.vga.virginia.gov"] },
  VT: { name: "Vermont", hosts: ["legislature.vermont.gov"] },
  WA: { name: "Washington", hosts: ["leg.wa.gov"] },
  WI: { name: "Wisconsin", hosts: ["legis.wisconsin.gov"] },
  WV: { name: "West Virginia", hosts: ["wvlegislature.gov", "legis.state.wv.us"] },
  WY: { name: "Wyoming", hosts: ["wyoleg.gov", "legisweb.state.wy.us"] },
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
              sources: [{ sourceType: "official", publicUrl: "https://www.senate.ca.gov/members/alex-rivera", retrievedAt: CHECKED_AT, effectiveAt: null }],
            }],
          },
          {
            chamber: "lower", district: "10", seat: "State Representative", vacancySources: [],
            people: [{
              id: "ocd-person/blair-chen", name: "Blair Chen",
              role: { chamber: "lower", district: "10", seat: "State Representative", current: true },
              sources: [{ sourceType: "official", publicUrl: "https://www.assembly.ca.gov/members/blair-chen", retrievedAt: CHECKED_AT, effectiveAt: null }],
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

  it("queries named Massachusetts districts by provider label while preserving OCD identity", async () => {
    const pages = [
      mutate(bicameralPage1, (page) => {
        page.results[0].jurisdiction.id = namedMassachusetts.jurisdictionId;
        page.results[0].jurisdiction.name = "Massachusetts";
        page.results[0].current_role.district = "Worcester and Middlesex";
        page.results[0].current_role.division_id = namedMassachusetts.districts[0]!.divisionId;
        page.results[0].sources = [{ url: "https://malegislature.gov/Legislators/Profile/example-upper" }];
      }),
      mutate(bicameralPage2, (page) => {
        page.results[0].jurisdiction.id = namedMassachusetts.jurisdictionId;
        page.results[0].jurisdiction.name = "Massachusetts";
        page.results[0].current_role.district = "3rd Suffolk";
        page.results[0].current_role.division_id = namedMassachusetts.districts[1]!.divisionId;
        page.results[0].sources = [{ url: "https://malegislature.gov/Legislators/Profile/example-lower" }];
      }),
    ];
    const requests: string[] = [];
    const result = await fetchStateLegislators(namedMassachusetts, {
      apiKey: API_KEY,
      checkedAt: CHECKED_AT,
      fetch: async (url) => {
        requests.push(String(url));
        return jsonResponse(pages[requests.length - 1]);
      },
      signal: new AbortController().signal,
    });

    expect(requests.map((value) => new URL(value).searchParams.get("district"))).toEqual([
      "Worcester and Middlesex",
      "3rd Suffolk",
    ]);
    expect(result).toMatchObject({
      status: "available",
      roster: {
        seats: [
          { chamber: "upper", district: "Worcester and Middlesex" },
          { chamber: "lower", district: "3rd Suffolk" },
        ],
      },
    });
  });

  it("queries the literal Massachusetts upper ordinal label evidenced by current roles", async () => {
    const canonical = stateJurisdictionFromDivisions([
      { type: "state", name: "Massachusetts", id: "ocd-division/country:us/state:ma", idScheme: "ocd" },
      { type: "state_upper", name: "First Bristol and Plymouth", id: "ocd-division/country:us/state:ma/sldu:1st_bristol_and_plymouth", idScheme: "ocd" },
      { type: "state_lower", name: "3rd Suffolk", id: "ocd-division/country:us/state:ma/sldl:3rd_suffolk", idScheme: "ocd" },
    ]);
    expect(canonical.status).toBe("available");
    if (canonical.status !== "available") throw new Error("Expected Massachusetts jurisdiction.");
    const pages = [
      mutate(bicameralPage1, (page) => {
        page.results[0].jurisdiction.id = canonical.jurisdiction.jurisdictionId;
        page.results[0].jurisdiction.name = "Massachusetts";
        page.results[0].current_role.district = "First Bristol and Plymouth";
        page.results[0].current_role.division_id = canonical.jurisdiction.districts[0]!.divisionId;
        page.results[0].sources = [{ url: "https://malegislature.gov/Legislators/Profile/example-upper" }];
      }),
      mutate(bicameralPage2, (page) => {
        page.results[0].jurisdiction.id = canonical.jurisdiction.jurisdictionId;
        page.results[0].jurisdiction.name = "Massachusetts";
        page.results[0].current_role.district = "3rd Suffolk";
        page.results[0].current_role.division_id = canonical.jurisdiction.districts[1]!.divisionId;
        page.results[0].sources = [{ url: "https://malegislature.gov/Legislators/Profile/example-lower" }];
      }),
    ];
    const requests: string[] = [];

    const result = await fetchStateLegislators(canonical.jurisdiction, {
      apiKey: API_KEY,
      checkedAt: CHECKED_AT,
      fetch: async (url) => {
        requests.push(String(url));
        return jsonResponse(pages[requests.length - 1]);
      },
      signal: new AbortController().signal,
    });

    expect(requests.map((value) => new URL(value).searchParams.get("district"))).toEqual([
      "First Bristol and Plymouth",
      "3rd Suffolk",
    ]);
    expect(result).toMatchObject({ status: "available" });
  });

  it("combines exact Idaho 1A and 1B role queries under canonical lower division 1", async () => {
    const canonical = stateJurisdictionFromDivisions([
      { type: "state", name: "Idaho", id: "ocd-division/country:us/state:id", idScheme: "ocd" },
      { type: "state_upper", name: "1", id: "ocd-division/country:us/state:id/sldu:1", idScheme: "ocd" },
      { type: "state_lower", name: "1", id: "ocd-division/country:us/state:id/sldl:1", idScheme: "ocd" },
    ]);
    expect(canonical.status).toBe("available");
    if (canonical.status !== "available") throw new Error("Expected Idaho jurisdiction.");
    const upper = mutate(bicameralPage1, (page) => {
      page.results[0].jurisdiction.id = canonical.jurisdiction.jurisdictionId;
      page.results[0].jurisdiction.name = "Idaho";
      page.results[0].current_role.district = "1";
      page.results[0].current_role.division_id = canonical.jurisdiction.districts[0]!.divisionId;
      page.results[0].sources = [{ url: "https://legislature.idaho.gov/legislators/membership/" }];
    });
    const lowerA = mutate(bicameralPage2, (page) => {
      page.results[0].id = "ocd-person/idaho-1a";
      page.results[0].name = "Idaho Representative A";
      page.results[0].jurisdiction.id = canonical.jurisdiction.jurisdictionId;
      page.results[0].jurisdiction.name = "Idaho";
      page.results[0].current_role.district = "1A";
      page.results[0].current_role.division_id = "ocd-division/country:us/state:id/sldl:1a";
      page.results[0].sources = [{ url: "https://legislature.idaho.gov/legislators/membership/" }];
    });
    const lowerB = mutate(bicameralPage2, (page) => {
      page.results[0].id = "ocd-person/idaho-1b";
      page.results[0].name = "Idaho Representative B";
      page.results[0].jurisdiction.id = canonical.jurisdiction.jurisdictionId;
      page.results[0].jurisdiction.name = "Idaho";
      page.results[0].current_role.district = "1B";
      page.results[0].current_role.division_id = "ocd-division/country:us/state:id/sldl:1b";
      page.results[0].sources = [{ url: "https://legislature.idaho.gov/legislators/membership/" }];
    });
    const pages = [upper, lowerA, lowerB];
    const requests: string[] = [];

    const result = await fetchStateLegislators(canonical.jurisdiction, {
      apiKey: API_KEY,
      checkedAt: CHECKED_AT,
      fetch: async (url) => {
        requests.push(String(url));
        return jsonResponse(pages[requests.length - 1]);
      },
      signal: new AbortController().signal,
    });

    expect(requests.map((value) => new URL(value).searchParams.get("district"))).toEqual([
      "1",
      "1A",
      "1B",
    ]);
    expect(result).toMatchObject({
      status: "available",
      roster: {
        seats: [
          { chamber: "upper", district: "1" },
          { chamber: "lower", district: "1A" },
          { chamber: "lower", district: "1B" },
        ],
      },
    });
  });

  it("continues from an empty Idaho target to the second exact lower target", async () => {
    const canonical = idahoJurisdiction();
    const result = await run(canonical, [
      idahoPage(canonical, "upper", "1", canonical.districts[0]!.divisionId, "idaho-upper"),
      emptyPage,
      idahoPage(
        canonical,
        "lower",
        "1B",
        "ocd-division/country:us/state:id/sldl:1b",
        "idaho-lower-b",
      ),
    ]);

    expect(result).toMatchObject({
      status: "available",
      roster: { seats: [
        { chamber: "upper", district: "1" },
        { chamber: "lower", district: "1B" },
      ] },
    });
  });

  it.each([
    ["swapped", "ocd-division/country:us/state:id/sldl:1b"],
    ["unlisted", "ocd-division/country:us/state:id/sldl:1c"],
  ])("rejects a %s Idaho provider division for the 1A target", async (_label, divisionId) => {
    const canonical = idahoJurisdiction();
    await expect(run(canonical, [
      idahoPage(canonical, "upper", "1", canonical.districts[0]!.divisionId, "idaho-upper"),
      idahoPage(canonical, "lower", "1A", divisionId, "idaho-lower-a"),
    ])).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("rejects a duplicate person returned by both Idaho lower targets", async () => {
    const canonical = idahoJurisdiction();
    await expect(run(canonical, [
      idahoPage(canonical, "upper", "1", canonical.districts[0]!.divisionId, "idaho-upper"),
      idahoPage(
        canonical,
        "lower",
        "1A",
        "ocd-division/country:us/state:id/sldl:1a",
        "duplicate-idaho-person",
      ),
      idahoPage(
        canonical,
        "lower",
        "1B",
        "ocd-division/country:us/state:id/sldl:1b",
        "duplicate-idaho-person",
      ),
    ])).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("enforces one aggregate person bound across Idaho provider targets", async () => {
    const canonical = idahoJurisdiction();
    const lowerAPages = Array.from({ length: 5 }, (_, page) =>
      idahoRosterPage(
        canonical,
        "1A",
        "ocd-division/country:us/state:id/sldl:1a",
        page + 1,
        100,
        page * 20,
        20,
      ),
    );

    await expect(run(canonical, [
      emptyPage,
      ...lowerAPages,
      idahoPage(
        canonical,
        "lower",
        "1B",
        "ocd-division/country:us/state:id/sldl:1b",
        "idaho-lower-b",
      ),
    ])).resolves.toEqual({ status: "unavailable", reason: "oversize" });
  });

  it("queries the literal Maryland 1C provider subdistrict", async () => {
    const canonical = stateJurisdictionFromDivisions([
      { type: "state", name: "Maryland", id: "ocd-division/country:us/state:md", idScheme: "ocd" },
      { type: "state_upper", name: "1", id: "ocd-division/country:us/state:md/sldu:1", idScheme: "ocd" },
      { type: "state_lower", name: "1C", id: "ocd-division/country:us/state:md/sldl:1c", idScheme: "ocd" },
    ]);
    expect(canonical.status).toBe("available");
    if (canonical.status !== "available") throw new Error("Expected Maryland jurisdiction.");
    const pages = [
      mutate(bicameralPage1, (page) => {
        page.results[0].jurisdiction.id = canonical.jurisdiction.jurisdictionId;
        page.results[0].jurisdiction.name = "Maryland";
        page.results[0].current_role.district = "1";
        page.results[0].current_role.division_id = canonical.jurisdiction.districts[0]!.divisionId;
        page.results[0].sources = [{ url: "https://mgaleg.maryland.gov/mgawebsite/Members/Details/example-upper" }];
      }),
      mutate(bicameralPage2, (page) => {
        page.results[0].jurisdiction.id = canonical.jurisdiction.jurisdictionId;
        page.results[0].jurisdiction.name = "Maryland";
        page.results[0].current_role.district = "1C";
        page.results[0].current_role.division_id = canonical.jurisdiction.districts[1]!.divisionId;
        page.results[0].sources = [{ url: "https://mgaleg.maryland.gov/mgawebsite/Members/Details/example-lower" }];
      }),
    ];
    const requests: string[] = [];
    const result = await fetchStateLegislators(canonical.jurisdiction, {
      apiKey: API_KEY,
      checkedAt: CHECKED_AT,
      fetch: async (url) => {
        requests.push(String(url));
        return jsonResponse(pages[requests.length - 1]);
      },
      signal: new AbortController().signal,
    });

    expect(requests.map((value) => new URL(value).searchParams.get("district"))).toEqual(["1", "1C"]);
    expect(result).toMatchObject({
      status: "available",
      roster: { seats: [{ chamber: "upper", district: "1" }, { chamber: "lower", district: "1C" }] },
    });
  });

  it("queries the current Vermont canonical district through its exact provider target", async () => {
    const canonical = vermontJurisdiction();
    const pages = [
      vermontPage(canonical, "ocd-division/country:us/state:vt/sldu:grand_isle"),
      emptyPage,
    ];
    const requests: string[] = [];

    const result = await fetchStateLegislators(canonical, {
      apiKey: API_KEY,
      checkedAt: CHECKED_AT,
      fetch: async (url) => {
        requests.push(String(url));
        return jsonResponse(pages[requests.length - 1]);
      },
      signal: new AbortController().signal,
    });

    expect(requests.map((value) => new URL(value).searchParams.get("district"))).toEqual([
      "Grand Isle",
      "Addison-1",
    ]);
    expect(result).toMatchObject({
      status: "available",
      roster: { seats: [{ chamber: "upper", district: "Grand Isle" }] },
    });
  });

  it("rejects a Vermont response using the canonical rather than provider division", async () => {
    const canonical = vermontJurisdiction();

    await expect(run(canonical, [
      vermontPage(canonical, "ocd-division/country:us/state:vt/sldu:grand_isle-chittenden"),
      emptyPage,
    ])).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("normalizes unicameral, multi-member, and verified-empty coverage without inventing a vacancy", async () => {
    const unicameralPage = mutate(bicameralPage1, (page) => {
      page.results[0].jurisdiction.id = unicameral.jurisdictionId;
      page.results[0].jurisdiction.name = "Nebraska";
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

  it("validates provider record-update times without presenting them as role-effective dates", async () => {
    const offsetPage = mutate(bicameralPage1, (page) => {
      page.results[0].updated_at = "2026-07-01T05:30:00-04:00";
    });
    const microsecondPage = mutate(bicameralPage2, (page) => {
      page.results[0].updated_at = "2026-07-02T00:00:00.123456Z";
    });

    await expect(run(bicameral, [offsetPage, microsecondPage])).resolves.toMatchObject({
      status: "available",
      roster: { seats: [
        { people: [{ sources: [{ effectiveAt: null }] }] },
        { people: [{ sources: [{ effectiveAt: null }] }] },
      ] },
    });
    await expect(run(unicameral, [emptyPage], "2026-07-31T08:00:00-04:00"))
      .resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("retains only bounded, deduplicated institutional sources without rejecting well-formed extras", async () => {
    const officialUrl = "https://members.senate.ca.gov/members/alex-rivera?session=2025-2026&id=42";
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

  it.each([
    ["Arizona House with current session", "AZ", pinnedProfileUrls.AZ],
    [
      "Arizona Senate without optional session",
      "AZ",
      "https://www.azleg.gov/senate-member/?legislature=57&legislator=2293",
    ],
    ["Kentucky", "KY", pinnedProfileUrls.KY],
    ["Montana", "MT", pinnedProfileUrls.MT],
    ["New Mexico", "NM", pinnedProfileUrls.NM],
    [
      "New Mexico lower-case members path",
      "NM",
      "https://www.nmlegis.gov/members/Legislator?SponCode=SABCD",
    ],
    ["Texas Senate", "TX", pinnedProfileUrls.TX],
    [
      "Texas Senate District 30 www host",
      "TX",
      "https://www.senate.texas.gov/member.php?d=30",
    ],
  ] as const)("accepts the pinned %s official profile route", async (_label, state, sourceUrl) => {
    const result = await runSourceUrls(state, [sourceUrl]);

    expect(result).toMatchObject({ status: "available" });
    if (result.status !== "available") throw new Error(`Expected ${state} profile route.`);
    expect(result.roster.seats[0]?.people[0]?.sources).toEqual([
      expect.objectContaining({ publicUrl: sourceUrl }),
    ]);
  });

  it.each([
    ["unknown query", "https://senate.ca.gov/member?sort=alpha"],
    ["location query", "https://senate.ca.gov/member?address=1-main"],
  ])("skips a policy-denied live %s while retaining the approved source", async (_label, denied) => {
    const allowed = "https://senate.ca.gov/member";
    const result = await runSourceUrls("CA", [allowed, denied]);

    expect(result).toMatchObject({ status: "available" });
    if (result.status !== "available") throw new Error("Expected approved source to survive filtering.");
    expect(result.roster.seats[0]?.people[0]?.sources).toEqual([
      expect.objectContaining({ publicUrl: allowed }),
    ]);
    expect(result.roster.seats[0]?.people[0]?.sources).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ publicUrl: denied })]),
    );
  });

  it("keeps a policy-denied-only live profile unavailable", async () => {
    await expect(runSourceUrls("CA", ["https://senate.ca.gov/member?sort=alpha"]))
      .resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("does not skip a malformed URL beside an approved source", async () => {
    const invalidUrl = "not-a-url";
    await expect(runSourceUrls("CA", ["https://senate.ca.gov/member", invalidUrl]))
      .resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it.each([
    ["AZ", `${pinnedProfileUrls.AZ}&sort=alpha`, "unknown parameter"],
    ["AZ", `${pinnedProfileUrls.AZ}&address=1-main`, "location parameter"],
    ["AZ", `${pinnedProfileUrls.AZ}&legislator=2356`, "duplicate parameter"],
    ["AZ", "https://www.azleg.gov/member/?legislature=57&session=129&legislator=2355", "wrong path"],
    ["AZ", "https://www.azleg.gov/house-member/?legislature=56&session=129&legislator=2355", "wrong legislature"],
    ["AZ", "https://www.azleg.gov/house-member/?legislature=57&session=130&legislator=2355", "wrong session"],
    ["AZ", "https://www.azleg.gov/house-member/?legislature=57&session=129&legislator=355", "bad legislator"],
    ["KY", `${pinnedProfileUrls.KY}&sort=alpha`, "unknown parameter"],
    ["KY", `${pinnedProfileUrls.KY}&DistrictNumber=81`, "duplicate parameter"],
    ["KY", "https://legislature.ky.gov/legislators/pages/legislator-profile.aspx?DistrictNumber=80", "wrong path case"],
    ["KY", "https://legislature.ky.gov/Legislators/Pages/Legislator-Profile.aspx?DistrictNumber=8A", "bad district"],
    ["MT", "https://legislators.legmt.gov/#/legislator/not-numeric", "bad legislator"],
    ["MT", "https://legislators.legmt.gov/member/#/legislator/1553", "wrong path"],
    ["MT", "https://legislators.legmt.gov/#/Legislator/1553", "wrong fragment case"],
    ["MT", "https://legislators.legmt.gov/?id=1553#/legislator/1553", "unexpected query"],
    ["NM", `${pinnedProfileUrls.NM}&sort=alpha`, "unknown parameter"],
    ["NM", `${pinnedProfileUrls.NM}&SponCode=SABCD`, "duplicate parameter"],
    ["NM", "https://www.nmlegis.gov/MEMBERS/Legislator?SponCode=HREGA", "wrong path case"],
    ["NM", "https://www.nmlegis.gov/Members/Legislator?SponCode=XABCD", "bad sponsor chamber"],
    ["NM", "https://www.nmlegis.gov/Members/Legislator?SponCode=HABC", "short sponsor code"],
    ["TX", `${pinnedProfileUrls.TX}&sort=alpha`, "unknown parameter"],
    ["TX", `${pinnedProfileUrls.TX}&d=15`, "duplicate parameter"],
    ["TX", "https://senate.texas.gov/members.php?d=14", "wrong path"],
    ["TX", "https://senate.texas.gov/member.php?d=0", "district below range"],
    ["TX", "https://senate.texas.gov/member.php?d=32", "district above range"],
  ] as const)(
    "excludes the %s pinned-route near miss: %s",
    async (state, deniedUrl, reason) => {
      const allowedUrl = pinnedProfileUrls[state];
      const result = await runSourceUrls(state, [allowedUrl, deniedUrl]);

      expect(result, `${state} ${reason}`).toMatchObject({ status: "available" });
      if (result.status !== "available") throw new Error(`Expected ${state} near miss filtering.`);
      expect(result.roster.seats[0]?.people[0]?.sources).toEqual([
        expect.objectContaining({ publicUrl: allowedUrl }),
      ]);
      expect(result.roster.seats[0]?.people[0]?.sources).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ publicUrl: deniedUrl })]),
      );
    },
  );

  it.each([
    ["host sibling", "https://district30.senate.texas.gov/member.php?d=30"],
    ["host spoof", "https://www.senate.texas.gov.attacker.example/member.php?d=30"],
  ])("rejects pinned-route %s", async (_label, sourceUrl) => {
    await expect(runSourceUrls("TX", [sourceUrl]))
      .resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("keeps Connecticut FTP-only coverage unavailable", async () => {
    const connecticut = jurisdictionFor("CT");
    const page = officialPageFor(
      connecticut,
      "ftp://ftp.cga.ct.gov/pub/data/people/profile.html",
    );

    await expect(run(connecticut, [page, emptyPage]))
      .resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("accepts only normalized query keys evidenced by public legislative sources", async () => {
    const publicQueries = [
      "body=S",
      "CHAMBER=H",
      "code=abc",
      "dd-Biennium_Session=94",
      "District=8",
      "GA=104",
      "id=42",
      "LegislativeTermId=90",
      "member=294",
      "Member_ID%5B%5D=4879",
      "mem_id=1270",
      "personId=9",
      "pid=10621",
      "session=34",
      "Session_ID=2026",
      "session-select=2026",
      "sid=42",
      "year=2026",
    ];

    for (const query of publicQueries) {
      const page = mutate(bicameralPage1, (value) => {
        value.results[0].sources = [{ url: `https://senate.ca.gov/member?${query}` }];
      });
      await expect(run(bicameral, [page, bicameralPage2]), query)
        .resolves.toMatchObject({ status: "available" });
    }
  });

  it("rejects location, identity, credential, and unknown query keys after stable normalization", async () => {
    const forbiddenQueries = [
      "Address=1-main",
      "street_address=1-main",
      "LOCATION%5B%5D=private",
      "lat=38.5",
      "l-n-g=-121.5",
      "coordinates=38.5%2C-121.5",
      "USER=person-1",
      "user_id=person-1",
      "email=person%40example.com",
      "account=person-1",
      "api-key=secret",
      "TOKEN=secret",
      "secret%5B%5D=value",
      "auth=value",
      "pass_word=value",
      "sort=alpha",
    ];

    for (const query of forbiddenQueries) {
      const page = mutate(bicameralPage1, (value) => {
        value.results[0].sources = [{ url: `https://senate.ca.gov/member?${query}` }];
      });
      await expect(run(bicameral, [page, bicameralPage2]), query)
        .resolves.toEqual({ status: "unavailable", reason: "malformed" });
    }
  });

  it("uses the complete state-scoped legislative host policy, including vetted non-.gov roots", async () => {
    expect(Object.keys(VETTED_LEGISLATIVE_HOSTS)).toHaveLength(50);
    for (const [state, { hosts }] of Object.entries(VETTED_LEGISLATIVE_HOSTS)) {
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

  it.each([
    ["AZ", "https://azleg.gov/member"],
    ["KY", "https://legislature.ky.gov/member"],
    ["MT", "https://leg.mt.gov/member"],
    ["NM", "https://nmlegis.gov/member"],
    ["TX", "https://senate.texas.gov/member"],
  ] as const)("keeps ordinary queryless %s official URLs available", async (state, sourceUrl) => {
    await expect(runSourceUrls(state, [sourceUrl])).resolves.toMatchObject({ status: "available" });
  });

  it("fails closed without a state-matched institutional source and protects trusted URLs", async () => {
    for (const sourceUrl of [
      "https://www.nysenate.gov/legislators/bio/example",
      "https://www.whitehouse.gov/briefing-room/",
      "https://housedems.ct.gov/example",
      "https://senate.ca.gov.attacker.example/member",
      "https://evil-senate.ca.gov/member",
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

function idahoJurisdiction(): StateJurisdiction {
  const result = stateJurisdictionFromDivisions([
    { type: "state", name: "Idaho", id: "ocd-division/country:us/state:id", idScheme: "ocd" },
    { type: "state_upper", name: "1", id: "ocd-division/country:us/state:id/sldu:1", idScheme: "ocd" },
    { type: "state_lower", name: "1", id: "ocd-division/country:us/state:id/sldl:1", idScheme: "ocd" },
  ]);
  if (result.status !== "available") throw new Error("Expected Idaho jurisdiction.");
  return result.jurisdiction;
}

function vermontJurisdiction(): StateJurisdiction {
  const result = stateJurisdictionFromDivisions([
    { type: "state", name: "Vermont", id: "ocd-division/country:us/state:vt", idScheme: "ocd" },
    { type: "state_upper", name: "Grand Isle-Chittenden", id: "ocd-division/country:us/state:vt/sldu:grand_isle-chittenden", idScheme: "ocd" },
    { type: "state_lower", name: "Addison-1", id: "ocd-division/country:us/state:vt/sldl:addison-1", idScheme: "ocd" },
  ]);
  if (result.status !== "available") throw new Error("Expected current Vermont jurisdiction.");
  return result.jurisdiction;
}

function vermontPage(jurisdiction: StateJurisdiction, divisionId: string) {
  return mutate(bicameralPage1, (page) => {
    page.results[0].id = "ocd-person/vermont-grand-isle";
    page.results[0].name = "Vermont Senator";
    page.results[0].jurisdiction.id = jurisdiction.jurisdictionId;
    page.results[0].jurisdiction.name = "Vermont";
    page.results[0].current_role.org_classification = "upper";
    page.results[0].current_role.district = "Grand Isle";
    page.results[0].current_role.division_id = divisionId;
    page.results[0].sources = [{ url: "https://legislature.vermont.gov/people/single/2026/123" }];
  });
}

function idahoPage(
  jurisdiction: StateJurisdiction,
  chamber: "upper" | "lower",
  label: string,
  divisionId: string,
  id: string,
) {
  return mutate(chamber === "upper" ? bicameralPage1 : bicameralPage2, (page) => {
    page.results[0].id = `ocd-person/${id}`;
    page.results[0].name = id;
    page.results[0].jurisdiction.id = jurisdiction.jurisdictionId;
    page.results[0].jurisdiction.name = "Idaho";
    page.results[0].current_role.org_classification = chamber;
    page.results[0].current_role.district = label;
    page.results[0].current_role.division_id = divisionId;
    page.results[0].sources = [{ url: "https://legislature.idaho.gov/legislators/membership/" }];
  });
}

function idahoRosterPage(
  jurisdiction: StateJurisdiction,
  label: string,
  divisionId: string,
  page: number,
  totalItems: number,
  offset: number,
  count: number,
) {
  const value = idahoPage(jurisdiction, "lower", label, divisionId, `${label}-${offset}`);
  const person = value.results[0]!;
  value.results = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(person),
    id: `ocd-person/${label}-${offset + index}`,
    name: `${label}-${offset + index}`,
  }));
  value.pagination = {
    per_page: 20,
    page,
    max_page: Math.ceil(totalItems / 20),
    total_items: totalItems,
  };
  return value;
}

function jurisdictionFor(state: string): StateJurisdiction {
  if (!Object.hasOwn(VETTED_LEGISLATIVE_HOSTS, state)) {
    throw new Error(`Missing vetted host fixture for ${state}.`);
  }
  const lowerState = state.toLowerCase();
  const upperDistrict = state === "AK"
    ? "a"
    : state === "MA"
      ? "worcester_and_middlesex"
      : state === "VT"
        ? "addison"
        : "1";
  const lowerDistrict = state === "ID"
    ? "1"
    : state === "MA"
      ? "3rd_suffolk"
      : state === "MN"
        ? "1a"
        : state === "NH"
          ? "belknap_1"
          : state === "VT"
            ? "addison-1"
            : "1";
  const canonical = stateJurisdictionFromDivisions([
    {
      type: "state",
      name: state,
      id: `ocd-division/country:us/state:${lowerState}`,
      idScheme: "ocd",
    },
    {
      type: "state_upper",
      name: upperDistrict,
      id: `ocd-division/country:us/state:${lowerState}/sldu:${upperDistrict}`,
      idScheme: "ocd",
    },
    ...(state === "NE" ? [] : [{
      type: "state_lower" as const,
      name: lowerDistrict,
      id: `ocd-division/country:us/state:${lowerState}/sldl:${lowerDistrict}`,
      idScheme: "ocd" as const,
    }]),
  ]);
  if (canonical.status !== "available") {
    throw new Error(`Missing canonical jurisdiction fixture for ${state}.`);
  }
  return canonical.jurisdiction;
}

function officialPageFor(jurisdiction: StateJurisdiction, sourceUrl: string): MutableFixturePage {
  const policy = VETTED_LEGISLATIVE_HOSTS[
    jurisdiction.stateCode as keyof typeof VETTED_LEGISLATIVE_HOSTS
  ];
  if (policy === undefined) throw new Error(`Missing vetted state fixture for ${jurisdiction.stateCode}.`);
  return mutate(bicameralPage1, (page) => {
    const district = jurisdiction.districts[0]!;
    page.results[0].jurisdiction.id = jurisdiction.jurisdictionId;
    page.results[0].jurisdiction.name = policy.name;
    page.results[0].current_role.org_classification = district.chamber;
    page.results[0].current_role.district = district.providerTargets[0].label;
    page.results[0].current_role.division_id = district.providerTargets[0].divisionId;
    page.results[0].sources = [{ url: sourceUrl }];
  });
}

function runSourceUrls(
  state: keyof typeof pinnedProfileUrls | "CA",
  sourceUrls: readonly string[],
) {
  const jurisdiction = jurisdictionFor(state);
  const page = officialPageFor(jurisdiction, sourceUrls[0]!);
  page.results[0]!.sources = sourceUrls.map((url) => ({ url }));
  return run(
    jurisdiction,
    jurisdiction.legislature === "unicameral" ? [page] : [page, emptyPage],
  );
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
