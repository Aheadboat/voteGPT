export type CandidateLevel = "federal" | "state" | "local";
export type ElectionStage = "primary" | "general";
export type SampleStratum =
  | "ordinary"
  | "nonpartisan"
  | "write_in"
  | "cross_filed"
  | "withdrawn"
  | "disqualified";
export type CandidateLifecycleStatus =
  "qualified" | "withdrawn" | "disqualified";
export type BallotAppearance = "printed" | "write_in" | "not_on_ballot";
export type CandidateSourceType =
  "official_election_authority" | "official_ballot" | "official_court_record";

export type OfficialCandidateId = Readonly<{
  issuer: string;
  namespace: string;
  value: string;
}>;

export type ReviewedCandidateAlias = Readonly<{
  name: string;
  source_url: string;
  locator: string;
}>;

type CandidateSourceBase = Readonly<{
  url: string;
  source_type: CandidateSourceType;
  retrieved_at: string;
  locator: string;
  sha256: string;
}>;

export type CandidateSource = CandidateSourceBase &
  (
    | Readonly<{ effective_at: string; effective_time_reason: null }>
    | Readonly<{
        effective_at: null;
        effective_time_reason: "not_published";
      }>
  );

export type CandidateParticipation = Readonly<{
  record_key: string;
  contest_key: string;
  candidate_name: string;
  official_ids: readonly OfficialCandidateId[];
  reviewed_aliases: readonly ReviewedCandidateAlias[];
  jurisdiction: string;
  election_date: string;
  office: string;
  district: string;
  level: CandidateLevel;
  stage: ElectionStage;
  sample_stratum: SampleStratum;
  lifecycle_status: CandidateLifecycleStatus;
  ballot_appearance: BallotAppearance;
  party_lines: readonly string[];
  sources: readonly CandidateSource[];
}>;

const participationKeys = [
  "record_key",
  "contest_key",
  "candidate_name",
  "official_ids",
  "reviewed_aliases",
  "jurisdiction",
  "election_date",
  "office",
  "district",
  "level",
  "stage",
  "sample_stratum",
  "lifecycle_status",
  "ballot_appearance",
  "party_lines",
  "sources",
] as const;
const levels = ["federal", "state", "local"] as const;
const stages = ["primary", "general"] as const;
const strata = [
  "ordinary",
  "nonpartisan",
  "write_in",
  "cross_filed",
  "withdrawn",
  "disqualified",
] as const;
const lifecycleStatuses = ["qualified", "withdrawn", "disqualified"] as const;
const ballotAppearances = ["printed", "write_in", "not_on_ballot"] as const;
const sourceTypes = [
  "official_election_authority",
  "official_ballot",
  "official_court_record",
] as const;
const sourceKeys = [
  "url",
  "source_type",
  "retrieved_at",
  "effective_at",
  "effective_time_reason",
  "locator",
  "sha256",
] as const;
const officialIdKeys = ["issuer", "namespace", "value"] as const;
const aliasKeys = ["name", "source_url", "locator"] as const;
// RFC 3986 unreserved and reserved ASCII punctuation; percent triplets are checked separately.
const rfc3986UriPunctuation = "-._~:/?#[]@!$&'()*+,;=%";

export function normalizeCandidateName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\p{White_Space}\uFEFF]+/gu, " ")
    .trim()
    .toLowerCase();
}

export function validateCandidateParticipation(
  value: unknown,
): value is CandidateParticipation {
  try {
    if (!validateCandidateParticipationValue(value)) {
      return false;
    }
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

function validateCandidateParticipationValue(
  value: unknown,
): value is CandidateParticipation {
  const row = readExactDataRecord(value, participationKeys);
  if (row === null) {
    return false;
  }
  const officialIds = readExactDenseArray(row.official_ids);
  const reviewedAliases = readExactDenseArray(row.reviewed_aliases);
  const partyLines = readExactDenseArray(row.party_lines);
  const sourceValues = readExactDenseArray(row.sources);
  if (
    !isNonblank(row.record_key) ||
    !isNonblank(row.contest_key) ||
    !isNonblank(row.candidate_name) ||
    normalizeCandidateName(row.candidate_name).length === 0 ||
    !isNonblank(row.jurisdiction) ||
    !isNonblank(row.office) ||
    !isNonblank(row.district) ||
    !isCalendarDate(row.election_date) ||
    !isOneOf(row.level, levels) ||
    !isOneOf(row.stage, stages) ||
    !isOneOf(row.sample_stratum, strata) ||
    !isOneOf(row.lifecycle_status, lifecycleStatuses) ||
    !isOneOf(row.ballot_appearance, ballotAppearances) ||
    officialIds === null ||
    reviewedAliases === null ||
    partyLines === null ||
    sourceValues === null ||
    sourceValues.length === 0
  ) {
    return false;
  }
  const sources = readCandidateSources(sourceValues);
  if (sources === null) {
    return false;
  }
  return (
    areOfficialCandidateIds(officialIds) &&
    areUniqueNonblankStrings(partyLines) &&
    matchesStratumRules(
      row.sample_stratum,
      row.lifecycle_status,
      row.ballot_appearance,
      partyLines,
    ) &&
    areReviewedCandidateAliases(reviewedAliases, row.candidate_name, sources)
  );
}

function areOfficialCandidateIds(
  values: readonly unknown[],
): values is readonly OfficialCandidateId[] {
  const seen = new Set<string>();
  for (const value of values) {
    const officialId = readExactDataRecord(value, officialIdKeys);
    if (
      officialId === null ||
      !isNonblank(officialId.issuer) ||
      !isNonblank(officialId.namespace) ||
      !isNonblank(officialId.value)
    ) {
      return false;
    }
    const key = JSON.stringify([
      officialId.issuer,
      officialId.namespace,
      officialId.value,
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
  }
  return true;
}

function areUniqueNonblankStrings(
  values: readonly unknown[],
): values is readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (!isNonblank(value) || seen.has(value)) {
      return false;
    }
    seen.add(value);
  }
  return true;
}

function areReviewedCandidateAliases(
  aliases: readonly unknown[],
  candidateName: string,
  sources: readonly CandidateSource[],
): aliases is readonly ReviewedCandidateAlias[] {
  const canonicalName = normalizeCandidateName(candidateName);
  const seen = new Set<string>();
  for (const value of aliases) {
    const alias = readExactDataRecord(value, aliasKeys);
    if (
      alias === null ||
      !isNonblank(alias.name) ||
      !isNonblank(alias.source_url) ||
      !isNonblank(alias.locator)
    ) {
      return false;
    }
    const normalizedName = normalizeCandidateName(alias.name);
    if (
      normalizedName.length === 0 ||
      normalizedName === canonicalName ||
      seen.has(normalizedName)
    ) {
      return false;
    }
    let matchingSourceCount = 0;
    for (const source of sources) {
      if (source.url === alias.source_url && source.locator === alias.locator) {
        matchingSourceCount += 1;
      }
    }
    if (matchingSourceCount !== 1) {
      return false;
    }
    seen.add(normalizedName);
  }
  return true;
}

function matchesStratumRules(
  stratum: unknown,
  lifecycleStatus: unknown,
  ballotAppearance: unknown,
  partyLines: readonly unknown[],
): boolean {
  switch (stratum) {
    case "ordinary":
      return lifecycleStatus === "qualified" && ballotAppearance === "printed";
    case "nonpartisan":
      return (
        lifecycleStatus === "qualified" &&
        ballotAppearance === "printed" &&
        partyLines.length === 0
      );
    case "cross_filed":
      return (
        lifecycleStatus === "qualified" &&
        ballotAppearance === "printed" &&
        partyLines.length >= 2
      );
    case "write_in":
      return lifecycleStatus === "qualified" && ballotAppearance === "write_in";
    case "withdrawn":
      return (
        lifecycleStatus === "withdrawn" &&
        (ballotAppearance === "printed" || ballotAppearance === "not_on_ballot")
      );
    case "disqualified":
      return (
        lifecycleStatus === "disqualified" &&
        ballotAppearance === "not_on_ballot"
      );
    default:
      return false;
  }
}

function readCandidateSource(value: unknown): CandidateSource | null {
  const source = readExactDataRecord(value, sourceKeys);
  if (source === null) {
    return null;
  }
  const hasPublishedEffectiveTime =
    isRfc3339(source.effective_at) && source.effective_time_reason === null;
  const hasUnpublishedEffectiveTime =
    source.effective_at === null &&
    source.effective_time_reason === "not_published";

  if (
    !isHttpsUrl(source.url) ||
    !isOneOf(source.source_type, sourceTypes) ||
    !isRfc3339(source.retrieved_at) ||
    !isNonblank(source.locator) ||
    typeof source.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(source.sha256) ||
    (!hasPublishedEffectiveTime && !hasUnpublishedEffectiveTime)
  ) {
    return null;
  }
  return source as CandidateSource;
}

function readCandidateSources(
  values: readonly unknown[],
): readonly CandidateSource[] | null {
  const sources: CandidateSource[] = [];
  for (const value of values) {
    const source = readCandidateSource(value);
    if (source === null) {
      return null;
    }
    sources.push(source);
  }
  return sources;
}

function readExactDataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    return null;
  }
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return null;
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function readExactDenseArray(value: unknown): readonly unknown[] | null {
  if (
    !Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Array.prototype
  ) {
    return null;
  }
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return null;
  }
  const length = lengthDescriptor.value;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) {
    return null;
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return null;
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function isNonblank(value: unknown): value is string {
  return typeof value === "string" && normalizeCandidateName(value).length > 0;
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year === 0 || month < 1 || month > 12) {
    return false;
  }
  const days = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day >= 1 && day <= days[month - 1]!;
}

function isHttpsUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^https:\/\/[^/?#\\]+(?:[/?#]|$)/i.test(value) ||
    !hasOnlyRfc3986AsciiCharacters(value) ||
    /%(?![0-9A-Fa-f]{2})/.test(value)
  ) {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function hasOnlyRfc3986AsciiCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isAsciiAlphaNumeric =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);
    if (!isAsciiAlphaNumeric && !rfc3986UriPunctuation.includes(character)) {
      return false;
    }
  }
  return true;
}

function isRfc3339(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match =
    /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (match === null || !isCalendarDate(match[1])) {
    return false;
  }
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[6] === undefined ? 0 : Number(match[6]);
  const offsetMinute = match[7] === undefined ? 0 : Number(match[7]);
  return (
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}
