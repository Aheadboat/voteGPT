import { describe, expect, it } from "vitest";
import {
  GEOLOCATION_TIMEOUT_MS,
  MAX_CANONICAL_RESIDENCE_PREVIEW_PAYLOAD_BYTES,
  MAX_CANONICAL_SAVED_RESIDENCE_PAYLOAD_BYTES,
  MAX_COORDINATE_DECIMAL_PLACES,
  MAX_JSON_ESCAPED_BYTES_PER_ADDRESS_CHARACTER,
  MAX_LATITUDE_ABSOLUTE_DEGREES,
  MAX_LATITUDE_CANONICAL_CHARACTERS,
  MAX_LONGITUDE_ABSOLUTE_DEGREES,
  MAX_LONGITUDE_CANONICAL_CHARACTERS,
  MAX_RESIDENCE_ADDRESS_CHARACTERS,
  MAX_RESIDENCE_ADDRESS_JSON_STRING_BYTES,
  MAX_RESIDENCE_ADDRESS_UTF8_BYTES,
  MAX_RESOLUTION_TOKEN_CHARACTERS,
  MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS,
  MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS,
  RESIDENCE_HTTP_TIMEOUT_MS,
  RESIDENCE_RESOLUTION_TOKEN_VERSION,
  RESIDENCE_ROTATION_PROCESS_TIMEOUT_MS,
  RESOLUTION_TOKEN_SIGNATURE_BYTES,
  SAVED_RESIDENCE_KEY_BATCH_SIZE,
  canonicalizeResidenceCoordinate,
  isResidenceAddressGrammar,
  isV2ResolutionTokenGrammar,
} from "./residence-policy";

const encoder = new TextEncoder();

function utf8Bytes(value: string) {
  return encoder.encode(value).byteLength;
}

describe("residence policy", () => {
  it("names the shared version, timeout, batch, and address policies", () => {
    expect({
      tokenVersion: RESIDENCE_RESOLUTION_TOKEN_VERSION,
      residenceTimeout: RESIDENCE_HTTP_TIMEOUT_MS,
      geolocationTimeout: GEOLOCATION_TIMEOUT_MS,
      keyBatchSize: SAVED_RESIDENCE_KEY_BATCH_SIZE,
      rotationProcessTimeout: RESIDENCE_ROTATION_PROCESS_TIMEOUT_MS,
      addressCharacters: MAX_RESIDENCE_ADDRESS_CHARACTERS,
      addressUtf8Bytes: MAX_RESIDENCE_ADDRESS_UTF8_BYTES,
    }).toEqual({
      tokenVersion: "v2",
      residenceTimeout: 15_000,
      geolocationTimeout: 10_000,
      keyBatchSize: 100,
      rotationProcessTimeout: 15_000,
      addressCharacters: 300,
      addressUtf8Bytes: 1_024,
    });
  });

  it("keeps address character and UTF-8 ceilings independent at their boundaries", () => {
    const maximumCharacterAddress = "a".repeat(
      MAX_RESIDENCE_ADDRESS_CHARACTERS,
    );
    const oneExtraCharacterAddress = `${maximumCharacterAddress}a`;
    const fourByteCharacter = "\u{1F600}";
    const bytesPerFourByteCharacter = utf8Bytes(fourByteCharacter);

    expect(maximumCharacterAddress).toHaveLength(
      MAX_RESIDENCE_ADDRESS_CHARACTERS,
    );
    expect(oneExtraCharacterAddress).toHaveLength(
      MAX_RESIDENCE_ADDRESS_CHARACTERS + 1,
    );
    expect(utf8Bytes(maximumCharacterAddress)).toBeLessThanOrEqual(
      MAX_RESIDENCE_ADDRESS_UTF8_BYTES,
    );
    expect(isResidenceAddressGrammar(maximumCharacterAddress)).toBe(true);
    expect(isResidenceAddressGrammar(oneExtraCharacterAddress)).toBe(false);

    expect(MAX_RESIDENCE_ADDRESS_UTF8_BYTES % bytesPerFourByteCharacter).toBe(
      0,
    );
    const maximumUtf8Address = fourByteCharacter.repeat(
      MAX_RESIDENCE_ADDRESS_UTF8_BYTES / bytesPerFourByteCharacter,
    );
    const oneExtraUtf8CharacterAddress = `${maximumUtf8Address}${fourByteCharacter}`;

    expect(Array.from(maximumUtf8Address)).toHaveLength(
      MAX_RESIDENCE_ADDRESS_UTF8_BYTES / bytesPerFourByteCharacter,
    );
    expect(utf8Bytes(maximumUtf8Address)).toBe(
      MAX_RESIDENCE_ADDRESS_UTF8_BYTES,
    );
    expect(Array.from(oneExtraUtf8CharacterAddress)).toHaveLength(
      MAX_RESIDENCE_ADDRESS_UTF8_BYTES / bytesPerFourByteCharacter + 1,
    );
    expect(utf8Bytes(oneExtraUtf8CharacterAddress)).toBeGreaterThan(
      MAX_RESIDENCE_ADDRESS_UTF8_BYTES,
    );
    expect(Array.from(oneExtraUtf8CharacterAddress).length).toBeLessThanOrEqual(
      MAX_RESIDENCE_ADDRESS_CHARACTERS,
    );
    expect(isResidenceAddressGrammar(maximumUtf8Address)).toBe(true);
    expect(isResidenceAddressGrammar(oneExtraUtf8CharacterAddress)).toBe(false);
  });

  it("derives escaped-address and canonical payload maxima from named grammar bounds", () => {
    const worstCaseEscapedAddress = "\u0000".repeat(
      MAX_RESIDENCE_ADDRESS_CHARACTERS,
    );
    const serializedAddress = JSON.stringify(worstCaseEscapedAddress);

    expect(utf8Bytes(worstCaseEscapedAddress)).toBeLessThanOrEqual(
      MAX_RESIDENCE_ADDRESS_UTF8_BYTES,
    );
    expect(MAX_RESIDENCE_ADDRESS_JSON_STRING_BYTES).toBe(
      MAX_RESIDENCE_ADDRESS_CHARACTERS *
        MAX_JSON_ESCAPED_BYTES_PER_ADDRESS_CHARACTER +
        2,
    );
    expect(utf8Bytes(serializedAddress)).toBe(
      MAX_RESIDENCE_ADDRESS_JSON_STRING_BYTES,
    );
    expect(MAX_CANONICAL_RESIDENCE_PREVIEW_PAYLOAD_BYTES).toBeGreaterThan(
      MAX_RESIDENCE_ADDRESS_JSON_STRING_BYTES,
    );
    expect(MAX_CANONICAL_SAVED_RESIDENCE_PAYLOAD_BYTES).toBeGreaterThan(
      MAX_RESOLUTION_TOKEN_CHARACTERS,
    );
  });

  it("canonicalizes only finite in-range coordinates at named lexical bounds", () => {
    const latitude = `-${MAX_LATITUDE_ABSOLUTE_DEGREES - 1}.${"1".repeat(
      MAX_COORDINATE_DECIMAL_PLACES,
    )}`;
    const longitude = `-${MAX_LONGITUDE_ABSOLUTE_DEGREES - 1}.${"1".repeat(
      MAX_COORDINATE_DECIMAL_PLACES,
    )}`;

    expect(latitude).toHaveLength(MAX_LATITUDE_CANONICAL_CHARACTERS);
    expect(longitude).toHaveLength(MAX_LONGITUDE_CANONICAL_CHARACTERS);
    expect(
      canonicalizeResidenceCoordinate(
        Number(latitude),
        MAX_LATITUDE_ABSOLUTE_DEGREES,
      ),
    ).toBe(latitude);
    expect(
      canonicalizeResidenceCoordinate(
        Number(longitude),
        MAX_LONGITUDE_ABSOLUTE_DEGREES,
      ),
    ).toBe(longitude);
    expect(
      canonicalizeResidenceCoordinate(-0, MAX_LATITUDE_ABSOLUTE_DEGREES),
    ).toBe("0");
    expect(
      canonicalizeResidenceCoordinate(
        Number(`1.${"1".repeat(MAX_COORDINATE_DECIMAL_PLACES + 1)}`),
        MAX_LATITUDE_ABSOLUTE_DEGREES,
      ),
    ).toBeNull();

    const invalidCoordinates: Array<[unknown, number]> = [
      [Number.NaN, MAX_LATITUDE_ABSOLUTE_DEGREES],
      [Number.POSITIVE_INFINITY, MAX_LATITUDE_ABSOLUTE_DEGREES],
      [Number.NEGATIVE_INFINITY, MAX_LATITUDE_ABSOLUTE_DEGREES],
      [MAX_LATITUDE_ABSOLUTE_DEGREES + 0.000001, MAX_LATITUDE_ABSOLUTE_DEGREES],
      [
        -MAX_LONGITUDE_ABSOLUTE_DEGREES - 0.000001,
        MAX_LONGITUDE_ABSOLUTE_DEGREES,
      ],
      ["1", MAX_LATITUDE_ABSOLUTE_DEGREES],
    ];

    for (const [value, maximumAbsoluteDegrees] of invalidCoordinates) {
      expect(
        canonicalizeResidenceCoordinate(value, maximumAbsoluteDegrees),
      ).toBeNull();
    }
  });

  it("accepts only the bounded v2 token grammar before cryptographic verification", () => {
    const maximumSignatureCharacters = Math.ceil(
      (RESOLUTION_TOKEN_SIGNATURE_BYTES * 8) / 6,
    );
    const grammarOnlyToken = `${RESIDENCE_RESOLUTION_TOKEN_VERSION}.${"A".repeat(
      MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS,
    )}.${"B".repeat(MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS)}`;

    expect(MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS).toBe(
      maximumSignatureCharacters,
    );
    expect(grammarOnlyToken).toHaveLength(MAX_RESOLUTION_TOKEN_CHARACTERS);
    expect(isV2ResolutionTokenGrammar(grammarOnlyToken)).toBe(true);

    for (const token of [
      `${RESIDENCE_RESOLUTION_TOKEN_VERSION}.${"A".repeat(
        MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS + 1,
      )}.${"B".repeat(MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS)}`,
      `${RESIDENCE_RESOLUTION_TOKEN_VERSION}.${"A".repeat(
        MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS,
      )}.${"B".repeat(MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS + 1)}`,
      `${RESIDENCE_RESOLUTION_TOKEN_VERSION}.${"A".repeat(
        MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS,
      )}.${"+".repeat(MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS)}`,
      `${RESIDENCE_RESOLUTION_TOKEN_VERSION}..${"B".repeat(
        MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS,
      )}`,
      `v1.${"A".repeat(MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS)}.${"B".repeat(
        MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS,
      )}`,
      `${RESIDENCE_RESOLUTION_TOKEN_VERSION}.${"A".repeat(
        MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS,
      )}.${"B".repeat(MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS)}.extra`,
    ]) {
      expect(isV2ResolutionTokenGrammar(token)).toBe(false);
    }
  });
});
