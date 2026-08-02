import "server-only";

import {
  MAX_STATE_ROSTER_RECORDS,
  MAX_STATE_ROSTER_SOURCES,
  stateJurisdictionFromDivisions,
  type StateJurisdiction,
  type StateRosterInput,
} from "./state-officials";
import {
  isSupportedStateLegislativeSourceState,
  validateStateLegislativeSourceUrl,
} from "./state-source-policy";

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
const MAX_DISTRICT_FILTERS = 3;
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
    for (const target of district.providerTargets) {
      const response = await fetchDistrict(
        jurisdiction.jurisdictionId,
        jurisdiction.stateCode.toLowerCase(),
        district,
        target,
        apiKey,
        checkedAt,
        retrievedAt,
        fetch,
        signal,
      );
      if (response.status === "unavailable") {
        return response;
      }
      if (people.length + response.people.length > MAX_STATE_ROSTER_RECORDS) {
        return unavailable("oversize");
      }
      for (const person of response.people) {
        if (personIds.has(person.id)) {
          return unavailable("malformed");
        }
        personIds.add(person.id);
        people.push(person);
      }
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
  target: StateJurisdiction["districts"][number]["providerTargets"][number],
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
    url.searchParams.set("district", target.label);
    url.searchParams.set("include", "sources");
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(PER_PAGE));
    const response = await requestJson(url, apiKey, fetch, signal);
    if (response.status === "unavailable") {
      return response;
    }
    const parsed = parsePage(response.body, jurisdiction, state, district, target, page, checkedAt, retrievedAt);
    if (parsed === "partial") {
      return unavailable("partial");
    }
    if (parsed === null) {
      return unavailable("malformed");
    }
    if (parsed.maxPage > MAX_PAGES || parsed.totalItems > MAX_STATE_ROSTER_RECORDS) {
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
      people.length + parsed.results.length > MAX_STATE_ROSTER_RECORDS
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
  target: StateJurisdiction["districts"][number]["providerTargets"][number],
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
  const people = value.results.map((person) => parsePerson(person, jurisdiction, state, district, target, checkedAt, retrievedAt));
  return people.some((person) => person === null) ? null : { results: people as Person[], maxPage, totalItems };
}

function parsePerson(
  value: unknown,
  jurisdiction: string,
  state: string,
  district: StateJurisdiction["districts"][number],
  target: StateJurisdiction["districts"][number]["providerTargets"][number],
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
  if (role.org_classification !== district.chamber || roleDistrict !== target.label || role.division_id !== target.divisionId || !publicText.test(role.title) || updatedAt === null || updatedAt > retrievedAt) {
    return null;
  }
  const sources = parseSources(value.sources, state, checkedAt);
  return sources === null ? null : { id: value.id, name: value.name, chamber: district.chamber, district: target.label, seat: role.title, sources };
}

function parseSources(values: readonly unknown[], state: string, checkedAt: string) {
  if (values.length === 0) return null;
  const urls = new Set<string>();
  const sources: Array<StateRosterInput["seats"][number]["people"][number]["sources"][number]> = [];
  for (const value of values) {
    if (
      !isRecord(value) ||
      !Object.hasOwn(value, "url") ||
      (Object.keys(value).length !== 1 && !(Object.keys(value).length === 2 && Object.hasOwn(value, "note"))) ||
      typeof value.url !== "string" ||
      (Object.hasOwn(value, "note") &&
        (typeof value.note !== "string" || value.note.length > 500 || /[\u0000-\u001f\u007f]/.test(value.note)))
    ) {
      return null;
    }
    const validation = validateStateLegislativeSourceUrl(value.url, state);
    if (validation.status === "invalid") return null;
    if (validation.status === "untrusted") continue;
    if (urls.has(value.url)) continue;
    if (sources.length >= MAX_STATE_ROSTER_SOURCES) return null;
    urls.add(value.url);
    sources.push({ sourceType: "official", publicUrl: value.url, retrievedAt: checkedAt, effectiveAt: null });
  }
  return sources.length === 0
    ? null
    : sources.sort((left, right) => compareText(left.publicUrl, right.publicUrl));
}

function isCanonicalJurisdiction(value: StateJurisdiction): boolean {
  if (!isRecord(value) || !stateCode.test(value.stateCode) || !Array.isArray(value.districts) || value.districts.length === 0 || value.districts.length > 2 || (value.legislature !== "bicameral" && value.legislature !== "unicameral")) return false;
  const state = value.stateCode.toLowerCase();
  if (!isSupportedStateLegislativeSourceState(state) || value.stateDivisionId !== `ocd-division/country:us/state:${state}` || value.jurisdictionId !== `ocd-jurisdiction/country:us/state:${state}/government`) return false;
  const chambers = new Set<string>();
  let filterCount = 0;
  for (const district of value.districts) {
    if (!isExactRecord(district, ["chamber", "district", "providerTargets", "divisionId"]) || (district.chamber !== "upper" && district.chamber !== "lower") || typeof district.district !== "string" || !isProviderTargets(district.providerTargets) || typeof district.divisionId !== "string" || !identifier.test(district.district) || !identifier.test(district.divisionId) || district.divisionId !== `ocd-division/country:us/state:${state}/sld${district.chamber === "upper" ? "u" : "l"}:${district.district}` || chambers.has(district.chamber)) return false;
    filterCount += district.providerTargets.length;
    chambers.add(district.chamber);
  }
  if (filterCount > MAX_DISTRICT_FILTERS) return false;
  const canonical = stateJurisdictionFromDivisions([
    { type: "state", name: state, id: value.stateDivisionId, idScheme: "ocd" },
    ...value.districts.map((district) => ({
      type: district.chamber === "upper" ? "state_upper" as const : "state_lower" as const,
      name: district.providerTargets[0].label,
      id: district.divisionId,
      idScheme: "ocd" as const,
    })),
  ]);
  return canonical.status === "available" &&
    canonical.jurisdiction.legislature === value.legislature &&
    canonical.jurisdiction.districts.every((district, index) =>
      district.chamber === value.districts[index]?.chamber &&
      district.district === value.districts[index]?.district &&
      sameProviderTargets(
        district.providerTargets,
        value.districts[index]?.providerTargets ?? [],
      ) &&
      district.divisionId === value.districts[index]?.divisionId,
    );
}

function isProviderTargets(
  value: unknown,
): value is StateJurisdiction["districts"][number]["providerTargets"] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) return false;
  const labels = new Set<string>();
  const divisions = new Set<string>();
  return value.every((target) => {
    if (
      !isExactRecord(target, ["label", "divisionId"]) ||
      typeof target.label !== "string" ||
      typeof target.divisionId !== "string" ||
      !publicText.test(target.label) ||
      !identifier.test(target.divisionId) ||
      labels.has(target.label) ||
      divisions.has(target.divisionId)
    ) return false;
    labels.add(target.label);
    divisions.add(target.divisionId);
    return true;
  });
}

function sameProviderTargets(
  left: StateJurisdiction["districts"][number]["providerTargets"],
  right: readonly Readonly<{ label: string; divisionId: string }>[],
): boolean {
  return left.length === right.length && left.every((target, index) =>
    target.label === right[index]?.label &&
    target.divisionId === right[index]?.divisionId,
  );
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
