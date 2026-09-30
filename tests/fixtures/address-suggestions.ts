// Synthetic addresses only. Never copy real residence queries into fixtures.
export const suggestionQuery = "101 Exampel Street, Sample City";

export function photonHouse(properties: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-120.123456, 35.123456] },
    properties: {
      countrycode: "US",
      housenumber: "101",
      street: "Example Street",
      city: "Sample City",
      state: "California",
      postcode: "90000",
      osm_id: 100,
      osm_type: "N",
      ...properties,
    },
  };
}

export const photonFixture = {
  type: "FeatureCollection",
  features: [photonHouse()],
};

export const suggestionFixture = {
  status: "ok",
  suggestions: [
    { id: "suggestion-1", address: "101 Example Street, Sample City, California 90000" },
  ],
};
