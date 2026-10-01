// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  photonFixture,
  photonHouse,
  suggestionFixture,
  suggestionQuery,
} from "../../tests/fixtures/address-suggestions";
import {
  areAddressSuggestionsConfigured,
  lookupAddressSuggestions,
} from "./address-suggestions";
import { ADDRESS_SUGGESTION_MIN_LENGTH } from "./address-suggestions-contract";

vi.mock("server-only", () => ({}));

const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  PHOTON_BASE_URL: "https://photon.example.test",
};
const unavailable = {
  status: "unavailable",
  message: "Address suggestions are temporarily unavailable. You can still enter an address manually.",
};
const consoleMethods = ["debug", "error", "info", "log", "warn"] as const;

beforeEach(() => {
  vi.useFakeTimers();
  for (const method of consoleMethods) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  for (const method of consoleMethods) expect(console[method]).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("address suggestion provider", () => {
  it("requires an explicit HTTPS base with no credentials, query, or fragment", async () => {
    expect(ADDRESS_SUGGESTION_MIN_LENGTH).toBe(4);
    const providerFetch = vi.fn<typeof fetch>();
    for (const base of [undefined, "", "http://photon.example.test", "not a URL", "https://user:password@photon.example.test", "https://photon.example.test?key=secret", "https://photon.example.test#fragment", "https://photon.example.test/?", "https://photon.example.test/#"]) {
      const settings: NodeJS.ProcessEnv = { NODE_ENV: "test", PHOTON_BASE_URL: base };
      expect(areAddressSuggestionsConfigured(settings)).toBe(false);
      expect(await lookupAddressSuggestions(suggestionQuery, { environment: settings, fetch: providerFetch })).toEqual(unavailable);
    }
    expect(providerFetch).not.toHaveBeenCalled();
    expect(areAddressSuggestionsConfigured(environment)).toBe(true);
    vi.stubEnv("PHOTON_BASE_URL", environment.PHOTON_BASE_URL);
    expect(areAddressSuggestionsConfigured()).toBe(true);
  });

  it("passes a typo query unchanged in one bounded no-store server call", async () => {
    const providerFetch = returning(photonFixture);
    expect(await lookupAddressSuggestions(suggestionQuery, { environment, fetch: providerFetch })).toEqual(suggestionFixture);
    expect(providerFetch).toHaveBeenCalledOnce();
    const [input, init] = providerFetch.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe("https://photon.example.test/api/");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: suggestionQuery, countrycode: "us", lang: "en", layer: "house", limit: "5" });
    expect(init).toMatchObject({ cache: "no-store", redirect: "error", credentials: "omit", referrerPolicy: "no-referrer" });
    expect(init?.headers).toEqual({ Accept: "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("supports operator-hosted subpaths without letting the query change the destination", async () => {
    const providerFetch = returning(photonFixture);
    const query = "https://attacker.example/?query=101 Main";
    await lookupAddressSuggestions(query, { environment: { NODE_ENV: "test", PHOTON_BASE_URL: "https://photon.example.test/geocoder" }, fetch: providerFetch });
    const url = new URL(String(providerFetch.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://photon.example.test/geocoder/api/");
    expect(url.searchParams.get("q")).toBe(query);
  });

  it("returns only deduplicated complete US street addresses with no provider metadata", async () => {
    const providerFetch = returning({ features: [
      photonHouse(), photonHouse({ countrycode: "us", street: " Example   Street ", osm_id: 200 }),
      photonHouse({ countrycode: "CA" }), photonHouse({ countrycode: undefined }),
      photonHouse({ housenumber: undefined }), photonHouse({ street: undefined }),
      photonHouse({ city: undefined, state: undefined, postcode: undefined }),
      photonHouse({ city: undefined, postcode: undefined }),
      photonHouse({ housenumber: "102", city: undefined, state: undefined }),
      photonHouse({ housenumber: "103", postcode: undefined }),
      photonHouse({ street: "unsafe\nStreet" }), photonHouse({ city: "unsafe\u202eCity" }),
      photonHouse({ street: "x".repeat(301) }), photonHouse({ postcode: "not-a-zip" }),
      photonHouse({ housenumber: 104 }), null, { properties: null },
    ] });
    const result = await lookupAddressSuggestions(suggestionQuery, { environment, fetch: providerFetch });
    expect(result).toEqual({ status: "ok", suggestions: [
      ...suggestionFixture.suggestions,
      { id: "suggestion-2", address: "102 Example Street, 90000" },
      { id: "suggestion-3", address: "103 Example Street, Sample City, California" },
    ] });
    for (const secret of [suggestionQuery, "coordinates", "osm_id", "120.123456", "35.123456"]) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });

  it("caps suggestions at five even when a provider ignores the requested limit", async () => {
    const providerFetch = returning({ features: Array.from({ length: 12 }, (_, index) => photonHouse({ housenumber: String(index + 100) })) });
    const result = await lookupAddressSuggestions(suggestionQuery, { environment, fetch: providerFetch });
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.suggestions).toHaveLength(5);
  });

  it("treats a valid empty response as no suggestions", async () => {
    expect(await lookupAddressSuggestions(suggestionQuery, { environment, fetch: returning({ features: [] }) })).toEqual({ status: "ok", suggestions: [] });
  });

  it("fails closed on bad provider status, shape, JSON, content type, or redirects", async () => {
    const redirected = Response.json(photonFixture);
    Object.defineProperty(redirected, "redirected", { value: true });
    for (const response of [
      new Response("sensitive provider error", { status: 429 }),
      new Response("sensitive provider error", { status: 503 }),
      new Response(null, { status: 302, headers: { location: "https://attacker.example" } }),
      Response.json({ features: "sensitive provider error" }),
      Response.json(null), new Response("{", { headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify(photonFixture), { headers: { "content-type": "text/html" } }), redirected,
    ]) {
      expect(await lookupAddressSuggestions(suggestionQuery, { environment, fetch: vi.fn<typeof fetch>().mockResolvedValue(response) })).toEqual(unavailable);
    }
  });

  it("bounds declared and streamed response sizes and cancels oversized bodies", async () => {
    for (const contentLength of ["65537", "invalid", "-1"]) {
      const cancel = vi.fn();
      const response = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json", "content-length": contentLength } });
      expect(await lookupAddressSuggestions(suggestionQuery, { environment, fetch: vi.fn<typeof fetch>().mockResolvedValue(response) })).toEqual(unavailable);
      expect(cancel).toHaveBeenCalledOnce();
    }
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel }), { headers: { "content-type": "application/json" } });
    expect(await lookupAddressSuggestions(suggestionQuery, { environment, fetch: vi.fn<typeof fetch>().mockResolvedValue(response) })).toEqual(unavailable);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("aborts and settles a hung fetch after three seconds without exposing the query", async () => {
    const providerFetch = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    const pending = lookupAddressSuggestions(suggestionQuery, { environment, fetch: providerFetch });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual(unavailable);
    expect(providerFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also times out a stalled response stream and cancels it", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } });
    const pending = lookupAddressSuggestions(suggestionQuery, { environment, fetch: vi.fn<typeof fetch>().mockResolvedValue(response) });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual(unavailable);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("propagates caller cancellation and skips provider work for an already aborted call", async () => {
    const controller = new AbortController();
    const providerFetch = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    const pending = lookupAddressSuggestions(suggestionQuery, { environment, fetch: providerFetch, signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual(unavailable);
    expect(providerFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    providerFetch.mockClear();
    expect(await lookupAddressSuggestions(suggestionQuery, { environment, fetch: providerFetch, signal: controller.signal })).toEqual(unavailable);
    expect(providerFetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never reflects or logs network error contents", async () => {
    const providerFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error(`PRIVATE ${suggestionQuery} ${environment.PHOTON_BASE_URL}`));
    expect(await lookupAddressSuggestions(suggestionQuery, { environment, fetch: providerFetch })).toEqual(unavailable);
  });
});

function returning(body: unknown) {
  return vi.fn<typeof fetch>().mockImplementation(async () => Response.json(body));
}
