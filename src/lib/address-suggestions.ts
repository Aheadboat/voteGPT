import "server-only";
import type {
  AddressSuggestion,
  AddressSuggestionResponse,
} from "./address-suggestions-contract";

const responseByteLimit = 65_536;
const timeoutMilliseconds = 3_000;
const suggestionLimit = 5;
const controlCharacters = /[\p{Cc}\p{Cf}]/u;
const unavailable: AddressSuggestionResponse = {
  status: "unavailable",
  message:
    "Address suggestions are temporarily unavailable. You can still enter an address manually.",
};

type LookupOptions = {
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export function areAddressSuggestionsConfigured(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return configuredBase(environment) !== null;
}

export async function lookupAddressSuggestions(
  query: string,
  {
    environment = process.env,
    fetch = globalThis.fetch,
    signal,
  }: LookupOptions = {},
): Promise<AddressSuggestionResponse> {
  const base = configuredBase(environment);
  if (base === null || signal?.aborted) return unavailable;

  // Only the operator's fixed base determines the destination. Precise input
  // remains transient and is sent only in this uncached, server-side TLS call.
  const url = new URL("api/", base);
  url.searchParams.set("q", query);
  url.searchParams.set("countrycode", "us");
  url.searchParams.set("lang", "en");
  url.searchParams.set("layer", "house");
  url.searchParams.set("limit", String(suggestionLimit));

  const controller = new AbortController();
  let stop: () => void = () => undefined;
  const interrupted = new Promise<AddressSuggestionResponse>((resolve) => {
    stop = () => {
      controller.abort();
      resolve(unavailable);
    };
  });
  const timer = setTimeout(stop, timeoutMilliseconds);
  signal?.addEventListener("abort", stop, { once: true });

  try {
    // The race also bounds implementations that fail to honor AbortSignal.
    return await Promise.race([
      requestSuggestions(url, fetch, controller.signal),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

function configuredBase(environment: NodeJS.ProcessEnv): URL | null {
  const value = environment.PHOTON_BASE_URL;
  if (!value || value !== value.trim() || /[?#]/u.test(value)) return null;
  try {
    const base = new URL(value);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      controlCharacters.test(value)
    ) {
      return null;
    }
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    return base;
  } catch {
    return null;
  }
}

async function requestSuggestions(
  url: URL,
  fetch: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<AddressSuggestionResponse> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal,
    });
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (
      signal.aborted ||
      !response.ok ||
      response.redirected ||
      (contentType !== "application/json" && contentType !== "application/geo+json")
    ) {
      cancelResponse(response);
      return unavailable;
    }

    const payload = await readProviderJson(response, signal);
    if (signal.aborted || !isRecord(payload) || !Array.isArray(payload.features)) {
      return unavailable;
    }

    const suggestions: AddressSuggestion[] = [];
    const seen = new Set<string>();
    for (const feature of payload.features) {
      const address = addressFromFeature(feature);
      if (address === null || seen.has(address.toLowerCase())) continue;
      seen.add(address.toLowerCase());
      suggestions.push({ id: `suggestion-${suggestions.length + 1}`, address });
      if (suggestions.length === suggestionLimit) break;
    }
    return { status: "ok", suggestions };
  } catch {
    // Provider failures can contain the private query or full URL. Never log
    // them or return provider-generated prose to the browser.
    return unavailable;
  }
}

async function readProviderJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (
    response.body === null ||
    (length !== null &&
      (!/^(?:0|[1-9]\d*)$/u.test(length) ||
        !Number.isSafeInteger(Number(length)) ||
        Number(length) > responseByteLimit))
  ) {
    cancelResponse(response);
    return null;
  }

  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > responseByteLimit) {
        cancel();
        return null;
      }
      chunks.push(value);
    }
    if (signal.aborted) return null;
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    cancel();
    return null;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function addressFromFeature(feature: unknown): string | null {
  if (!isRecord(feature) || !isRecord(feature.properties)) return null;
  const properties = feature.properties;
  if (
    typeof properties.countrycode !== "string" ||
    properties.countrycode.toLowerCase() !== "us"
  ) return null;

  const house = cleanString(properties.housenumber, 24);
  const street = cleanString(properties.street, 160);
  const city = cleanString(properties.city, 100);
  const state = cleanString(properties.state, 100);
  const postcode = cleanString(properties.postcode, 10);
  // Reject malformed present address fields rather than silently removing
  // dangerous or misleading parts from a provider-generated suggestion.
  if (
    !house || !street ||
    (properties.city !== undefined && city === null) ||
    (properties.state !== undefined && state === null) ||
    (properties.postcode !== undefined && postcode === null) ||
    (postcode !== null && !/^\d{5}(?:-\d{4})?$/u.test(postcode)) ||
    (!(city && state) && !postcode)
  ) return null;

  const region = [state, postcode].filter(Boolean).join(" ");
  const address = [`${house} ${street}`, city, region].filter(Boolean).join(", ");
  return address.length <= 300 ? address : null;
}

function cleanString(value: unknown, limit: number): string | null {
  if (typeof value !== "string" || value.length > limit || controlCharacters.test(value)) {
    return null;
  }
  return value.trim().replace(/\s+/gu, " ") || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cancelResponse(response: Response) {
  void response.body?.cancel().catch(() => undefined);
}
