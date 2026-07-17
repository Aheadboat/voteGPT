import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import congressCurrentFixture from "../../tests/fixtures/congress-current.json";
import congressHouseFixture from "../../tests/fixtures/congress-house.json";
import congressMemberHouseFixture from "../../tests/fixtures/congress-member-house.json";
import congressMemberSenatorOneFixture from "../../tests/fixtures/congress-member-senator-one.json";
import congressMemberSenatorTwoFixture from "../../tests/fixtures/congress-member-senator-two.json";
import congressSenateFixture from "../../tests/fixtures/congress-senate.json";
import { fetchCongressRoster } from "./congress-gov";
import type {
  CongressRosterOutcome,
  FederalJurisdiction,
  FetchCongressRoster,
} from "./federal-officials";

// RED contract: this suite must first fail because the Congress adapter is absent.
// UX-01/02/03/04/06/07/09: source-backed equal seats, current timestamps,
// explicit unavailable states, no AI, and no precise residence in provider traffic.

const now = new Date("2026-07-16T12:00:00.000Z");
const apiKey = "SENTINEL_CONGRESS_API_KEY";
const jurisdiction: FederalJurisdiction = {
  stateCode: "CA",
  district: 12,
  divisionIds: [
    "ocd-division/country:us/state:ca",
    "ocd-division/country:us/state:ca/cd:12",
  ],
};
const consoleMethods = ["debug", "error", "info", "log", "warn"] as const;

type FixtureBundle = {
  current: typeof congressCurrentFixture;
  house: typeof congressHouseFixture;
  senate: typeof congressSenateFixture;
  houseDetail: typeof congressMemberHouseFixture;
  senatorOneDetail: typeof congressMemberSenatorOneFixture;
  senatorTwoDetail: typeof congressMemberSenatorTwoFixture;
};

beforeEach(() => {
  for (const method of consoleMethods) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  vi.useRealTimers();
  for (const method of consoleMethods) {
    expect(console[method]).not.toHaveBeenCalled();
  }
  vi.restoreAllMocks();
});

describe("Congress.gov current roster adapter", () => {
  it("discovers the current Congress and performs only the exact fixed-origin requests", async () => {
    expectTypeOf(fetchCongressRoster).toMatchTypeOf<FetchCongressRoster>();
    const providerFetch = fixtureFetch();

    const outcome = await lookup(providerFetch);

    expect(outcome.status).toBe("available");
    expect(providerFetch).toHaveBeenCalledTimes(6);
    expect(requestUrls(providerFetch)).toEqual([
      "https://api.congress.gov/v3/congress/current?format=json",
      "https://api.congress.gov/v3/member/congress/119/CA/12?currentMember=true&format=json",
      "https://api.congress.gov/v3/member/CA?currentMember=true&limit=250&format=json",
      "https://api.congress.gov/v3/member/H000001?format=json",
      "https://api.congress.gov/v3/member/S000001?format=json",
      "https://api.congress.gov/v3/member/S000002?format=json",
    ]);

    for (const [input, init] of providerFetch.mock.calls) {
      const url = new URL(toUrl(input));
      const headers = new Headers(init?.headers);
      expect(url.protocol).toBe("https:");
      expect(url.origin).toBe("https://api.congress.gov");
      expect(url.searchParams.has("api_key")).toBe(false);
      expect(url.searchParams.has("address")).toBe(false);
      expect(url.searchParams.has("latitude")).toBe(false);
      expect(url.searchParams.has("longitude")).toBe(false);
      expect(headers.get("X-Api-Key")).toBe(apiKey);
      expect(headers.get("Accept")).toBe("application/json");
      expect(init?.method).toBe("GET");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.body).toBeUndefined();
    }

    expect(JSON.stringify(outcome)).not.toContain(apiKey);
  });

  it("normalizes one House member and exactly two senators with provenance", async () => {
    const outcome = await lookup(fixtureFetch());
    const available = expectAvailable(outcome);

    expect(available.currentCongress).toBe(119);
    expect(available.house).toHaveLength(1);
    expect(available.senate).toHaveLength(2);
    expect(available.house[0]).toMatchObject({
      status: "serving",
      office: {
        chamber: "house",
        stateCode: "CA",
        district: 12,
        title: "U.S. Representative",
      },
      person: {
        id: "bioguide:H000001",
        bioguideId: "H000001",
        name: "Alex Rivera",
      },
      term: {
        congress: 119,
        startYear: 2025,
        endYear: null,
        status: "serving",
      },
      sources: [
        {
          publisher: "Congress.gov",
          sourceType: "member",
          url: "https://api.congress.gov/v3/member/H000001?format=json",
          retrievedAt: now.toISOString(),
          recordUpdatedAt: "2026-07-15T09:30:00.000Z",
          effectiveAt: null,
        },
      ],
    });
    expect(available.senate.map((seat) => seat.status)).toEqual([
      "serving",
      "serving",
    ]);
    expect(
      available.senate.map((seat) =>
        seat.status === "serving" ? seat.person.bioguideId : null,
      ),
    ).toEqual(["S000001", "S000002"]);

    const servingSeats = [...available.house, ...available.senate].filter(
      (seat) => seat.status === "serving",
    );
    for (const seat of servingSeats) {
      if (seat.status !== "serving") {
        throw new Error("Expected serving fixture seat.");
      }
      expect(seat.term.officeId).toBe(seat.office.id);
      expect(seat.term.personId).toBe(seat.person.id);
    }
  });

  it("uses a newly discovered Congress in the House request and all selected details", async () => {
    const fixtures = fixtureBundle();
    setCurrentCongress(fixtures, 120, "2027", "2028");
    const providerFetch = fixtureFetch(fixtures);

    const available = expectAvailable(
      await lookup(providerFetch, new Date("2028-07-16T12:00:00.000Z")),
    );

    expect(available.currentCongress).toBe(120);
    expect(requestUrls(providerFetch)[1]).toBe(
      "https://api.congress.gov/v3/member/congress/120/CA/12?currentMember=true&format=json",
    );
    expect(
      [...available.house, ...available.senate].map((seat) =>
        "term" in seat ? seat.term.congress : null,
      ),
    ).toEqual([120, 120, 120]);
  });

  it("rejects a selected detail from the old Congress after discovering a new one", async () => {
    const fixtures = fixtureBundle();
    setCurrentCongress(fixtures, 120, "2027", "2028");
    fixtures.houseDetail.member.terms[0].congress = 119;
    const providerFetch = fixtureFetch(fixtures);

    await expect(
      lookup(providerFetch, new Date("2028-07-16T12:00:00.000Z")),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
    expect(requestUrls(providerFetch)[1]).toContain(
      "/v3/member/congress/120/CA/12",
    );
  });

  it("rejects an unsafe current-Congress number before member requests", async () => {
    const fixtures = fixtureBundle();
    fixtures.current.congress.number = 1e100;
    fixtures.current.congress.name = "1e+100th Congress";
    fixtures.current.congress.url =
      "https://api.congress.gov/v3/congress/1e+100?format=json";
    const providerFetch = fixtureFetch(fixtures);

    await expect(lookup(providerFetch)).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
    expect(providerFetch).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "number",
      (f: FixtureBundle) => setCurrentCongress(f, 118, "2025", "2026"),
    ],
    [
      "start year",
      (f: FixtureBundle) => {
        f.current.congress.startYear = "2024";
      },
    ],
    [
      "end year",
      (f: FixtureBundle) => {
        f.current.congress.endYear = "2027";
      },
    ],
  ] as const)(
    "rejects a current-Congress %s/calendar identity mismatch before member requests",
    async (_label, mutate) => {
      const fixtures = fixtureBundle();
      mutate(fixtures);
      const providerFetch = fixtureFetch(fixtures);

      await expect(lookup(providerFetch)).resolves.toEqual({
        status: "unavailable",
        reason: "malformed",
      });
      expect(providerFetch).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [118, "2023", "2024"],
    [120, "2027", "2028"],
  ] as const)(
    "rejects internally coherent but inactive Congress %s for the retrieval clock",
    async (congress, startYear, endYear) => {
      const fixtures = fixtureBundle();
      setCurrentCongress(fixtures, congress, startYear, endYear);
      const providerFetch = fixtureFetch(fixtures);

      await expect(lookup(providerFetch)).resolves.toEqual({
        status: "unavailable",
        reason: "malformed",
      });
      expect(providerFetch).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["unsafe start", { startYear: 1e100 }],
    ["unsafe end", { endYear: 1e100 }],
    ["fractional start", { startYear: 2025.5 }],
    ["fractional end", { endYear: 2026.5 }],
    ["negative start", { startYear: -1 }],
    ["negative end", { endYear: -1 }],
    ["reversed", { startYear: 2026, endYear: 2025 }],
  ] as const)("rejects %s selected-term years", async (_label, years) => {
    const fixtures = fixtureBundle();
    Object.assign(fixtures.houseDetail.member.terms[0], years);

    await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it.each([
    ["before", { startYear: 2023, endYear: 2024 }],
    ["after", { startYear: 2027, endYear: 2028 }],
  ] as const)(
    "rejects a selected term wholly %s the current Congress window",
    async (_label, years) => {
      const fixtures = fixtureBundle();
      Object.assign(fixtures.houseDetail.member.terms[0], years);

      await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
        status: "unavailable",
        reason: "malformed",
      });
    },
  );

  it.each([
    ["the current fixture", (_f: FixtureBundle) => undefined],
    [
      "an explicit null term end",
      (f: FixtureBundle) => {
        Object.assign(f.house.members[0].terms.item[0], { endYear: null });
        Object.assign(f.houseDetail.member.terms[0], { endYear: null });
      },
    ],
    [
      "a House member starting mid-Congress",
      (f: FixtureBundle) => {
        f.house.members[0].terms.item[0].startYear = 2026;
        f.houseDetail.member.terms[0].startYear = 2026;
      },
    ],
    [
      "a senator whose service began in an earlier Congress",
      (f: FixtureBundle) => {
        f.senate.members[1].terms.item[0].startYear = 2021;
        f.senatorOneDetail.member.terms[0].startYear = 2021;
      },
    ],
  ] as const)("accepts %s", async (_label, mutate) => {
    const fixtures = fixtureBundle();
    mutate(fixtures);

    expect(await lookup(fixtureFetch(fixtures))).toMatchObject({
      status: "available",
      currentCongress: 119,
    });
  });

  it("preserves district zero in the at-large House request and normalized office", async () => {
    const fixtures = fixtureBundle();
    fixtures.house.members[0].district = 0;
    fixtures.houseDetail.member.district = 0;
    fixtures.houseDetail.member.terms[0].district = 0;
    const atLarge: FederalJurisdiction = {
      stateCode: "AK",
      district: 0,
      divisionIds: ["02", "0200"],
    };
    fixtures.house.members[0].state = "Alaska";
    fixtures.houseDetail.member.state = "Alaska";
    fixtures.houseDetail.member.terms[0].stateCode = "AK";
    fixtures.houseDetail.member.terms[0].stateName = "Alaska";
    fixtures.senate.members = [];
    fixtures.senate.pagination.count = 0;
    const providerFetch = fixtureFetch(fixtures);

    const outcome = expectAvailable(
      await fetchCongressRoster(atLarge, {
        apiKey,
        fetch: providerFetch,
        now: () => now,
      }),
    );

    expect(requestUrls(providerFetch)[1]).toBe(
      "https://api.congress.gov/v3/member/congress/119/AK/0?currentMember=true&format=json",
    );
    expect(outcome.house[0]).toMatchObject({
      office: { stateCode: "AK", district: 0 },
    });
  });

  it("returns an available empty House roster so reconciliation can qualify vacancy evidence", async () => {
    const fixtures = fixtureBundle();
    fixtures.house.members = [];
    fixtures.house.pagination.count = 0;

    const outcome = expectAvailable(await lookup(fixtureFetch(fixtures)));

    expect(outcome.house).toEqual([]);
    expect(outcome.senate).toHaveLength(2);
  });

  it("returns one validated senator as partial roster input without inventing a vacancy", async () => {
    const fixtures = fixtureBundle();
    fixtures.senate.members = fixtures.senate.members.filter(
      ({ bioguideId }) => bioguideId !== "S000002",
    );
    fixtures.senate.pagination.count = fixtures.senate.members.length;

    const outcome = expectAvailable(await lookup(fixtureFetch(fixtures)));

    expect(outcome.senate).toHaveLength(1);
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [404, "not_found"],
    [429, "quota"],
    [500, "provider_error"],
  ] as const)("maps HTTP %s to %s without provider prose", async (status, reason) => {
    const providerFetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ message: "SENTINEL PROVIDER PROSE" }, status),
    );

    const outcome = await lookup(providerFetch);

    expect(outcome).toEqual({ status: "unavailable", reason });
    expect(JSON.stringify(outcome)).not.toContain("SENTINEL PROVIDER PROSE");
    expect(providerFetch).toHaveBeenCalledOnce();
  });

  it("aborts after five seconds, reports timeout, and never retries", async () => {
    vi.useFakeTimers();
    const providerFetch = vi.fn<typeof globalThis.fetch>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("SENTINEL TIMEOUT PROSE", "AbortError")),
            { once: true },
          );
        }),
    );

    const pending = lookup(providerFetch);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(providerFetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({
      status: "unavailable",
      reason: "timeout",
    });
    expect(providerFetch).toHaveBeenCalledOnce();
  });

  it("fails closed on invalid JSON and non-JSON success bodies", async () => {
    const invalidJson = vi.fn<typeof globalThis.fetch>(async () =>
      new Response("{", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const html = vi.fn<typeof globalThis.fetch>(async () =>
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(lookup(invalidJson)).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
    await expect(lookup(html)).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it("cancels a streaming JSON body after its bytes exceed one MiB", async () => {
    const fixtures = fixtureBundle();
    fixtures.current.congress.name = "é".repeat(524_289);
    const json = JSON.stringify(fixtures.current);
    const bytes = new TextEncoder().encode(json);
    expect(json.length).toBeLessThan(1024 * 1024);
    expect(bytes.byteLength).toBeGreaterThan(1024 * 1024);

    const chunks = [
      bytes.slice(0, 512 * 1024),
      bytes.slice(512 * 1024, 1024 * 1024),
      bytes.slice(1024 * 1024, 1024 * 1024 + 1),
      bytes.slice(1024 * 1024 + 1),
    ];
    let nextChunk = 0;
    let trailingChunkPulled = false;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (nextChunk === chunks.length) {
            controller.close();
            return;
          }
          trailingChunkPulled ||= nextChunk === chunks.length - 1;
          controller.enqueue(chunks[nextChunk]);
          nextChunk += 1;
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const providerFetch = fixtureFetchWithCurrentResponse(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    const outcome = await lookup(providerFetch);

    expect.soft(cancelled).toBe(true);
    expect.soft(trailingChunkPulled).toBe(false);
    expect(outcome).toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("rejects Content-Length above one MiB before consuming the body", async () => {
    const encoded = new TextEncoder().encode(JSON.stringify(fixtureBundle().current));
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(encoded);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const providerFetch = fixtureFetchWithCurrentResponse(
      new Response(stream, {
        status: 200,
        headers: {
          "content-length": String(1024 * 1024 + 1),
          "content-type": "application/json; charset=utf-8",
        },
      }),
    );

    const outcome = await lookup(providerFetch);

    expect.soft(pulls).toBe(0);
    expect(outcome).toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("rejects a persisted member name above 200 characters", async () => {
    const fixtures = fixtureBundle();
    fixtures.houseDetail.member.directOrderName = "N".repeat(201);
    expect(fixtures.houseDetail.member.directOrderName).toHaveLength(201);

    await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it("rejects a canonical member source URL above 2,048 characters", async () => {
    const fixtures = fixtureBundle();
    const oversizedUrl =
      `https://api.congress.gov/${"x/../".repeat(410)}` +
      "v3/member/H000001?format=json";
    expect(oversizedUrl.length).toBeGreaterThan(2_048);
    expect(new URL(oversizedUrl).pathname).toBe("/v3/member/H000001");
    fixtures.house.members[0].url = oversizedUrl;

    await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it("rejects a provider timestamp string above 24 characters", async () => {
    const fixtures = fixtureBundle();
    fixtures.houseDetail.member.updateDate =
      "2026-07-15T09:30:00.123Z " as typeof fixtures.houseDetail.member.updateDate;
    expect(fixtures.houseDetail.member.updateDate).toHaveLength(25);

    await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it("rejects member-summary term arrays above 64 unique entries", async () => {
    const fixtures = fixtureBundle();
    fixtures.house.members[0].terms.item = Array.from(
      { length: 65 },
      (_, index) => ({
        chamber: "House of Representatives",
        startYear: 1961 + index,
      }),
    );
    expect(new Set(
      fixtures.house.members[0].terms.item.map(({ startYear }) => startYear),
    ).size).toBe(65);

    await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it("rejects member-detail term arrays above 64 unique entries", async () => {
    const fixtures = fixtureBundle();
    const currentTerm = structuredClone(fixtures.houseDetail.member.terms[0]);
    fixtures.houseDetail.member.terms = [
      ...Array.from({ length: 64 }, (_, index) => ({
        ...currentTerm,
        congress: 55 + index,
        startYear: 1897 + index * 2,
        endYear: 1899 + index * 2,
      })),
      currentTerm,
    ];
    expect(new Set(
      fixtures.houseDetail.member.terms.map(({ congress }) => congress),
    ).size).toBe(65);

    await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it("rejects 251 otherwise-valid unique results above the API page limit", async () => {
    const fixtures = fixtureBundle();
    setStateMemberResults(fixtures, 251);
    expect(fixtures.senate.members).toHaveLength(251);
    expect(new Set(
      fixtures.senate.members.map(({ bioguideId }) => bioguideId),
    ).size).toBe(251);

    await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it.each([
    "2026-07-15T10:00:00Z",
    "2026-07-15T10:00:00.1Z",
    "2026-07-15T10:00:00.12Z",
    "2026-07-15T10:00:00.123Z",
  ])("accepts canonical timestamps with zero to three fractional digits: %s", async (value) => {
    const fixtures = fixtureBundle();
    fixtures.current.congress.updateDate = value;
    fixtures.house.members[0].updateDate = value;
    fixtures.houseDetail.member.updateDate = value;

    const available = expectAvailable(await lookup(fixtureFetch(fixtures)));

    expect(available.house[0]).toMatchObject({
      sources: [{ recordUpdatedAt: new Date(value).toISOString() }],
    });
  });

  it.each([
    [
      "current Congress string",
      (f: FixtureBundle) => Object.assign(f.current, { pagination: "cursor" }),
    ],
    [
      "current Congress array",
      (f: FixtureBundle) => Object.assign(f.current, { pagination: [] }),
    ],
    [
      "current Congress next cursor",
      (f: FixtureBundle) =>
        Object.assign(f.current, { pagination: { next: "cursor" } }),
    ],
    [
      "member detail string",
      (f: FixtureBundle) =>
        Object.assign(f.houseDetail, { pagination: "cursor" }),
    ],
    [
      "member detail array",
      (f: FixtureBundle) => Object.assign(f.houseDetail, { pagination: [] }),
    ],
    [
      "member detail previous cursor",
      (f: FixtureBundle) =>
        Object.assign(f.houseDetail, { pagination: { previous: "cursor" } }),
    ],
  ] as const)("fails closed on non-null %s pagination", async (_label, mutate) => {
    const fixtures = fixtureBundle();
    mutate(fixtures);

    await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it("allows absent-equivalent null pagination on item endpoints", async () => {
    const fixtures = fixtureBundle();
    Object.assign(fixtures.current, { pagination: null });
    Object.assign(fixtures.houseDetail, { pagination: null });

    await expect(lookup(fixtureFetch(fixtures))).resolves.toMatchObject({
      status: "available",
      currentCongress: 119,
    });
  });

  it.each([
    ["count/item mismatch", (f: FixtureBundle) => { f.house.pagination.count = 2; }],
    [
      "unexpected next page",
      (f: FixtureBundle) => {
        (f.senate.pagination as { next: string | null }).next =
          "https://api.congress.gov/v3/member/CA?offset=250";
      },
    ],
    [
      "cross-origin member URL",
      (f: FixtureBundle) => {
        f.house.members[0].url = "https://example.test/v3/member/H000001?format=json";
      },
    ],
    [
      "provider-path mismatch",
      (f: FixtureBundle) => {
        f.house.members[0].url = "https://api.congress.gov/v3/member/S000001?format=json";
      },
    ],
    [
      "credential-bearing member URL",
      (f: FixtureBundle) => {
        f.house.members[0].url =
          "https://user:pass@api.congress.gov/v3/member/H000001?format=json";
      },
    ],
    [
      "future summary timestamp",
      (f: FixtureBundle) => { f.house.members[0].updateDate = "2026-07-17T00:00:00Z"; },
    ],
    [
      "future detail timestamp",
      (f: FixtureBundle) => { f.houseDetail.member.updateDate = "2026-07-17T00:00:00Z"; },
    ],
    [
      "impossible current-Congress timestamp",
      (f: FixtureBundle) => {
        f.current.congress.updateDate = "2026-02-30T10:00:00Z";
      },
    ],
    [
      "impossible member-summary timestamp",
      (f: FixtureBundle) => {
        f.house.members[0].updateDate = "2026-02-30T10:00:00Z";
      },
    ],
    [
      "impossible member-detail timestamp",
      (f: FixtureBundle) => {
        f.houseDetail.member.updateDate = "2026-02-30T10:00:00Z";
      },
    ],
    [
      "duplicate House seat",
      (f: FixtureBundle) => {
        const duplicate = structuredClone(f.house.members[0]);
        duplicate.bioguideId = "H000002";
        duplicate.url = "https://api.congress.gov/v3/member/H000002?format=json";
        f.house.members.push(duplicate);
        f.house.pagination.count = 2;
      },
    ],
    [
      "duplicate Senate Bioguide ID",
      (f: FixtureBundle) => {
        f.senate.members.push(structuredClone(f.senate.members[1]));
        f.senate.pagination.count += 1;
      },
    ],
  ] as const)("fails closed on %s", async (_label, mutate) => {
    const fixtures = fixtureBundle();
    mutate(fixtures);

    await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it.each([
    ["Bioguide", (f: FixtureBundle) => { f.houseDetail.member.bioguideId = "S000001"; }],
    ["current flag", (f: FixtureBundle) => { f.houseDetail.member.currentMember = false; }],
    ["Congress", (f: FixtureBundle) => { f.houseDetail.member.terms[0].congress = 118; }],
    ["chamber", (f: FixtureBundle) => { f.houseDetail.member.terms[0].chamber = "Senate"; }],
    ["state", (f: FixtureBundle) => { f.houseDetail.member.terms[0].stateCode = "OR"; }],
    ["district", (f: FixtureBundle) => { f.houseDetail.member.terms[0].district = 11; }],
  ] as const)("fails closed when summary/detail %s disagrees", async (_label, mutate) => {
    const fixtures = fixtureBundle();
    mutate(fixtures);

    await expect(lookup(fixtureFetch(fixtures))).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
  });

  it("rejects malformed current-Congress identity before member requests", async () => {
    const fixtures = fixtureBundle();
    fixtures.current.congress.url = "https://api.congress.gov/v3/congress/118?format=json";
    const providerFetch = fixtureFetch(fixtures);

    await expect(lookup(providerFetch)).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
    expect(providerFetch).toHaveBeenCalledOnce();
  });
});

function lookup(providerFetch: typeof globalThis.fetch, retrievedAt = now) {
  return fetchCongressRoster(jurisdiction, {
    apiKey,
    fetch: providerFetch,
    now: () => retrievedAt,
  });
}

function fixtureBundle(): FixtureBundle {
  return structuredClone({
    current: congressCurrentFixture,
    house: congressHouseFixture,
    senate: congressSenateFixture,
    houseDetail: congressMemberHouseFixture,
    senatorOneDetail: congressMemberSenatorOneFixture,
    senatorTwoDetail: congressMemberSenatorTwoFixture,
  });
}

function setCurrentCongress(
  fixtures: FixtureBundle,
  currentCongress: number,
  startYear = fixtures.current.congress.startYear,
  endYear = fixtures.current.congress.endYear,
) {
  fixtures.current.congress.number = currentCongress;
  fixtures.current.congress.name = `${currentCongress}th Congress`;
  fixtures.current.congress.startYear = startYear;
  fixtures.current.congress.endYear = endYear;
  fixtures.current.congress.url =
    `https://api.congress.gov/v3/congress/${currentCongress}?format=json`;
  for (const detail of [
    fixtures.houseDetail,
    fixtures.senatorOneDetail,
    fixtures.senatorTwoDetail,
  ]) {
    detail.member.terms[0].congress = currentCongress;
  }
}

function fixtureFetch(fixtures = fixtureBundle()) {
  return vi.fn<typeof globalThis.fetch>(async (input) => {
    const { pathname } = new URL(toUrl(input));
    const body =
      pathname === "/v3/congress/current"
        ? fixtures.current
        : pathname.startsWith("/v3/member/congress/")
          ? fixtures.house
          : pathname === "/v3/member/CA" || pathname === "/v3/member/AK"
            ? fixtures.senate
            : pathname === "/v3/member/H000001"
              ? fixtures.houseDetail
              : pathname === "/v3/member/S000001"
                ? fixtures.senatorOneDetail
                : pathname === "/v3/member/S000002"
                  ? fixtures.senatorTwoDetail
                  : null;
    return body === null ? jsonResponse({}, 404) : jsonResponse(body);
  });
}

function fixtureFetchWithCurrentResponse(response: Response) {
  const fallback = fixtureFetch();
  return vi.fn<typeof globalThis.fetch>(async (input, init) =>
    new URL(toUrl(input)).pathname === "/v3/congress/current"
      ? response
      : fallback(input, init),
  );
}

function setStateMemberResults(fixtures: FixtureBundle, count: number) {
  const house = fixtures.senate.members[0];
  const senators = fixtures.senate.members.slice(1).map((member) =>
    structuredClone(member),
  );
  fixtures.senate.members = [
    ...Array.from({ length: count - senators.length }, (_, index) => {
      const bioguideId = `H${String(index + 1).padStart(6, "0")}`;
      return {
        ...structuredClone(house),
        bioguideId,
        district: index % 100,
        name: `House Member ${index + 1}`,
        state: `State ${index + 1}`,
        url: `https://api.congress.gov/v3/member/${bioguideId}?format=json`,
      };
    }),
    ...senators,
  ];
  fixtures.senate.pagination.count = fixtures.senate.members.length;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function requestUrls(providerFetch: ReturnType<typeof fixtureFetch>) {
  return providerFetch.mock.calls.map(([input]) => toUrl(input));
}

function toUrl(input: Parameters<typeof globalThis.fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function expectAvailable(
  outcome: CongressRosterOutcome,
): Extract<CongressRosterOutcome, { status: "available" }> {
  if (outcome.status !== "available") {
    throw new Error(`Expected available fixture outcome, got ${outcome.reason}.`);
  }
  return outcome;
}
