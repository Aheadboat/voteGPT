import type {
  ResolutionErrorResponse,
  ResolutionResponse,
} from "@/lib/residence";

export const matchedResidenceResponse = {
  status: "matched",
  divisions: [
    {
      type: "congressional_district",
      name: "Example Congressional District 1",
      id: "ocd-division/country:us/state:ex/cd:1",
      idScheme: "ocd",
    },
  ],
  source: {
    name: "Google Civic Information API",
    url: "https://developers.google.com/civic-information",
    checkedAt: "2026-07-14T20:00:00.000Z",
    effectiveAt: null,
  },
  coverageNotes: ["Local divisions may be unavailable."],
  resolutionToken: "fixture-resolution-token",
  expiresAt: "2026-07-14T20:10:00.000Z",
} satisfies ResolutionResponse;

export const partialResidenceResponse = {
  status: "partial",
  divisions: [
    {
      type: "county",
      name: "Example County",
      id: "99001",
      idScheme: "census",
    },
  ],
  source: {
    name: "U.S. Census Geocoder",
    url: "https://geocoding.geo.census.gov/geocoder/",
    checkedAt: "2026-07-14T20:00:00.000Z",
    effectiveAt: null,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
  },
  coverageNotes: [
    "Census coverage is partial and may omit local political divisions.",
  ],
  resolutionToken: "fixture-resolution-token",
  expiresAt: "2026-07-14T20:10:00.000Z",
} satisfies ResolutionResponse;

export const noMatchResidenceResponse = {
  status: "no_match",
  message: "We could not match that residence. Check it and try again.",
} satisfies ResolutionResponse;

export const ambiguousResidenceResponse = {
  status: "ambiguous",
  message: "That residence matched more than one place. Add more detail.",
} satisfies ResolutionResponse;

export const invalidResidenceResponse = {
  status: "invalid_request",
  message: "Enter a valid residence and try again.",
} satisfies ResolutionErrorResponse;

export const unauthenticatedResidenceResponse = {
  status: "unauthenticated",
  message: "Sign in again before checking a residence.",
} satisfies ResolutionErrorResponse;

export const forbiddenResidenceResponse = {
  status: "forbidden",
  message: "This residence request was not accepted.",
} satisfies ResolutionErrorResponse;

export const unavailableResidenceResponse = {
  status: "unavailable",
  message: "Residence matching is temporarily unavailable. Try again later.",
} satisfies ResolutionErrorResponse;
