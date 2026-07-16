import type { CensusLookup, ProviderOutcome } from "./residence";

const baseUrl = "https://geocoding.geo.census.gov/geocoder/geographies";
const sourceUrl = "https://geocoding.geo.census.gov/geocoder/";
const benchmark = "Public_AR_Current";
const vintage = "Current_Current";
const layers = "28,54,56,58,80,82";
const coverageNote =
  "Census coverage is partial and may omit local political divisions.";

type ResolvedProviderOutcome = Extract<
  ProviderOutcome,
  { divisions: unknown }
>;
type Division = ResolvedProviderOutcome["divisions"][number];

export const lookupCensus: CensusLookup = async (
  input,
  { checkedAt, fetch, signal },
) => {
  const endpoint = input.kind === "address" ? "onelineaddress" : "coordinates";
  const url = new URL(`${baseUrl}/${endpoint}`);
  url.searchParams.set("benchmark", benchmark);
  url.searchParams.set("vintage", vintage);
  url.searchParams.set("layers", layers);
  url.searchParams.set("format", "json");

  if (input.kind === "address") {
    url.searchParams.set("address", input.address);
  } else {
    url.searchParams.set("x", String(input.longitude));
    url.searchParams.set("y", String(input.latitude));
  }

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal });
  } catch (error) {
    return unavailable(
      signal.aborted || isAbortError(error) ? "timeout" : "provider_error",
    );
  }

  if (!response.ok) {
    return unavailable(response.status === 429 ? "quota" : "provider_error");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    return unavailable(
      signal.aborted || isAbortError(error) ? "timeout" : "malformed",
    );
  }

  if (!isRecord(payload) || !isRecord(payload.result)) {
    return unavailable("malformed");
  }

  const result = payload.result;
  if (!hasExpectedVersions(result.input)) {
    return unavailable("malformed");
  }

  let geographies: unknown;
  if (input.kind === "address") {
    if (!Array.isArray(result.addressMatches)) {
      return unavailable("malformed");
    }
    if (result.addressMatches.length === 0) {
      return { status: "no_match" };
    }
    if (!result.addressMatches.every(isAddressMatch)) {
      return unavailable("malformed");
    }
    if (result.addressMatches.length > 1) {
      return { status: "ambiguous" };
    }

    const match = result.addressMatches[0];
    geographies = match.geographies;
  } else {
    geographies = result.geographies;
  }

  const divisions = parseDivisions(geographies);
  if (divisions === null) {
    return unavailable("malformed");
  }
  if (divisions.length === 0) {
    return { status: "no_match" };
  }

  return {
    status: "partial",
    divisions,
    source: {
      name: "U.S. Census Geocoder",
      url: sourceUrl,
      checkedAt,
      effectiveAt: null,
      benchmark,
      vintage,
    },
    coverageNotes: [coverageNote],
  };
};

function parseDivisions(value: unknown): Division[] | null {
  if (!isRecord(value)) {
    return null;
  }

  const divisions: Division[] = [];
  for (const [layer, entries] of Object.entries(value)) {
    const type = divisionType(layer);
    if (type === null) {
      continue;
    }
    if (!Array.isArray(entries)) {
      return null;
    }

    for (const entry of entries) {
      if (
        !isRecord(entry) ||
        typeof entry.GEOID !== "string" ||
        entry.GEOID.length === 0 ||
        typeof entry.NAME !== "string" ||
        entry.NAME.length === 0
      ) {
        return null;
      }

      divisions.push({
        type,
        name: entry.NAME,
        id: entry.GEOID,
        idScheme: "census",
      });
    }
  }

  return divisions;
}

function divisionType(layer: string): Division["type"] | null {
  if (layer === "States") {
    return "state";
  }
  if (layer === "Counties") {
    return "county";
  }
  if (/^(?:\d+(?:st|nd|rd|th) )?Congressional Districts$/.test(layer)) {
    return "congressional_district";
  }
  if (/^(?:\d{4} )?State Legislative Districts - Upper$/.test(layer)) {
    return "state_upper";
  }
  if (/^(?:\d{4} )?State Legislative Districts - Lower$/.test(layer)) {
    return "state_lower";
  }
  if (layer === "Incorporated Places") {
    return "place";
  }
  return null;
}

function hasExpectedVersions(value: unknown) {
  return (
    isRecord(value) &&
    isRecord(value.benchmark) &&
    value.benchmark.benchmarkName === benchmark &&
    isRecord(value.vintage) &&
    value.vintage.vintageName === vintage
  );
}

function isAddressMatch(
  value: unknown,
): value is Record<string, unknown> & { geographies: Record<string, unknown> } {
  if (
    !isRecord(value) ||
    typeof value.matchedAddress !== "string" ||
    value.matchedAddress.length === 0 ||
    !isRecord(value.coordinates) ||
    typeof value.coordinates.x !== "number" ||
    !Number.isFinite(value.coordinates.x) ||
    typeof value.coordinates.y !== "number" ||
    !Number.isFinite(value.coordinates.y) ||
    !isRecord(value.geographies)
  ) {
    return false;
  }

  return parseDivisions(value.geographies) !== null;
}

function unavailable(
  reason: Extract<ProviderOutcome, { status: "unavailable" }>["reason"],
): ProviderOutcome {
  return { status: "unavailable", reason };
}

function isAbortError(value: unknown) {
  return isRecord(value) && value.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
