import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { lookupCensus } from "./census-geocoder";
import { lookupGoogleAddress } from "./google-civic";

export type ResidenceInput =
  | { kind: "address"; address: string }
  | { kind: "coordinates"; latitude: number; longitude: number };

type DivisionType =
  | "country"
  | "state"
  | "county"
  | "congressional_district"
  | "state_upper"
  | "state_lower"
  | "place"
  | "other";

type ResolvedResidence = {
  status: "matched" | "partial";
  divisions: Array<{
    type: DivisionType;
    name: string;
    id: string;
    idScheme: string;
  }>;
  source: {
    name: string;
    url: string;
    checkedAt: string;
    effectiveAt: string | null;
    benchmark?: string;
    vintage?: string;
  };
  coverageNotes: string[];
};

export type ResolutionOutcome =
  | ResolvedResidence
  | { status: "no_match" | "ambiguous" | "unavailable" };

export type ResolutionResponse =
  | (ResolvedResidence & { resolutionToken: string; expiresAt: string })
  | { status: "no_match" | "ambiguous"; message: string };

export type ResolutionErrorResponse = {
  status: "invalid_request" | "unauthenticated" | "forbidden" | "unavailable";
  message: string;
};

export type ProviderOutcome =
  | ResolvedResidence
  | { status: "no_match" | "ambiguous" }
  | {
      status: "unavailable";
      reason: "timeout" | "quota" | "auth" | "provider_error" | "malformed";
    };

export type ParseResidenceInput = (value: unknown) => ResidenceInput | null;

export type CreateResolutionToken = (
  resolution: Extract<ResolutionOutcome, { status: "matched" | "partial" }>,
  userId: string,
  secret: string,
  now: Date,
) => { resolutionToken: string; expiresAt: string };

export type VerifyResolutionToken = (
  token: string,
  userId: string,
  secret: string,
  now: Date,
) => Extract<ResolutionOutcome, { status: "matched" | "partial" }> | null;

export type GoogleAddressLookup = (
  address: string,
  options: {
    apiKey: string;
    checkedAt: string;
    fetch: typeof globalThis.fetch;
    signal: AbortSignal;
  },
) => Promise<ProviderOutcome>;

export type CensusLookup = (
  input: ResidenceInput,
  options: {
    checkedAt: string;
    fetch: typeof globalThis.fetch;
    signal: AbortSignal;
  },
) => Promise<ProviderOutcome>;

type ResolverDependencies = {
  google: (
    address: string,
    context: { checkedAt: string; signal: AbortSignal },
  ) => Promise<ProviderOutcome>;
  census: (
    input: ResidenceInput,
    context: { checkedAt: string; signal: AbortSignal },
  ) => Promise<ProviderOutcome>;
  now: () => Date;
};

export type ResolveResidence = (
  input: ResidenceInput,
  testDependencies?: ResolverDependencies,
) => Promise<ResolutionOutcome>;

const addressKeys = new Set(["kind", "address"]);
const coordinateKeys = new Set(["kind", "latitude", "longitude"]);
const tokenVersion = "v1";
const tokenLifetimeMilliseconds = 10 * 60 * 1_000;
const tokenPurpose = "voteGPT/residence-resolution/v1";
const providerTimeoutMilliseconds = 5_000;
const sourceUrlsByName: ReadonlyMap<string, string> = new Map([
  [
    "Google Civic Information API",
    "https://developers.google.com/civic-information",
  ],
  ["U.S. Census Geocoder", "https://geocoding.geo.census.gov/geocoder/"],
]);
const divisionTypes = new Set<DivisionType>([
  "country",
  "state",
  "county",
  "congressional_district",
  "state_upper",
  "state_lower",
  "place",
  "other",
]);

export const parseResidenceInput: ParseResidenceInput = (value) => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.kind === "address" && hasExactKeys(value, addressKeys)) {
    if (typeof value.address !== "string") {
      return null;
    }

    const address = value.address.trim();
    return address.length >= 1 && address.length <= 300
      ? { kind: "address", address }
      : null;
  }

  if (value.kind === "coordinates" && hasExactKeys(value, coordinateKeys)) {
    const { latitude, longitude } = value;
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    return { kind: "coordinates", latitude, longitude };
  }

  return null;
};

export const createResolutionToken: CreateResolutionToken = (
  resolution,
  userId,
  secret,
  now,
) => {
  const normalizedResolution = copyResolvedResidence(resolution);
  if (!isResolvedResidence(normalizedResolution)) {
    throw new Error("Cannot sign an invalid residence resolution.");
  }

  const expiresAt = new Date(
    now.getTime() + tokenLifetimeMilliseconds,
  ).toISOString();
  const payload = {
    version: tokenVersion,
    userId,
    issuedAt: now.toISOString(),
    expiresAt,
    resolution: normalizedResolution,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signingInput = `${tokenVersion}.${encodedPayload}`;
  const signature = sign(signingInput, secret);

  return {
    resolutionToken: `${signingInput}.${signature}`,
    expiresAt,
  };
};

export const verifyResolutionToken: VerifyResolutionToken = (
  token,
  userId,
  secret,
  now,
) => {
  try {
    const [version, encodedPayload, receivedSignature, extra] = token.split(".");
    if (
      version !== tokenVersion ||
      !encodedPayload ||
      !receivedSignature ||
      extra !== undefined
    ) {
      return null;
    }

    const expectedSignature = Buffer.from(
      sign(`${version}.${encodedPayload}`, secret),
      "base64url",
    );
    const actualSignature = Buffer.from(receivedSignature, "base64url");
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;
    if (!isResolutionTokenPayload(payload, userId, now)) {
      return null;
    }

    return copyResolvedResidence(payload.resolution);
  } catch {
    return null;
  }
};

export const resolveResidence: ResolveResidence = async (
  input,
  testDependencies,
) => {
  const dependencies = testDependencies ?? productionResolverDependencies();
  const checkedAt = dependencies.now().toISOString();

  if (input.kind === "coordinates") {
    const census = await attemptProvider((signal) =>
      dependencies.census(input, { checkedAt, signal }),
    );
    return resolutionOutcome(census);
  }

  const google = await attemptProvider((signal) =>
    dependencies.google(input.address, { checkedAt, signal }),
  );
  if (google.status === "matched") {
    return google;
  }

  const census = await attemptProvider((signal) =>
    dependencies.census(input, { checkedAt, signal }),
  );
  if (census.status === "matched" || census.status === "partial") {
    return census;
  }
  if (census.status === "ambiguous") {
    return { status: "ambiguous" };
  }
  if (census.status === "no_match") {
    return google.status === "ambiguous"
      ? { status: "ambiguous" }
      : { status: "no_match" };
  }
  return { status: "unavailable" };
};

function productionResolverDependencies(): ResolverDependencies {
  return {
    google: async (address, { checkedAt, signal }) => {
      const apiKey = process.env.GOOGLE_CIVIC_API_KEY?.trim();
      if (!apiKey) {
        return { status: "unavailable", reason: "auth" };
      }
      return lookupGoogleAddress(address, {
        apiKey,
        checkedAt,
        fetch: globalThis.fetch,
        signal,
      });
    },
    census: (input, { checkedAt, signal }) =>
      lookupCensus(input, {
        checkedAt,
        fetch: globalThis.fetch,
        signal,
      }),
    now: () => new Date(),
  };
}

async function attemptProvider(
  call: (signal: AbortSignal) => Promise<ProviderOutcome>,
): Promise<ProviderOutcome> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<ProviderOutcome>((resolve) => {
    timeout = setTimeout(() => {
      resolve({ status: "unavailable", reason: "timeout" });
      controller.abort();
    }, providerTimeoutMilliseconds);
  });

  try {
    return await Promise.race([call(controller.signal), timedOut]);
  } catch (error) {
    return {
      status: "unavailable",
      reason:
        controller.signal.aborted || isAbortError(error)
          ? "timeout"
          : "provider_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function resolutionOutcome(outcome: ProviderOutcome): ResolutionOutcome {
  if (outcome.status === "matched" || outcome.status === "partial") {
    return outcome;
  }
  if (outcome.status === "no_match" || outcome.status === "ambiguous") {
    return { status: outcome.status };
  }
  return { status: "unavailable" };
}

function isAbortError(value: unknown) {
  return isRecord(value) && value.name === "AbortError";
}

function sign(value: string, secret: string) {
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      Buffer.alloc(0),
      tokenPurpose,
      32,
    ),
  );
  return createHmac("sha256", key).update(value).digest("base64url");
}

function copyResolvedResidence(resolution: ResolvedResidence): ResolvedResidence {
  const source: ResolvedResidence["source"] = {
    name: resolution.source.name,
    url: resolution.source.url,
    checkedAt: resolution.source.checkedAt,
    effectiveAt: resolution.source.effectiveAt,
  };
  if (resolution.source.benchmark !== undefined) {
    source.benchmark = resolution.source.benchmark;
  }
  if (resolution.source.vintage !== undefined) {
    source.vintage = resolution.source.vintage;
  }

  return {
    status: resolution.status,
    divisions: resolution.divisions.map(({ type, name, id, idScheme }) => ({
      type,
      name,
      id,
      idScheme,
    })),
    source,
    coverageNotes: [...resolution.coverageNotes],
  };
}

function isResolutionTokenPayload(
  value: unknown,
  userId: string,
  now: Date,
): value is {
  version: "v1";
  userId: string;
  issuedAt: string;
  expiresAt: string;
  resolution: ResolvedResidence;
} {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      new Set(["version", "userId", "issuedAt", "expiresAt", "resolution"]),
    ) ||
    value.version !== tokenVersion ||
    value.userId !== userId ||
    !isIsoDate(value.issuedAt) ||
    !isIsoDate(value.expiresAt) ||
    Date.parse(value.issuedAt) > Date.parse(value.expiresAt) ||
    Date.parse(value.issuedAt) > now.getTime() ||
    Date.parse(value.expiresAt) - Date.parse(value.issuedAt) !==
      tokenLifetimeMilliseconds ||
    Date.parse(value.expiresAt) <= now.getTime() ||
    !isResolvedResidence(value.resolution)
  ) {
    return false;
  }

  return true;
}

function isResolvedResidence(value: unknown): value is ResolvedResidence {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      new Set(["status", "divisions", "source", "coverageNotes"]),
    ) ||
    (value.status !== "matched" && value.status !== "partial") ||
    !Array.isArray(value.divisions) ||
    !value.divisions.every(isDivision) ||
    !isSource(value.source) ||
    !Array.isArray(value.coverageNotes) ||
    !value.coverageNotes.every((note) => typeof note === "string")
  ) {
    return false;
  }

  return true;
}

function isDivision(value: unknown): value is ResolvedResidence["divisions"][number] {
  return (
    isRecord(value) &&
    hasExactKeys(value, new Set(["type", "name", "id", "idScheme"])) &&
    typeof value.type === "string" &&
    divisionTypes.has(value.type as DivisionType) &&
    typeof value.name === "string" &&
    typeof value.id === "string" &&
    typeof value.idScheme === "string"
  );
}

function isSource(value: unknown): value is ResolvedResidence["source"] {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set([
        "name",
        "url",
        "checkedAt",
        "effectiveAt",
        "benchmark",
        "vintage",
      ]),
    ) ||
    typeof value.name !== "string" ||
    typeof value.url !== "string" ||
    sourceUrlsByName.get(value.name) !== value.url ||
    !isIsoDate(value.checkedAt) ||
    !(value.effectiveAt === null || isIsoDate(value.effectiveAt)) ||
    !(value.benchmark === undefined || typeof value.benchmark === "string") ||
    !(value.vintage === undefined || typeof value.vintage === "string")
  ) {
    return false;
  }

  return true;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: Set<string>) {
  const keys = Object.keys(value);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}
