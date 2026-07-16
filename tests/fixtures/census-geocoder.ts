const benchmark = {
  id: "4",
  benchmarkName: "Public_AR_Current",
  benchmarkDescription: "Synthetic current address benchmark",
  isDefault: false,
};

const vintage = {
  id: "4",
  vintageName: "Current_Current",
  vintageDescription: "Synthetic current geography vintage",
  isDefault: false,
};

const selectedGeographies = {
  States: [
    {
      GEOID: "39",
      NAME: "Example State",
      CENTLAT: "+SENTINEL STATISTICAL LATITUDE",
    },
  ],
  Counties: [{ GEOID: "39049", NAME: "Example County" }],
  "119th Congressional Districts": [
    { GEOID: "3903", NAME: "Congressional District 3" },
  ],
  "2024 State Legislative Districts - Upper": [
    { GEOID: "39015", NAME: "State Senate District 15" },
  ],
  "2024 State Legislative Districts - Lower": [
    { GEOID: "39003", NAME: "State House District 3" },
  ],
  "Incorporated Places": [
    { GEOID: "3918000", NAME: "Example City" },
  ],
  "Census Tracts": [
    {
      GEOID: "SENTINEL-TRACT",
      NAME: "SENTINEL STATISTICAL LAYER",
    },
  ],
  "2020 Census Blocks": [
    {
      GEOID: "SENTINEL-BLOCK",
      NAME: "SENTINEL BLOCK LAYER",
    },
  ],
};

export const censusFixtureAddress =
  "742 SENTINEL RAW ADDRESS, EXAMPLE CITY, EX 00000";

export const censusFixtureCoordinates = {
  latitude: 12.345678,
  longitude: -98.765432,
} as const;

export const censusAddressResponse = {
  result: {
    input: {
      address: { address: censusFixtureAddress },
      benchmark,
      vintage,
    },
    addressMatches: [
      {
        matchedAddress: "742 SENTINEL NORMALIZED ADDRESS",
        coordinates: { x: -82.987654, y: 39.123456 },
        addressComponents: {
          city: "SENTINEL NORMALIZED CITY",
          state: "EX",
          zip: "00000",
        },
        geographies: selectedGeographies,
        providerNarrative: "SENTINEL PROVIDER PROSE",
      },
    ],
  },
} as const;

export const censusCoordinatesResponse = {
  result: {
    input: {
      location: {
        x: censusFixtureCoordinates.longitude,
        y: censusFixtureCoordinates.latitude,
      },
      benchmark,
      vintage,
    },
    geographies: {
      States: [{ GEOID: "06", NAME: "Coordinate Example State" }],
      Counties: [{ GEOID: "06037", NAME: "Coordinate Example County" }],
      "Census Designated Places": [
        { GEOID: "SENTINEL-CDP", NAME: "SENTINEL STATISTICAL PLACE" },
      ],
      "Census Block Groups": [
        {
          GEOID: "SENTINEL-BLOCK-GROUP",
          NAME: "SENTINEL COORDINATE STATISTICAL LAYER",
        },
      ],
      providerNarrative: "SENTINEL COORDINATE PROVIDER PROSE",
    },
  },
} as const;

export const censusEmptyAddressResponse = {
  result: {
    input: censusAddressResponse.result.input,
    addressMatches: [],
  },
} as const;

export const censusAmbiguousAddressResponse = {
  result: {
    input: censusAddressResponse.result.input,
    addressMatches: [
      censusAddressResponse.result.addressMatches[0],
      {
        ...censusAddressResponse.result.addressMatches[0],
        matchedAddress: "742 SENTINEL SECOND NORMALIZED ADDRESS",
      },
    ],
  },
} as const;

export const censusMalformedMultipleAddressResponse = {
  result: {
    input: censusAddressResponse.result.input,
    addressMatches: [{}, {}],
  },
} as const;
