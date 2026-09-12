import type {
  ClaimMapping, ContestField, ElectionEvidence, ElectionPackage, ElectionSourcePolicy,
  EvidenceKind, EvidenceValues, Subject,
} from "../../../src/lib/elections";

// Entirely synthetic. These people, sources, approvals, and assertions are test data.
export const VERIFIED_AT = "2026-09-12T12:00:00.000Z";
export const CURRENT_UNTIL = "2026-09-13T12:00:00.000Z";
export const NOW = new Date("2026-09-12T13:00:00.000Z");
export const STATE = "ocd-division/country:us/state:ca";
export const DISTRICT = STATE + "/cd:12";
export type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const contestFields: ContestField[] = ["name", "office", "district", "term", "seats", "form", "level", "jurisdiction_id", "division_ids", "partisanship"];

const metadataKinds = [
  ["election_metadata", "election"], ["stage_metadata", "stage"],
  ["contest_metadata", "contest"], ["candidacy_metadata", "candidacy"],
  ["ballot_line_metadata", "ballot_line"],
] as const;
const statuses = {
  intent: ["declared", "withdrawn"],
  filing: ["filed", "pending", "accepted"],
  ballot_qualification: ["pending", "certified", "removed", "disqualified"],
  ballot_appearance: ["listed_for_ballot", "printed", "write_in_eligible", "not_on_ballot"],
  outcome: ["advanced", "won", "lost"],
  ballot_continuation: [],
} as const;

export function mapping(kind: EvidenceKind, subject_kind: Subject["kind"], values: readonly string[] = []): ClaimMapping {
  return {
    id: kind + ":" + subject_kind, kind, subject_kind, values,
    allowed_fields: kind === "contest_metadata" ? contestFields : [],
    allows_supersession: true, supports_current_snapshot: true,
    date_rule: { time_zone: "America/Los_Angeles", start: "after_date", end: "start_of_day" },
  };
}

export function fixturePolicy(): Mutable<ElectionSourcePolicy> {
  const electionMappings: ClaimMapping[] = [
    ...metadataKinds.map(([kind, subject]) => mapping(kind, subject)),
    ...Object.entries(statuses).flatMap(([kind, values]) =>
      (["candidacy", "ballot_line"] as const).map((subject) => mapping(kind as EvidenceKind, subject, values))),
    ...(["stage", "contest", "candidacy", "ballot_line"] as const).map((subject) => mapping("retirement", subject)),
  ];
  const authority = {
    id: "fixture-election-authority",
    source_type: "official_election_authority" as const,
    election_issuer: "fixture-office", election_key: "fixture-2026",
    jurisdiction_id: STATE, stage_keys: ["general", "primary", "runoff"],
    contest_keys: ["house-12", "house-12-primary", "other-contest"],
    urls: ["https://elections.example.test/2026/candidates"],
    mappings: electionMappings, access_approval: "synthetic-access-only",
    retention_approval: "synthetic-retention-only", retention: "indefinite" as const,
    current_display_until: null, enabled: true,
  };
  return structuredClone({
    version: "fixture-policy-v1", dataset_kind: "synthetic",
    authorities: [
      authority,
      {
        ...authority, id: "fixture-finance-authority", source_type: "official_finance",
        urls: ["https://finance.example.test/2026/filings"],
        mappings: [mapping("finance", "candidacy", ["filed"]), mapping("finance", "ballot_line", ["filed"])],
      },
    ],
  }) as Mutable<ElectionSourcePolicy>;
}

export function evidence<K extends EvidenceKind>(
  kind: K,
  value: EvidenceValues[K],
  overrides: Partial<ElectionEvidence<K>> = {},
): Mutable<ElectionEvidence<K>> {
  const subject = overrides.subject ?? { kind: "candidacy", id: "candidate-avery" };
  return structuredClone({
    id: subject.id + ":" + kind,
    subject, kind, value,
    document_id: kind === "finance" ? "finance-document" : "election-document",
    mapping_id: kind + ":" + subject.kind,
    locator: "Synthetic row 1",
    original_term: typeof value === "string" ? value : "Synthetic official term",
    retrieved_at: "2026-09-12T11:00:00.000Z",
    verified_at: VERIFIED_AT,
    effective: { precision: "instant", start: "2026-09-01T00:00:00.000Z", end: null },
    current_until: CURRENT_UNTIL,
    ...(kind === "contest_metadata" ? { fields: contestFields, supporting_sources: [] } : {}),
    ...overrides,
  }) as Mutable<ElectionEvidence<K>>;
}

export function fixturePackage(): Mutable<ElectionPackage> {
  const identity = (id: string, official_key: string) => ({
    id, issuer: "fixture-office", official_key, revision: "original", revision_of: null,
  });
  return {
    schema_version: "f7-v1", dataset_kind: "synthetic", policy_version: "fixture-policy-v1",
    election: identity("election-2026", "fixture-2026"),
    stages: [{ ...identity("stage-general", "general"), election_id: "election-2026" }],
    contests: [{ ...identity("contest-house", "house-12"), stage_id: "stage-general" }],
    candidacies: [
      { ...identity("candidate-avery", "candidate-a"), contest_id: "contest-house" },
      { ...identity("candidate-blair", "candidate-b"), contest_id: "contest-house" },
    ],
    ballot_lines: [
      { ...identity("line-a-one", "nomination-one"), candidacy_id: "candidate-avery" },
      { ...identity("line-a-two", "nomination-two"), candidacy_id: "candidate-avery" },
    ],
    documents: [
      { id: "election-document", authority_id: "fixture-election-authority", url: "https://elections.example.test/2026/candidates", sha256: "a".repeat(64), label: "Synthetic election office list" },
      { id: "finance-document", authority_id: "fixture-finance-authority", url: "https://finance.example.test/2026/filings", sha256: "b".repeat(64), label: "Synthetic finance filing" },
    ],
    evidence: [
      evidence("election_metadata", {
        name: "Synthetic 2026 election", jurisdiction_id: STATE, kind: "regular",
        coverage: { state: "complete_in_admitted_contests", contest_ids: ["contest-house"], notes: ["Synthetic test coverage only."] },
      }, { subject: { kind: "election", id: "election-2026" } }),
      evidence("stage_metadata", {
        name: "Synthetic general election", kind: "general", date: "2026-11-03",
        time_zone: "America/Los_Angeles", successor_stage_ids: [],
      }, { subject: { kind: "stage", id: "stage-general" } }),
      evidence("contest_metadata", {
        name: "Synthetic House contest", office: "House", district: "12", term: "2027-2029",
        seats: 1, form: "candidate_single_seat", level: "federal", jurisdiction_id: STATE,
        division_ids: [DISTRICT], partisanship: "partisan",
      }, { subject: { kind: "contest", id: "contest-house" } }),
      evidence("candidacy_metadata", {
        name: "Avery Example", official_person_id: { issuer: "fixture-office", value: "person-a" },
      }),
      evidence("candidacy_metadata", {
        name: "Blair Sample", official_person_id: { issuer: "fixture-office", value: "person-b" },
      }, { subject: { kind: "candidacy", id: "candidate-blair" } }),
      evidence("ballot_line_metadata", { name: "Synthetic line One", party_label: "Example One" },
        { subject: { kind: "ballot_line", id: "line-a-one" } }),
      evidence("ballot_line_metadata", { name: "Synthetic line Two", party_label: "Example Two" },
        { subject: { kind: "ballot_line", id: "line-a-two" } }),
    ],
    supersessions: [],
  };
}

export type FixtureGraph = Mutable<{
  package: ElectionPackage; policy: ElectionSourcePolicy; contest_id: string;
}>;

export function fixtureGraph(): FixtureGraph {
  return { package: fixturePackage(), policy: fixturePolicy(), contest_id: "contest-house" };
}
