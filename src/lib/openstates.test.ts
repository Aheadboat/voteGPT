import { describe, expect, it } from "vitest";
import bicameralPage1 from "../../tests/fixtures/openstates/bicameral-page-1.json";
import bicameralPage2 from "../../tests/fixtures/openstates/bicameral-page-2.json";
import emptyPage from "../../tests/fixtures/openstates/empty.json";
import multiMemberPage from "../../tests/fixtures/openstates/multi-member.json";
import {
  fetchStateLegislators,
  type FetchStateLegislators,
} from "./openstates";
import type { StateJurisdiction } from "./state-officials";

const CHECKED_AT = "2026-07-31T12:00:00.000Z";
const API_KEY = "test-openstates-key";

const bicameral: StateJurisdiction = {
  stateCode: "EX",
  stateDivisionId: "ocd-division/country:us/state:ex",
  jurisdictionId: "ocd-jurisdiction/country:us/state:ex/government",
  legislature: "bicameral",
  districts: [
    { chamber: "upper", district: "2", divisionId: "ocd-division/country:us/state:ex/sldu:2" },
    { chamber: "lower", district: "10", divisionId: "ocd-division/country:us/state:ex/sldl:10" },
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
              sources: [{ sourceType: "official", publicUrl: "https://legislature.example.gov/members/alex-rivera", retrievedAt: CHECKED_AT, effectiveAt: "2026-07-01T00:00:00.000Z" }],
            }],
          },
          {
            chamber: "lower", district: "10", seat: "State Representative", vacancySources: [],
            people: [{
              id: "ocd-person/blair-chen", name: "Blair Chen",
              role: { chamber: "lower", district: "10", seat: "State Representative", current: true },
              sources: [{ sourceType: "official", publicUrl: "https://legislature.example.gov/members/blair-chen", retrievedAt: CHECKED_AT, effectiveAt: "2026-07-02T00:00:00.000Z" }],
            }],
          },
        ],
      },
    });
    expect(requests.map(({ url }) => url)).toEqual([
      "https://v3.openstates.org/people?jurisdiction=ocd-jurisdiction%2Fcountry%3Aus%2Fstate%3Aex%2Fgovernment&org_classification=upper&district=2&page=1&per_page=20",
      "https://v3.openstates.org/people?jurisdiction=ocd-jurisdiction%2Fcountry%3Aus%2Fstate%3Aex%2Fgovernment&org_classification=lower&district=10&page=1&per_page=20",
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
      roster: { seats: [
        { chamber: "lower", district: "10", seat: "Delegate", people: [{ id: "ocd-person/avery-morgan", name: "Avery Morgan" }] },
        { chamber: "lower", district: "10", seat: "Delegate Seat 2", people: [{ id: "ocd-person/casey-lee", name: "Casey Lee" }] },
      ] },
    });
    expect(emptyResult).toEqual({
      status: "available",
      roster: { freshness: { checkedAt: CHECKED_AT, refreshAfter: CHECKED_AT, staleAfter: CHECKED_AT, state: "fresh" }, seats: [] },
    });
  });

  it("requires complete bounded pagination and rejects contradictory, missing, or oversized coverage", async () => {
    const firstPage = clone(multiMemberPage);
    firstPage.pagination = { per_page: 20, page: 1, max_page: 2, total_items: 3 };
    const secondPage = clone(multiMemberPage);
    secondPage.results = [clone(multiMemberPage.results[0])];
    secondPage.results[0].id = "ocd-person/jordan-park";
    secondPage.results[0].name = "Jordan Park";
    secondPage.results[0].current_role.title = "Assistant Delegate";
    secondPage.pagination = { per_page: 20, page: 2, max_page: 2, total_items: 3 };
    const complete = await run(bicameral, [emptyPage, firstPage, secondPage]);
    const wrongPage = clone(secondPage);
    wrongPage.pagination.page = 1;
    const overLimit = clone(firstPage);
    overLimit.pagination.max_page = 6;
    overLimit.pagination.total_items = 101;

    expect(complete).toMatchObject({ status: "available", roster: { seats: [
      { seat: "Assistant Delegate" }, { seat: "Delegate" }, { seat: "Delegate Seat 2" },
    ] } });
    await expect(run(bicameral, [emptyPage, firstPage, wrongPage]))
      .resolves.toEqual({ status: "unavailable", reason: "partial" });
    await expect(run(bicameral, [emptyPage, overLimit]))
      .resolves.toEqual({ status: "unavailable", reason: "oversize" });
  });

  it("fails closed for malformed or privacy-bearing people data", async () => {
    const cases: Array<[string, unknown]> = [
      ["invalid JSON", "not-json"],
      ["missing identity", mutate(bicameralPage1, (page) => { Reflect.deleteProperty(page.results[0]!, "id"); })],
      ["duplicate identity", duplicatePersonPage()],
      ["duplicate role", duplicateRolePage()],
      ["wrong role", mutate(bicameralPage1, (page) => { page.results[0].current_role.org_classification = "lower"; })],
      ["wrong district", mutate(bicameralPage1, (page) => { page.results[0].current_role.district = "9"; })],
      ["missing current role", mutate(bicameralPage1, (page) => { Reflect.deleteProperty(page.results[0]!, "current_role"); })],
      ["future update", mutate(bicameralPage1, (page) => { page.results[0].updated_at = "2026-08-01T00:00:00.000Z"; })],
      ["unsafe source", mutate(bicameralPage1, (page) => { page.results[0].sources[0].url = "http://legislature.example.gov/member"; })],
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

function run(jurisdiction: StateJurisdiction, responses: readonly unknown[]) {
  let index = 0;
  return fetchStateLegislators(jurisdiction, {
    apiKey: API_KEY,
    checkedAt: CHECKED_AT,
    fetch: async () => jsonResponse(responses[index++] ?? emptyPage),
    signal: new AbortController().signal,
  });
}

function jsonResponse(body: unknown) {
  if (body instanceof Response) return body;
  if (typeof body === "string") return new Response(body, { headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function clone<T>(value: T): T { return structuredClone(value); }
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
function duplicateRolePage() {
  const page = clonePage(bicameralPage1);
  const duplicate = clone(page.results[0]);
  duplicate.id = "ocd-person/duplicate-role";
  duplicate.name = "Duplicate Role";
  duplicate.sources[0].url = "https://legislature.example.gov/members/duplicate-role";
  page.results.push(duplicate);
  page.pagination.total_items = 2;
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
