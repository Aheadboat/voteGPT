export const googleCivicAddress =
  "123 Fixture Avenue, Example City, CA 90000";
export const googleCivicApiKey = "test-google-civic-key";
export const googleProviderProseSentinel = "SENTINEL GOOGLE PROVIDER PROSE";

export const googleCivicMatchedFixture = {
  kind: "civicinfo#divisionsByAddressResponse",
  normalizedInput: {
    locationName: "SENTINEL GOOGLE NORMALIZED INPUT",
    line1: googleCivicAddress,
    line2: "",
    line3: "",
    city: "Example City",
    state: "CA",
    zip: "90000",
  },
  divisions: {
    "ocd-division/country:us": { name: "United States" },
    "ocd-division/country:us/state:ca": { name: "California" },
    "ocd-division/country:us/state:ca/county:example": {
      name: "Example County",
    },
    "ocd-division/country:us/state:ca/cd:12": {
      name: "California Congressional District 12",
    },
    "ocd-division/country:us/state:ca/sldu:7": {
      name: "California State Senate District 7",
    },
    "ocd-division/country:us/state:ca/sldl:14": {
      name: "California State Assembly District 14",
    },
    "ocd-division/country:us/state:ca/place:example_city": {
      name: "Example City",
    },
    "ocd-division/country:us/state:ca/place:example_city/council_district:2": {
      name: "Example City Council District 2",
      alsoKnownAs: [
        "ocd-division/country:us/state:ca/place:example_city/ward:2",
      ],
    },
  },
} as const;

function googleError(code: number, reason: string) {
  return {
    error: {
      code,
      message: `${googleProviderProseSentinel}: ${reason}`,
      errors: [
        {
          domain: "global",
          reason,
          message: `${googleProviderProseSentinel}: ${reason}`,
        },
      ],
    },
  };
}

export const googleCivicErrorFixtures = {
  parseError: googleError(400, "parseError"),
  required: googleError(400, "required"),
  invalidValue: googleError(400, "invalidValue"),
  invalidQuery: googleError(400, "invalidQuery"),
  unauthorized: googleError(401, "unauthorized"),
  keyInvalid: googleError(400, "keyInvalid"),
  apiKeyInvalid: googleError(403, "API_KEY_INVALID"),
  limitExceeded: googleError(403, "limitExceeded"),
  dailyLimitExceeded: googleError(403, "dailyLimitExceeded"),
  notFound: googleError(404, "notFound"),
  conflict: googleError(409, "conflict"),
  rateLimitExceeded: googleError(429, "rateLimitExceeded"),
  backendError: googleError(503, "backendError"),
  unknown: googleError(418, "futureGoogleError"),
} as const;

function googleErrorInfo(code: number, status: string, reason: string) {
  return {
    error: {
      code,
      message: `${googleProviderProseSentinel}: ${reason}`,
      status,
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason,
          domain: "googleapis.com",
          metadata: { service: "civicinfo.googleapis.com" },
        },
        {
          "@type": "type.googleapis.com/google.rpc.LocalizedMessage",
          locale: "en-US",
          message: `${googleProviderProseSentinel}: ${reason}`,
        },
      ],
    },
  };
}

export const googleCivicModernErrorFixtures = {
  apiKeyInvalid: googleErrorInfo(400, "INVALID_ARGUMENT", "API_KEY_INVALID"),
  rateLimitExceeded: googleErrorInfo(
    403,
    "PERMISSION_DENIED",
    "RATE_LIMIT_EXCEEDED",
  ),
} as const;

export const googleCivicEmptyFixture = {
  kind: "civicinfo#divisionsByAddressResponse",
  normalizedInput: googleCivicMatchedFixture.normalizedInput,
  divisions: {},
} as const;

export const googleCivicMalformedFixture = {
  kind: "civicinfo#divisionsByAddressResponse",
  normalizedInput: googleCivicMatchedFixture.normalizedInput,
  divisions: {
    "ocd-division/country:us": { name: 42 },
  },
} as const;
