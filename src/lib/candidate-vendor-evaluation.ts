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

export function normalizeCandidateName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\p{White_Space}+/gu, " ")
    .trim()
    .toLowerCase();
}

export function validateCandidateParticipation(
  value: unknown,
): value is CandidateParticipation {
  try {
    return validateCandidateParticipationValue(value);
  } catch {
    return false;
  }
}

function validateCandidateParticipationValue(
  value: unknown,
): value is CandidateParticipation {
  if (!isRecord(value) || !hasExactKeys(value, participationKeys)) {
    return false;
  }
  if (
    !isNonblank(value.record_key) ||
    !isNonblank(value.contest_key) ||
    !isNonblank(value.candidate_name) ||
    !isNonblank(value.jurisdiction) ||
    !isNonblank(value.office) ||
    !isNonblank(value.district) ||
    !isCalendarDate(value.election_date) ||
    !isOneOf(value.level, levels) ||
    !isOneOf(value.stage, stages) ||
    !isOneOf(value.sample_stratum, strata) ||
    !isOneOf(value.lifecycle_status, lifecycleStatuses) ||
    !isOneOf(value.ballot_appearance, ballotAppearances) ||
    !Array.isArray(value.official_ids) ||
    !Array.isArray(value.reviewed_aliases) ||
    !Array.isArray(value.party_lines) ||
    !Array.isArray(value.sources) ||
    value.sources.length === 0
  ) {
    return false;
  }
  return (
    areOfficialCandidateIds(value.official_ids) &&
    areUniqueNonblankStrings(value.party_lines) &&
    matchesStratumRules(
      value.sample_stratum,
      value.lifecycle_status,
      value.ballot_appearance,
      value.party_lines,
    ) &&
    areCandidateSources(value.sources) &&
    areReviewedCandidateAliases(
      value.reviewed_aliases,
      value.candidate_name,
      value.sources,
    )
  );
}

function areOfficialCandidateIds(
  values: readonly unknown[],
): values is readonly OfficialCandidateId[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, officialIdKeys) ||
      !isNonblank(value.issuer) ||
      !isNonblank(value.namespace) ||
      !isNonblank(value.value)
    ) {
      return false;
    }
    const key = JSON.stringify([value.issuer, value.namespace, value.value]);
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
  sources: readonly unknown[],
): aliases is readonly ReviewedCandidateAlias[] {
  const canonicalName = normalizeCandidateName(candidateName);
  const seen = new Set<string>();
  for (const alias of aliases) {
    if (
      !isRecord(alias) ||
      !hasExactKeys(alias, aliasKeys) ||
      !isNonblank(alias.name) ||
      !isNonblank(alias.source_url) ||
      !isNonblank(alias.locator)
    ) {
      return false;
    }
    const normalizedName = normalizeCandidateName(alias.name);
    if (normalizedName === canonicalName || seen.has(normalizedName)) {
      return false;
    }
    const matchingSources = sources.filter(
      (source) =>
        isRecord(source) &&
        source.url === alias.source_url &&
        source.locator === alias.locator,
    );
    if (matchingSources.length !== 1) {
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

function isCandidateSource(value: unknown): value is CandidateSource {
  if (!isRecord(value) || !hasExactKeys(value, sourceKeys)) {
    return false;
  }
  const hasPublishedEffectiveTime =
    isRfc3339(value.effective_at) && value.effective_time_reason === null;
  const hasUnpublishedEffectiveTime =
    value.effective_at === null &&
    value.effective_time_reason === "not_published";

  return (
    isHttpsUrl(value.url) &&
    isOneOf(value.source_type, sourceTypes) &&
    isRfc3339(value.retrieved_at) &&
    isNonblank(value.locator) &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    (hasPublishedEffectiveTime || hasUnpublishedEffectiveTime)
  );
}

function areCandidateSources(
  values: readonly unknown[],
): values is readonly CandidateSource[] {
  for (const value of values) {
    if (!isCandidateSource(value)) {
      return false;
    }
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isNonblank(value: unknown): value is string {
  return typeof value === "string" && /[^\p{White_Space}]/u.test(value);
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
  if (typeof value !== "string") {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
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
    second <= 60 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}
