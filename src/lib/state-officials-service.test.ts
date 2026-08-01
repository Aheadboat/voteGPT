import { describe, expect, it, vi } from "vitest";

import {
  createStateOfficialsService,
  type StateOfficialCacheRecord,
  type StateOfficialCacheRepository,
} from "./state-officials-service";
import type { FetchStateLegislators } from "./openstates";
import {
  stateJurisdictionFromDivisions,
  type StateJurisdiction,
  type StateRosterInput,
} from "./state-officials";

const HOUR = 60 * 60 * 1_000;
const NOW = new Date("2026-07-31T12:00:00.000Z");
const API_KEY = "server-only-openstates-key";
const jurisdiction: StateJurisdiction = {
  stateCode: "GA",
  stateDivisionId: "ocd-division/country:us/state:ga",
  jurisdictionId: "ocd-jurisdiction/country:us/state:ga/government",
  legislature: "bicameral",
  districts: [
    {
      chamber: "upper",
      district: "13",
      providerTargets: [{
        label: "13",
        divisionId: "ocd-division/country:us/state:ga/sldu:13",
      }],
      divisionId: "ocd-division/country:us/state:ga/sldu:13",
    },
    {
      chamber: "lower",
      district: "25",
      providerTargets: [{
        label: "25",
        divisionId: "ocd-division/country:us/state:ga/sldl:25",
      }],
      divisionId: "ocd-division/country:us/state:ga/sldl:25",
    },
  ],
};

describe("createStateOfficialsService", () => {
  it("uses canonical Idaho district identity for the cache key and provider jurisdiction", async () => {
    const parsed = stateJurisdictionFromDivisions([
      { type: "state", name: "Idaho", id: "ocd-division/country:us/state:id", idScheme: "ocd" },
      { type: "state_upper", name: "1", id: "ocd-division/country:us/state:id/sldu:1", idScheme: "ocd" },
      { type: "state_lower", name: "1", id: "ocd-division/country:us/state:id/sldl:1", idScheme: "ocd" },
    ]);
    expect(parsed.status).toBe("available");
    if (parsed.status !== "available") throw new Error("Expected Idaho jurisdiction.");
    const cache = memoryCache(null);
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({
      status: "unavailable",
      reason: "provider_error",
    });

    await expect(
      createStateOfficialsService(options(cache, fetchStateLegislators)).getOfficials(parsed.jurisdiction),
    ).resolves.toEqual({ status: "unavailable" });

    expect(cache.readKeys).toEqual(["state-roster:v1:ID:U-1:L-1"]);
    expect(fetchStateLegislators).toHaveBeenCalledWith(
      parsed.jurisdiction,
      expect.objectContaining({ apiKey: API_KEY }),
    );
  });

  it("uses the current Vermont canonical district in the cache key and provider jurisdiction", async () => {
    const parsed = stateJurisdictionFromDivisions([
      { type: "state", name: "Vermont", id: "ocd-division/country:us/state:vt", idScheme: "ocd" },
      { type: "state_upper", name: "Grand Isle-Chittenden", id: "ocd-division/country:us/state:vt/sldu:grand_isle-chittenden", idScheme: "ocd" },
      { type: "state_lower", name: "Addison-1", id: "ocd-division/country:us/state:vt/sldl:addison-1", idScheme: "ocd" },
    ]);
    expect(parsed.status).toBe("available");
    if (parsed.status !== "available") throw new Error("Expected current Vermont jurisdiction.");
    const cache = memoryCache(null);
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({
      status: "unavailable",
      reason: "provider_error",
    });

    await expect(
      createStateOfficialsService(options(cache, fetchStateLegislators)).getOfficials(parsed.jurisdiction),
    ).resolves.toEqual({ status: "unavailable" });

    expect(cache.readKeys).toEqual([
      "state-roster:v1:VT:U-grand_isle-chittenden:L-addison-1",
    ]);
    expect(fetchStateLegislators).toHaveBeenCalledWith(
      parsed.jurisdiction,
      expect.objectContaining({ apiKey: API_KEY }),
    );
  });

  it.each([
    { ...jurisdiction, untrusted: true },
    { ...jurisdiction, districts: [{ ...jurisdiction.districts[0], untrusted: true }] },
    { ...jurisdiction, districts: { privateAddress: "no" } },
    { ...jurisdiction, districts: null },
  ])("rejects untrusted requested jurisdiction before clock, cache, or provider work", async (input) => {
    const cache = memoryCache(record(hoursBefore(1)));
    const fetchStateLegislators = vi.fn<FetchStateLegislators>();
    const now = vi.fn(() => NOW);

    await expect(createStateOfficialsService({ ...options(cache, fetchStateLegislators), now }).getOfficials(input as StateJurisdiction)).resolves.toEqual({ status: "unavailable" });
    expect(now).not.toHaveBeenCalled();
    expect(cache.reads).toBe(0);
    expect(fetchStateLegislators).not.toHaveBeenCalled();
  });

  it("returns a fresh valid cache hit without provider work", async () => {
    const cache = memoryCache(record(hoursBefore(1)));
    const fetchStateLegislators = vi.fn<FetchStateLegislators>();
    const service = createStateOfficialsService(options(cache, fetchStateLegislators));

    await expect(service.getOfficials(jurisdiction)).resolves.toMatchObject({
      status: "available",
      view: { freshness: { state: "fresh" } },
    });
    expect(fetchStateLegislators).not.toHaveBeenCalled();
    expect(cache.writes).toEqual([]);
  });

  it("refreshes a stale roster and rewrites its exact cache freshness", async () => {
    const cache = memoryCache(record(hoursBefore(25)));
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({
      status: "available",
      roster: roster(NOW),
    });
    const service = createStateOfficialsService(options(cache, fetchStateLegislators));

    const result = await service.getOfficials(jurisdiction);

    expect(result).toMatchObject({
      status: "available",
      view: {
        freshness: {
          checkedAt: NOW.toISOString(),
          refreshAfter: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
          staleAfter: new Date(NOW.getTime() + 72 * HOUR).toISOString(),
          state: "fresh",
        },
      },
    });
    expect(cache.writes).toHaveLength(1);
    expect(cache.writes[0]).toMatchObject({
      retrievedAt: NOW,
      refreshAfter: new Date(NOW.getTime() + 24 * HOUR),
      staleAfter: new Date(NOW.getTime() + 72 * HOUR),
    });
  });

  it.each([
    ["blank key", {}, undefined],
    ["provider unavailable", { OPENSTATES_API_KEY: API_KEY }, { status: "unavailable", reason: "provider_error" }],
    ["provider throw", { OPENSTATES_API_KEY: API_KEY }, new Error("provider failed")],
    ["cache write failure", { OPENSTATES_API_KEY: API_KEY }, undefined],
  ])("keeps an unexpired stale roster on %s", async (_label, environment, outcome) => {
    const cache = memoryCache(record(hoursBefore(25)));
    if (_label === "cache write failure") cache.writeError = new Error("write failed");
    const fetchStateLegislators = vi.fn<FetchStateLegislators>();
    if (outcome instanceof Error) fetchStateLegislators.mockRejectedValue(outcome);
    else if (outcome) fetchStateLegislators.mockResolvedValue(outcome as Awaited<ReturnType<FetchStateLegislators>>);
    else fetchStateLegislators.mockResolvedValue({ status: "available", roster: roster(NOW) });
    const service = createStateOfficialsService(options(cache, fetchStateLegislators, environment));

    await expect(service.getOfficials(jurisdiction)).resolves.toMatchObject({
      status: "available",
      view: { freshness: { state: "stale" } },
    });
  });

  it("treats refresh and expiry boundaries exactly and fails closed after expiry", async () => {
    const atRefresh = memoryCache(record(hoursBefore(24)));
    const refresh = vi.fn<FetchStateLegislators>().mockResolvedValue({ status: "unavailable", reason: "timeout" });
    await expect(createStateOfficialsService(options(atRefresh, refresh)).getOfficials(jurisdiction)).resolves.toMatchObject({
      status: "available", view: { freshness: { state: "stale" } },
    });
    expect(refresh).toHaveBeenCalledOnce();

    const atExpiry = memoryCache(record(hoursBefore(72)));
    await expect(createStateOfficialsService(options(atExpiry, refresh)).getOfficials(jurisdiction)).resolves.toEqual({ status: "unavailable" });
  });

  it("classifies cache freshness from a clock read after delayed cache reads", async () => {
    const cache = memoryCache(record(new Date(NOW.getTime() - 24 * HOUR + 1)));
    const read = Promise.withResolvers<void>();
    cache.readGate = read.promise;
    let currentTime = new Date(NOW.getTime() - 2);
    const pending = createStateOfficialsService({ ...options(cache, vi.fn(), {}), now: () => currentTime }).getOfficials(jurisdiction);
    currentTime = new Date(NOW.getTime() + 2);
    read.resolve();

    await expect(pending).resolves.toMatchObject({ status: "available", view: { freshness: { state: "stale" } } });
  });

  it("fails closed when delayed cache reads cross expiry", async () => {
    const cache = memoryCache(record(new Date(NOW.getTime() - 72 * HOUR + 1)));
    const read = Promise.withResolvers<void>();
    cache.readGate = read.promise;
    let currentTime = new Date(NOW.getTime() - 2);
    const pending = createStateOfficialsService({ ...options(cache, vi.fn(), {}), now: () => currentTime }).getOfficials(jurisdiction);
    currentTime = new Date(NOW.getTime() + 2);
    read.resolve();

    await expect(pending).resolves.toEqual({ status: "unavailable" });
  });

  it("fails closed when initial cache reads reject instead of treating them as misses", async () => {
    const cache = memoryCache(null);
    cache.readError = new Error("read failed");
    const fetchStateLegislators = vi.fn<FetchStateLegislators>();

    await expect(createStateOfficialsService(options(cache, fetchStateLegislators)).getOfficials(jurisdiction)).resolves.toEqual({ status: "unavailable" });
    expect(fetchStateLegislators).not.toHaveBeenCalled();
  });

  it("fails closed for malformed, non-exact, or wrong-jurisdiction cache rows", async () => {
    const malformed = memoryCache({ ...record(hoursBefore(1)), payload: { unsafe: true } });
    const wrongJurisdiction = memoryCache({
      ...record(hoursBefore(1)),
      payload: {
        jurisdiction: {
          ...jurisdiction,
          stateCode: "CA",
          stateDivisionId: "ocd-division/country:us/state:ca",
          jurisdictionId: "ocd-jurisdiction/country:us/state:ca/government",
          districts: [{ chamber: "upper", district: "13", providerTargets: [{ label: "13", divisionId: "ocd-division/country:us/state:ca/sldu:13" }], divisionId: "ocd-division/country:us/state:ca/sldu:13" }],
          legislature: "unicameral",
        },
        roster: cachedRoster(hoursBefore(1)),
      },
    });
    const extraJurisdictionField = memoryCache({
      ...record(hoursBefore(1)),
      payload: {
        jurisdiction: { ...jurisdiction, untrusted: true },
        roster: cachedRoster(hoursBefore(1)),
      },
    });
    for (const cache of [malformed, wrongJurisdiction, extraJurisdictionField]) {
      await expect(createStateOfficialsService(options(cache, vi.fn())).getOfficials(jurisdiction)).resolves.toEqual({ status: "unavailable" });
    }
  });

  it.each([
    ["wrong-state host", "https://senate.ca.gov/member"],
    ["unvetted host", "https://georgia.gov/legislator"],
    ["privacy-bearing query", "https://www.legis.ga.gov/member?address=1-main"],
    ["unapproved query", "https://www.legis.ga.gov/member?sort=alpha"],
  ])("fails closed for a cached %s source", async (_label, publicUrl) => {
    const cache = memoryCache(recordWithSource(hoursBefore(1), publicUrl));

    await expect(
      createStateOfficialsService(options(cache, vi.fn(), {})).getOfficials(jurisdiction),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("serves a cache row whose source satisfies the state host and public-query policy", async () => {
    const cache = memoryCache(
      recordWithSource(
        hoursBefore(1),
        "https://www.legis.ga.gov/member?district=13&session=2026",
      ),
    );

    await expect(
      createStateOfficialsService(options(cache, vi.fn(), {})).getOfficials(jurisdiction),
    ).resolves.toMatchObject({ status: "available", view: { freshness: { state: "fresh" } } });
  });

  it("rejects a provider source outside cache policy before writing it", async () => {
    const cache = memoryCache(null);
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({
      status: "available",
      roster: withVacancySource(roster(NOW), "https://senate.ca.gov/member", NOW),
    });

    await expect(
      createStateOfficialsService(options(cache, fetchStateLegislators)).getOfficials(jurisdiction),
    ).resolves.toEqual({ status: "unavailable" });
    expect(cache.writes).toEqual([]);
  });

  it("fails closed when a cached source time differs from its generation", async () => {
    const retrievedAt = hoursBefore(1);
    const cache = memoryCache({
      ...record(retrievedAt),
      payload: {
        jurisdiction,
        roster: {
          ...cachedRoster(retrievedAt),
          seats: [{
            chamber: "upper",
            district: "13",
            seat: "State Senator",
            people: [],
            vacancySources: [{
              sourceType: "vacancy",
              publicUrl: "https://www.legis.ga.gov/vacancies",
              retrievedAt: NOW.toISOString(),
              effectiveAt: NOW.toISOString(),
            }],
          }],
        },
      },
    });

    await expect(createStateOfficialsService(options(cache, vi.fn())).getOfficials(jurisdiction)).resolves.toEqual({ status: "unavailable" });
  });

  it("aborts a timed-out provider refresh and keeps the stale roster", async () => {
    vi.useFakeTimers();
    const cache = memoryCache(record(hoursBefore(25)));
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockImplementation(
      async (_jurisdiction, { signal }) => new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve({ status: "unavailable", reason: "timeout" }));
      }),
    );
    const pending = createStateOfficialsService(options(cache, fetchStateLegislators)).getOfficials(jurisdiction);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toMatchObject({ status: "available", view: { freshness: { state: "stale" } } });
    vi.useRealTimers();
  });

  it("does not publish a refresh that expires before the provider returns", async () => {
    const cache = memoryCache(record(hoursBefore(25)));
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({ status: "available", roster: roster(NOW) });
    let clockCalls = 0;

    await expect(createStateOfficialsService({
      ...options(cache, fetchStateLegislators),
      now: () => (clockCalls++ === 0 ? NOW : new Date(NOW.getTime() + 73 * HOUR)),
    }).getOfficials(jurisdiction)).resolves.toEqual({ status: "unavailable" });
    expect(cache.writes).toEqual([]);
  });

  it("does not serve a successful publication after delayed writes cross expiry", async () => {
    const cache = memoryCache(record(hoursBefore(25)));
    const write = Promise.withResolvers<void>();
    cache.writeGate = write.promise;
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({ status: "available", roster: roster(NOW) });
    let clockCalls = 0;
    const pending = createStateOfficialsService({
      ...options(cache, fetchStateLegislators),
      now: () => (clockCalls++ < 2 ? NOW : new Date(NOW.getTime() + 72 * HOUR)),
    }).getOfficials(jurisdiction);
    await vi.waitFor(() => expect(cache.writes).toHaveLength(1));
    write.resolve();

    await expect(pending).resolves.toEqual({ status: "unavailable" });
  });

  it("keeps validated stale cache when a delayed write is followed by a backward clock before its generation", async () => {
    const cache = memoryCache(record(hoursBefore(25)));
    const write = Promise.withResolvers<void>();
    cache.writeGate = write.promise;
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({ status: "available", roster: roster(NOW) });
    let clockCalls = 0;
    const pending = createStateOfficialsService({
      ...options(cache, fetchStateLegislators),
      now: () => clockCalls++ < 2 ? NOW : new Date(NOW.getTime() - 1),
    }).getOfficials(jurisdiction);
    await vi.waitFor(() => expect(cache.writes).toHaveLength(1));
    write.resolve();

    await expect(pending).resolves.toMatchObject({ status: "available", view: { freshness: { state: "stale" } } });
  });

  it("fails closed after a backward post-write clock without prior stale cache", async () => {
    const cache = memoryCache(null);
    const write = Promise.withResolvers<void>();
    cache.writeGate = write.promise;
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({ status: "available", roster: roster(NOW) });
    let clockCalls = 0;
    const pending = createStateOfficialsService({
      ...options(cache, fetchStateLegislators),
      now: () => clockCalls++ < 2 ? NOW : new Date(NOW.getTime() - 1),
    }).getOfficials(jurisdiction);
    await vi.waitFor(() => expect(cache.writes).toHaveLength(1));
    write.resolve();

    await expect(pending).resolves.toEqual({ status: "unavailable" });
  });

  it("rereads a valid newer winner when atomic publication is rejected", async () => {
    const winner = record(new Date(NOW.getTime() + 1));
    const cache = memoryCache(record(hoursBefore(25)));
    cache.writeResult = { status: "ignored", reason: "older_generation" };
    cache.afterIgnoredWrite = winner;
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({ status: "available", roster: roster(NOW) });

    let clockCalls = 0;
    const result = await createStateOfficialsService({
      ...options(cache, fetchStateLegislators),
      now: () => (clockCalls++ === 0 ? NOW : new Date(NOW.getTime() + 1)),
    }).getOfficials(jurisdiction);

    expect(result).toMatchObject({ status: "available", view: { freshness: { checkedAt: winner.retrievedAt.toISOString(), state: "fresh" } } });
  });

  it("serves a valid equal-generation winner after a cold-cache publication race", async () => {
    const winner = record(NOW, "Persisted cold winner");
    const cache = memoryCache(null);
    cache.writeResult = { status: "ignored", reason: "older_generation" };
    cache.afterIgnoredWrite = winner;
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({
      status: "available",
      roster: roster(NOW, "Unpersisted cold loser"),
    });

    const result = await createStateOfficialsService(
      options(cache, fetchStateLegislators),
    ).getOfficials(jurisdiction);

    expect(result).toMatchObject({
      status: "available",
      view: {
        freshness: { checkedAt: NOW.toISOString(), state: "fresh" },
        chambers: [{ districts: [{ seats: [{ seat: "Persisted cold winner" }] }] }],
      },
    });
    expect(cache.reads).toBe(2);
  });

  it("serves a valid equal-generation winner instead of the prior stale fallback", async () => {
    const winner = record(NOW, "Persisted stale-race winner");
    const cache = memoryCache(record(hoursBefore(25), "Prior stale roster"));
    cache.writeResult = { status: "ignored", reason: "older_generation" };
    cache.afterIgnoredWrite = winner;
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({
      status: "available",
      roster: roster(NOW, "Unpersisted stale-race loser"),
    });

    const result = await createStateOfficialsService(
      options(cache, fetchStateLegislators),
    ).getOfficials(jurisdiction);

    expect(result).toMatchObject({
      status: "available",
      view: {
        freshness: { checkedAt: NOW.toISOString(), state: "fresh" },
        chambers: [{ districts: [{ seats: [{ seat: "Persisted stale-race winner" }] }] }],
      },
    });
    expect(cache.reads).toBe(2);
  });

  it("rejects a malformed authoritative reread after an ignored cold-cache write", async () => {
    const cache = memoryCache(null);
    cache.writeResult = { status: "ignored", reason: "older_generation" };
    cache.afterIgnoredWrite = { ...record(NOW), payload: { malformed: true } };
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({
      status: "available",
      roster: roster(NOW, "Unpersisted loser"),
    });

    await expect(
      createStateOfficialsService(options(cache, fetchStateLegislators)).getOfficials(jurisdiction),
    ).resolves.toEqual({ status: "unavailable" });
    expect(cache.reads).toBe(2);
  });

  it("rejects a future authoritative reread after an ignored cold-cache write", async () => {
    const cache = memoryCache(null);
    cache.writeResult = { status: "ignored", reason: "older_generation" };
    cache.afterIgnoredWrite = record(new Date(NOW.getTime() + 1), "Future reread");
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({
      status: "available",
      roster: roster(NOW, "Unpersisted loser"),
    });

    await expect(
      createStateOfficialsService(options(cache, fetchStateLegislators)).getOfficials(jurisdiction),
    ).resolves.toEqual({ status: "unavailable" });
    expect(cache.reads).toBe(2);
  });

  it("rejects an older authoritative reread and keeps the prior stale roster", async () => {
    const prior = record(hoursBefore(25), "Prior stale roster");
    const cache = memoryCache(prior);
    cache.writeResult = { status: "ignored", reason: "older_generation" };
    cache.afterIgnoredWrite = record(new Date(NOW.getTime() - 1), "Older reread");
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({
      status: "available",
      roster: roster(NOW, "Unpersisted loser"),
    });

    const result = await createStateOfficialsService(
      options(cache, fetchStateLegislators),
    ).getOfficials(jurisdiction);

    expect(result).toMatchObject({
      status: "available",
      view: {
        freshness: { checkedAt: prior.retrievedAt.toISOString(), state: "stale" },
        chambers: [{ districts: [{ seats: [{ seat: "Prior stale roster" }] }] }],
      },
    });
    expect(cache.reads).toBe(2);
  });

  it("rejects an equal winner that expires at the final authoritative-read clock", async () => {
    const cache = memoryCache(null);
    cache.writeResult = { status: "ignored", reason: "older_generation" };
    cache.afterIgnoredWrite = record(NOW, "Expired equal winner");
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({
      status: "available",
      roster: roster(NOW, "Unpersisted loser"),
    });
    let clockCalls = 0;

    await expect(createStateOfficialsService({
      ...options(cache, fetchStateLegislators),
      now: () => clockCalls++ < 3 ? NOW : new Date(NOW.getTime() + 72 * HOUR),
    }).getOfficials(jurisdiction)).resolves.toEqual({ status: "unavailable" });
    expect(cache.reads).toBe(2);
  });

  it("uses validated stale fallback when ignored-write winner rereads reject", async () => {
    const cache = memoryCache(record(hoursBefore(25)));
    cache.writeResult = { status: "ignored", reason: "older_generation" };
    cache.readErrorAfter = 1;
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({ status: "available", roster: roster(NOW) });

    await expect(createStateOfficialsService(options(cache, fetchStateLegislators)).getOfficials(jurisdiction)).resolves.toMatchObject({ status: "available", view: { freshness: { state: "stale" } } });
  });

  it("fails closed when ignored-write winner rereads reject without prior valid stale cache", async () => {
    const cache = memoryCache(null);
    cache.writeResult = { status: "ignored", reason: "older_generation" };
    cache.readErrorAfter = 1;
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({ status: "available", roster: roster(NOW) });

    await expect(createStateOfficialsService(options(cache, fetchStateLegislators)).getOfficials(jurisdiction)).resolves.toEqual({ status: "unavailable" });
  });

  it("passes private key only to adapter and never exposes it", async () => {
    const cache = memoryCache(null);
    const fetchStateLegislators = vi.fn<FetchStateLegislators>().mockResolvedValue({ status: "available", roster: roster(NOW) });
    const result = await createStateOfficialsService(options(cache, fetchStateLegislators)).getOfficials(jurisdiction);

    expect(fetchStateLegislators).toHaveBeenCalledWith(jurisdiction, expect.objectContaining({ apiKey: API_KEY }));
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(JSON.stringify(cache.writes)).not.toContain(API_KEY);
  });
});

function options(
  cache: ReturnType<typeof memoryCache>,
  fetchStateLegislators: FetchStateLegislators,
  environment: Readonly<{ OPENSTATES_API_KEY?: string }> = { OPENSTATES_API_KEY: API_KEY },
) {
  return { cache, environment, fetch: vi.fn(), fetchStateLegislators, now: () => NOW };
}

function memoryCache(initial: StateOfficialCacheRecord | null) {
  let current = initial;
  const writes: StateOfficialCacheRecord[] = [];
  const cache: StateOfficialCacheRepository & {
    writes: StateOfficialCacheRecord[];
    reads: number;
    readKeys: string[];
    readError?: Error;
    readErrorAfter?: number;
    readGate?: Promise<void>;
    writeError?: Error;
    writeGate?: Promise<void>;
    writeResult?: Awaited<ReturnType<StateOfficialCacheRepository["write"]>>;
    afterIgnoredWrite?: StateOfficialCacheRecord;
  } = {
    writes,
    reads: 0,
    readKeys: [],
    async read(cacheKey) {
      cache.reads += 1;
      cache.readKeys.push(cacheKey);
      await cache.readGate;
      if (cache.readError || (cache.readErrorAfter !== undefined && cache.reads > cache.readErrorAfter)) {
        throw cache.readError ?? new Error("read failed");
      }
      return current;
    },
    async write(value) {
      writes.push(value);
      await cache.writeGate;
      if (cache.writeError) throw cache.writeError;
      if (cache.writeResult?.status === "ignored") {
        current = cache.afterIgnoredWrite ?? current;
        return cache.writeResult;
      }
      current = value;
      return { status: "written" };
    },
  };
  return cache;
}

function record(
  retrievedAt: Date,
  seat = "State Senator",
): StateOfficialCacheRecord {
  return {
    cacheKey: "state-roster:v1:GA:U-13:L-25",
    payload: { jurisdiction, roster: cachedRoster(retrievedAt, seat) },
    retrievedAt,
    refreshAfter: new Date(retrievedAt.getTime() + 24 * HOUR),
    staleAfter: new Date(retrievedAt.getTime() + 72 * HOUR),
  };
}

function recordWithSource(
  retrievedAt: Date,
  publicUrl: string,
): StateOfficialCacheRecord {
  const value = record(retrievedAt);
  return {
    ...value,
    payload: {
      jurisdiction,
      roster: withVacancySource(cachedRoster(retrievedAt), publicUrl, retrievedAt),
    },
  };
}

function cachedRoster(
  retrievedAt: Date,
  seat = "State Senator",
): StateRosterInput {
  const value = roster(retrievedAt, seat);
  return {
    ...value,
    freshness: {
      checkedAt: retrievedAt.toISOString(),
      refreshAfter: new Date(retrievedAt.getTime() + 24 * HOUR).toISOString(),
      staleAfter: new Date(retrievedAt.getTime() + 72 * HOUR).toISOString(),
      state: "fresh",
    },
  };
}

function roster(
  retrievedAt: Date,
  seat = "State Senator",
): StateRosterInput {
  const checkedAt = retrievedAt.toISOString();
  return {
    freshness: { checkedAt, refreshAfter: checkedAt, staleAfter: checkedAt, state: "fresh" },
    seats: [{
      chamber: "upper",
      district: "13",
      seat,
      people: [],
      vacancySources: [],
    }],
  };
}

function withVacancySource(
  value: StateRosterInput,
  publicUrl: string,
  retrievedAt: Date,
): StateRosterInput {
  return {
    ...value,
    seats: [{
      chamber: "upper",
      district: "13",
      seat: "State Senator",
      people: [],
      vacancySources: [{
        sourceType: "vacancy",
        publicUrl,
        retrievedAt: retrievedAt.toISOString(),
        effectiveAt: null,
      }],
    }],
  };
}

function hoursBefore(hours: number) {
  return new Date(NOW.getTime() - hours * HOUR);
}
