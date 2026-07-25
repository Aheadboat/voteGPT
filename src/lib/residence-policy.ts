export const RESIDENCE_RESOLUTION_TOKEN_VERSION = "v2";
export const RESIDENCE_HTTP_TIMEOUT_MS = 15_000;
export const GEOLOCATION_TIMEOUT_MS = 10_000;
export const SAVED_RESIDENCE_KEY_BATCH_SIZE = 100;
export const RESIDENCE_ROTATION_PROCESS_TIMEOUT_MS = 15_000;

export const MAX_RESIDENCE_ADDRESS_CHARACTERS = 300;
export const MAX_RESIDENCE_ADDRESS_UTF8_BYTES = 1_024;
export const MAX_JSON_ESCAPED_BYTES_PER_ADDRESS_CHARACTER = 6;
export const MAX_COORDINATE_DECIMAL_PLACES = 6;
export const MAX_LATITUDE_ABSOLUTE_DEGREES = 90;
export const MAX_LONGITUDE_ABSOLUTE_DEGREES = 180;
export const MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS = 8_192;
export const RESOLUTION_TOKEN_SIGNATURE_BYTES = 32;
export const RESIDENCE_PREVIEW_BODY_CAP_BYTES = 16_384;
export const SAVED_RESIDENCE_BODY_CAP_BYTES = 16_384;

const encoder = new TextEncoder();
const JSON_STRING_DELIMITER_BYTES = encoder.encode(JSON.stringify("")).byteLength;
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;
const CANONICAL_COORDINATE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export const MAX_RESIDENCE_ADDRESS_JSON_STRING_BYTES =
  MAX_RESIDENCE_ADDRESS_CHARACTERS *
    MAX_JSON_ESCAPED_BYTES_PER_ADDRESS_CHARACTER +
  JSON_STRING_DELIMITER_BYTES;

export const MAX_LATITUDE_CANONICAL_CHARACTERS =
  maximumCoordinateCharacters(MAX_LATITUDE_ABSOLUTE_DEGREES);
export const MAX_LONGITUDE_CANONICAL_CHARACTERS =
  maximumCoordinateCharacters(MAX_LONGITUDE_ABSOLUTE_DEGREES);

export const MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS = Math.ceil(
  (RESOLUTION_TOKEN_SIGNATURE_BYTES * 8) / 6,
);
export const MAX_RESOLUTION_TOKEN_CHARACTERS =
  RESIDENCE_RESOLUTION_TOKEN_VERSION.length +
  MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS +
  MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS +
  2;

const maximumAddress = "\u0000".repeat(MAX_RESIDENCE_ADDRESS_CHARACTERS);
const maximumResolutionToken = `${RESIDENCE_RESOLUTION_TOKEN_VERSION}.${"A".repeat(
  MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS,
)}.${"A".repeat(MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS)}`;

export const MAX_CANONICAL_RESIDENCE_PREVIEW_PAYLOAD_BYTES = utf8Bytes(
  JSON.stringify({ kind: "address", address: maximumAddress }),
);
export const MAX_CANONICAL_SAVED_RESIDENCE_PAYLOAD_BYTES = utf8Bytes(
  JSON.stringify({
    resolutionToken: maximumResolutionToken,
    consent: "saved-residence-v1",
  }),
);

export function isResidenceAddressGrammar(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Array.from(value).length > 0 &&
    Array.from(value).length <= MAX_RESIDENCE_ADDRESS_CHARACTERS &&
    utf8Bytes(value) <= MAX_RESIDENCE_ADDRESS_UTF8_BYTES
  );
}

export function canonicalizeResidenceCoordinate(
  value: unknown,
  maximumAbsoluteDegrees: number,
): string | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isFinite(maximumAbsoluteDegrees) ||
    maximumAbsoluteDegrees < 0 ||
    value < -maximumAbsoluteDegrees ||
    value > maximumAbsoluteDegrees
  ) {
    return null;
  }

  if (Object.is(value, -0)) {
    return "0";
  }

  const spelling = String(value);
  if (!CANONICAL_COORDINATE.test(spelling)) {
    return null;
  }

  const [whole, fraction] = spelling.split(".");
  if (
    fraction !== undefined &&
    fraction.length > MAX_COORDINATE_DECIMAL_PLACES
  ) {
    return null;
  }

  const canonicalFraction = fraction?.replace(/0+$/, "");
  const canonical = canonicalFraction
    ? `${whole}.${canonicalFraction}`
    : whole;

  return canonical === spelling ? canonical : null;
}

export function isV2ResolutionTokenGrammar(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const segments = value.split(".");
  if (segments.length !== 3) {
    return false;
  }

  const [version, payload, signature] = segments;
  return (
    version === RESIDENCE_RESOLUTION_TOKEN_VERSION &&
    payload.length >= 1 &&
    payload.length <= MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS &&
    BASE64URL_SEGMENT.test(payload) &&
    signature.length === MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS &&
    BASE64URL_SEGMENT.test(signature)
  );
}

function maximumCoordinateCharacters(maximumAbsoluteDegrees: number) {
  return `-${maximumAbsoluteDegrees - 1}.${"0".repeat(
    MAX_COORDINATE_DECIMAL_PLACES,
  )}`.length;
}

function utf8Bytes(value: string) {
  return encoder.encode(value).byteLength;
}
