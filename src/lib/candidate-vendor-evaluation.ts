import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

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

const censusRegions = [
  {
    name: "northeast",
    states: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  },
  {
    name: "midwest",
    states: [
      "IN",
      "IL",
      "MI",
      "OH",
      "WI",
      "IA",
      "KS",
      "MN",
      "MO",
      "NE",
      "ND",
      "SD",
    ],
  },
  {
    name: "south",
    states: [
      "DE",
      "FL",
      "GA",
      "MD",
      "NC",
      "SC",
      "VA",
      "WV",
      "AL",
      "KY",
      "MS",
      "TN",
      "AR",
      "LA",
      "OK",
      "TX",
    ],
  },
  {
    name: "west",
    states: [
      "AK",
      "AZ",
      "CA",
      "CO",
      "HI",
      "ID",
      "MT",
      "NV",
      "NM",
      "OR",
      "UT",
      "WA",
      "WY",
    ],
  },
] as const;

export type UsStateCode = (typeof censusRegions)[number]["states"][number];

export type CandidateAuthority = Readonly<{
  authority_id: string;
  authority_name: string;
  authority_level: CandidateLevel;
  state_code: UsStateCode;
}>;

export type CandidateAuthorityAssignment = Readonly<{
  record_key: string;
  authority_id: string;
  source_url: string;
  locator: string;
}>;

export type OrdinaryControlManifestCell = Readonly<{
  level: CandidateLevel;
  stage: ElectionStage;
  eligible_record_keys: readonly string[];
}>;

export type CandidateComparisonSet = Readonly<{
  as_of: string;
  records: readonly CandidateParticipation[];
  authorities: readonly CandidateAuthority[];
  authority_assignments: readonly CandidateAuthorityAssignment[];
  ordinary_control_manifest: readonly OrdinaryControlManifestCell[];
}>;

export type CandidateVendorSource = Readonly<{
  url: string;
  retrieved_at: string;
  locator: string;
}>;

export type CandidateVendorRecord = Readonly<{
  vendor_record_id: string;
  contest_key: string;
  candidate_name: string;
  official_ids: readonly OfficialCandidateId[];
  jurisdiction: string;
  election_date: string;
  office: string;
  district: string;
  level: CandidateLevel;
  stage: ElectionStage;
  lifecycle_status: CandidateLifecycleStatus;
  ballot_appearance: BallotAppearance;
  party_lines: readonly string[];
  sources: readonly CandidateVendorSource[];
}>;

export type CandidateVendorDiagnosticCode =
  | "ambiguous_match"
  | "duplicate_truth_record_key"
  | "duplicate_vendor_record_id"
  | "edge_stratum_recall_below_threshold"
  | "false_confirmed_on_ballot"
  | "field_conflict"
  | "invalid_truth_set"
  | "invalid_vendor_record"
  | "missing_truth_record"
  | "overall_recall_below_threshold"
  | "positive_recall_below_threshold"
  | "truth_provenance_missing"
  | "unmatched_confirmed_on_ballot"
  | "unmatched_vendor_record"
  | "vendor_provenance_missing";

export type CandidateVendorDiagnostic = Readonly<{
  code: CandidateVendorDiagnosticCode;
  fatal: boolean;
  truth_record_key: string | null;
  vendor_record_id: string | null;
  field: string | null;
  expected: string | null;
  actual: string | null;
}>;

export type CandidateVendorRecall = Readonly<{
  matched: number;
  total: number;
  required: number;
  passed: boolean;
}>;

export type CandidateVendorStratumRecall = Readonly<{
  sample_stratum: SampleStratum;
  matched: number;
  total: number;
  required: number | null;
  passed: boolean;
}>;

export type CandidateVendorEvaluationReport = Readonly<{
  technical_result: "pass" | "fail";
  truth_record_count: number;
  vendor_record_count: number;
  matched_record_count: number;
  overall_recall: CandidateVendorRecall;
  positive_recall: CandidateVendorRecall;
  strata: readonly CandidateVendorStratumRecall[];
  provenance: Readonly<{
    truth_records_complete: number;
    vendor_records_complete: number;
    truth_complete: boolean;
    vendor_complete: boolean;
  }>;
  diagnostics: readonly CandidateVendorDiagnostic[];
}>;

export type CandidateVendorDecisionEvidenceStatus =
  "allowed" | "unknown" | "denied";

export type CandidateVendorDecisionEvidenceRecord = Readonly<{
  requirement: string;
  status: CandidateVendorDecisionEvidenceStatus;
  scope: string;
  limits: string;
  evidence_url: string;
  document_title: string;
  document_version: string;
  effective_date: string;
  retrieved_at: string;
  raw_content_sha256: string;
  [key: string]: unknown;
}>;

export type CandidateVendorDecisionEvidence = Readonly<{
  legal_permissions: readonly CandidateVendorDecisionEvidenceRecord[];
  operational_commitments: readonly CandidateVendorDecisionEvidenceRecord[];
  package_coverage: CandidateVendorDecisionEvidenceRecord;
  quote_approved?: boolean;
}>;

export type CandidateVendorDecisionEvidenceKind =
  | "evidence"
  | "legal_permission"
  | "operational_commitment"
  | "package_coverage"
  | "quote"
  | "technical";

export type CandidateVendorDecisionDiagnosticCode =
  | "duplicate_evidence_requirement"
  | "evidence_bundle_invalid"
  | "evidence_metadata_invalid"
  | "evidence_missing"
  | "evidence_status_not_allowed"
  | "legal_minimum_not_met"
  | "operational_minimum_not_met"
  | "package_coverage_incomplete"
  | "quote_not_approved"
  | "technical_evaluation_failed";

export type CandidateVendorDecisionDiagnostic = Readonly<{
  code: CandidateVendorDecisionDiagnosticCode;
  evidence_kind: CandidateVendorDecisionEvidenceKind;
  requirement: string | null;
  field: string | null;
  expected: string | null;
  actual: string | null;
}>;

export type CandidateVendorDecision = Readonly<{
  decision: "go" | "no_go";
  technical_result: "pass" | "fail";
  rights_and_operations_result: "pass" | "fail";
  quote_approved: boolean;
  diagnostics: readonly CandidateVendorDecisionDiagnostic[];
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
const comparisonSetKeys = [
  "as_of",
  "records",
  "authorities",
  "authority_assignments",
  "ordinary_control_manifest",
] as const;
const authorityKeys = [
  "authority_id",
  "authority_name",
  "authority_level",
  "state_code",
] as const;
const authorityAssignmentKeys = [
  "record_key",
  "authority_id",
  "source_url",
  "locator",
] as const;
const manifestCellKeys = ["level", "stage", "eligible_record_keys"] as const;
const vendorRecordKeys = [
  "vendor_record_id",
  "contest_key",
  "candidate_name",
  "official_ids",
  "jurisdiction",
  "election_date",
  "office",
  "district",
  "level",
  "stage",
  "lifecycle_status",
  "ballot_appearance",
  "party_lines",
  "sources",
] as const;
const vendorSourceKeys = ["url", "retrieved_at", "locator"] as const;
const comparisonCellQuotas = [
  {
    level: "federal",
    stage: "primary",
    ordinary: 8,
    nonpartisan: 1,
    write_in: 2,
    cross_filed: 2,
    withdrawn: 2,
    disqualified: 2,
  },
  {
    level: "federal",
    stage: "general",
    ordinary: 9,
    nonpartisan: 1,
    write_in: 2,
    cross_filed: 2,
    withdrawn: 2,
    disqualified: 1,
  },
  {
    level: "state",
    stage: "primary",
    ordinary: 9,
    nonpartisan: 2,
    write_in: 1,
    cross_filed: 2,
    withdrawn: 2,
    disqualified: 1,
  },
  {
    level: "state",
    stage: "general",
    ordinary: 8,
    nonpartisan: 2,
    write_in: 1,
    cross_filed: 2,
    withdrawn: 1,
    disqualified: 2,
  },
  {
    level: "local",
    stage: "primary",
    ordinary: 8,
    nonpartisan: 2,
    write_in: 2,
    cross_filed: 1,
    withdrawn: 1,
    disqualified: 2,
  },
  {
    level: "local",
    stage: "general",
    ordinary: 8,
    nonpartisan: 2,
    write_in: 2,
    cross_filed: 1,
    withdrawn: 2,
    disqualified: 2,
  },
] as const;
const rfc3986UnreservedAndSubDelimiterPunctuation = "-._~!$&'()*+,;=";
const rfc3986RegNamePunctuation = `${rfc3986UnreservedAndSubDelimiterPunctuation}%`;
const rfc3986IpLiteralPunctuation = `${rfc3986UnreservedAndSubDelimiterPunctuation}:`;
const rfc3986PathPunctuation = `${rfc3986UnreservedAndSubDelimiterPunctuation}:@/%`;
const rfc3986QueryOrFragmentPunctuation = `${rfc3986PathPunctuation}?`;
const candidateVendorDecisionEvidenceKeys = [
  "legal_permissions",
  "operational_commitments",
  "package_coverage",
  "quote_approved",
] as const;

type CandidateVendorDecisionMinimum = Readonly<{
  field: string;
  expected: string;
  passes: (value: unknown) => boolean;
}>;

type CandidateVendorDecisionRequirement = Readonly<{
  requirement: string;
  minima: readonly CandidateVendorDecisionMinimum[];
}>;

const candidateVendorDecisionMetadata: readonly CandidateVendorDecisionMinimum[] =
  [
    {
      field: "scope",
      expected: "nonblank string",
      passes: isNonblank,
    },
    {
      field: "limits",
      expected: "nonblank string",
      passes: isNonblank,
    },
    {
      field: "evidence_url",
      expected: "HTTPS URL",
      passes: isHttpsUrl,
    },
    {
      field: "document_title",
      expected: "nonblank string",
      passes: isNonblank,
    },
    {
      field: "document_version",
      expected: "nonblank string",
      passes: isNonblank,
    },
    {
      field: "effective_date",
      expected: "calendar date",
      passes: isCalendarDate,
    },
    {
      field: "retrieved_at",
      expected: "RFC 3339 timestamp",
      passes: isRfc3339,
    },
    {
      field: "raw_content_sha256",
      expected: "lowercase 64-hex SHA-256",
      passes: (value) =>
        typeof value === "string" && /^[0-9a-f]{64}$/.test(value),
    },
  ];

const legalCandidateVendorDecisionRequirements: readonly CandidateVendorDecisionRequirement[] =
  [
    {
      requirement: "public_redisplay",
      minima: [
        {
          field: "public_use",
          expected: "true",
          passes: (value) => value === true,
        },
        {
          field: "normalized_facts",
          expected: '["candidate","contest","status","source"]',
          passes: (value) => {
            const values = readExactDenseArray(value);
            return (
              values !== null &&
              JSON.stringify(values) ===
                '["candidate","contest","status","source"]'
            );
          },
        },
        {
          field: "bulk_raw_extraction",
          expected: "false",
          passes: (value) => value === false,
        },
      ],
    },
    {
      requirement: "current_response_cache",
      minima: [
        {
          field: "minimum_days",
          expected: ">=30",
          passes: (value) => isNonnegativeSafeInteger(value) && value >= 30,
        },
      ],
    },
    {
      requirement: "normalized_history_and_audit",
      minima: [
        {
          field: "minimum_months_after_certification",
          expected: ">=24",
          passes: (value) => isNonnegativeSafeInteger(value) && value >= 24,
        },
      ],
    },
    {
      requirement: "derived_use",
      minima: [
        {
          field: "normalized_records",
          expected: "true",
          passes: (value) => value === true,
        },
        {
          field: "non_reconstructive_metrics",
          expected: "true",
          passes: (value) => value === true,
        },
      ],
    },
    {
      requirement: "correction_and_tombstone",
      minima: [
        {
          field: "correction_processing",
          expected: "true",
          passes: (value) => value === true,
        },
        {
          field: "tombstone_processing",
          expected: "true",
          passes: (value) => value === true,
        },
        {
          field: "audit_trail",
          expected: "true",
          passes: (value) => value === true,
        },
      ],
    },
    {
      requirement: "termination",
      minima: [
        {
          field: "maximum_raw_purge_days",
          expected: "<=30",
          passes: (value) => isNonnegativeSafeInteger(value) && value <= 30,
        },
        {
          field: "maximum_backup_purge_days",
          expected: "<=90",
          passes: (value) => isNonnegativeSafeInteger(value) && value <= 90,
        },
        {
          field: "retains_only_separately_permitted_normalized_audit_facts",
          expected: "true",
          passes: (value) => value === true,
        },
      ],
    },
  ];

const operationalCandidateVendorDecisionRequirements: readonly CandidateVendorDecisionRequirement[] =
  [
    {
      requirement: "content_refresh",
      minima: [
        {
          field: "maximum_interval_hours",
          expected: "<=24",
          passes: (value) => isNonnegativeSafeInteger(value) && value <= 24,
        },
      ],
    },
    {
      requirement: "status_alert_and_tombstone",
      minima: [
        {
          field: "maximum_status_alert_hours_after_ingestion",
          expected: "<=24",
          passes: (value) => isNonnegativeSafeInteger(value) && value <= 24,
        },
        {
          field: "maximum_tombstone_hours_after_ingestion",
          expected: "<=24",
          passes: (value) => isNonnegativeSafeInteger(value) && value <= 24,
        },
      ],
    },
    {
      requirement: "correction_acknowledgement",
      minima: [
        {
          field: "maximum_business_days",
          expected: "<=1",
          passes: (value) => isNonnegativeSafeInteger(value) && value <= 1,
        },
      ],
    },
    {
      requirement: "correction_or_disposition",
      minima: [
        {
          field: "maximum_business_days",
          expected: "<=2",
          passes: (value) => isNonnegativeSafeInteger(value) && value <= 2,
        },
      ],
    },
    {
      requirement: "nonbreaking_schema_notice",
      minima: [
        {
          field: "minimum_notice_days",
          expected: ">=30",
          passes: (value) => isNonnegativeSafeInteger(value) && value >= 30,
        },
      ],
    },
    {
      requirement: "breaking_schema_notice",
      minima: [
        {
          field: "minimum_notice_days",
          expected: ">=90",
          passes: (value) => isNonnegativeSafeInteger(value) && value >= 90,
        },
      ],
    },
  ];

const packageCandidateVendorDecisionRequirement: CandidateVendorDecisionRequirement =
  {
    requirement: "purchased_package_coverage",
    minima: [
      {
        field: "covers_every_sampled_jurisdiction",
        expected: "true",
        passes: (value) => value === true,
      },
      {
        field: "covers_every_sampled_stage",
        expected: "true",
        passes: (value) => value === true,
      },
      {
        field: "covers_every_sampled_stratum",
        expected: "true",
        passes: (value) => value === true,
      },
    ],
  };

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
    if (
      !canStructuredCloneCandidateInput(value) ||
      !validateCandidateParticipationValue(value)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function validateCandidateComparisonSet(
  value: unknown,
): value is CandidateComparisonSet {
  try {
    if (
      !canStructuredCloneCandidateInput(value) ||
      !validateCandidateComparisonSetValue(value)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function evaluateCandidateVendor(
  truthValue: unknown,
  vendorValue: unknown,
): CandidateVendorEvaluationReport {
  if (!canStructuredCloneCandidateInput(truthValue)) {
    return rejectedCandidateVendorInputReport([
      candidateVendorDiagnostic("invalid_truth_set", true),
    ]);
  }
  const rejectedVendorDiagnostics = preflightCandidateVendorInput(vendorValue);
  if (rejectedVendorDiagnostics !== null) {
    return rejectedCandidateVendorInputReport(rejectedVendorDiagnostics);
  }
  try {
    return evaluateCandidateVendorValue(truthValue, vendorValue);
  } catch {
    return rejectedCandidateVendorInputReport([
      candidateVendorDiagnostic("invalid_truth_set", true),
      candidateVendorDiagnostic("invalid_vendor_record", true),
    ]);
  }
}

function evaluateCandidateVendorValue(
  truthValue: unknown,
  vendorValue: unknown,
): CandidateVendorEvaluationReport {
  const diagnostics: CandidateVendorDiagnostic[] = [];
  const truthSet = readExactDataRecord(truthValue, comparisonSetKeys);
  const rawTruthRecords =
    truthSet === null ? null : readExactDenseArray(truthSet.records);
  const truthValues = rawTruthRecords ?? [];
  const truthRecords: CandidateParticipation[] = [];

  if (!validateCandidateComparisonSet(truthValue)) {
    diagnostics.push(candidateVendorDiagnostic("invalid_truth_set", true));
  }

  const truthKeys = new Set<string>();
  for (let index = 0; index < truthValues.length; index += 1) {
    const value = truthValues[index];
    const recordKey = candidateRecordKey(value);
    if (recordKey !== null) {
      if (truthKeys.has(recordKey)) {
        diagnostics.push(
          candidateVendorDiagnostic("duplicate_truth_record_key", true, {
            truth_record_key: recordKey,
          }),
        );
      }
      truthKeys.add(recordKey);
    }
    if (validateCandidateParticipation(value)) {
      truthRecords.push(value);
    }
  }

  const truthRecordsComplete = truthValues.filter(
    hasCompleteTruthProvenance,
  ).length;
  for (const value of truthValues) {
    if (!hasCompleteTruthProvenance(value)) {
      diagnostics.push(
        candidateVendorDiagnostic("truth_provenance_missing", true, {
          truth_record_key: candidateRecordKey(value),
        }),
      );
    }
  }

  const rawVendorRecords = readExactDenseArray(vendorValue);
  const vendorValues = rawVendorRecords ?? [];
  if (rawVendorRecords === null) {
    diagnostics.push(candidateVendorDiagnostic("invalid_vendor_record", true));
  }

  const vendorRecords: CandidateVendorRecord[] = [];
  const vendorIds = new Set<string>();
  for (const value of vendorValues) {
    const vendorRecordId = candidateVendorRecordId(value);
    const record = readCandidateVendorRecord(value);
    if (record === null) {
      diagnostics.push(
        candidateVendorDiagnostic("invalid_vendor_record", true, {
          vendor_record_id: vendorRecordId,
        }),
      );
      continue;
    }
    if (vendorIds.has(record.vendor_record_id)) {
      diagnostics.push(
        candidateVendorDiagnostic("duplicate_vendor_record_id", true, {
          vendor_record_id: record.vendor_record_id,
        }),
      );
    }
    vendorIds.add(record.vendor_record_id);
    vendorRecords.push(record);
  }

  const vendorRecordsComplete = vendorValues.filter(
    hasCompleteVendorProvenance,
  ).length;
  for (const value of vendorValues) {
    if (!hasCompleteVendorProvenance(value)) {
      diagnostics.push(
        candidateVendorDiagnostic("vendor_provenance_missing", true, {
          vendor_record_id: candidateVendorRecordId(value),
        }),
      );
    }
  }

  const truthByContest = new Map<string, CandidateParticipation[]>();
  for (const truth of truthRecords) {
    const key = candidateContestIdentity(truth);
    const candidates = truthByContest.get(key) ?? [];
    candidates.push(truth);
    truthByContest.set(key, candidates);
  }

  const proposals = new Map<CandidateParticipation, CandidateVendorRecord[]>();
  const unavailableVendorRecords = new Set<CandidateVendorRecord>();

  for (const vendor of vendorRecords) {
    const contestCandidates =
      truthByContest.get(candidateContestIdentity(vendor)) ?? [];
    const candidates = contestCandidates.filter((truth) =>
      candidateIdentityOverlaps(truth, vendor),
    );
    if (candidates.length === 1) {
      const rows = proposals.get(candidates[0]!) ?? [];
      rows.push(vendor);
      proposals.set(candidates[0]!, rows);
      continue;
    }

    unavailableVendorRecords.add(vendor);
    if (candidates.length > 1) {
      diagnostics.push(
        candidateVendorDiagnostic("ambiguous_match", true, {
          vendor_record_id: vendor.vendor_record_id,
        }),
      );
      continue;
    }

    diagnostics.push(
      candidateVendorDiagnostic("unmatched_vendor_record", false, {
        vendor_record_id: vendor.vendor_record_id,
      }),
    );
    const identityHints = truthRecords.filter((truth) =>
      candidateIdentityOverlaps(truth, vendor),
    );
    if (identityHints.length === 1) {
      addCandidateVendorConflicts(diagnostics, identityHints[0]!, vendor);
    }
  }

  const matches: Array<
    readonly [CandidateParticipation, CandidateVendorRecord]
  > = [];
  for (const [truth, vendors] of proposals) {
    if (vendors.length === 1) {
      matches.push([truth, vendors[0]!] as const);
      continue;
    }
    for (const vendor of vendors) {
      unavailableVendorRecords.add(vendor);
      diagnostics.push(
        candidateVendorDiagnostic("ambiguous_match", true, {
          truth_record_key: truth.record_key,
          vendor_record_id: vendor.vendor_record_id,
        }),
      );
    }
  }

  for (const vendor of unavailableVendorRecords) {
    if (
      vendor.ballot_appearance === "printed" &&
      truthByContest.has(candidateContestIdentity(vendor))
    ) {
      diagnostics.push(
        candidateVendorDiagnostic("unmatched_confirmed_on_ballot", true, {
          vendor_record_id: vendor.vendor_record_id,
          field: "ballot_appearance",
          expected: "matched official printed record",
          actual: "printed",
        }),
      );
    }
  }

  const matchedTruth = new Set<CandidateParticipation>();
  for (const [truth, vendor] of matches) {
    matchedTruth.add(truth);
    addCandidateVendorConflicts(diagnostics, truth, vendor);
    if (
      vendor.ballot_appearance === "printed" &&
      truth.ballot_appearance !== "printed"
    ) {
      diagnostics.push(
        candidateVendorDiagnostic("false_confirmed_on_ballot", true, {
          truth_record_key: truth.record_key,
          vendor_record_id: vendor.vendor_record_id,
          field: "ballot_appearance",
          expected: truth.ballot_appearance,
          actual: vendor.ballot_appearance,
        }),
      );
    }
  }

  for (const truth of truthRecords) {
    if (!matchedTruth.has(truth)) {
      diagnostics.push(
        candidateVendorDiagnostic("missing_truth_record", false, {
          truth_record_key: truth.record_key,
        }),
      );
    }
  }

  const overallRecall = candidateVendorRecall(
    matchedTruth.size,
    truthValues.length,
    0.95,
  );
  if (!overallRecall.passed) {
    diagnostics.push(
      candidateVendorDiagnostic("overall_recall_below_threshold", true, {
        expected: String(overallRecall.required),
        actual: String(overallRecall.matched),
      }),
    );
  }

  const positiveTruth = truthRecords.filter(isPositiveCandidateTruth);
  const matchedPositive = positiveTruth.filter((truth) =>
    matchedTruth.has(truth),
  ).length;
  const positiveRecall = candidateVendorRecall(
    matchedPositive,
    positiveTruth.length,
    0.95,
  );
  if (!positiveRecall.passed) {
    diagnostics.push(
      candidateVendorDiagnostic("positive_recall_below_threshold", true, {
        expected: String(positiveRecall.required),
        actual: String(positiveRecall.matched),
      }),
    );
  }

  const stratumRecall = strata.map((sampleStratum) => {
    const stratumTruth = truthRecords.filter(
      (truth) => truth.sample_stratum === sampleStratum,
    );
    const matched = stratumTruth.filter((truth) =>
      matchedTruth.has(truth),
    ).length;
    const required =
      sampleStratum === "ordinary"
        ? null
        : Math.ceil(stratumTruth.length * 0.9);
    const passed = required === null || matched >= required;
    if (!passed) {
      diagnostics.push(
        candidateVendorDiagnostic("edge_stratum_recall_below_threshold", true, {
          field: sampleStratum,
          expected: String(required),
          actual: String(matched),
        }),
      );
    }
    return {
      sample_stratum: sampleStratum,
      matched,
      total: stratumTruth.length,
      required,
      passed,
    };
  });

  const truthComplete =
    rawTruthRecords !== null && truthRecordsComplete === truthValues.length;
  const vendorComplete =
    rawVendorRecords !== null && vendorRecordsComplete === vendorValues.length;
  diagnostics.sort(compareCandidateVendorDiagnostics);

  return {
    technical_result:
      diagnostics.some((diagnostic) => diagnostic.fatal) ||
      !truthComplete ||
      !vendorComplete
        ? "fail"
        : "pass",
    truth_record_count: truthValues.length,
    vendor_record_count: vendorValues.length,
    matched_record_count: matchedTruth.size,
    overall_recall: overallRecall,
    positive_recall: positiveRecall,
    strata: stratumRecall,
    provenance: {
      truth_records_complete: truthRecordsComplete,
      vendor_records_complete: vendorRecordsComplete,
      truth_complete: truthComplete,
      vendor_complete: vendorComplete,
    },
    diagnostics,
  };
}

export function serializeCandidateVendorEvaluation(
  report: CandidateVendorEvaluationReport,
): string {
  return JSON.stringify(report);
}

export function evaluateCandidateVendorDecision(
  technicalReport: CandidateVendorEvaluationReport,
  evidenceValue: unknown,
): CandidateVendorDecision {
  const technicalResult = technicalReport.technical_result;
  if (!canStructuredCloneCandidateInput(evidenceValue)) {
    return rejectedCandidateVendorDecisionEvidence(technicalResult);
  }

  try {
    const evidence = readCandidateVendorDecisionEvidence(evidenceValue);
    if (evidence === null) {
      return rejectedCandidateVendorDecisionEvidence(technicalResult);
    }

    const legalValues = readExactDenseArray(evidence.legal_permissions);
    const operationalValues = readExactDenseArray(
      evidence.operational_commitments,
    );
    if (legalValues === null || operationalValues === null) {
      return rejectedCandidateVendorDecisionEvidence(technicalResult);
    }

    const diagnostics: CandidateVendorDecisionDiagnostic[] = [];
    if (
      !validateCandidateVendorDecisionEvidenceRecords(
        legalValues,
        legalCandidateVendorDecisionRequirements,
        "legal_permission",
        "legal_minimum_not_met",
        diagnostics,
      ) ||
      !validateCandidateVendorDecisionEvidenceRecords(
        operationalValues,
        operationalCandidateVendorDecisionRequirements,
        "operational_commitment",
        "operational_minimum_not_met",
        diagnostics,
      )
    ) {
      return rejectedCandidateVendorDecisionEvidence(technicalResult);
    }

    if (!Object.hasOwn(evidence, "package_coverage")) {
      diagnostics.push(
        candidateVendorDecisionDiagnostic(
          "evidence_missing",
          "package_coverage",
          {
            requirement: packageCandidateVendorDecisionRequirement.requirement,
            field: "requirement",
            expected: "present",
          },
        ),
      );
    } else {
      const packageEvidence = readDataRecord(evidence.package_coverage);
      if (
        packageEvidence === null ||
        packageEvidence.requirement !==
          packageCandidateVendorDecisionRequirement.requirement
      ) {
        return rejectedCandidateVendorDecisionEvidence(technicalResult);
      }
      validateCandidateVendorDecisionEvidenceRecord(
        packageEvidence,
        packageCandidateVendorDecisionRequirement,
        "package_coverage",
        "package_coverage_incomplete",
        diagnostics,
      );
    }

    const quoteApproved = evidence.quote_approved === true;
    if (!quoteApproved) {
      diagnostics.push(
        candidateVendorDecisionDiagnostic("quote_not_approved", "quote", {
          field: "quote_approved",
          expected: "true",
          actual: candidateVendorDecisionActual(evidence.quote_approved),
        }),
      );
    }
    if (technicalResult === "fail") {
      diagnostics.push(candidateVendorTechnicalFailureDiagnostic());
    }

    return candidateVendorDecision(technicalResult, quoteApproved, diagnostics);
  } catch {
    return rejectedCandidateVendorDecisionEvidence(technicalResult);
  }
}

export function serializeCandidateVendorDecision(
  decision: CandidateVendorDecision,
): string {
  return JSON.stringify(decision);
}

function readCandidateVendorDecisionEvidence(
  value: unknown,
): Record<string, unknown> | null {
  const evidence = readDataRecord(value);
  if (
    evidence === null ||
    !Object.hasOwn(evidence, "legal_permissions") ||
    !Object.hasOwn(evidence, "operational_commitments") ||
    Object.keys(evidence).some(
      (key) =>
        !candidateVendorDecisionEvidenceKeys.some(
          (allowedKey) => allowedKey === key,
        ),
    )
  ) {
    return null;
  }
  return evidence;
}

function validateCandidateVendorDecisionEvidenceRecords(
  values: readonly unknown[],
  requirements: readonly CandidateVendorDecisionRequirement[],
  evidenceKind: "legal_permission" | "operational_commitment",
  minimumCode: "legal_minimum_not_met" | "operational_minimum_not_met",
  diagnostics: CandidateVendorDecisionDiagnostic[],
): boolean {
  const records: Record<string, unknown>[] = [];
  for (const value of values) {
    const record = readDataRecord(value);
    if (
      record === null ||
      typeof record.requirement !== "string" ||
      !requirements.some(
        ({ requirement }) => requirement === record.requirement,
      )
    ) {
      return false;
    }
    records.push(record);
  }

  for (const requirement of requirements) {
    const matches = records.filter(
      (record) => record.requirement === requirement.requirement,
    );
    if (matches.length === 0) {
      diagnostics.push(
        candidateVendorDecisionDiagnostic("evidence_missing", evidenceKind, {
          requirement: requirement.requirement,
          field: "requirement",
          expected: "present",
        }),
      );
    } else if (matches.length > 1) {
      diagnostics.push(
        candidateVendorDecisionDiagnostic(
          "duplicate_evidence_requirement",
          evidenceKind,
          {
            requirement: requirement.requirement,
            field: "requirement",
            expected: "unique",
            actual: "duplicate",
          },
        ),
      );
    } else {
      validateCandidateVendorDecisionEvidenceRecord(
        matches[0]!,
        requirement,
        evidenceKind,
        minimumCode,
        diagnostics,
      );
    }
  }
  return true;
}

function validateCandidateVendorDecisionEvidenceRecord(
  record: Record<string, unknown>,
  requirement: CandidateVendorDecisionRequirement,
  evidenceKind:
    "legal_permission" | "operational_commitment" | "package_coverage",
  minimumCode:
    | "legal_minimum_not_met"
    | "operational_minimum_not_met"
    | "package_coverage_incomplete",
  diagnostics: CandidateVendorDecisionDiagnostic[],
) {
  if (record.status !== "allowed") {
    diagnostics.push(
      candidateVendorDecisionDiagnostic(
        "evidence_status_not_allowed",
        evidenceKind,
        {
          requirement: requirement.requirement,
          field: "status",
          expected: "allowed",
          actual: candidateVendorDecisionActual(record.status),
        },
      ),
    );
  }

  for (const metadata of candidateVendorDecisionMetadata) {
    if (!metadata.passes(record[metadata.field])) {
      diagnostics.push(
        candidateVendorDecisionDiagnostic(
          "evidence_metadata_invalid",
          evidenceKind,
          {
            requirement: requirement.requirement,
            field: metadata.field,
            expected: metadata.expected,
            actual: candidateVendorDecisionActual(record[metadata.field]),
          },
        ),
      );
    }
  }

  for (const minimum of requirement.minima) {
    if (!minimum.passes(record[minimum.field])) {
      diagnostics.push(
        candidateVendorDecisionDiagnostic(minimumCode, evidenceKind, {
          requirement: requirement.requirement,
          field: minimum.field,
          expected: minimum.expected,
          actual: candidateVendorDecisionActual(record[minimum.field]),
        }),
      );
    }
  }
}

function rejectedCandidateVendorDecisionEvidence(
  technicalResult: "pass" | "fail",
): CandidateVendorDecision {
  const diagnostics: CandidateVendorDecisionDiagnostic[] = [
    candidateVendorDecisionDiagnostic("evidence_bundle_invalid", "evidence", {
      expected: "plain trap-free evidence bundle",
    }),
  ];
  if (technicalResult === "fail") {
    diagnostics.push(candidateVendorTechnicalFailureDiagnostic());
  }
  return candidateVendorDecision(technicalResult, false, diagnostics);
}

function candidateVendorDecision(
  technicalResult: "pass" | "fail",
  quoteApproved: boolean,
  diagnostics: CandidateVendorDecisionDiagnostic[],
): CandidateVendorDecision {
  diagnostics.sort(compareCandidateVendorDecisionDiagnostics);
  const rightsAndOperationsPassed = diagnostics.every(
    ({ evidence_kind: evidenceKind }) =>
      evidenceKind === "quote" || evidenceKind === "technical",
  );
  return {
    decision: diagnostics.length === 0 ? "go" : "no_go",
    technical_result: technicalResult,
    rights_and_operations_result: rightsAndOperationsPassed ? "pass" : "fail",
    quote_approved: quoteApproved,
    diagnostics,
  };
}

function candidateVendorTechnicalFailureDiagnostic(): CandidateVendorDecisionDiagnostic {
  return candidateVendorDecisionDiagnostic(
    "technical_evaluation_failed",
    "technical",
    {
      field: "technical_result",
      expected: "pass",
      actual: "fail",
    },
  );
}

function candidateVendorDecisionDiagnostic(
  code: CandidateVendorDecisionDiagnosticCode,
  evidenceKind: CandidateVendorDecisionEvidenceKind,
  values: Partial<
    Omit<CandidateVendorDecisionDiagnostic, "code" | "evidence_kind">
  > = {},
): CandidateVendorDecisionDiagnostic {
  return {
    code,
    evidence_kind: evidenceKind,
    requirement: values.requirement ?? null,
    field: values.field ?? null,
    expected: values.expected ?? null,
    actual: values.actual ?? null,
  };
}

function candidateVendorDecisionActual(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value === "" ? '""' : value;
  }
  return JSON.stringify(value) ?? String(value);
}

function compareCandidateVendorDecisionDiagnostics(
  left: CandidateVendorDecisionDiagnostic,
  right: CandidateVendorDecisionDiagnostic,
): number {
  const serializedLeft = JSON.stringify(left);
  const serializedRight = JSON.stringify(right);
  return serializedLeft < serializedRight
    ? -1
    : serializedLeft > serializedRight
      ? 1
      : 0;
}

function canStructuredCloneCandidateInput(value: unknown): boolean {
  try {
    if (!hasOnlyTrapFreeCandidateData(value, new WeakSet<object>())) {
      return false;
    }
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

function hasOnlyTrapFreeCandidateData(
  value: unknown,
  visited: WeakSet<object>,
): boolean {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return true;
  }
  if (nodeTypes.isProxy(value) || typeof value === "function") {
    return false;
  }

  const candidate = value as object;
  if (visited.has(candidate)) {
    return true;
  }
  const prototype = Reflect.getPrototypeOf(candidate);
  if (
    Array.isArray(candidate)
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  ) {
    return false;
  }

  visited.add(candidate);
  for (const key of Reflect.ownKeys(candidate)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(candidate, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !hasOnlyTrapFreeCandidateData(descriptor.value, visited)
    ) {
      return false;
    }
  }
  return true;
}

function preflightCandidateVendorInput(
  vendorValue: unknown,
): CandidateVendorDiagnostic[] | null {
  if (nodeTypes.isProxy(vendorValue)) {
    return [candidateVendorDiagnostic("invalid_vendor_record", true)];
  }

  const vendorRecords = readExactDenseArray(vendorValue);
  if (vendorRecords === null) {
    return canStructuredCloneCandidateInput(vendorValue)
      ? null
      : [candidateVendorDiagnostic("invalid_vendor_record", true)];
  }
  for (const vendorRecord of vendorRecords) {
    if (!canStructuredCloneCandidateInput(vendorRecord)) {
      const vendorRecordId = nodeTypes.isProxy(vendorRecord)
        ? null
        : candidateVendorRecordId(vendorRecord);
      return [
        candidateVendorDiagnostic("invalid_vendor_record", true, {
          vendor_record_id: vendorRecordId,
        }),
        candidateVendorDiagnostic("vendor_provenance_missing", true, {
          vendor_record_id: vendorRecordId,
        }),
      ];
    }
  }
  return null;
}

function rejectedCandidateVendorInputReport(
  diagnostics: CandidateVendorDiagnostic[],
): CandidateVendorEvaluationReport {
  diagnostics.sort(compareCandidateVendorDiagnostics);
  return {
    technical_result: "fail",
    truth_record_count: 0,
    vendor_record_count: 0,
    matched_record_count: 0,
    overall_recall: {
      matched: 0,
      total: 0,
      required: 0,
      passed: false,
    },
    positive_recall: {
      matched: 0,
      total: 0,
      required: 0,
      passed: false,
    },
    strata: strata.map((sampleStratum) => ({
      sample_stratum: sampleStratum,
      matched: 0,
      total: 0,
      required: sampleStratum === "ordinary" ? null : 0,
      passed: false,
    })),
    provenance: {
      truth_records_complete: 0,
      vendor_records_complete: 0,
      truth_complete: false,
      vendor_complete: false,
    },
    diagnostics,
  };
}

function compareCandidateVendorDiagnostics(
  left: CandidateVendorDiagnostic,
  right: CandidateVendorDiagnostic,
): number {
  const serializedLeft = JSON.stringify(left);
  const serializedRight = JSON.stringify(right);
  return serializedLeft < serializedRight
    ? -1
    : serializedLeft > serializedRight
      ? 1
      : 0;
}

function candidateVendorDiagnostic(
  code: CandidateVendorDiagnosticCode,
  fatal: boolean,
  values: Partial<Omit<CandidateVendorDiagnostic, "code" | "fatal">> = {},
): CandidateVendorDiagnostic {
  return {
    code,
    fatal,
    truth_record_key: values.truth_record_key ?? null,
    vendor_record_id: values.vendor_record_id ?? null,
    field: values.field ?? null,
    expected: values.expected ?? null,
    actual: values.actual ?? null,
  };
}

function candidateRecordKey(value: unknown): string | null {
  const record = readExactDataRecord(value, participationKeys);
  return record !== null && typeof record.record_key === "string"
    ? record.record_key
    : null;
}

function candidateVendorRecordId(value: unknown): string | null {
  const record = readExactDataRecord(value, vendorRecordKeys);
  return record !== null && typeof record.vendor_record_id === "string"
    ? record.vendor_record_id
    : null;
}

function hasCompleteTruthProvenance(value: unknown): boolean {
  const record = readExactDataRecord(value, participationKeys);
  if (record === null) {
    return false;
  }
  const sourceValues = readExactDenseArray(record.sources);
  return (
    sourceValues !== null &&
    sourceValues.length > 0 &&
    readCandidateSources(sourceValues) !== null
  );
}

function hasCompleteVendorProvenance(value: unknown): boolean {
  const record = readExactDataRecord(value, vendorRecordKeys);
  if (record === null) {
    return false;
  }
  const sourceValues = readExactDenseArray(record.sources);
  return (
    sourceValues !== null &&
    sourceValues.length > 0 &&
    readCandidateVendorSources(sourceValues) !== null
  );
}

function readCandidateVendorRecord(
  value: unknown,
): CandidateVendorRecord | null {
  const record = readExactDataRecord(value, vendorRecordKeys);
  if (record === null) {
    return null;
  }
  const officialIds = readExactDenseArray(record.official_ids);
  const partyLines = readExactDenseArray(record.party_lines);
  const sourceValues = readExactDenseArray(record.sources);
  if (
    !isNonblank(record.vendor_record_id) ||
    !isNonblank(record.contest_key) ||
    !isNonblank(record.candidate_name) ||
    !isNonblank(record.jurisdiction) ||
    !isCalendarDate(record.election_date) ||
    !isNonblank(record.office) ||
    !isNonblank(record.district) ||
    !isOneOf(record.level, levels) ||
    !isOneOf(record.stage, stages) ||
    !isOneOf(record.lifecycle_status, lifecycleStatuses) ||
    !isOneOf(record.ballot_appearance, ballotAppearances) ||
    officialIds === null ||
    !areOfficialCandidateIds(officialIds) ||
    partyLines === null ||
    !areUniqueNonblankStrings(partyLines) ||
    sourceValues === null ||
    sourceValues.length === 0
  ) {
    return null;
  }
  const sources = readCandidateVendorSources(sourceValues);
  if (sources === null) {
    return null;
  }
  return {
    vendor_record_id: record.vendor_record_id,
    contest_key: record.contest_key,
    candidate_name: record.candidate_name,
    official_ids: officialIds,
    jurisdiction: record.jurisdiction,
    election_date: record.election_date,
    office: record.office,
    district: record.district,
    level: record.level,
    stage: record.stage,
    lifecycle_status: record.lifecycle_status,
    ballot_appearance: record.ballot_appearance,
    party_lines: partyLines,
    sources,
  };
}

function readCandidateVendorSources(
  values: readonly unknown[],
): readonly CandidateVendorSource[] | null {
  const sources: CandidateVendorSource[] = [];
  for (const value of values) {
    const source = readExactDataRecord(value, vendorSourceKeys);
    if (
      source === null ||
      !isHttpsUrl(source.url) ||
      !isRfc3339(source.retrieved_at) ||
      !isNonblank(source.locator)
    ) {
      return null;
    }
    sources.push({
      url: source.url,
      retrieved_at: source.retrieved_at,
      locator: source.locator,
    });
  }
  return sources;
}

type CandidateContestIdentity = Pick<
  CandidateParticipation,
  "jurisdiction" | "election_date" | "stage" | "office" | "district"
>;

function candidateContestIdentity(value: CandidateContestIdentity): string {
  return JSON.stringify([
    value.jurisdiction,
    value.election_date,
    value.stage,
    value.office,
    value.district,
  ]);
}

function officialCandidateIdKey(value: OfficialCandidateId): string {
  return JSON.stringify([value.issuer, value.namespace, value.value]);
}

function candidateIdentityOverlaps(
  truth: CandidateParticipation,
  vendor: CandidateVendorRecord,
): boolean {
  const vendorName = normalizeCandidateName(vendor.candidate_name);
  const truthNames = new Set([
    normalizeCandidateName(truth.candidate_name),
    ...truth.reviewed_aliases.map((alias) =>
      normalizeCandidateName(alias.name),
    ),
  ]);
  if (truthNames.has(vendorName)) {
    return true;
  }
  const truthIds = new Set(truth.official_ids.map(officialCandidateIdKey));
  return vendor.official_ids.some((value) =>
    truthIds.has(officialCandidateIdKey(value)),
  );
}

function addCandidateVendorConflicts(
  diagnostics: CandidateVendorDiagnostic[],
  truth: CandidateParticipation,
  vendor: CandidateVendorRecord,
): void {
  const acceptedNames = new Set([
    normalizeCandidateName(truth.candidate_name),
    ...truth.reviewed_aliases.map((alias) =>
      normalizeCandidateName(alias.name),
    ),
  ]);
  if (!acceptedNames.has(normalizeCandidateName(vendor.candidate_name))) {
    addCandidateVendorFieldConflict(
      diagnostics,
      truth,
      vendor,
      "candidate_name",
      truth.candidate_name,
      vendor.candidate_name,
    );
  }

  for (const field of [
    "contest_key",
    "jurisdiction",
    "election_date",
    "office",
    "district",
    "level",
    "stage",
    "lifecycle_status",
    "ballot_appearance",
  ] as const) {
    if (truth[field] !== vendor[field]) {
      addCandidateVendorFieldConflict(
        diagnostics,
        truth,
        vendor,
        field,
        truth[field],
        vendor[field],
      );
    }
  }

  const expectedPartyLines = [...truth.party_lines].sort();
  const actualPartyLines = [...vendor.party_lines].sort();
  if (JSON.stringify(expectedPartyLines) !== JSON.stringify(actualPartyLines)) {
    addCandidateVendorFieldConflict(
      diagnostics,
      truth,
      vendor,
      "party_lines",
      JSON.stringify(expectedPartyLines),
      JSON.stringify(actualPartyLines),
    );
  }

  const truthIds = new Set(truth.official_ids.map(officialCandidateIdKey));
  if (
    vendor.official_ids.some(
      (officialId) => !truthIds.has(officialCandidateIdKey(officialId)),
    )
  ) {
    addCandidateVendorFieldConflict(
      diagnostics,
      truth,
      vendor,
      "official_ids",
      JSON.stringify(truth.official_ids.map(officialCandidateIdKey).sort()),
      JSON.stringify(vendor.official_ids.map(officialCandidateIdKey).sort()),
    );
  }
}

function addCandidateVendorFieldConflict(
  diagnostics: CandidateVendorDiagnostic[],
  truth: CandidateParticipation,
  vendor: CandidateVendorRecord,
  field: string,
  expected: string,
  actual: string,
): void {
  diagnostics.push(
    candidateVendorDiagnostic("field_conflict", true, {
      truth_record_key: truth.record_key,
      vendor_record_id: vendor.vendor_record_id,
      field,
      expected,
      actual,
    }),
  );
}

function candidateVendorRecall(
  matched: number,
  total: number,
  fraction: number,
): CandidateVendorRecall {
  const required = Math.ceil(total * fraction);
  return { matched, total, required, passed: matched >= required };
}

function isPositiveCandidateTruth(truth: CandidateParticipation): boolean {
  return (
    truth.ballot_appearance === "printed" ||
    (truth.lifecycle_status === "qualified" &&
      truth.ballot_appearance === "write_in")
  );
}

function validateCandidateComparisonSetValue(value: unknown): boolean {
  const comparisonSet = readExactDataRecord(value, comparisonSetKeys);
  if (comparisonSet === null || !isRfc3339(comparisonSet.as_of)) {
    return false;
  }
  const recordValues = readExactDenseArray(comparisonSet.records);
  const authorityValues = readExactDenseArray(comparisonSet.authorities);
  const assignmentValues = readExactDenseArray(
    comparisonSet.authority_assignments,
  );
  const manifestValues = readExactDenseArray(
    comparisonSet.ordinary_control_manifest,
  );
  if (
    recordValues === null ||
    recordValues.length !== 100 ||
    authorityValues === null ||
    assignmentValues === null ||
    assignmentValues.length !== 100 ||
    manifestValues === null
  ) {
    return false;
  }

  const records = readComparisonRecords(recordValues, comparisonSet.as_of);
  const authorities = readCandidateAuthorities(authorityValues);
  const assignments = readAuthorityAssignments(assignmentValues);
  const manifest = readOrdinaryControlManifest(manifestValues);
  return (
    records !== null &&
    authorities !== null &&
    assignments !== null &&
    manifest !== null &&
    hasExactComparisonCounts(records) &&
    hasConsistentCandidateIdentities(records) &&
    hasValidAuthorityCoverage(records, authorities, assignments) &&
    hasValidOrdinaryControls(records, manifest)
  );
}

function readComparisonRecords(
  values: readonly unknown[],
  asOf: string,
): readonly CandidateParticipation[] | null {
  const records: CandidateParticipation[] = [];
  const recordKeys = new Set<string>();
  for (const value of values) {
    if (!validateCandidateParticipationValue(value)) {
      return null;
    }
    const row = readExactDataRecord(value, participationKeys);
    if (row === null) {
      return null;
    }
    const record = row as unknown as CandidateParticipation;
    if (recordKeys.has(record.record_key)) {
      return null;
    }
    recordKeys.add(record.record_key);

    const sourceValues = readExactDenseArray(record.sources);
    const sources =
      sourceValues === null ? null : readCandidateSources(sourceValues);
    if (sources === null) {
      return null;
    }
    for (const source of sources) {
      if (
        compareRfc3339Instants(source.retrieved_at, asOf) > 0 ||
        isFecHostname(new URL(source.url).hostname)
      ) {
        return null;
      }
    }
    records.push(record);
  }
  return records;
}

function readCandidateAuthorities(
  values: readonly unknown[],
): readonly CandidateAuthority[] | null {
  const authorities: CandidateAuthority[] = [];
  for (const value of values) {
    const authority = readExactDataRecord(value, authorityKeys);
    if (
      authority === null ||
      !isNonblank(authority.authority_id) ||
      !isNonblank(authority.authority_name) ||
      !isOneOf(authority.authority_level, levels) ||
      !isUsStateCode(authority.state_code)
    ) {
      return null;
    }
    authorities.push(authority as unknown as CandidateAuthority);
  }
  return authorities;
}

function readAuthorityAssignments(
  values: readonly unknown[],
): readonly CandidateAuthorityAssignment[] | null {
  const assignments: CandidateAuthorityAssignment[] = [];
  for (const value of values) {
    const assignment = readExactDataRecord(value, authorityAssignmentKeys);
    if (
      assignment === null ||
      !isNonblank(assignment.record_key) ||
      !isNonblank(assignment.authority_id) ||
      !isNonblank(assignment.source_url) ||
      !isNonblank(assignment.locator)
    ) {
      return null;
    }
    assignments.push(assignment as unknown as CandidateAuthorityAssignment);
  }
  return assignments;
}

function readOrdinaryControlManifest(
  values: readonly unknown[],
): readonly OrdinaryControlManifestCell[] | null {
  const cells: OrdinaryControlManifestCell[] = [];
  const eligibleKeys = new Set<string>();
  for (const value of values) {
    const cell = readExactDataRecord(value, manifestCellKeys);
    if (
      cell === null ||
      !isOneOf(cell.level, levels) ||
      !isOneOf(cell.stage, stages)
    ) {
      return null;
    }
    const keys = readExactDenseArray(cell.eligible_record_keys);
    if (keys === null) {
      return null;
    }
    for (const key of keys) {
      if (!isNonblank(key) || eligibleKeys.has(key)) {
        return null;
      }
      eligibleKeys.add(key);
    }
    cells.push(cell as unknown as OrdinaryControlManifestCell);
  }
  return cells;
}

function hasExactComparisonCounts(
  records: readonly CandidateParticipation[],
): boolean {
  const counts = new Map<string, number>();
  let withdrawnPrinted = 0;
  let withdrawnNotOnBallot = 0;
  for (const record of records) {
    const key = comparisonCountKey(
      record.level,
      record.stage,
      record.sample_stratum,
    );
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (record.sample_stratum === "withdrawn") {
      if (record.ballot_appearance === "printed") {
        withdrawnPrinted += 1;
      } else if (record.ballot_appearance === "not_on_ballot") {
        withdrawnNotOnBallot += 1;
      }
    }
  }
  if (withdrawnPrinted !== 5 || withdrawnNotOnBallot !== 5) {
    return false;
  }
  for (const quota of comparisonCellQuotas) {
    for (const stratum of strata) {
      if (
        (counts.get(comparisonCountKey(quota.level, quota.stage, stratum)) ??
          0) !== quota[stratum]
      ) {
        return false;
      }
    }
  }
  return true;
}

function hasConsistentCandidateIdentities(
  records: readonly CandidateParticipation[],
): boolean {
  const contestTupleByKey = new Map<string, string>();
  const contestKeyByTuple = new Map<string, string>();
  const nameOwner = new Map<string, string>();
  const officialIdOwner = new Map<string, string>();

  for (const record of records) {
    const tuple = JSON.stringify([
      record.jurisdiction,
      record.election_date,
      record.office,
      record.district,
      record.level,
      record.stage,
    ]);
    const priorTuple = contestTupleByKey.get(record.contest_key);
    const priorKey = contestKeyByTuple.get(tuple);
    if (
      (priorTuple !== undefined && priorTuple !== tuple) ||
      (priorKey !== undefined && priorKey !== record.contest_key)
    ) {
      return false;
    }
    contestTupleByKey.set(record.contest_key, tuple);
    contestKeyByTuple.set(tuple, record.contest_key);

    const normalizedNames = [normalizeCandidateName(record.candidate_name)];
    const aliasValues = readExactDenseArray(record.reviewed_aliases);
    if (aliasValues === null) {
      return false;
    }
    for (const value of aliasValues) {
      const alias = readExactDataRecord(value, aliasKeys);
      if (alias === null || typeof alias.name !== "string") {
        return false;
      }
      normalizedNames.push(normalizeCandidateName(alias.name));
    }
    for (const normalizedName of normalizedNames) {
      const scopedName = JSON.stringify([record.contest_key, normalizedName]);
      const owner = nameOwner.get(scopedName);
      if (owner !== undefined && owner !== record.record_key) {
        return false;
      }
      nameOwner.set(scopedName, record.record_key);
    }

    const officialIdValues = readExactDenseArray(record.official_ids);
    if (officialIdValues === null) {
      return false;
    }
    for (const value of officialIdValues) {
      const officialId = readExactDataRecord(value, officialIdKeys);
      if (officialId === null) {
        return false;
      }
      const scopedId = JSON.stringify([
        record.contest_key,
        officialId.issuer,
        officialId.namespace,
        officialId.value,
      ]);
      const owner = officialIdOwner.get(scopedId);
      if (owner !== undefined && owner !== record.record_key) {
        return false;
      }
      officialIdOwner.set(scopedId, record.record_key);
    }
  }
  return true;
}

function hasValidAuthorityCoverage(
  records: readonly CandidateParticipation[],
  authorities: readonly CandidateAuthority[],
  assignments: readonly CandidateAuthorityAssignment[],
): boolean {
  const recordsByKey = new Map(
    records.map((record) => [record.record_key, record] as const),
  );
  const authoritiesById = new Map<string, CandidateAuthority>();
  const authorityIdentities = new Set<string>();
  for (const authority of authorities) {
    const identity = JSON.stringify([
      normalizeCandidateName(authority.authority_name),
      authority.authority_level,
      authority.state_code,
    ]);
    if (
      authoritiesById.has(authority.authority_id) ||
      authorityIdentities.has(identity)
    ) {
      return false;
    }
    authoritiesById.set(authority.authority_id, authority);
    authorityIdentities.add(identity);
  }

  const assignedRecords = new Set<string>();
  const assignmentCountByAuthority = new Map<string, number>();
  for (const assignment of assignments) {
    const record = recordsByKey.get(assignment.record_key);
    if (
      record === undefined ||
      assignedRecords.has(assignment.record_key) ||
      !authoritiesById.has(assignment.authority_id)
    ) {
      return false;
    }
    const sourceValues = readExactDenseArray(record.sources);
    const sources =
      sourceValues === null ? null : readCandidateSources(sourceValues);
    if (sources === null) {
      return false;
    }
    let matchingSources = 0;
    for (const source of sources) {
      if (
        source.url === assignment.source_url &&
        source.locator === assignment.locator
      ) {
        matchingSources += 1;
      }
    }
    if (matchingSources !== 1) {
      return false;
    }
    assignedRecords.add(assignment.record_key);
    assignmentCountByAuthority.set(
      assignment.authority_id,
      (assignmentCountByAuthority.get(assignment.authority_id) ?? 0) + 1,
    );
  }
  if (assignedRecords.size !== records.length) {
    return false;
  }

  const stateCodes = new Set<UsStateCode>();
  const regions = new Set<string>();
  let localAuthorityCount = 0;
  for (const authority of authorities) {
    const assignmentCount =
      assignmentCountByAuthority.get(authority.authority_id) ?? 0;
    if (assignmentCount === 0 || assignmentCount > 10) {
      return false;
    }
    stateCodes.add(authority.state_code);
    regions.add(censusRegionForState(authority.state_code));
    if (authority.authority_level === "local") {
      localAuthorityCount += 1;
    }
  }
  return (
    stateCodes.size >= 10 &&
    regions.size === censusRegions.length &&
    localAuthorityCount >= 10
  );
}

function hasValidOrdinaryControls(
  records: readonly CandidateParticipation[],
  manifest: readonly OrdinaryControlManifestCell[],
): boolean {
  if (manifest.length !== comparisonCellQuotas.length) {
    return false;
  }
  const manifestByCell = new Map<string, OrdinaryControlManifestCell>();
  const eligibleCellByKey = new Map<string, string>();
  for (const cell of manifest) {
    const key = comparisonCellKey(cell.level, cell.stage);
    if (manifestByCell.has(key)) {
      return false;
    }
    manifestByCell.set(key, cell);
    for (const eligibleKey of cell.eligible_record_keys) {
      eligibleCellByKey.set(eligibleKey, key);
    }
  }

  for (const record of records) {
    if (record.sample_stratum === "ordinary") {
      if (
        eligibleCellByKey.get(record.record_key) !==
        comparisonCellKey(record.level, record.stage)
      ) {
        return false;
      }
    } else if (eligibleCellByKey.has(record.record_key)) {
      return false;
    }
  }

  for (const quota of comparisonCellQuotas) {
    const key = comparisonCellKey(quota.level, quota.stage);
    const cell = manifestByCell.get(key);
    if (
      cell === undefined ||
      cell.eligible_record_keys.length < quota.ordinary + 1
    ) {
      return false;
    }
    const selected = new Set<string>();
    for (const record of records) {
      if (
        record.level === quota.level &&
        record.stage === quota.stage &&
        record.sample_stratum === "ordinary"
      ) {
        selected.add(record.record_key);
      }
    }
    const expected = rankOrdinaryControlKeys(
      cell.eligible_record_keys,
      quota.level,
      quota.stage,
    ).slice(0, quota.ordinary);
    if (
      selected.size !== expected.length ||
      expected.some((recordKey) => !selected.has(recordKey))
    ) {
      return false;
    }
  }
  return manifestByCell.size === comparisonCellQuotas.length;
}

function rankOrdinaryControlKeys(
  recordKeys: readonly string[],
  level: CandidateLevel,
  stage: ElectionStage,
): string[] {
  return recordKeys
    .map((recordKey) => ({
      recordKey,
      digest: createHash("sha256")
        .update(
          JSON.stringify(["g1-ordinary-control-v1", level, stage, recordKey]),
          "utf8",
        )
        .digest("hex"),
    }))
    .sort((left, right) => {
      if (left.digest !== right.digest) {
        return left.digest < right.digest ? -1 : 1;
      }
      if (left.recordKey === right.recordKey) {
        return 0;
      }
      return left.recordKey < right.recordKey ? -1 : 1;
    })
    .map(({ recordKey }) => recordKey);
}

function comparisonCellKey(
  level: CandidateLevel,
  stage: ElectionStage,
): string {
  return JSON.stringify([level, stage]);
}

function comparisonCountKey(
  level: CandidateLevel,
  stage: ElectionStage,
  stratum: SampleStratum,
): string {
  return JSON.stringify([level, stage, stratum]);
}

function isUsStateCode(value: unknown): value is UsStateCode {
  if (typeof value !== "string") {
    return false;
  }
  for (const region of censusRegions) {
    for (const stateCode of region.states) {
      if (stateCode === value) {
        return true;
      }
    }
  }
  return false;
}

function censusRegionForState(stateCode: UsStateCode): string {
  for (const region of censusRegions) {
    for (const candidate of region.states) {
      if (candidate === stateCode) {
        return region.name;
      }
    }
  }
  throw new Error("validated state has no Census region");
}

function isFecHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.+$/, "");
  return normalized === "fec.gov" || normalized.endsWith(".fec.gov");
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
  const snapshot = readDataRecord(value);
  if (
    snapshot === null ||
    Object.keys(snapshot).length !== keys.length ||
    Object.keys(snapshot).some((key) => !keys.includes(key))
  ) {
    return null;
  }
  return snapshot;
}

function readDataRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    return null;
  }
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of ownKeys as string[]) {
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

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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
    !hasValidRawHttpsComponents(value) ||
    /%(?![0-9A-Fa-f]{2})/.test(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function hasValidRawHttpsComponents(value: string): boolean {
  const match = /^https:\/\/([^/?#\\]+)(.*)$/i.exec(value);
  if (match === null || !hasValidRfc3986Authority(match[1]!)) {
    return false;
  }

  const remainder = match[2]!;
  const fragmentIndex = remainder.indexOf("#");
  if (
    fragmentIndex !== -1 &&
    remainder.indexOf("#", fragmentIndex + 1) !== -1
  ) {
    return false;
  }
  const beforeFragment =
    fragmentIndex === -1 ? remainder : remainder.slice(0, fragmentIndex);
  const fragment =
    fragmentIndex === -1 ? "" : remainder.slice(fragmentIndex + 1);
  const queryIndex = beforeFragment.indexOf("?");
  const path =
    queryIndex === -1 ? beforeFragment : beforeFragment.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : beforeFragment.slice(queryIndex + 1);

  return (
    hasOnlyRfc3986AsciiCharacters(path, rfc3986PathPunctuation) &&
    hasOnlyRfc3986AsciiCharacters(query, rfc3986QueryOrFragmentPunctuation) &&
    hasOnlyRfc3986AsciiCharacters(fragment, rfc3986QueryOrFragmentPunctuation)
  );
}

function hasValidRfc3986Authority(value: string): boolean {
  if (value.includes("@")) {
    return false;
  }
  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");
    const port = value.slice(closingBracket + 1);
    if (
      closingBracket <= 1 ||
      value.indexOf("[", 1) !== -1 ||
      value.indexOf("]", closingBracket + 1) !== -1 ||
      (port !== "" && !/^:\d*$/.test(port))
    ) {
      return false;
    }
    return hasOnlyRfc3986AsciiCharacters(
      value.slice(1, closingBracket),
      rfc3986IpLiteralPunctuation,
    );
  }
  if (value.includes("[") || value.includes("]")) {
    return false;
  }

  const portDelimiter = value.indexOf(":");
  if (
    portDelimiter !== -1 &&
    (value.indexOf(":", portDelimiter + 1) !== -1 ||
      !/^\d*$/.test(value.slice(portDelimiter + 1)))
  ) {
    return false;
  }
  const host = portDelimiter === -1 ? value : value.slice(0, portDelimiter);
  return (
    host !== "" &&
    hasOnlyRfc3986AsciiCharacters(host, rfc3986RegNamePunctuation)
  );
}

function hasOnlyRfc3986AsciiCharacters(
  value: string,
  punctuation: string,
): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isAsciiAlphaNumeric =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);
    if (!isAsciiAlphaNumeric && !punctuation.includes(character)) {
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

function compareRfc3339Instants(left: string, right: string): number {
  const leftMilliseconds = Date.parse(left);
  const rightMilliseconds = Date.parse(right);
  if (leftMilliseconds !== rightMilliseconds) {
    return leftMilliseconds < rightMilliseconds ? -1 : 1;
  }

  const leftFraction = /\.(\d+)/.exec(left)?.[1] ?? "";
  const rightFraction = /\.(\d+)/.exec(right)?.[1] ?? "";
  const width = Math.max(leftFraction.length, rightFraction.length);
  const paddedLeft = leftFraction.padEnd(width, "0");
  const paddedRight = rightFraction.padEnd(width, "0");
  if (paddedLeft === paddedRight) {
    return 0;
  }
  return paddedLeft < paddedRight ? -1 : 1;
}
