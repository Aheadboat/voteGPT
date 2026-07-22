import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { lookupCensus } from "./census-geocoder";
import { lookupGoogleAddress } from "./google-civic";
import {
  MAX_LATITUDE_ABSOLUTE_DEGREES,
  MAX_LONGITUDE_ABSOLUTE_DEGREES,
  MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS,
  RESIDENCE_RESOLUTION_TOKEN_VERSION,
  canonicalizeResidenceCoordinate,
  isResidenceAddressGrammar,
  isV2ResolutionTokenGrammar,
} from "./residence-policy";

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
  input: ResidenceInput,
  resolution: Extract<ResolutionOutcome, { status: "matched" | "partial" }>,
  userId: string,
  secret: string,
  now: Date,
) => { resolutionToken: string; expiresAt: string };

export type VerifyResolutionToken = (
  token: string,
  userId: string,
  expectedInput: ResidenceInput,
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
const tokenVersion = RESIDENCE_RESOLUTION_TOKEN_VERSION;
const tokenLifetimeMilliseconds = 10 * 60 * 1_000;
const tokenPurpose = `voteGPT/residence-resolution/${tokenVersion}`;
const providerTimeoutMilliseconds = 5_000;
const maximumPublicCollectionSize = 64;
const maximumPublicTextLength = 2_048;
const maximumDecodePasses = 4;
const decimalDigitZeroCodePoints = [
  0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6,
  0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0xf20, 0x1040, 0x1090,
  0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0,
  0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0, 0xa9f0, 0xaa50,
  0xabf0, 0xff10, 0x104a0, 0x10d30, 0x10d40, 0x11066, 0x110f0,
  0x11136, 0x111d0, 0x112f0, 0x11450, 0x114d0, 0x11650, 0x116c0,
  0x116d0, 0x116da, 0x11730, 0x118e0, 0x11950, 0x11bf0, 0x11c50,
  0x11d50, 0x11da0, 0x11de0, 0x11f50, 0x16130, 0x16a60, 0x16ac0,
  0x16b50, 0x16d70, 0x1ccf0, 0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec,
  0x1d7f6, 0x1e140, 0x1e2f0, 0x1e4f0, 0x1e5f1, 0x1e950, 0x1fbf0,
] as const;
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
    return isResidenceAddressGrammar(address)
      ? { kind: "address", address }
      : null;
  }

  if (value.kind === "coordinates" && hasExactKeys(value, coordinateKeys)) {
    const { latitude, longitude } = value;
    const canonicalLatitude = canonicalizeResidenceCoordinate(
      latitude,
      MAX_LATITUDE_ABSOLUTE_DEGREES,
    );
    const canonicalLongitude = canonicalizeResidenceCoordinate(
      longitude,
      MAX_LONGITUDE_ABSOLUTE_DEGREES,
    );
    if (canonicalLatitude === null || canonicalLongitude === null) {
      return null;
    }

    return {
      kind: "coordinates",
      latitude: Number(canonicalLatitude),
      longitude: Number(canonicalLongitude),
    };
  }

  return null;
};

export const createResolutionToken: CreateResolutionToken = (
  input,
  resolution,
  userId,
  secret,
  now,
) => {
  const canonicalInput = parseResidenceInput(input);
  if (canonicalInput === null) {
    throw new Error("Cannot sign an invalid residence resolution.");
  }
  let normalizedResolution: ResolvedResidence;
  try {
    normalizedResolution = copyResolvedResidence(resolution);
  } catch {
    throw new Error("Cannot sign an invalid residence resolution.");
  }
  if (!isPublicResidenceResolution(normalizedResolution, canonicalInput)) {
    throw new Error("Cannot sign an invalid residence resolution.");
  }

  const expiresAt = new Date(
    now.getTime() + tokenLifetimeMilliseconds,
  ).toISOString();
  const payload = {
    version: tokenVersion,
    input: canonicalInput,
    userId,
    issuedAt: now.toISOString(),
    expiresAt,
    resolution: normalizedResolution,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  if (encodedPayload.length > MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS) {
    throw new Error("Cannot sign an invalid residence resolution.");
  }
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
  expectedInput,
  secret,
  now,
) => {
  if (!isV2ResolutionTokenGrammar(token)) {
    return null;
  }

  try {
    const [version, encodedPayload, receivedSignature] = token.split(".");

    const actualSignature = Buffer.from(receivedSignature, "base64url");
    if (actualSignature.toString("base64url") !== receivedSignature) {
      return null;
    }
    const expectedSignature = Buffer.from(
      sign(`${version}.${encodedPayload}`, secret),
      "base64url",
    );
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;
    if (!isResolutionTokenPayload(payload, userId, expectedInput, now)) {
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
  expectedInput: ResidenceInput,
  now: Date,
): value is {
  version: typeof RESIDENCE_RESOLUTION_TOKEN_VERSION;
  input: ResidenceInput;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  resolution: ResolvedResidence;
} {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      new Set([
        "version",
        "input",
        "userId",
        "issuedAt",
        "expiresAt",
        "resolution",
      ]),
    ) ||
    value.version !== tokenVersion
  ) {
    return false;
  }

  const input = parseResidenceInput(value.input);
  if (
    input === null ||
    value.userId !== userId ||
    !sameResidenceInput(input, expectedInput) ||
    !isIsoDate(value.issuedAt) ||
    !isIsoDate(value.expiresAt) ||
    Date.parse(value.issuedAt) > Date.parse(value.expiresAt) ||
    Date.parse(value.issuedAt) > now.getTime() ||
    Date.parse(value.expiresAt) - Date.parse(value.issuedAt) !==
      tokenLifetimeMilliseconds ||
    Date.parse(value.expiresAt) <= now.getTime() ||
    !isPublicResidenceResolution(value.resolution, input)
  ) {
    return false;
  }

  return true;
}

function sameResidenceInput(value: unknown, expected: ResidenceInput) {
  const actualInput = parseResidenceInput(value);
  const expectedInput = parseResidenceInput(expected);
  return (
    actualInput !== null &&
    expectedInput !== null &&
    JSON.stringify(actualInput) === JSON.stringify(expectedInput)
  );
}

export function isPublicResidenceResolution(
  value: unknown,
  input?: ResidenceInput,
): value is Extract<ResolutionOutcome, { status: "matched" | "partial" }> {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      new Set(["status", "divisions", "source", "coverageNotes"]),
    ) ||
    (value.status !== "matched" && value.status !== "partial") ||
    !Array.isArray(value.divisions) ||
    value.divisions.length > maximumPublicCollectionSize ||
    !value.divisions.every(isDivision) ||
    !isSource(value.source) ||
    !Array.isArray(value.coverageNotes) ||
    value.coverageNotes.length > maximumPublicCollectionSize ||
    !value.coverageNotes.every(isBoundedPublicText)
  ) {
    return false;
  }

  return (
    input === undefined ||
    !reflectsResidenceInput(value as ResolvedResidence, input)
  );
}

function isDivision(value: unknown): value is ResolvedResidence["divisions"][number] {
  return (
    isRecord(value) &&
    hasExactKeys(value, new Set(["type", "name", "id", "idScheme"])) &&
    typeof value.type === "string" &&
    divisionTypes.has(value.type as DivisionType) &&
    isBoundedPublicText(value.name) &&
    isBoundedPublicText(value.id) &&
    isBoundedPublicText(value.idScheme)
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
    !isBoundedPublicText(value.name) ||
    !isBoundedPublicText(value.url) ||
    sourceUrlsByName.get(value.name) !== value.url ||
    !isIsoDate(value.checkedAt) ||
    !(value.effectiveAt === null || isIsoDate(value.effectiveAt)) ||
    !(
      value.benchmark === undefined || isBoundedPublicText(value.benchmark)
    ) ||
    !(value.vintage === undefined || isBoundedPublicText(value.vintage))
  ) {
    return false;
  }

  return true;
}

function reflectsResidenceInput(
  resolution: ResolvedResidence,
  input: ResidenceInput,
) {
  const fields = publicResolutionFields(resolution);
  return input.kind === "address"
    ? reflectsAddress(fields, input.address)
    : reflectsCoordinates(fields, input.latitude, input.longitude);
}

type PublicResolutionField = {
  aggregateOnly?: boolean;
  kind: "identifier" | "prose" | "timestamp";
  text: string;
};

function publicResolutionFields(
  resolution: ResolvedResidence,
): PublicResolutionField[] {
  return [
    ...resolution.divisions.flatMap(({ id, idScheme, name, type }) => [
      { kind: "prose" as const, text: name },
      { kind: "prose" as const, text: type.replaceAll("_", " ") },
      { kind: "identifier" as const, text: id },
      { kind: "identifier" as const, text: idScheme },
    ]),
    { aggregateOnly: true, kind: "prose", text: resolution.source.name },
    { aggregateOnly: true, kind: "identifier", text: resolution.source.url },
    { kind: "timestamp", text: resolution.source.checkedAt },
    ...(resolution.source.effectiveAt === null
      ? []
      : [{ kind: "timestamp" as const, text: resolution.source.effectiveAt }]),
    ...(resolution.source.benchmark === undefined
      ? []
      : [{ kind: "identifier" as const, text: resolution.source.benchmark }]),
    ...(resolution.source.vintage === undefined
      ? []
      : [{ kind: "identifier" as const, text: resolution.source.vintage }]),
    ...resolution.coverageNotes.map((text) => ({ kind: "prose" as const, text })),
  ];
}

function reflectsAddress(fields: PublicResolutionField[], address: string) {
  const normalizedAddress = normalizeWordTokens(address).join("");
  if (normalizedAddress.length === 0) {
    return true;
  }

  const layers = fields.map((field) => ({
    aggregateOnly: field.aggregateOnly ?? false,
    layers: decodePublicText(field.text),
  }));
  return (
    layers.some((fieldLayers) => fieldLayers === null) ||
    containsAddressAcrossPublicFields(layers, normalizedAddress)
  );
}

function containsAddressAcrossPublicFields(
  layersByField: Array<{ aggregateOnly: boolean; layers: string[] | null }>,
  target: string,
) {
  let carriedMatches: Array<{ offset: number; startedAt: number }> = [];

  for (const [fieldIndex, field] of layersByField.entries()) {
    const { aggregateOnly, layers } = field;
    if (layers === null) {
      return true;
    }

    const nextMatches = new Map<string, { offset: number; startedAt: number }>();
    for (const layer of layers) {
      let matches = carriedMatches;
      for (const token of normalizeWordTokens(layer)) {
        const followingMatches = new Map<string, { offset: number; startedAt: number }>();
        for (const match of [...matches, { offset: 0, startedAt: fieldIndex }]) {
          if (!target.startsWith(token, match.offset)) {
            continue;
          }
          const nextOffset = match.offset + token.length;
          if (nextOffset === target.length) {
            if (match.startedAt !== fieldIndex || !aggregateOnly) {
              return true;
            }
            continue;
          }
          followingMatches.set(`${nextOffset}:${match.startedAt}`, {
            offset: nextOffset,
            startedAt: match.startedAt,
          });
        }
        matches = [...followingMatches.values()];
      }
      for (const match of matches) {
        if (match.offset !== 0) {
          nextMatches.set(`${match.offset}:${match.startedAt}`, match);
        }
      }
    }
    carriedMatches = [...nextMatches.values()];
  }

  return false;
}

function reflectsCoordinates(
  fields: PublicResolutionField[],
  latitude: number,
  longitude: number,
) {
  for (const field of fields) {
    const layers = decodePublicText(field.text);
    if (layers === null) {
      return true;
    }
    const fieldKind = field.kind;
    if (fieldKind === "timestamp") {
      continue;
    }
    if (
      layers.some((layer) =>
        containsCoordinate(layer, latitude, longitude),
      )
    ) {
      return true;
    }
  }

  return false;
}

function decodePublicText(value: string) {
  const layers = [value];
  let decoded = value;
  for (let pass = 0; pass < maximumDecodePasses; pass += 1) {
    const next = decodePublicTextLayer(decoded);
    if (next === null) {
      return null;
    }
    if (next === decoded) {
      return layers;
    }
    decoded = next;
    layers.push(decoded);
  }

  return decodePublicTextLayer(decoded) === null || /%[\da-f]{2}/iu.test(decoded)
    ? null
    : layers;
}

function decodePublicTextLayer(value: string) {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "+") {
      decoded += " ";
      continue;
    }
    if (character !== "%") {
      decoded += character;
      continue;
    }

    if (!isPercentEscape(value, index)) {
      if (isLiteralPercentage(value, index)) {
        decoded += character;
        continue;
      }
      return null;
    }

    let end = index;
    while (isPercentEscape(value, end)) {
      end += 3;
    }
    try {
      decoded += decodeURIComponent(value.slice(index, end));
    } catch {
      return null;
    }
    index = end - 1;
  }

  return decoded;
}

function isPercentEscape(value: string, index: number) {
  return value[index] === "%" && /^[\da-f]{2}$/iu.test(value.slice(index + 1, index + 3));
}

function isLiteralPercentage(value: string, index: number) {
  const previous = value[index - 1];
  const next = value[index + 1];
  return (
    previous !== undefined &&
    /\p{N}/u.test(previous) &&
    (next === undefined || /[\s\p{P}]/u.test(next))
  );
}

function normalizeWordTokens(value: string) {
  const normalized = normalizeUnicodeNumbers(value)
    .toLowerCase()
    .replace(/\p{Default_Ignorable_Code_Point}+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return normalized.length === 0 ? [] : normalized.split(/\s+/u);
}

function normalizeUnicodeNumbers(value: string) {
  const folded = value.normalize("NFKD").replace(/\p{M}+/gu, "");
  return Array.from(folded, (character) => {
    const codePoint = character.codePointAt(0);
    const zero = decimalDigitZeroCodePoints.find(
      (candidate) =>
        codePoint !== undefined &&
        codePoint >= candidate &&
        codePoint <= candidate + 9,
    );
    return zero === undefined || codePoint === undefined
      ? character
      : String(codePoint - zero);
  }).join("");
}

function containsCoordinate(
  value: string,
  latitude: number,
  longitude: number,
) {
  const normalized = normalizeNumericText(value);
  const labelled = /\b(?:coordinates?|gps|lat(?:itude)?|l(?:on|ng|ongitude))\b/iu.test(
    normalized,
  );
  const numericText = labelled
    ? normalized.replace(/(?<=\d)[,/](?=\d)/gu, ".")
    : normalized;
  const numericPattern =
    /(?<![\p{L}\p{N}])[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+\-]?\d+)?(?![\p{L}\p{N}])/giu;

  for (const match of numericText.matchAll(numericPattern)) {
    const token = match[0];
    const number = Number(token);
    if (number !== latitude && number !== longitude) {
      continue;
    }

    const wholeField = numericText.trim() === token;
    if (
      wholeField ||
      labelled ||
      /[+\-.e]/iu.test(token)
    ) {
      return true;
    }
  }

  return false;
}

function normalizeNumericText(value: string) {
  return normalizeUnicodeNumbers(value.replaceAll("\uff0f", "."))
    .toLowerCase()
    .replace(/\p{Default_Ignorable_Code_Point}+/gu, "")
    .replaceAll("\u2212", "-")
    .replaceAll("\u066b", ".");
}

function isBoundedPublicText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumPublicTextLength
  );
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
