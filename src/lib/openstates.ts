import "server-only";

import type { StateJurisdiction, StateRosterInput } from "./state-officials";

export type OpenStatesFailureReason =
  | "auth"
  | "timeout"
  | "quota"
  | "provider_error"
  | "malformed"
  | "partial"
  | "oversize";

export type FetchStateLegislators = (
  jurisdiction: StateJurisdiction,
  options: Readonly<{
    apiKey: string;
    checkedAt: string;
    fetch: typeof globalThis.fetch;
    signal: AbortSignal;
  }>,
) => Promise<
  | Readonly<{ status: "available"; roster: StateRosterInput }>
  | Readonly<{ status: "unavailable"; reason: OpenStatesFailureReason }>
>;

type Chamber = "upper" | "lower";
type Page = Readonly<{ results: readonly Person[]; maxPage: number; totalItems: number }>;
type Person = Readonly<{
  id: string;
  name: string;
  chamber: Chamber;
  district: string;
  seat: string;
  sources: StateRosterInput["seats"][number]["people"][number]["sources"];
}>;
type JsonOutcome =
  | Readonly<{ status: "ok"; body: unknown }>
  | Readonly<{ status: "unavailable"; reason: OpenStatesFailureReason }>;

const ROOT = "https://v3.openstates.org";
const PER_PAGE = 20;
const MAX_PAGES = 5;
const MAX_RECORDS = 100;
const MAX_BODY_BYTES = 262_144;
const publicText = /^(?=.{1,200}$)[^\u0000-\u001f\u007f]+$/;
const identifier = /^(?=.{1,200}$)[^\s\u0000-\u001f\u007f]+$/;
const stateCode = /^[A-Z]{2}$/;

export const fetchStateLegislators: FetchStateLegislators = async (
  jurisdiction,
  { apiKey, checkedAt, fetch, signal },
) => {
  const retrievedAt = parseCanonicalInstant(checkedAt);
  if (retrievedAt === null || !isCanonicalJurisdiction(jurisdiction)) {
    return unavailable("malformed");
  }
  if (apiKey.trim() === "") {
    return unavailable("auth");
  }
  if (signal.aborted) {
    return unavailable("timeout");
  }

  const people: Person[] = [];
  const personIds = new Set<string>();
  for (const district of jurisdiction.districts) {
    const response = await fetchDistrict(
      jurisdiction.jurisdictionId,
      jurisdiction.stateCode.toLowerCase(),
      district,
      apiKey,
      checkedAt,
      retrievedAt,
      fetch,
      signal,
    );
    if (response.status === "unavailable") {
      return response;
    }
    for (const person of response.people) {
      if (personIds.has(person.id)) {
        return unavailable("malformed");
      }
      personIds.add(person.id);
      people.push(person);
    }
  }

  const seats = new Map<string, StateRosterInput["seats"][number]>();
  for (const person of people) {
    const key = `${person.chamber}\u0000${person.district}\u0000${person.seat}`;
    const existing = seats.get(key);
    const value = {
      id: person.id,
      name: person.name,
      role: {
        chamber: person.chamber,
        district: person.district,
        seat: person.seat,
        current: true,
      },
      sources: person.sources,
    } as const;
    if (existing === undefined) {
      seats.set(key, {
        chamber: person.chamber,
        district: person.district,
        seat: person.seat,
        people: [value],
        vacancySources: [],
      });
    } else {
      seats.set(key, { ...existing, people: [...existing.people, value] });
    }
  }

  return {
    status: "available",
    roster: {
      freshness: {
        checkedAt,
        refreshAfter: checkedAt,
        staleAfter: checkedAt,
        state: "fresh",
      },
      seats: [...seats.values()]
        .map((seat) => ({
          ...seat,
          people: [...seat.people].sort(comparePeople),
        }))
        .sort(compareSeats),
    },
  };
};

async function fetchDistrict(
  jurisdiction: string,
  state: string,
  district: StateJurisdiction["districts"][number],
  apiKey: string,
  checkedAt: string,
  retrievedAt: Date,
  fetch: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<
  | Readonly<{ status: "available"; people: readonly Person[] }>
  | Readonly<{ status: "unavailable"; reason: OpenStatesFailureReason }>
> {
  const people: Person[] = [];
  let totalItems: number | undefined;
  let maxPage: number | undefined;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL("/people", ROOT);
    url.searchParams.set("jurisdiction", jurisdiction);
    url.searchParams.set("org_classification", district.chamber);
    url.searchParams.set("district", district.district);
    url.searchParams.set("include", "sources");
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(PER_PAGE));
    const response = await requestJson(url, apiKey, fetch, signal);
    if (response.status === "unavailable") {
      return response;
    }
    const parsed = parsePage(response.body, jurisdiction, state, district, page, checkedAt, retrievedAt);
    if (parsed === "partial") {
      return unavailable("partial");
    }
    if (parsed === null) {
      return unavailable("malformed");
    }
    if (parsed.maxPage > MAX_PAGES || parsed.totalItems > MAX_RECORDS) {
      return unavailable("oversize");
    }
    const expectedMaxPage = Math.max(1, Math.ceil(parsed.totalItems / PER_PAGE));
    const expectedPageSize =
      page < parsed.maxPage
        ? PER_PAGE
        : parsed.totalItems - PER_PAGE * (parsed.maxPage - 1);
    if (
      parsed.maxPage !== expectedMaxPage ||
      parsed.results.length !== expectedPageSize ||
      (totalItems !== undefined && totalItems !== parsed.totalItems) ||
      (maxPage !== undefined && maxPage !== parsed.maxPage) ||
      people.length + parsed.results.length > MAX_RECORDS
    ) {
      return unavailable("partial");
    }
    totalItems = parsed.totalItems;
    maxPage = parsed.maxPage;
    people.push(...parsed.results);
    if (page === parsed.maxPage) {
      return people.length === parsed.totalItems
        ? { status: "available", people }
        : unavailable("partial");
    }
    if (parsed.results.length === 0) {
      return unavailable("partial");
    }
  }
  return unavailable("oversize");
}

async function requestJson(
  url: URL,
  apiKey: string,
  fetch: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<JsonOutcome> {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "X-API-KEY": apiKey },
      cache: "no-store",
      redirect: "error",
      signal,
    });
  } catch (error) {
    return unavailable(signal.aborted || isAbortError(error) ? "timeout" : "provider_error");
  }
  if (!response.ok) {
    return unavailable(response.status === 401 || response.status === 403 ? "auth" : response.status === 429 ? "quota" : "provider_error");
  }
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return unavailable("malformed");
  }
  return readJson(response, signal);
}

async function readJson(response: Response, signal: AbortSignal): Promise<JsonOutcome> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) {
    cancel(response.body);
    return unavailable("oversize");
  }
  if (response.body === null) {
    return unavailable("malformed");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await readChunk(reader, signal);
      if (chunk.done) {
        text += decoder.decode();
        try {
          return { status: "ok", body: JSON.parse(text) as unknown };
        } catch {
          return unavailable("malformed");
        }
      }
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        cancel(reader);
        return unavailable("oversize");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error) {
    cancel(reader);
    return unavailable(signal.aborted || isAbortError(error) ? "timeout" : "malformed");
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Stream cleanup never controls provider-failure classification.
    }
  }
}

function parsePage(
  value: unknown,
  jurisdiction: string,
  state: string,
  district: StateJurisdiction["districts"][number],
  expectedPage: number,
  checkedAt: string,
  retrievedAt: Date,
): Page | "partial" | null {
  if (!isExactRecord(value, ["results", "pagination"]) || !Array.isArray(value.results) || !isExactRecord(value.pagination, ["per_page", "page", "max_page", "total_items"])) {
    return null;
  }
  const { per_page: perPage, page, max_page: maxPage, total_items: totalItems } = value.pagination;
  if (!isPositiveInteger(perPage) || !isPositiveInteger(page) || !isPositiveInteger(maxPage) || !isNonNegativeInteger(totalItems) || perPage !== PER_PAGE || maxPage < page || totalItems < value.results.length) {
    return null;
  }
  if (page !== expectedPage) return "partial";
  const people = value.results.map((person) => parsePerson(person, jurisdiction, state, district, checkedAt, retrievedAt));
  return people.some((person) => person === null) ? null : { results: people as Person[], maxPage, totalItems };
}

function parsePerson(
  value: unknown,
  jurisdiction: string,
  state: string,
  district: StateJurisdiction["districts"][number],
  checkedAt: string,
  retrievedAt: Date,
): Person | null {
  const keys = ["id", "name", "party", "jurisdiction", "given_name", "family_name", "image", "email", "gender", "birth_date", "death_date", "extras", "created_at", "updated_at", "openstates_url", "current_role", "sources"];
  if (!isExactRecord(value, keys) || typeof value.id !== "string" || typeof value.name !== "string" || !identifier.test(value.id) || !publicText.test(value.name) || !isExactRecord(value.jurisdiction, ["id", "name", "classification"]) || value.jurisdiction.id !== jurisdiction || value.jurisdiction.classification !== "state" || !isExactRecord(value.current_role, ["title", "org_classification", "district", "division_id"]) || !Array.isArray(value.sources) || typeof value.updated_at !== "string") {
    return null;
  }
  const role = value.current_role;
  if (typeof role.title !== "string" || typeof role.org_classification !== "string" || typeof role.division_id !== "string") return null;
  const roleDistrict = typeof role.district === "string" || typeof role.district === "number" ? String(role.district) : null;
  const updatedAt = parseProviderInstant(value.updated_at);
  if (role.org_classification !== district.chamber || roleDistrict !== district.district || role.division_id !== district.divisionId || !publicText.test(role.title) || updatedAt === null || updatedAt > retrievedAt) {
    return null;
  }
  const sources = parseSources(value.sources, state, checkedAt, updatedAt.toISOString());
  return sources === null ? null : { id: value.id, name: value.name, chamber: district.chamber, district: district.district, seat: role.title, sources };
}

function parseSources(values: readonly unknown[], state: string, checkedAt: string, effectiveAt: string) {
  if (values.length === 0 || values.length > 8) return null;
  const urls = new Set<string>();
  const sources: Array<StateRosterInput["seats"][number]["people"][number]["sources"][number]> = [];
  for (const value of values) {
    if (!isRecord(value) || !Object.hasOwn(value, "url") || (Object.keys(value).length !== 1 && !(Object.keys(value).length === 2 && Object.hasOwn(value, "note"))) || typeof value.url !== "string" || !isOfficialSourceUrl(value.url, state) || urls.has(value.url)) {
      return null;
    }
    urls.add(value.url);
    sources.push({ sourceType: "official", publicUrl: value.url, retrievedAt: checkedAt, effectiveAt });
  }
  return sources.sort((left, right) => compareText(left.publicUrl, right.publicUrl));
}

function isCanonicalJurisdiction(value: StateJurisdiction): boolean {
  if (!isRecord(value) || !stateCode.test(value.stateCode) || !Array.isArray(value.districts) || value.districts.length === 0 || value.districts.length > 2 || (value.legislature !== "bicameral" && value.legislature !== "unicameral")) return false;
  const state = value.stateCode.toLowerCase();
  if (value.stateDivisionId !== `ocd-division/country:us/state:${state}` || value.jurisdictionId !== `ocd-jurisdiction/country:us/state:${state}/government`) return false;
  const chambers = new Set<string>();
  for (const district of value.districts) {
    if (!isExactRecord(district, ["chamber", "district", "divisionId"]) || (district.chamber !== "upper" && district.chamber !== "lower") || typeof district.district !== "string" || typeof district.divisionId !== "string" || !publicText.test(district.district) || !identifier.test(district.divisionId) || district.divisionId !== `ocd-division/country:us/state:${state}/sld${district.chamber === "upper" ? "u" : "l"}:${district.district}` || chambers.has(district.chamber)) return false;
    chambers.add(district.chamber);
  }
  return value.legislature === "bicameral" ? chambers.size === 2 : chambers.size === 1 && value.stateCode === "NE" && chambers.has("upper");
}

function isOfficialSourceUrl(value: string, state: string): boolean {
  try {
    const url = new URL(value);
    const stateSuffix = `.state.${state}.us`;
    return (
      url.toString() === value &&
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === "" &&
      ((url.hostname.length > 4 && url.hostname.endsWith(".gov")) ||
        (url.hostname.length > stateSuffix.length && url.hostname.endsWith(stateSuffix)))
    );
  } catch {
    return false;
  }
}

function parseCanonicalInstant(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : date;
}

function parseProviderInstant(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dateOnly = new Date(Date.UTC(year, month - 1, day));
  if (year < 1 || dateOnly.getUTCFullYear() !== year || dateOnly.getUTCMonth() !== month - 1 || dateOnly.getUTCDate() !== day) return null;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds);
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> { return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function isPositiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0; }
function isNonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function unavailable(reason: OpenStatesFailureReason) { return { status: "unavailable" as const, reason }; }
function isAbortError(error: unknown): boolean { return error instanceof DOMException && error.name === "AbortError"; }
function cancel(value: { cancel(): Promise<void> } | ReadableStreamDefaultReader<Uint8Array> | null) { try { void value?.cancel().catch(() => undefined); } catch { /* best-effort */ } }
function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException("Request timed out.", "AbortError"));
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const abort = () => reject(new DOMException("Request timed out.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    reader.read().then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function compareText(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function comparePeople(left: StateRosterInput["seats"][number]["people"][number], right: StateRosterInput["seats"][number]["people"][number]) { return compareText(left.name, right.name) || compareText(left.id, right.id); }
function compareSeats(left: StateRosterInput["seats"][number], right: StateRosterInput["seats"][number]) { return compareChambers(left.chamber, right.chamber) || compareText(left.district, right.district) || compareText(left.seat, right.seat); }
function compareChambers(left: Chamber, right: Chamber) { return left === right ? 0 : left === "upper" ? -1 : 1; }
