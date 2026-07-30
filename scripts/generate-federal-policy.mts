import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APPORTIONMENT_URL =
  "https://www2.census.gov/programs-surveys/decennial/2020/data/apportionment/apportionment.csv";
const STATE_REFERENCE_URL = "https://www2.census.gov/geo/docs/reference/state.txt";
const SOURCE_URLS = [APPORTIONMENT_URL, STATE_REFERENCE_URL] as const;
// Fixed aggregate facts of the checked-in 2020 Census apportionment artifact.
// Retained as defence in depth alongside the per-state contract below.
const CENSUS_2020_APPORTIONMENT_SOURCE_COVERAGE = Object.freeze({
  votingStateCount: 50,
  representativeCount: 435,
  effectiveCongress: Object.freeze({ first: 118, last: 119 }),
});

// The apportionment data does not distinguish every launch-excluded jurisdiction
// from UM. Civic launch scope owns this exact code list; state.txt owns its FIPS.
const LAUNCH_EXCLUDED_JURISDICTION_CODES: readonly string[] = Object.freeze([
  "DC",
  "AS",
  "GU",
  "MP",
  "PR",
  "VI",
]);

type SourceMetadata = {
  url: string;
  officialRelease: string;
  officialVersion: string;
  retrievedAt: string;
  upstreamSha256: string;
  canonicalSha256: string;
};

type VotingState = {
  code: string;
  fips: string;
  representativeCount: number;
};

// 2020 Census Apportionment Identity and Seat Contract. Reviewed against the
// official Census apportionment CSV and state reference above; deliberately
// independent from mutable source files, metadata, and generated output.
const CENSUS_2020_APPORTIONMENT_IDENTITY_SEAT_CONTRACT = Object.freeze(
  [
    { code: "AL", fips: "01", representativeCount: 7 },
    { code: "AK", fips: "02", representativeCount: 1 },
    { code: "AZ", fips: "04", representativeCount: 9 },
    { code: "AR", fips: "05", representativeCount: 4 },
    { code: "CA", fips: "06", representativeCount: 52 },
    { code: "CO", fips: "08", representativeCount: 8 },
    { code: "CT", fips: "09", representativeCount: 5 },
    { code: "DE", fips: "10", representativeCount: 1 },
    { code: "FL", fips: "12", representativeCount: 28 },
    { code: "GA", fips: "13", representativeCount: 14 },
    { code: "HI", fips: "15", representativeCount: 2 },
    { code: "ID", fips: "16", representativeCount: 2 },
    { code: "IL", fips: "17", representativeCount: 17 },
    { code: "IN", fips: "18", representativeCount: 9 },
    { code: "IA", fips: "19", representativeCount: 4 },
    { code: "KS", fips: "20", representativeCount: 4 },
    { code: "KY", fips: "21", representativeCount: 6 },
    { code: "LA", fips: "22", representativeCount: 6 },
    { code: "ME", fips: "23", representativeCount: 2 },
    { code: "MD", fips: "24", representativeCount: 8 },
    { code: "MA", fips: "25", representativeCount: 9 },
    { code: "MI", fips: "26", representativeCount: 13 },
    { code: "MN", fips: "27", representativeCount: 8 },
    { code: "MS", fips: "28", representativeCount: 4 },
    { code: "MO", fips: "29", representativeCount: 8 },
    { code: "MT", fips: "30", representativeCount: 2 },
    { code: "NE", fips: "31", representativeCount: 3 },
    { code: "NV", fips: "32", representativeCount: 4 },
    { code: "NH", fips: "33", representativeCount: 2 },
    { code: "NJ", fips: "34", representativeCount: 12 },
    { code: "NM", fips: "35", representativeCount: 3 },
    { code: "NY", fips: "36", representativeCount: 26 },
    { code: "NC", fips: "37", representativeCount: 14 },
    { code: "ND", fips: "38", representativeCount: 1 },
    { code: "OH", fips: "39", representativeCount: 15 },
    { code: "OK", fips: "40", representativeCount: 5 },
    { code: "OR", fips: "41", representativeCount: 6 },
    { code: "PA", fips: "42", representativeCount: 17 },
    { code: "RI", fips: "44", representativeCount: 2 },
    { code: "SC", fips: "45", representativeCount: 7 },
    { code: "SD", fips: "46", representativeCount: 1 },
    { code: "TN", fips: "47", representativeCount: 9 },
    { code: "TX", fips: "48", representativeCount: 38 },
    { code: "UT", fips: "49", representativeCount: 4 },
    { code: "VT", fips: "50", representativeCount: 1 },
    { code: "VA", fips: "51", representativeCount: 11 },
    { code: "WA", fips: "53", representativeCount: 10 },
    { code: "WV", fips: "54", representativeCount: 2 },
    { code: "WI", fips: "55", representativeCount: 8 },
    { code: "WY", fips: "56", representativeCount: 1 },
  ].map((state) => Object.freeze(state)),
);

type NonlaunchJurisdiction = {
  code: string;
  fips: string;
};

type CensusIdentityManifest = {
  votingStates: VotingState[];
  nonlaunchJurisdictions: NonlaunchJurisdiction[];
  totalVotingStates: number;
  totalRepresentativeCount: number;
  totalNonlaunchJurisdictions: number;
};

type FederalPolicyMetadata = {
  sources: SourceMetadata[];
  generatedAt: string;
  effectiveCongress: { first: number; last: number };
  censusIdentityManifest: CensusIdentityManifest;
};

type StateReference = {
  code: string;
  fips: string;
  name: string;
};

type StateReferences = {
  byCode: Map<string, StateReference>;
  byName: Map<string, StateReference>;
};

type FederalCensusData = {
  effectiveCongress: { first: number; last: number };
  votingStates: VotingState[];
  nonlaunchJurisdictions: string[];
  nonlaunchJurisdictionFips: Record<string, string>;
  totalVotingStates: number;
  totalRepresentativeCount: number;
};

export type FederalPolicyGenerationInput = {
  apportionmentCsv: string;
  stateTxt: string;
  metadata: FederalPolicyMetadata;
};

export type FederalPolicyGenerationResult = {
  generatedTypeScript: string;
  metadata: FederalPolicyMetadata;
  censusData: FederalCensusData;
};

export function generateFederalPolicy(
  input: FederalPolicyGenerationInput,
): FederalPolicyGenerationResult {
  const manifest = validateMetadata(input.metadata);

  const stateReferences = parseStateReference(input.stateTxt);
  const votingStates = parseApportionment(input.apportionmentCsv, stateReferences);
  const totalRepresentativeCount = votingStates.reduce(
    (total, state) => total + state.representativeCount,
    0,
  );
  validateCensusSourceCoverage(votingStates.length, totalRepresentativeCount);
  validateCensusIdentitySeatContract(votingStates, "Census source");
  const nonlaunchJurisdictions = deriveLaunchExcludedJurisdictions(stateReferences);
  const nonlaunchJurisdictionFips = validateCensusSourceIdentities(
    manifest,
    votingStates,
    nonlaunchJurisdictions,
  );

  const censusData: FederalCensusData = {
    effectiveCongress: {
      ...CENSUS_2020_APPORTIONMENT_SOURCE_COVERAGE.effectiveCongress,
    },
    votingStates,
    nonlaunchJurisdictions: nonlaunchJurisdictions.map(
      (jurisdiction) => jurisdiction.code,
    ),
    nonlaunchJurisdictionFips,
    totalVotingStates: votingStates.length,
    totalRepresentativeCount,
  };
  return {
    generatedTypeScript: renderGeneratedTypeScript(censusData),
    metadata: input.metadata,
    censusData,
  };
}

export function checkFederalPolicy(
  input: FederalPolicyGenerationInput & { generatedTypeScript: string },
): FederalPolicyGenerationResult {
  const result = generateFederalPolicy(input);
  if (result.generatedTypeScript !== canonicalizeSource(input.generatedTypeScript)) {
    throw new Error("Generated federal policy is out of date.");
  }
  return result;
}

export function checkFederalPolicyFiles(root = projectRoot()): void {
  const safeRoot = assertPolicyRootIsSafe(root);
  assertCheckedPolicyArtifactsAreSafe(safeRoot);
  const apportionmentBytes = readFileSync(apportionmentPath(safeRoot));
  const stateBytes = readFileSync(statePath(safeRoot));
  const metadata = readMetadata(safeRoot);
  validateMetadata(metadata);
  validateSourceHashes(metadata, [
    [APPORTIONMENT_URL, apportionmentBytes],
    [STATE_REFERENCE_URL, stateBytes],
  ]);
  checkFederalPolicy({
    apportionmentCsv: decodeUtf8(apportionmentBytes, APPORTIONMENT_URL),
    stateTxt: decodeUtf8(stateBytes, STATE_REFERENCE_URL),
    metadata,
    generatedTypeScript: readFileSync(generatedPath(safeRoot), "utf8"),
  });
}

function assertCheckedPolicyArtifactsAreSafe(root: string): void {
  for (const path of [
    apportionmentPath(root),
    statePath(root),
    metadataPath(root),
    generatedPath(root),
  ]) {
    assertPolicyArtifactIsSafe(root, path);
  }
}

function assertPolicyArtifactIsSafe(root: string, targetPath: string): void {
  assertPolicyArtifactParentIsSafe(root, targetPath);
  try {
    const stats = lstatSync(targetPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Census policy check artifact is unsafe: ${targetPath}.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("artifact is unsafe")) {
      throw error;
    }
    throw new Error(`Census policy check artifact is unsafe: ${targetPath}.`);
  }
}

function assertPolicyArtifactParentIsSafe(root: string, targetPath: string): void {
  const resolvedRoot = assertPolicyRootIsSafe(root);
  const targetParent = dirname(resolve(targetPath));
  const relativeParent = relative(resolvedRoot, targetParent);
  if (
    isAbsolute(relativeParent) ||
    /^\.\.(?:[\\/]|$)/.test(relativeParent)
  ) {
    throw new Error(`Census policy check target parent is unsafe: ${targetParent}.`);
  }
  let currentDirectory = resolvedRoot;
  for (const segment of relativeParent.split(/[\\/]+/)) {
    if (segment === "") {
      continue;
    }
    currentDirectory = resolve(currentDirectory, segment);
    assertPolicyDirectoryIsSafe(currentDirectory);
  }
}

function assertPolicyRootIsSafe(root: string): string {
  const resolvedRoot = resolve(root);
  const ancestorDirectories: string[] = [];
  for (let directory = resolvedRoot; ; directory = dirname(directory)) {
    ancestorDirectories.push(directory);
    if (dirname(directory) === directory) {
      break;
    }
  }
  for (const directory of ancestorDirectories.reverse()) {
    assertPolicyDirectoryIsSafe(directory);
  }
  return resolvedRoot;
}

function assertPolicyDirectoryIsSafe(directoryPath: string): void {
  try {
    const stats = lstatSync(directoryPath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`Census policy check target parent is unsafe: ${directoryPath}.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("target parent is unsafe")) {
      throw error;
    }
    throw new Error(`Census policy check target parent is unsafe: ${directoryPath}.`);
  }
}
function validateMetadata(metadata: FederalPolicyMetadata): CensusIdentityManifest {
  if (
    !metadata ||
    !Array.isArray(metadata.sources) ||
    !isRfc3339Utc(metadata.generatedAt)
  ) {
    throw new Error("Metadata generatedAt must be a full RFC3339 UTC timestamp.");
  }
  if (
    !Number.isInteger(metadata.effectiveCongress?.first) ||
    !Number.isInteger(metadata.effectiveCongress?.last) ||
    metadata.effectiveCongress.first < 1 ||
    metadata.effectiveCongress.first > metadata.effectiveCongress.last
  ) {
    throw new Error("Metadata effective Congress range is invalid.");
  }
  if (
    metadata.effectiveCongress.first !==
      CENSUS_2020_APPORTIONMENT_SOURCE_COVERAGE.effectiveCongress.first ||
    metadata.effectiveCongress.last !==
      CENSUS_2020_APPORTIONMENT_SOURCE_COVERAGE.effectiveCongress.last
  ) {
    throw new Error(
      "Metadata effective Congress range does not match the 2020 apportionment coverage.",
    );
  }
  if (metadata.sources.length !== SOURCE_URLS.length) {
    throw new Error("Metadata must contain the two required Census sources.");
  }
  const generatedAt = new Date(metadata.generatedAt).valueOf();
  for (const [index, source] of metadata.sources.entries()) {
    if (!source || source.url !== SOURCE_URLS[index]) {
      throw new Error("Metadata source URL is not an approved Census source.");
    }
    if (
      typeof source.officialRelease !== "string" ||
      typeof source.officialVersion !== "string" ||
      source.officialRelease.trim() === "" ||
      !isRfc3339Utc(source.officialVersion) ||
      !isRfc3339Utc(source.retrievedAt) ||
      !isSha256(source.upstreamSha256) ||
      !isSha256(source.canonicalSha256)
    ) {
      throw new Error("Metadata source provenance is incomplete or malformed.");
    }
    if (
      new Date(source.officialVersion).valueOf() > new Date(source.retrievedAt).valueOf() ||
      new Date(source.retrievedAt).valueOf() > generatedAt
    ) {
      throw new Error("Metadata source provenance timestamps are out of order.");
    }
  }
  if (new Set(metadata.sources.map((source) => source.url)).size !== SOURCE_URLS.length) {
    throw new Error("Metadata source records must be unique.");
  }
  return validateCensusIdentityManifest(metadata.censusIdentityManifest);
}

function validateCensusIdentityManifest(
  manifest: unknown,
): CensusIdentityManifest {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Metadata Census identity manifest is malformed.");
  }
  const candidate = manifest as CensusIdentityManifest;
  if (
    !Array.isArray(candidate.votingStates) ||
    !Array.isArray(candidate.nonlaunchJurisdictions) ||
    !isPositiveInteger(candidate.totalVotingStates) ||
    !isPositiveInteger(candidate.totalRepresentativeCount) ||
    !isPositiveInteger(candidate.totalNonlaunchJurisdictions) ||
    candidate.votingStates.length !== candidate.totalVotingStates ||
    candidate.nonlaunchJurisdictions.length !== candidate.totalNonlaunchJurisdictions
  ) {
    throw new Error("Metadata Census identity manifest is malformed.");
  }
  const codes = new Set<string>();
  const fipsCodes = new Set<string>();
  let representativeCount = 0;
  let previousVotingFips: string | undefined;
  for (const state of candidate.votingStates) {
    if (
      !isVotingState(state) ||
      !isStrictlySortedFips(previousVotingFips, state.fips) ||
      codes.has(state.code) ||
      fipsCodes.has(state.fips)
    ) {
      throw new Error("Metadata Census identity manifest is malformed.");
    }
    codes.add(state.code);
    fipsCodes.add(state.fips);
    representativeCount += state.representativeCount;
    previousVotingFips = state.fips;
  }
  if (representativeCount !== candidate.totalRepresentativeCount) {
    throw new Error("Metadata Census identity manifest is malformed.");
  }
  validateCensusManifestCoverage(candidate);
  validateCensusIdentitySeatContract(
    candidate.votingStates,
    "Metadata Census identity manifest",
  );

  let previousNonlaunchFips: string | undefined;
  for (const jurisdiction of candidate.nonlaunchJurisdictions) {
    if (
      !isNonlaunchJurisdiction(jurisdiction) ||
      !isStrictlySortedFips(previousNonlaunchFips, jurisdiction.fips) ||
      codes.has(jurisdiction.code) ||
      fipsCodes.has(jurisdiction.fips)
    ) {
      throw new Error("Metadata Census identity manifest is malformed.");
    }
    codes.add(jurisdiction.code);
    fipsCodes.add(jurisdiction.fips);
    previousNonlaunchFips = jurisdiction.fips;
  }
  return candidate;
}

function validateCensusManifestCoverage(manifest: CensusIdentityManifest): void {
  if (
    manifest.totalVotingStates !==
      CENSUS_2020_APPORTIONMENT_SOURCE_COVERAGE.votingStateCount ||
    manifest.totalRepresentativeCount !==
      CENSUS_2020_APPORTIONMENT_SOURCE_COVERAGE.representativeCount
  ) {
    throw new Error(
      "Metadata Census identity manifest does not match the 2020 apportionment coverage.",
    );
  }
}

function validateCensusSourceCoverage(
  votingStateCount: number,
  representativeCount: number,
): void {
  if (
    votingStateCount !== CENSUS_2020_APPORTIONMENT_SOURCE_COVERAGE.votingStateCount ||
    representativeCount !==
      CENSUS_2020_APPORTIONMENT_SOURCE_COVERAGE.representativeCount
  ) {
    throw new Error("Census source does not match the 2020 apportionment coverage.");
  }
}

function validateCensusIdentitySeatContract(
  votingStates: readonly VotingState[],
  subject: string,
): void {
  if (!sameVotingStates(CENSUS_2020_APPORTIONMENT_IDENTITY_SEAT_CONTRACT, votingStates)) {
    throw new Error(
      `${subject} does not match the immutable 2020 apportionment identity/seat contract.`,
    );
  }
}

function validateCensusSourceIdentities(
  manifest: CensusIdentityManifest,
  votingStates: VotingState[],
  nonlaunchJurisdictions: NonlaunchJurisdiction[],
): Record<string, string> {
  if (!sameVotingStates(manifest.votingStates, votingStates)) {
    throw new Error("Census source identities do not match metadata manifest.");
  }
  if (!sameNonlaunchJurisdictions(manifest.nonlaunchJurisdictions, nonlaunchJurisdictions)) {
    throw new Error("Census source identities do not match metadata manifest.");
  }
  const nonlaunchJurisdictionFips: Record<string, string> = {};
  for (const jurisdiction of nonlaunchJurisdictions) {
    nonlaunchJurisdictionFips[jurisdiction.code] = jurisdiction.fips;
  }
  return nonlaunchJurisdictionFips;
}

function isVotingState(value: unknown): value is VotingState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const state = value as VotingState;
  return (
    isStateCode(state.code) &&
    isFipsCode(state.fips) &&
    isPositiveInteger(state.representativeCount)
  );
}

function isNonlaunchJurisdiction(value: unknown): value is NonlaunchJurisdiction {
  if (!value || typeof value !== "object") {
    return false;
  }
  const jurisdiction = value as NonlaunchJurisdiction;
  return isStateCode(jurisdiction.code) && isFipsCode(jurisdiction.fips);
}

function isStateCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

function isFipsCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}$/.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isStrictlySortedFips(previous: string | undefined, current: string): boolean {
  return previous === undefined || previous < current;
}

function sameVotingStates(
  expected: readonly VotingState[],
  actual: readonly VotingState[],
): boolean {
  return expected.length === actual.length && expected.every((state, index) => {
    const candidate = actual[index];
    return (
      candidate !== undefined &&
      state.code === candidate.code &&
      state.fips === candidate.fips &&
      state.representativeCount === candidate.representativeCount
    );
  });
}

function sameNonlaunchJurisdictions(
  expected: NonlaunchJurisdiction[],
  actual: NonlaunchJurisdiction[],
): boolean {
  return expected.length === actual.length && expected.every((jurisdiction, index) => {
    const candidate = actual[index];
    return (
      candidate !== undefined &&
      jurisdiction.code === candidate.code &&
      jurisdiction.fips === candidate.fips
    );
  });
}

function deriveLaunchExcludedJurisdictions(
  stateReferences: StateReferences,
): NonlaunchJurisdiction[] {
  return LAUNCH_EXCLUDED_JURISDICTION_CODES.map((code) => {
    const state = stateReferences.byCode.get(code);
    if (state === undefined) {
      throw new Error("Census source identities do not match metadata manifest.");
    }
    return { code, fips: state.fips };
  }).sort((left, right) => left.fips.localeCompare(right.fips));
}

function parseApportionment(
  source: string,
  stateReferences: StateReferences,
): VotingState[] {
  const rows = parseCsv(canonicalizeSource(source));
  const header = rows.shift();
  if (header === undefined) {
    throw new Error("Unexpected apportionment header.");
  }
  const indexes = headerIndexes(header, [
    "Name",
    "Geography Type",
    "Year",
    "Number of Representatives",
  ], "Unexpected apportionment header.");
  const votingStates = new Map<string, VotingState>();
  for (const row of rows) {
    if (row.length !== header.length) {
      throw new Error("Apportionment source data is malformed.");
    }
    if (
      row[indexes["Geography Type"]] !== "State" ||
      row[indexes.Year] !== "2020"
    ) {
      continue;
    }
    const name = row[indexes.Name];
    const state = stateReferences.byName.get(name);
    if (state === undefined) {
      throw new Error("Apportionment source data is malformed.");
    }
    if (LAUNCH_EXCLUDED_JURISDICTION_CODES.includes(state.code)) {
      continue;
    }
    const representativeCount = Number(row[indexes["Number of Representatives"]]);
    if (
      !Number.isInteger(representativeCount) ||
      representativeCount < 1 ||
      votingStates.has(state.code)
    ) {
      throw new Error("Apportionment source data is malformed.");
    }
    votingStates.set(state.code, {
      code: state.code,
      fips: state.fips,
      representativeCount,
    });
  }
  return [...votingStates.values()].sort((left, right) =>
    left.fips.localeCompare(right.fips),
  );
}

function parseStateReference(source: string): StateReferences {
  const rows = canonicalizeSource(source).split("\n").filter(Boolean);
  const header = rows.shift();
  if (header !== "STATE|STUSAB|STATE_NAME|STATENS") {
    throw new Error("Unexpected state reference header.");
  }
  const byCode = new Map<string, StateReference>();
  const byName = new Map<string, StateReference>();
  const seenFips = new Set<string>();
  for (const row of rows) {
    const fields = row.split("|");
    if (fields.length !== 4) {
      throw new Error("State reference source data is malformed.");
    }
    const [fips, code, name, statens] = fields;
    if (
      !isFipsCode(fips) ||
      !isStateCode(code) ||
      name.trim() === "" ||
      !/^\d{8}$/.test(statens) ||
      byCode.has(code) ||
      byName.has(name) ||
      seenFips.has(fips)
    ) {
      throw new Error("State reference source data is malformed.");
    }
    const state = { code, fips, name };
    byCode.set(code, state);
    byName.set(name, state);
    seenFips.add(fips);
  }
  return { byCode, byName };
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let afterClosingQuote = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
          afterClosingQuote = true;
        }
      } else {
        value += character;
      }
      continue;
    }
    if (afterClosingQuote) {
      if (character !== "," && character !== "\n") {
        throw new Error("Apportionment source data is malformed.");
      }
      afterClosingQuote = false;
    }
    if (character === '"') {
      if (value !== "") {
        throw new Error("Apportionment source data is malformed.");
      }
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value);
      if (row.some((field) => field !== "")) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) {
    throw new Error("Apportionment source data is malformed.");
  }
  if (value !== "" || row.length > 0) {
    row.push(value);
    if (row.some((field) => field !== "")) {
      rows.push(row);
    }
  }
  return rows;
}

function headerIndexes(
  header: string[],
  names: readonly string[],
  errorMessage: string,
): Record<string, number> {
  const indexes: Record<string, number> = {};
  for (const [index, name] of header.entries()) {
    if (indexes[name] !== undefined) {
      throw new Error(errorMessage);
    }
    indexes[name] = index;
  }
  for (const name of names) {
    if (indexes[name] === undefined) {
      throw new Error(errorMessage);
    }
  }
  return indexes;
}

function renderGeneratedTypeScript(censusData: FederalCensusData): string {
  return [
    "/* This file is generated by scripts/generate-federal-policy.mts. Do not edit manually. */",
    "",
    `export const FEDERAL_CENSUS_DATA = Object.freeze(${renderFrozenValue(censusData, "", false)} as const);`,
    "",
  ].join("\n");
}

function renderFrozenValue(
  value: unknown,
  indentation = "",
  freeze = true,
): string {
  const childIndentation = `${indentation}  `;
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      `${childIndentation}${renderFrozenValue(item, childIndentation)}`,
    );
    const literal = items.length === 0
      ? "[]"
      : `[\n${items.join(",\n")}\n${indentation}]`;
    return freeze ? `Object.freeze(${literal})` : literal;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) =>
        `${childIndentation}${JSON.stringify(key)}: ${renderFrozenValue(item, childIndentation)}`,
    );
    const literal = entries.length === 0
      ? "{}"
      : `{\n${entries.join(",\n")}\n${indentation}}`;
    return freeze ? `Object.freeze(${literal})` : literal;
  }
  const literal = JSON.stringify(value);
  if (literal === undefined) {
    throw new Error("Federal Census data must be JSON-serializable.");
  }
  return literal;
}

function validateSourceHashes(
  metadata: FederalPolicyMetadata,
  sourceBytes: ReadonlyArray<readonly [string, Uint8Array]>,
): void {
  for (const [url, bytes] of sourceBytes) {
    const source = metadata.sources.find((candidate) => candidate.url === url);
    const hashes = sourceHashes(bytes, url);
    if (
      source === undefined ||
      source.upstreamSha256 !== hashes.upstreamSha256 ||
      source.canonicalSha256 !== hashes.canonicalSha256
    ) {
      throw new Error(`Checked-in source hash drifted for ${url}.`);
    }
  }
}

function sourceHashes(bytes: Uint8Array, url: string): {
  upstreamSha256: string;
  canonicalSha256: string;
} {
  const source = decodeUtf8(bytes, url);
  return {
    upstreamSha256: sha256(bytes),
    canonicalSha256: sha256(Buffer.from(canonicalizeSource(source), "utf8")),
  };
}

function decodeUtf8(bytes: Uint8Array, url: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`Census source is not valid UTF-8 for ${url}.`);
  }
}

function canonicalizeSource(source: string): string {
  return source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function isRfc3339Utc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return (
    Number.isFinite(date.valueOf()) &&
    date.toISOString() === value.replace("Z", value.includes(".") ? "Z" : ".000Z")
  );
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function projectRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}

function apportionmentPath(root: string): string {
  return resolve(root, "data/census/2020-apportionment.csv");
}

function statePath(root: string): string {
  return resolve(root, "data/census/state.txt");
}

function metadataPath(root: string): string {
  return resolve(root, "data/census/2020-apportionment.metadata.json");
}

function generatedPath(root: string): string {
  return resolve(root, "src/lib/federal-policy.generated.ts");
}

function readMetadata(root: string): FederalPolicyMetadata {
  return JSON.parse(readFileSync(metadataPath(root), "utf8")) as FederalPolicyMetadata;
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--check") {
    checkFederalPolicyFiles();
    return;
  }
  throw new Error("Usage: node scripts/generate-federal-policy.mts --check");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    process.exitCode = 1;
    console.error(error instanceof Error ? error.message : error);
  });
}
