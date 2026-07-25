import { FEDERAL_CENSUS_DATA } from "./federal-policy.generated";
import {
  FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS,
  FEDERAL_PROVIDER_HOSTS,
} from "./federal-provider-host-policy.mjs";

export { FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS, FEDERAL_PROVIDER_HOSTS };

export type CongressSnapshot = Readonly<{
  checkedAt: string;
  currentCongress: number;
  startYear: number;
  endYear: number;
}>;

export type CensusDistrictAssessment =
  | Readonly<{
      status: "valid";
      maximumDistrict: number;
      atLarge: boolean;
    }>
  | Readonly<{ status: "invalid"; maximumDistrict: number }>
  | Readonly<{ status: "policy_expired" }>;

export type ClerkJurisdictionAssessment =
  | Readonly<{ status: "voting_state"; maximumDistrict: number }>
  | Readonly<{
      status: "known_nonlaunch";
      allowedDistricts: readonly [0];
    }>
  | Readonly<{ status: "unknown" }>;

export const FEDERAL_MILLISECONDS_PER_SECOND = 1_000;
export const FEDERAL_MILLISECONDS_PER_MINUTE =
  60 * FEDERAL_MILLISECONDS_PER_SECOND;
export const FEDERAL_MILLISECONDS_PER_HOUR =
  60 * FEDERAL_MILLISECONDS_PER_MINUTE;

export const CONGRESS_EPOCH_FIRST_NUMBER = 1;
export const CONGRESS_EPOCH_START_YEAR_UTC = 1789;
export const CONGRESS_EPOCH_START_INSTANT_UTC = "1789-03-04T00:00:00.000Z";
export const CONGRESS_TERM_LENGTH_YEARS = 2;
export const CONGRESS_TURNOVER_MONTH_INDEX = 0;
export const CONGRESS_TURNOVER_DAY_OF_MONTH = 3;
export const CONGRESS_TURNOVER_HOUR_UTC = 17;

export const CONGRESS_CALENDAR_POLICY = Object.freeze({
  epoch: Object.freeze({
    firstCongressNumber: CONGRESS_EPOCH_FIRST_NUMBER,
    startYearUtc: CONGRESS_EPOCH_START_YEAR_UTC,
    startInstantUtc: CONGRESS_EPOCH_START_INSTANT_UTC,
  }),
  termLengthYears: CONGRESS_TERM_LENGTH_YEARS,
  turnoverUtc: Object.freeze({
    monthIndex: CONGRESS_TURNOVER_MONTH_INDEX,
    dayOfMonth: CONGRESS_TURNOVER_DAY_OF_MONTH,
    hour: CONGRESS_TURNOVER_HOUR_UTC,
  }),
});

export const FEDERAL_CACHE_REFRESH_AGE_MS = 24 * FEDERAL_MILLISECONDS_PER_HOUR;
export const FEDERAL_CACHE_STALE_AGE_MS = 72 * FEDERAL_MILLISECONDS_PER_HOUR;
export const FEDERAL_CACHE_POLICY = Object.freeze({
  refreshAgeMs: FEDERAL_CACHE_REFRESH_AGE_MS,
  staleAgeMs: FEDERAL_CACHE_STALE_AGE_MS,
  futureTimestampToleranceMs: 0,
});

export const CONGRESS_STATE_MEMBER_LIST_LIMIT = 250;
export const CONGRESS_STATE_MEMBER_MAX_PAGES = 1;
export const CONGRESS_MEMBER_DETAIL_BATCH_LIMIT = CONGRESS_STATE_MEMBER_LIST_LIMIT;
export const CLERK_NATIONAL_VACANCY_LIST_LIMIT =
  FEDERAL_CENSUS_DATA.totalRepresentativeCount +
  FEDERAL_CENSUS_DATA.nonlaunchJurisdictions.length;
export const FEDERAL_PROVIDER_RESPONSE_MAX_BYTES = 1_048_576;
export const FEDERAL_PROVIDER_FETCH_REDIRECT_MODE = "error" as const;
export const FEDERAL_PROVIDER_CONTENT_TYPE_ALLOWLIST = Object.freeze({
  congress: Object.freeze(["application/json"]),
  clerk: Object.freeze(["text/html"]),
});
export const FEDERAL_PROVIDER_RESPONSE_POLICY = Object.freeze({
  maxBodyBytes: FEDERAL_PROVIDER_RESPONSE_MAX_BYTES,
  redirect: FEDERAL_PROVIDER_FETCH_REDIRECT_MODE,
  contentTypes: FEDERAL_PROVIDER_CONTENT_TYPE_ALLOWLIST,
  congress: Object.freeze({
    stateMemberListLimit: CONGRESS_STATE_MEMBER_LIST_LIMIT,
    maxStateMemberPages: CONGRESS_STATE_MEMBER_MAX_PAGES,
    maxMemberDetailRequests: CONGRESS_MEMBER_DETAIL_BATCH_LIMIT,
  }),
  clerk: Object.freeze({
    maxNationalVacancyRows: CLERK_NATIONAL_VACANCY_LIST_LIMIT,
  }),
});

export const FEDERAL_PROVIDER_PHASE_BUDGET_MS = 5 * FEDERAL_MILLISECONDS_PER_SECOND;
export const CONGRESS_CRITICAL_PATH_PHASES = 3;
export const FEDERAL_NETWORK_POLICY = Object.freeze({
  phaseBudgetMs: FEDERAL_PROVIDER_PHASE_BUDGET_MS,
  congressCriticalPathPhases: CONGRESS_CRITICAL_PATH_PHASES,
});
export const FEDERAL_REFRESH_DEADLINE_MS =
  FEDERAL_PROVIDER_PHASE_BUDGET_MS * CONGRESS_CRITICAL_PATH_PHASES;

export const FEDERAL_PROVIDER_HOST_ALLOWLIST = FEDERAL_PROVIDER_HOSTS;

const providerOrigin = (host: string): string => `https://${host}`;
const congressOrigin = providerOrigin(FEDERAL_PROVIDER_HOSTS.congressApi);
const clerkOrigin = providerOrigin(FEDERAL_PROVIDER_HOSTS.clerk);
const bioguideOrigin = providerOrigin(FEDERAL_PROVIDER_HOSTS.bioguidePublic);

export const FEDERAL_PROVIDER_URL_POLICY = Object.freeze({
  congress: Object.freeze({
    origin: congressOrigin,
    host: FEDERAL_PROVIDER_HOSTS.congressApi,
    pathPrefix: "/v3/",
    currentCongressPath: "/v3/congress/current",
    stateMemberPathPrefix: "/v3/member/",
    memberDetailPathPrefix: "/v3/member/",
    formatQueryName: "format",
    formatQueryValue: "json",
    currentMemberQueryName: "currentMember",
    currentMemberQueryValue: "true",
    limitQueryName: "limit",
    apiKeyQueryName: "api_key",
  }),
  clerk: Object.freeze({
    origin: clerkOrigin,
    host: FEDERAL_PROVIDER_HOSTS.clerk,
    nationalVacancyPath: "/Members/ViewVacancies",
    vacancyPathPrefix: "/members/",
    vacancyPathSuffix: "/vacancy",
  }),
  bioguide: Object.freeze({
    origin: bioguideOrigin,
    host: FEDERAL_PROVIDER_HOSTS.bioguidePublic,
    publicPathPrefix: "/search/bio/",
  }),
});

export const FEDERAL_OFFICIAL_NAME_MAX_CODE_POINTS = 160;
export const BIOGUIDE_ID_LENGTH = 7;
export const BIOGUIDE_ID_PATTERN = /^[A-Z]\d{6}$/;
const OFFICIAL_NAME_FORBIDDEN_RAW_INPUT_PATTERN =
  /[\p{Cc}\p{Bidi_Control}\p{Cs}\uFEFF]/u;
export const FEDERAL_OFFICIAL_FIELD_POLICY = Object.freeze({
  divisionTypes: Object.freeze({
    state: "state",
    congressionalDistrict: "congressional_district",
  }),
  district: Object.freeze({
    atLarge: 0,
    firstNumbered: 1,
    maximumCanonical: 99,
  }),
  stateCodePattern: /^[A-Z]{2}$/,
  officialName: Object.freeze({
    normalization: "NFC",
    maxCodePoints: FEDERAL_OFFICIAL_NAME_MAX_CODE_POINTS,
    rejectControlAndBidi: true,
  }),
  bioguideId: Object.freeze({
    length: BIOGUIDE_ID_LENGTH,
    pattern: BIOGUIDE_ID_PATTERN,
  }),
  congressCurrent: Object.freeze({
    requiredKeys: Object.freeze(["number", "startYear", "endYear", "url"]),
  }),
  congressMember: Object.freeze({
    requiredKeys: Object.freeze([
      "bioguideId",
      "name",
      "state",
      "district",
      "url",
    ]),
    chambers: Object.freeze(["House", "Senate"]),
  }),
  clerkVacancy: Object.freeze({
    requiredKeys: Object.freeze(["stateCode", "districtCode", "publicUrl"]),
  }),
});

const federalPolicyLiteralAuditAllowlistedPaths: Readonly<Record<string, string>> =
  Object.freeze({
    "src/lib/federal-policy.ts": "named_handwritten_policy_owner",
    "src/lib/federal-provider-host-policy.mjs":
      "node_loadable_provider_host_owner",
    "src/lib/federal-policy.generated.ts": "generated_census_data",
    "data/census/2020-apportionment.csv": "official_source",
    "data/census/state.txt": "official_source",
    "data/census/2020-apportionment.metadata.json": "provider_metadata",
    "scripts/generate-federal-policy.mts": "generated_source",
    "src/lib/federal-policy.test.ts": "boundary_test",
    "tests/generate-federal-policy.test.ts": "boundary_test",
    "tests/federal-policy-literal-audit.test.ts": "boundary_test",
  });

export const FEDERAL_POLICY_LITERAL_AUDIT = Object.freeze({
  productionFiles: Object.freeze([
    "src/lib/congress-gov.ts",
    "src/lib/federal-officials-service.ts",
    "src/lib/federal-officials.ts",
    "src/lib/federal-provider-host-policy.d.mts",
    "src/lib/house-clerk-vacancy.ts",
  ]),
  providerUrlConsumerFiles: Object.freeze([
    "src/components/federal-officials.tsx",
  ]),
  allowlistedPaths: federalPolicyLiteralAuditAllowlistedPaths,
  epochLiteralValues: Object.freeze([
    CONGRESS_EPOCH_FIRST_NUMBER,
    CONGRESS_EPOCH_START_YEAR_UTC,
    CONGRESS_EPOCH_START_INSTANT_UTC,
    CONGRESS_TERM_LENGTH_YEARS,
    CONGRESS_TURNOVER_MONTH_INDEX,
    CONGRESS_TURNOVER_DAY_OF_MONTH,
    CONGRESS_TURNOVER_HOUR_UTC,
  ]),
});

export function createCongressSnapshot(now: Date): CongressSnapshot | null {
  if (!Number.isFinite(now.getTime())) {
    return null;
  }
  if (now.getTime() < Date.parse(CONGRESS_EPOCH_START_INSTANT_UTC)) {
    return null;
  }
  const elapsedYears = now.getUTCFullYear() - CONGRESS_EPOCH_START_YEAR_UTC;
  let currentCongress =
    CONGRESS_EPOCH_FIRST_NUMBER +
    Math.floor(elapsedYears / CONGRESS_TERM_LENGTH_YEARS);
  let startYear = congressStartYear(currentCongress);
  const turnover = Date.UTC(
    startYear,
    CONGRESS_TURNOVER_MONTH_INDEX,
    CONGRESS_TURNOVER_DAY_OF_MONTH,
    CONGRESS_TURNOVER_HOUR_UTC,
  );
  if (now.getTime() < turnover) {
    currentCongress -= 1;
    startYear = congressStartYear(currentCongress);
  }
  if (currentCongress < CONGRESS_EPOCH_FIRST_NUMBER) {
    return null;
  }
  return {
    checkedAt: now.toISOString(),
    currentCongress,
    startYear,
    endYear: startYear + CONGRESS_TERM_LENGTH_YEARS - 1,
  };
}

export function assessCensusDistrict(
  stateCode: string,
  district: number,
  congress: number,
): CensusDistrictAssessment {
  if (!isCensusCongressInEffectiveRange(congress)) {
    return { status: "policy_expired" };
  }
  const state = FEDERAL_CENSUS_DATA.votingStates.find(
    (candidate) => candidate.code === stateCode,
  );
  if (state === undefined || !Number.isInteger(district) || district < 0) {
    return { status: "invalid", maximumDistrict: 0 };
  }
  const atLarge = state.representativeCount === 1;
  const maximumDistrict = atLarge ? 0 : state.representativeCount;
  if (
    (atLarge && district !== 0) ||
    (!atLarge && (district < 1 || district > maximumDistrict))
  ) {
    return { status: "invalid", maximumDistrict };
  }
  return { status: "valid", maximumDistrict, atLarge };
}

export function isCensusCongressInEffectiveRange(congress: number): boolean {
  return (
    Number.isInteger(congress) &&
    congress >= FEDERAL_CENSUS_DATA.effectiveCongress.first &&
    congress <= FEDERAL_CENSUS_DATA.effectiveCongress.last
  );
}

export function assessClerkJurisdiction(
  stateCode: string,
): ClerkJurisdictionAssessment {
  const state = FEDERAL_CENSUS_DATA.votingStates.find(
    (candidate) => candidate.code === stateCode,
  );
  if (state !== undefined) {
    return {
      status: "voting_state",
      maximumDistrict: state.representativeCount === 1 ? 0 : state.representativeCount,
    };
  }
  if (FEDERAL_CENSUS_DATA.nonlaunchJurisdictions.includes(stateCode as never)) {
    return { status: "known_nonlaunch", allowedDistricts: [0] };
  }
  return { status: "unknown" };
}

export function normalizeOfficialName(value: string): string | null {
  if (OFFICIAL_NAME_FORBIDDEN_RAW_INPUT_PATTERN.test(value)) {
    return null;
  }
  const normalized = value.normalize("NFC").trim();
  if (
    normalized === "" ||
    Array.from(normalized).length > FEDERAL_OFFICIAL_NAME_MAX_CODE_POINTS
  ) {
    return null;
  }
  return normalized;
}

export function isCanonicalOfficialName(value: string): boolean {
  return normalizeOfficialName(value) === value;
}

export function isBioguideId(value: string): boolean {
  return value.length === BIOGUIDE_ID_LENGTH && BIOGUIDE_ID_PATTERN.test(value);
}

export function bioguidePublicUrl(bioguideId: string): string | null {
  if (!isBioguideId(bioguideId)) {
    return null;
  }
  return new URL(
    `${FEDERAL_PROVIDER_URL_POLICY.bioguide.publicPathPrefix}${bioguideId}`,
    FEDERAL_PROVIDER_URL_POLICY.bioguide.origin,
  ).toString();
}

export function compareBioguideIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function congressCurrentUrl(apiKey: string): URL {
  return congressRequestUrl(
    FEDERAL_PROVIDER_URL_POLICY.congress.currentCongressPath,
    apiKey,
  );
}

export function congressStateMemberListUrl(stateCode: string, apiKey: string): URL {
  if (!FEDERAL_OFFICIAL_FIELD_POLICY.stateCodePattern.test(stateCode)) {
    throw new Error("Congress state member requests require a canonical state code.");
  }
  const request = congressRequestUrl(
    `${FEDERAL_PROVIDER_URL_POLICY.congress.stateMemberPathPrefix}${stateCode}`,
    apiKey,
  );
  request.searchParams.append(
    FEDERAL_PROVIDER_URL_POLICY.congress.currentMemberQueryName,
    FEDERAL_PROVIDER_URL_POLICY.congress.currentMemberQueryValue,
  );
  request.searchParams.append(
    FEDERAL_PROVIDER_URL_POLICY.congress.limitQueryName,
    String(CONGRESS_STATE_MEMBER_LIST_LIMIT),
  );
  return request;
}

export function congressMemberDetailUrl(bioguideId: string, apiKey: string): URL {
  if (!isBioguideId(bioguideId)) {
    throw new Error("Congress member detail requests require a Bioguide ID.");
  }
  return congressRequestUrl(
    `${FEDERAL_PROVIDER_URL_POLICY.congress.memberDetailPathPrefix}${bioguideId}`,
    apiKey,
  );
}

export function canonicalCongressIngestionUrl(value: URL | string): string | null {
  let request: URL;
  try {
    request = new URL(value);
  } catch {
    return null;
  }
  if (typeof value === "string" && value !== request.toString()) {
    return null;
  }
  if (
    request.origin !== FEDERAL_PROVIDER_URL_POLICY.congress.origin ||
    request.username !== "" ||
    request.password !== "" ||
    request.hash !== ""
  ) {
    return null;
  }
  const query = request.searchParams;
  const allowedQueryNames: ReadonlySet<string> = new Set([
    FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryName,
    FEDERAL_PROVIDER_URL_POLICY.congress.currentMemberQueryName,
    FEDERAL_PROVIDER_URL_POLICY.congress.limitQueryName,
    FEDERAL_PROVIDER_URL_POLICY.congress.apiKeyQueryName,
  ]);
  if (
    [...query.keys()].some((name) => !allowedQueryNames.has(name)) ||
    [...new Set(query.keys())].some((name) => query.getAll(name).length !== 1) ||
    query.get(FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryName) !==
      FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryValue
  ) {
    return null;
  }

  const stateMemberPathPrefix =
    FEDERAL_PROVIDER_URL_POLICY.congress.stateMemberPathPrefix;
  const memberDetailPathPrefix =
    FEDERAL_PROVIDER_URL_POLICY.congress.memberDetailPathPrefix;
  const stateCode = request.pathname.startsWith(stateMemberPathPrefix)
    ? request.pathname.slice(stateMemberPathPrefix.length)
    : null;
  const bioguideId = request.pathname.startsWith(memberDetailPathPrefix)
    ? request.pathname.slice(memberDetailPathPrefix.length)
    : null;
  const isStateRequest =
    stateCode !== null &&
    FEDERAL_OFFICIAL_FIELD_POLICY.stateCodePattern.test(stateCode);
  const isCurrentRequest =
    request.pathname === FEDERAL_PROVIDER_URL_POLICY.congress.currentCongressPath;
  const isDetailRequest = bioguideId !== null && isBioguideId(bioguideId);
  if (!isCurrentRequest && !isStateRequest && !isDetailRequest) {
    return null;
  }
  const currentMember = query.get(
    FEDERAL_PROVIDER_URL_POLICY.congress.currentMemberQueryName,
  );
  if (
    (isStateRequest &&
      currentMember !==
        FEDERAL_PROVIDER_URL_POLICY.congress.currentMemberQueryValue) ||
    (!isStateRequest && currentMember !== null)
  ) {
    return null;
  }
  const limit = query.get(FEDERAL_PROVIDER_URL_POLICY.congress.limitQueryName);
  if (
    (isStateRequest && limit !== String(CONGRESS_STATE_MEMBER_LIST_LIMIT)) ||
    (!isStateRequest && limit !== null)
  ) {
    return null;
  }
  const canonical = new URL(request.pathname, FEDERAL_PROVIDER_URL_POLICY.congress.origin);
  canonical.searchParams.set(
    FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryName,
    FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryValue,
  );
  if (isStateRequest) {
    canonical.searchParams.append(
      FEDERAL_PROVIDER_URL_POLICY.congress.currentMemberQueryName,
      FEDERAL_PROVIDER_URL_POLICY.congress.currentMemberQueryValue,
    );
    canonical.searchParams.append(
      FEDERAL_PROVIDER_URL_POLICY.congress.limitQueryName,
      String(CONGRESS_STATE_MEMBER_LIST_LIMIT),
    );
  }
  return canonical.toString();
}

export function clerkNationalVacancyUrl(): URL {
  return new URL(
    FEDERAL_PROVIDER_URL_POLICY.clerk.nationalVacancyPath,
    FEDERAL_PROVIDER_URL_POLICY.clerk.origin,
  );
}

export function clerkVacancyPublicUrl(
  stateCode: string,
  district: number,
  congress: CongressSnapshot | null = createCongressSnapshot(new Date()),
): string | null {
  if (
    congress === null ||
    !isCensusCongressInEffectiveRange(congress.currentCongress)
  ) {
    return null;
  }
  const assessment = assessClerkJurisdiction(stateCode);
  if (assessment.status !== "voting_state") {
    return null;
  }
  const census = assessCensusDistrict(
    stateCode,
    district,
    congress.currentCongress,
  );
  if (census.status !== "valid") {
    return null;
  }
  const districtCode = String(district).padStart(2, "0");
  return new URL(
    `${FEDERAL_PROVIDER_URL_POLICY.clerk.vacancyPathPrefix}${stateCode}${districtCode}${FEDERAL_PROVIDER_URL_POLICY.clerk.vacancyPathSuffix}`,
    FEDERAL_PROVIDER_URL_POLICY.clerk.origin,
  ).toString();
}

export function isAllowedCongressApiUrl(value: string): boolean {
  return canonicalCongressIngestionUrl(value) !== null;
}

export function isAllowedClerkPublicUrl(
  value: string,
  congress: CongressSnapshot | null = createCongressSnapshot(new Date()),
): boolean {
  if (
    congress === null ||
    !isCensusCongressInEffectiveRange(congress.currentCongress)
  ) {
    return false;
  }
  let request: URL;
  try {
    request = new URL(value);
  } catch {
    return false;
  }
  if (value !== request.toString()) {
    return false;
  }
  if (
    request.origin !== FEDERAL_PROVIDER_URL_POLICY.clerk.origin ||
    request.search !== "" ||
    request.hash !== "" ||
    request.username !== "" ||
    request.password !== ""
  ) {
    return false;
  }
  if (request.pathname === FEDERAL_PROVIDER_URL_POLICY.clerk.nationalVacancyPath) {
    return true;
  }
  const vacancy = new RegExp(
    `^${escapeRegex(FEDERAL_PROVIDER_URL_POLICY.clerk.vacancyPathPrefix)}([^/]+)(\\d{2})${escapeRegex(FEDERAL_PROVIDER_URL_POLICY.clerk.vacancyPathSuffix)}$`,
  ).exec(request.pathname);
  return (
    vacancy !== null &&
    FEDERAL_OFFICIAL_FIELD_POLICY.stateCodePattern.test(vacancy[1]) &&
    clerkVacancyPublicUrl(
      vacancy[1],
      Number(vacancy[2]),
      congress,
    ) === request.toString()
  );
}

function congressRequestUrl(pathname: string, apiKey: string): URL {
  const request = new URL(pathname, FEDERAL_PROVIDER_URL_POLICY.congress.origin);
  request.searchParams.set(
    FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryName,
    FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryValue,
  );
  request.searchParams.append(
    FEDERAL_PROVIDER_URL_POLICY.congress.apiKeyQueryName,
    apiKey,
  );
  return request;
}

function congressStartYear(currentCongress: number): number {
  return (
    CONGRESS_EPOCH_START_YEAR_UTC +
    (currentCongress - CONGRESS_EPOCH_FIRST_NUMBER) * CONGRESS_TERM_LENGTH_YEARS
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
