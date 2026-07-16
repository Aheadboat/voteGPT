import type {
  GoogleAddressLookup,
  ProviderOutcome,
} from "./residence";

const endpoint =
  "https://www.googleapis.com/civicinfo/v2/divisionsByAddress";
const sourceUrl = "https://developers.google.com/civic-information";
const noMatchReasons = new Set([
  "parseError",
  "required",
  "invalidValue",
  "invalidQuery",
  "notFound",
]);
const authReasons = new Set([
  "unauthorized",
  "keyInvalid",
  "API_KEY_INVALID",
]);
const quotaReasons = new Set([
  "limitExceeded",
  "dailyLimitExceeded",
  "rateLimitExceeded",
  "RATE_LIMIT_EXCEEDED",
]);

export const lookupGoogleAddress: GoogleAddressLookup = async (
  address,
  { apiKey, checkedAt, fetch, signal },
) => {
  const requestUrl = new URL(endpoint);
  requestUrl.searchParams.set("address", address);
  requestUrl.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(requestUrl.toString(), {
      cache: "no-store",
      signal,
    });
  } catch (error) {
    return {
      status: "unavailable",
      reason:
        isAbortError(error) || signal.aborted ? "timeout" : "provider_error",
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return { status: "unavailable", reason: "timeout" };
    }
    return response.ok
      ? { status: "unavailable", reason: "malformed" }
      : unavailableFromStatus(response.status);
  }

  if (!response.ok) {
    return mapError(response.status, body);
  }

  return normalizeResponse(body, checkedAt);
};

function normalizeResponse(body: unknown, checkedAt: string): ProviderOutcome {
  if (
    !isRecord(body) ||
    body.kind !== "civicinfo#divisionsByAddressResponse" ||
    !isRecord(body.divisions)
  ) {
    return { status: "unavailable", reason: "malformed" };
  }

  const divisions: Extract<
    ProviderOutcome,
    { divisions: unknown }
  >["divisions"] = [];
  for (const [id, value] of Object.entries(body.divisions)) {
    if (
      !id.startsWith("ocd-division/") ||
      !isRecord(value) ||
      typeof value.name !== "string" ||
      value.name.trim() === ""
    ) {
      return { status: "unavailable", reason: "malformed" };
    }

    divisions.push({
      type: divisionType(id),
      name: value.name.trim(),
      id,
      idScheme: "ocd",
    });
  }

  if (divisions.length === 0) {
    return { status: "no_match" };
  }

  return {
    status: "matched",
    divisions,
    source: {
      name: "Google Civic Information API",
      url: sourceUrl,
      checkedAt,
      effectiveAt: null,
    },
    coverageNotes: ["Local divisions may be unavailable."],
  };
}

function mapError(status: number, body: unknown): ProviderOutcome {
  const reasons = errorReasons(body);
  if (reasons.some((reason) => noMatchReasons.has(reason))) {
    return { status: "no_match" };
  }
  if (reasons.includes("conflict")) {
    return { status: "ambiguous" };
  }
  if (reasons.some((reason) => authReasons.has(reason))) {
    return { status: "unavailable", reason: "auth" };
  }
  if (reasons.some((reason) => quotaReasons.has(reason))) {
    return { status: "unavailable", reason: "quota" };
  }
  return unavailableFromStatus(status);
}

function unavailableFromStatus(status: number): ProviderOutcome {
  if (status === 401) {
    return { status: "unavailable", reason: "auth" };
  }
  if (status === 429) {
    return { status: "unavailable", reason: "quota" };
  }
  return { status: "unavailable", reason: "provider_error" };
}

function errorReasons(body: unknown) {
  if (!isRecord(body) || !isRecord(body.error)) {
    return [];
  }

  const reasons: string[] = [];
  if (Array.isArray(body.error.errors)) {
    for (const error of body.error.errors) {
      if (isRecord(error) && typeof error.reason === "string") {
        reasons.push(error.reason);
      }
    }
  }

  if (Array.isArray(body.error.details)) {
    for (const detail of body.error.details) {
      if (
        isRecord(detail) &&
        detail["@type"] === "type.googleapis.com/google.rpc.ErrorInfo" &&
        typeof detail.reason === "string"
      ) {
        reasons.push(detail.reason);
      }
    }
  }

  return reasons;
}

function divisionType(id: string) {
  const segment = id.split("/").at(-1)?.split(":", 1)[0];
  switch (segment) {
    case "country":
    case "state":
    case "county":
    case "place":
      return segment;
    case "cd":
      return "congressional_district";
    case "sldu":
      return "state_upper";
    case "sldl":
      return "state_lower";
    default:
      return "other";
  }
}

function isAbortError(error: unknown) {
  return isRecord(error) && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
