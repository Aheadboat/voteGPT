import type { GovernmentLevel } from "./government-navigation";
import type { SavedResidenceDivision } from "./saved-residence";

export type EntityKind = "election" | "stage" | "contest" | "candidacy" | "ballot_line";
export type EvidenceKind =
  | "election_metadata" | "stage_metadata" | "contest_metadata"
  | "candidacy_metadata" | "ballot_line_metadata"
  | "intent" | "filing" | "ballot_qualification" | "ballot_appearance"
  | "outcome" | "finance" | "ballot_continuation" | "retirement";
export type SourceType =
  | "official_election_authority" | "official_ballot_feed"
  | "official_finance" | "official_court_record"
  | "official_statute" | "division_identifier_registry";
export type Identity = Readonly<{
  id: string;
  issuer: string;
  official_key: string;
  revision: string;
  revision_of: string | null;
}>;
export type ElectionIdentity = Identity;
export type StageIdentity = Identity & Readonly<{ election_id: string }>;
export type ContestIdentity = Identity & Readonly<{ stage_id: string }>;
export type CandidacyIdentity = Identity & Readonly<{ contest_id: string }>;
export type BallotLineIdentity = Identity & Readonly<{ candidacy_id: string }>;
export type Subject = Readonly<{ kind: EntityKind; id: string }>;

export type ElectionMetadata = Readonly<{
  name: string;
  jurisdiction_id: string;
  kind: "regular" | "special";
  coverage: Readonly<{
    state: "complete_in_admitted_contests" | "partial";
    contest_ids: readonly string[];
    notes: readonly string[];
  }>;
}>;
export type StageMetadata = Readonly<{
  name: string;
  kind: "primary" | "general" | "runoff" | "other";
  date: string | null;
  time_zone: string | null;
  successor_stage_ids: readonly string[];
}>;
export type ContestMetadata = Readonly<{
  name: string;
  office: string;
  district: string;
  term: string;
  seats: number;
  form: "candidate_single_seat" | "candidate_multi_seat";
  level: GovernmentLevel;
  jurisdiction_id: string;
  division_ids: readonly string[];
  partisanship: "partisan" | "nonpartisan" | "unknown";
}>;
export type ContestField = keyof ContestMetadata;
export type CandidacyMetadata = Readonly<{
  name: string;
  official_person_id: Readonly<{ issuer: string; value: string }> | null;
}>;
export type BallotLineMetadata = Readonly<{ name: string; party_label: string | null }>;
export type Intent = "declared" | "withdrawn";
export type Filing = "filed" | "pending" | "accepted";
export type BallotQualification = "pending" | "certified" | "removed" | "disqualified";
export type BallotAppearance = "listed_for_ballot" | "printed" | "write_in_eligible" | "not_on_ballot";
export type Outcome = Readonly<{
  status: "advanced" | "won" | "lost";
  destination_contest_id: string | null;
}>;
export type BallotContinuation = Readonly<{
  withdrawal_evidence_id: string;
  appearance: "listed_for_ballot" | "printed";
}>;
export type Retirement = Readonly<{ replacement_id: string }>;
export type EvidenceValues = {
  election_metadata: ElectionMetadata;
  stage_metadata: StageMetadata;
  contest_metadata: ContestMetadata;
  candidacy_metadata: CandidacyMetadata;
  ballot_line_metadata: BallotLineMetadata;
  intent: Intent;
  filing: Filing;
  ballot_qualification: BallotQualification;
  ballot_appearance: BallotAppearance;
  outcome: Outcome;
  finance: "filed";
  ballot_continuation: BallotContinuation;
  retirement: Retirement;
};
export type EffectiveTime =
  | Readonly<{ precision: "instant"; start: string; end: string | null }>
  | Readonly<{ precision: "date"; start: string; end: string | null }>
  | Readonly<{ precision: "unknown"; reason: "not_published" }>;
export type CalendarReferenceKind = "iana_tzdb" | "time_zone_regulation";
export type CalendarReference = Readonly<{
  basis_id: string;
  kind: CalendarReferenceKind;
  locator: string;
  original_term: string;
  retrieved_at: string;
  verified_at: string;
  current_until: string;
}>;
export type SourceDocument = Readonly<{
  id: string;
  authority_id: string;
  url: string;
  sha256: string;
  label: string;
  calendar_basis_id?: string;
  calendar_reference?: CalendarReference;
}>;
export type EvidenceProvenance = Readonly<{
  document_id: string;
  mapping_id: string;
  locator: string;
  original_term: string;
  retrieved_at: string;
  verified_at: string;
  effective: EffectiveTime;
  current_until: string;
}>;
export type ContestSupportingSource = EvidenceProvenance & Readonly<{
  id: string;
  fields: readonly ContestField[];
}>;
export type ElectionEvidence<K extends EvidenceKind = EvidenceKind> = {
  [P in K]: EvidenceProvenance & Readonly<{
    id: string;
    subject: Subject;
    kind: P;
    value: EvidenceValues[P];
  }> & (P extends "contest_metadata" ? Readonly<{
    fields: readonly ContestField[];
    supporting_sources: readonly ContestSupportingSource[];
  }> : object);
}[K];
export type Supersession = Readonly<{
  replacement_id: string;
  predecessor_id: string;
  reason: string;
}>;
export type CalendarBasisPolicy = Readonly<{
  basis_id: string;
  jurisdiction_id: string;
  time_zone: string;
  references: readonly Readonly<{
    id: string;
    authority_id: string;
    url: string;
    kind: CalendarReferenceKind;
    access_approval: string;
    retention_approval: string;
    retention: "indefinite";
  }>[];
  enabled: boolean;
  current_display_until: string | null;
}>;
export type ClaimMapping = Readonly<{
  id: string;
  kind: EvidenceKind;
  subject_kind: EntityKind;
  values: readonly string[];
  allowed_fields: readonly ContestField[];
  allows_supersession: boolean;
  supports_current_snapshot: boolean;
  stage_calendar?: CalendarBasisPolicy;
  date_rule: Readonly<{
    time_zone: string;
    start: "start_of_day" | "after_date";
    end: "start_of_day" | "end_of_day";
  }> | null;
}>;
export type SourceAuthorityPolicy = Readonly<{
  id: string;
  source_type: SourceType;
  election_issuer: string;
  election_key: string;
  jurisdiction_id: string;
  stage_keys: readonly string[];
  contest_keys: readonly string[];
  urls: readonly string[];
  mappings: readonly ClaimMapping[];
  access_approval: string;
  retention_approval: string;
  retention: "indefinite";
  current_display_until: string | null;
  enabled: boolean;
}>;
// The production source module supplies this policy; incoming data cannot replace it.
export type ElectionSourcePolicy = Readonly<{
  version: string;
  dataset_kind: "official" | "synthetic";
  authorities: readonly SourceAuthorityPolicy[];
}>;
export type ElectionLedger = Readonly<{
  dataset_kind: "official" | "synthetic";
  election: ElectionIdentity;
  stages: readonly StageIdentity[];
  contests: readonly ContestIdentity[];
  candidacies: readonly CandidacyIdentity[];
  ballot_lines: readonly BallotLineIdentity[];
  documents: readonly SourceDocument[];
  evidence: readonly ElectionEvidence[];
  supersessions: readonly Supersession[];
}>;
export type ElectionPackage = ElectionLedger & Readonly<{
  schema_version: "f7-v1";
  policy_version: string;
}>;
export type ValidatedPackage = Readonly<{ status: "valid"; package: ElectionPackage }>;
export type PackageRejection = Readonly<{
  status: "rejected";
  reason: "invalid_package" | "invalid_policy" | "source_not_admitted"
    | "invalid_identity" | "invalid_evidence" | "invalid_supersession"
    | "invalid_time" | "limit_exceeded" | "dataset_not_admitted";
}>;
export type ApprovedElectionReceipt = Readonly<{
  id: string;
  package_sha256: string;
  policy_version: string;
  reviewer: string;
  approval_reference: string;
  verified_at: string;
  documents: readonly Readonly<{
    id: string; sha256: string; locators: readonly string[];
  }>[];
  contest_inventory: readonly Readonly<{
    contest_id: string; candidacy_ids: readonly string[]; ballot_line_ids: readonly string[];
  }>[];
}>;
// Repository reads inject trusted policy after checking protected receipts.
// Import bounds never cap retained history. F7 reads a complete contest snapshot;
// display pagination does not limit evidence used to decide current claims.
export type HistoryPageRequest = Readonly<{ offset: number; limit: number }>;
export type HistoryPage = HistoryPageRequest & Readonly<{
  total: number;
  next_offset: number | null;
  completeness: "complete";
}>;
export type ElectionGraph = Readonly<{
  ledger: ElectionLedger;
  policy: ElectionSourcePolicy;
  contest_id: string;
  completeness: Readonly<{
    current: "complete" | "incomplete";
    supersession: "complete" | "incomplete";
    history: "complete" | "incomplete";
  }>;
  history_page: HistoryPageRequest;
}>;
export type SourceReference = Readonly<{
  source_url: string;
  source_type: SourceType;
  authority_id: string;
  source_label: string;
  original_term: string;
  document_sha256: string;
  locator: string;
  retrieved_at: string;
  verified_at: string;
  effective: EffectiveTime;
  current_until: string;
  calendar_basis?: Readonly<{
    basis_id: string;
    mapping_id: string;
    jurisdiction_id: string;
    time_zone: string;
    references: readonly (CalendarReference & Readonly<{
      source_url: string;
      source_label: string;
      document_sha256: string;
      authority_id: string;
    }>)[];
  }>;
}>;
export type FieldSourceReference = SourceReference & Readonly<{ group_id: string }>;
export type EvidenceRef = SourceReference & Readonly<{
  id: string;
  // Contest facts use these exact field sources, never the primary envelope alone.
  field_sources?: Readonly<Record<ContestField, readonly FieldSourceReference[]>>;
}>;
export type SourcedAssertion<T> = Readonly<{ value: T; evidence: EvidenceRef }>;
export type EvidenceState<T> =
  | Readonly<{ state: "verified"; value: T; evidence: readonly EvidenceRef[]; verified_at: string }>
  | Readonly<{ state: "conflict"; assertions: readonly SourcedAssertion<T>[] }>
  | Readonly<{ state: "stale"; previous: readonly SourcedAssertion<T>[] }>
  | Readonly<{ state: "unknown"; last_checked_at: string | null }>;
export type EvidenceHistory = Readonly<{
  kind: EvidenceKind;
  subject: Subject;
  value: EvidenceValues[EvidenceKind];
  evidence: EvidenceRef;
  applicability: "current" | "scheduled" | "historical" | "unknown";
  superseded: boolean;
}>;
export type CandidateTracks = Readonly<{
  intent: EvidenceState<Intent>;
  filing: EvidenceState<Filing>;
  ballot_qualification: EvidenceState<BallotQualification>;
  ballot_appearance: EvidenceState<BallotAppearance>;
  outcome: EvidenceState<Outcome>;
  finance: EvidenceState<"filed">;
  continued_ballot_label: EvidenceState<"withdrawn_still_on_ballot"> | null;
}>;
export type BallotLineView = Readonly<{
  id: string;
  metadata: EvidenceState<BallotLineMetadata>;
  tracks: CandidateTracks;
  history: readonly EvidenceHistory[];
}>;
export type CandidacyView = Readonly<{
  id: string;
  metadata: EvidenceState<CandidacyMetadata>;
  tracks: CandidateTracks;
  ballot_lines: readonly BallotLineView[];
  retired_ballot_lines: readonly BallotLineView[];
  history: readonly EvidenceHistory[];
}>;
export type ContestView = Readonly<{
  status: "available";
  contest_id: string;
  verification: "current" | "historical";
  election: EvidenceState<ElectionMetadata>;
  stage: EvidenceState<StageMetadata>;
  contest: EvidenceState<ContestMetadata>;
  candidates: readonly CandidacyView[];
  retired_candidates: readonly CandidacyView[];
  history: readonly EvidenceHistory[];
  history_page: HistoryPage;
  upcoming: boolean | null;
}>;
export type UnverifiedContest = Readonly<{
  status: "unverified";
  reason: "invalid_graph" | "incomplete_graph" | "unverified_metadata" | "retired_identity" | "missing_contest";
  contest_id?: string;
  history?: readonly EvidenceHistory[];
  history_page?: HistoryPage;
  metadata_conflicts?: readonly EvidenceHistory[];
}>;
export type ElectionReadScope = Readonly<{
  level: GovernmentLevel;
  jurisdiction_id: string;
  division_ids: readonly string[];
}>;
export type ElectionScopeResult =
  | Readonly<{ status: "available"; scope: ElectionReadScope; coverage: "exact" | "partial" }>
  | Readonly<{ status: "missing" | "invalid" | "unsupported" }>;
export type ImportResult =
  | Readonly<{ status: "imported" | "unchanged"; package_sha256: string }>
  | Readonly<{ status: "rejected"; reason: string }>
  | Readonly<{ status: "unavailable" }>;
export type ElectionRepository = Readonly<{
  importReviewedPackage: (input: unknown, receiptId: string) => Promise<ImportResult>;
  readContest: (id: string, historyPage?: HistoryPageRequest) => Promise<ElectionGraph | null>;
  readUpcoming: (scope: ElectionReadScope, now: Date) => Promise<readonly ElectionGraph[]>;
}>;
export type ElectionRepositoryOptions = Readonly<{
  policy: ElectionSourcePolicy;
  approvedReceipts: readonly ApprovedElectionReceipt[];
  now: () => Date;
}>;
export type ContestResult = ContestView | UnverifiedContest | Readonly<{ status: "missing" | "unavailable" }>;
export type ElectionIndexResult =
  | Readonly<{ status: "available"; contests: readonly ContestView[]; unverified_count: number }>
  | Readonly<{ status: "unavailable" | "unsupported" }>;
export type ElectionService = Readonly<{
  getContest: (id: string, historyPage?: HistoryPageRequest) => Promise<ContestResult>;
  getUpcoming: (scope: ElectionReadScope) => Promise<ElectionIndexResult>;
}>;

export function validateElectionPackage(
  input: unknown,
  policy: ElectionSourcePolicy,
  now: Date,
): ValidatedPackage | PackageRejection {
  try {
    inspectRecords(input, policy, now, "import");
    return { status: "valid", package: structuredClone(input as ElectionPackage) };
  } catch (error) {
    return { status: "rejected", reason: error instanceof InvalidPackage ? error.reason : "invalid_package" };
  }
}

// T2/T3 hash these UTF-8 bytes and write this exact reviewed artifact (including LF).
// This fixes representation only; callers still validate data, policy, and protected receipts.
export function serializeElectionPackage(input: ElectionPackage): string {
  requireRule(plainData(input), "invalid_package");
  return canonical(input, undefined, false) + "\n";
}

export function projectContest(graph: ElectionGraph, now: Date): ContestView | UnverifiedContest {
  try {
    if (!plainData(graph, false) || !exact(graph, ["ledger", "policy", "contest_id", "completeness", "history_page"]) ||
      !identifier(graph.contest_id) || !exact(graph.completeness, ["current", "supersession", "history"]) ||
      !Object.values(graph.completeness).every((value) => value === "complete" || value === "incomplete") ||
      !exact(graph.history_page, ["offset", "limit"]) || !Number.isSafeInteger(graph.history_page.offset) ||
      graph.history_page.offset < 0 || !Number.isSafeInteger(graph.history_page.limit) ||
      graph.history_page.limit < 1 || graph.history_page.limit > 100) {
      return { status: "unverified", reason: "invalid_graph" };
    }
    if (Object.values(graph.completeness).some((value) => value !== "complete")) {
      return { status: "unverified", reason: "incomplete_graph" };
    }
    const context = inspectRecords(graph.ledger, graph.policy, now, "ledger");
    const contest = context.data.contests.find((item) => item.id === graph.contest_id);
    if (!contest) return { status: "unverified", reason: "missing_contest", contest_id: graph.contest_id };
    const stage = context.data.stages.find((item) => item.id === contest.stage_id)!;
    const election = context.data.election;
    const interpreter = interpret(context, now);
    const historyIds = context.data.evidence.filter((entry) => entry.subject.id === election.id || entry.subject.id === stage.id ||
      ancestors(context, entry.subject.id).some((ancestor) => ancestor.record.id === contest.id))
      .map((entry) => entry.id).sort(compareText);
    const { offset, limit } = graph.history_page;
    const selectedHistory = new Set(historyIds.slice(offset, offset + limit));
    const historyPage: HistoryPage = {
      offset, limit, total: historyIds.length, next_offset: offset + limit < historyIds.length ? offset + limit : null,
      completeness: "complete",
    };
    const pagedHistory = (kind: EntityKind, id: string) => interpreter.history(kind, id, selectedHistory);
    const electionState = interpreter.claim("election", election.id, "election_metadata");
    const stageState = interpreter.claim("stage", stage.id, "stage_metadata");
    const contestState = interpreter.claim("contest", contest.id, "contest_metadata");
    const metadataHistory = [
      ...interpreter.history("election", election.id),
      ...interpreter.history("stage", stage.id),
      ...interpreter.history("contest", contest.id),
    ];
    const selectedSubjects = new Map([...selectedHistory].map((id) => {
      const subject = context.evidence.get(id)!.subject;
      return [subject.id, subject] as const;
    }));
    const recoveryHistory = [...selectedSubjects.values()].flatMap((subject) => pagedHistory(subject.kind, subject.id))
      .sort((a, b) => compareText(a.evidence.id, b.evidence.id));
    const recover = (reason: "unverified_metadata" | "retired_identity"): UnverifiedContest => {
      const relevantIds = new Set(historyIds);
      const metadataSubjects = new Map(context.data.evidence.filter((entry) =>
        relevantIds.has(entry.id) && entry.kind.endsWith("_metadata"))
        .map((entry) => [entry.subject.id, entry] as const));
      const conflicts = [...metadataSubjects.values()].flatMap((entry) => {
        const state = interpreter.claim(entry.subject.kind, entry.subject.id, entry.kind);
        if (state.state !== "conflict") return [];
        const ids = new Set(state.assertions.map((assertion) => assertion.evidence.id));
        return interpreter.history(entry.subject.kind, entry.subject.id, ids);
      }).sort((a, b) => compareText(a.evidence.id, b.evidence.id));
      return {
        status: "unverified", reason, contest_id: contest.id, history: recoveryHistory, history_page: historyPage,
        metadata_conflicts: conflicts,
      };
    };
    if (interpreter.retired("stage", stage.id) || interpreter.retired("contest", contest.id)) {
      return recover("retired_identity");
    }
    if (![electionState, stageState, contestState].every(displayable)) {
      return recover("unverified_metadata");
    }
    const candidates: CandidacyView[] = [];
    const retiredCandidates: CandidacyView[] = [];
    for (const candidate of context.data.candidacies.filter((item) => item.contest_id === contest.id)) {
      const candidateMetadata = interpreter.claim("candidacy", candidate.id, "candidacy_metadata");
      if (!displayable(candidateMetadata)) {
        return recover("unverified_metadata");
      }
      const lines: BallotLineView[] = [];
      const retiredLines: BallotLineView[] = [];
      for (const line of context.data.ballot_lines.filter((item) => item.candidacy_id === candidate.id)) {
        const lineMetadata = interpreter.claim("ballot_line", line.id, "ballot_line_metadata");
        if (!displayable(lineMetadata)) {
          return recover("unverified_metadata");
        }
        (interpreter.retired("ballot_line", line.id) ? retiredLines : lines).push({
          id: line.id, metadata: lineMetadata, tracks: interpreter.tracks("ballot_line", line.id),
          history: pagedHistory("ballot_line", line.id),
        });
      }
      const lineOrder = (a: BallotLineView, b: BallotLineView) =>
        compareText(displayValue(a.metadata)!.name, displayValue(b.metadata)!.name) || compareText(a.id, b.id);
      lines.sort(lineOrder);
      retiredLines.sort(lineOrder);
      const projected: CandidacyView = {
        id: candidate.id, metadata: candidateMetadata, tracks: interpreter.tracks("candidacy", candidate.id),
        ballot_lines: lines, retired_ballot_lines: retiredLines, history: pagedHistory("candidacy", candidate.id),
      };
      (interpreter.retired("candidacy", candidate.id) ? retiredCandidates : candidates).push(projected);
    }
    const order = (a: CandidacyView, b: CandidacyView) =>
      compareText(displayValue(a.metadata)!.name, displayValue(b.metadata)!.name) || compareText(a.id, b.id);
    candidates.sort(order);
    retiredCandidates.sort(order);
    const current = [electionState, stageState, contestState].every((state) => state.state === "verified");
    const stageValue = displayValue(stageState)!;
    const today = stageValue.time_zone ? civilDate(now, stageValue.time_zone) : null;
    return {
      status: "available", contest_id: contest.id, verification: current ? "current" : "historical",
      election: electionState, stage: stageState, contest: contestState,
      candidates, retired_candidates: retiredCandidates,
      history: metadataHistory.filter((entry) => selectedHistory.has(entry.evidence.id)), history_page: historyPage,
      upcoming: current && stageValue.date && today ? stageValue.date >= today : null,
    };
  } catch {
    return { status: "unverified", reason: "invalid_graph" };
  }
}

export function electionScopeFromDivisions(
  divisions: readonly SavedResidenceDivision[],
  level: GovernmentLevel,
): ElectionScopeResult {
  try {
    if (!plainData(divisions) || !Array.isArray(divisions) || divisions.length > 100 ||
      !["local", "state", "federal"].includes(level)) return { status: "invalid" };
    if (divisions.length === 0) return { status: "missing" };
    if (level === "local") return { status: "unsupported" };
    const applicable: { id: string; type: string; state: string }[] = [];
    for (const division of divisions) {
      if (!exact(division, ["type", "name", "id", "idScheme"]) ||
        !publicText(division.name) || !publicText(division.type) || !publicText(division.idScheme) ||
        !publicText(division.id)) return { status: "invalid" };
      if (division.idScheme !== "ocd") return { status: "unsupported" };
      const match = /^ocd-division\/country:us\/state:([a-z]{2})(?:\/(cd|sldu|sldl):([a-z0-9][a-z0-9_-]{0,199}))?$/.exec(division.id);
      if (!match) {
        if (["state", "congressional_district", "state_upper", "state_lower"].includes(division.type)) return { status: "invalid" };
        continue;
      }
      if (!STATE_CODES.has(match[1])) return { status: "unsupported" };
      const requiredType = match[2] === "cd" ? "congressional_district" :
        match[2] === "sldu" ? "state_upper" : match[2] === "sldl" ? "state_lower" : "state";
      if (division.type !== requiredType) return { status: "invalid" };
      applicable.push({ id: division.id, type: division.type, state: match[1] });
    }
    if (applicable.length === 0) return { status: "unsupported" };
    const states = new Set(applicable.map((item) => item.state));
    if (states.size !== 1) return { status: "invalid" };
    const state = applicable.find((item) => item.type === "state");
    if (!state) return { status: "invalid" };
    const types = level === "federal" ? ["state", "congressional_district"] : ["state", "state_upper", "state_lower"];
    const selected = applicable.filter((item) => types.includes(item.type));
    if (new Set(selected.map((item) => item.type)).size !== selected.length) return { status: "invalid" };
    return {
      status: "available",
      coverage: types.every((type) => selected.some((item) => item.type === type)) ? "exact" : "partial",
      scope: {
        level, jurisdiction_id: state.id,
        division_ids: [state.id, ...selected.filter((item) => item.type !== "state").map((item) => item.id).sort(compareText)],
      },
    };
  } catch {
    return { status: "invalid" };
  }
}

const DAY = 86_400_000;
const CONTEST_FIELDS: readonly ContestField[] = ["name", "office", "district", "term", "seats", "form", "level", "jurisdiction_id", "division_ids", "partisanship"];
const PROVENANCE_FIELDS = ["document_id", "mapping_id", "locator", "original_term", "retrieved_at", "verified_at", "effective", "current_until"];
const SUPPORT_ONLY_FIELDS: Partial<Record<SourceType, readonly ContestField[]>> = {
  official_statute: ["term", "seats", "form"],
  division_identifier_registry: ["division_ids"],
};
const STATE_CODES = new Set("al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc".split(" "));
const ENTITY_KINDS: readonly EntityKind[] = ["election", "stage", "contest", "candidacy", "ballot_line"];
const STATUS_VALUES = {
  intent: ["declared", "withdrawn"],
  filing: ["filed", "pending", "accepted"],
  ballot_qualification: ["pending", "certified", "removed", "disqualified"],
  ballot_appearance: ["listed_for_ballot", "printed", "write_in_eligible", "not_on_ballot"],
  outcome: ["advanced", "won", "lost"],
  finance: ["filed"],
} as const;
const EVIDENCE_KINDS: readonly EvidenceKind[] = [
  "election_metadata", "stage_metadata", "contest_metadata", "candidacy_metadata", "ballot_line_metadata",
  "intent", "filing", "ballot_qualification", "ballot_appearance", "outcome", "finance", "ballot_continuation", "retirement",
];
type EntityRecord = Identity & Partial<{
  election_id: string; stage_id: string; contest_id: string; candidacy_id: string;
}>;
type LocatedIdentity = { kind: EntityKind; record: EntityRecord };
type Context = {
  data: ElectionLedger;
  policy: ElectionSourcePolicy;
  identities: Map<string, LocatedIdentity>;
  evidence: Map<string, ElectionEvidence>;
  documents: Map<string, SourceDocument>;
  authorities: Map<string, SourceAuthorityPolicy>;
  calendarBases: Map<string, CalendarBasisPolicy>;
};

class InvalidPackage extends Error {
  readonly reason: PackageRejection["reason"];
  constructor(reason: PackageRejection["reason"]) {
    super(reason);
    this.reason = reason;
  }
}

function requireRule(condition: unknown, reason: PackageRejection["reason"]): asserts condition {
  if (!condition) throw new InvalidPackage(reason);
}

function inspectRecords(input: unknown, policy: ElectionSourcePolicy, now: Date, envelope: "import" | "ledger"): Context {
  const importing = envelope === "import";
  requireRule(validDate(now) && plainData(input, importing), "invalid_package");
  requireRule(plainData(policy, false) && exact(policy, ["version", "dataset_kind", "authorities"]) &&
    identifier(policy.version) && ["official", "synthetic"].includes(policy.dataset_kind) &&
    Array.isArray(policy.authorities) && policy.authorities.length <= 100, "invalid_policy");
  requireRule(exact(input, ["dataset_kind", "election", "stages", "contests", "candidacies", "ballot_lines",
    "documents", "evidence", "supersessions", ...(importing ? ["schema_version", "policy_version"] : [])]), "invalid_package");
  requireRule(input.dataset_kind === policy.dataset_kind, "dataset_not_admitted");
  if (importing) {
    requireRule(input.schema_version === "f7-v1" && identifier(input.policy_version), "invalid_package");
    requireRule(input.policy_version === policy.version, "source_not_admitted");
  }
  for (const field of ["stages", "contests", "candidacies", "ballot_lines", "documents", "evidence", "supersessions"]) {
    requireRule(Array.isArray(input[field]), "invalid_package");
  }
  const data = input as unknown as ElectionLedger;
  requireRule(!importing || (new TextEncoder().encode(serializeElectionPackage(input as unknown as ElectionPackage)).byteLength <= 2 * 1_024 * 1_024 &&
    data.candidacies.length <= 1_000 && data.evidence.length <= 10_000 && data.documents.length <= 20 &&
    data.stages.length <= 1_000 && data.contests.length <= 1_000 && data.ballot_lines.length <= 10_000 &&
    data.supersessions.length <= 10_000), "limit_exceeded");
  const context: Context = {
    data, policy, identities: new Map(), evidence: new Map(), documents: new Map(), authorities: new Map(), calendarBases: new Map(),
  };
  const officialKeys = new Set<string>();
  const groups: readonly [EntityKind, readonly EntityRecord[], string | null][] = [
    ["election", [data.election], null], ["stage", data.stages, "election_id"],
    ["contest", data.contests, "stage_id"], ["candidacy", data.candidacies, "contest_id"],
    ["ballot_line", data.ballot_lines, "candidacy_id"],
  ];
  for (const [kind, records, parentKey] of groups) {
    for (const record of records) {
      const keys = ["id", "issuer", "official_key", "revision", "revision_of", ...(parentKey ? [parentKey] : [])];
      requireRule(exact(record, keys) && identifier(record.id) && identifier(record.issuer) &&
        publicText(record.official_key) && identifier(record.revision) &&
        (record.revision_of === null || identifier(record.revision_of)), "invalid_identity");
      requireRule(!context.identities.has(record.id), "invalid_identity");
      let parentId = "";
      if (parentKey) {
        parentId = (record as unknown as Record<string, string>)[parentKey];
        const expectedKind = ENTITY_KINDS[ENTITY_KINDS.indexOf(kind) - 1];
        requireRule(context.identities.get(parentId)?.kind === expectedKind, "invalid_identity");
      }
      const key = JSON.stringify([kind, parentId, record.issuer, record.official_key, record.revision]);
      requireRule(!officialKeys.has(key), "invalid_identity");
      officialKeys.add(key);
      context.identities.set(record.id, { kind, record });
    }
  }
  for (const [id, located] of context.identities) {
    const prior = located.record.revision_of;
    if (prior !== null) {
      const previous = context.identities.get(prior);
      requireRule(prior !== id && previous?.kind === located.kind &&
        previous.record.issuer === located.record.issuer &&
        previous.record.official_key === located.record.official_key &&
        previous.record.revision !== located.record.revision, "invalid_identity");
    }
  }
  requireRule(!cyclic([...context.identities].flatMap(([id, item]) =>
    item.record.revision_of ? [[id, item.record.revision_of] as const] : [])), "invalid_identity");

  for (const authority of policy.authorities) {
    requireRule(validAuthority(authority) && !context.authorities.has(authority.id), "invalid_policy");
    context.authorities.set(authority.id, authority);
    for (const mapping of authority.mappings) {
      const basis = mapping.stage_calendar;
      if (!basis) continue;
      const previous = context.calendarBases.get(basis.basis_id);
      requireRule(!previous || calendarMeaning(previous) === calendarMeaning(basis), "invalid_policy");
      context.calendarBases.set(basis.basis_id, basis);
    }
  }
  for (const document of data.documents) {
    requireRule(exact(document, ["id", "authority_id", "url", "sha256", "label",
      ...(Object.hasOwn(document, "calendar_basis_id") ? ["calendar_basis_id"] : []),
      ...(Object.hasOwn(document, "calendar_reference") ? ["calendar_reference"] : [])]) &&
      identifier(document.id) && identifier(document.authority_id) && safeSourceUrl(document.url) &&
      /^[a-f0-9]{64}$/.test(document.sha256) && publicText(document.label) &&
      !context.documents.has(document.id), "invalid_evidence");
    requireRule(!(Object.hasOwn(document, "calendar_basis_id") && Object.hasOwn(document, "calendar_reference")), "invalid_evidence");
    if (Object.hasOwn(document, "calendar_basis_id")) {
      requireRule(identifier(document.calendar_basis_id) && context.calendarBases.has(document.calendar_basis_id), "source_not_admitted");
    }
    const authority = context.authorities.get(document.authority_id);
    if (Object.hasOwn(document, "calendar_reference")) {
      const reference = document.calendar_reference!;
      requireRule(exact(reference, ["basis_id", "kind", "locator", "original_term", "retrieved_at", "verified_at", "current_until"]) &&
        identifier(reference.basis_id) && ["iana_tzdb", "time_zone_regulation"].includes(reference.kind) &&
        publicText(reference.locator, 500) && publicText(reference.original_term, 500), "invalid_evidence");
      requireRule(instant(reference.retrieved_at) && instant(reference.verified_at) && instant(reference.current_until) &&
        reference.retrieved_at <= reference.verified_at && Date.parse(reference.verified_at) <= now.getTime() &&
        reference.current_until > reference.verified_at &&
        Date.parse(reference.current_until) - Date.parse(reference.verified_at) <= DAY, "invalid_time");
      requireRule(context.calendarBases.get(reference.basis_id)?.references.some((permitted) =>
        permitted.id === document.id && permitted.authority_id === document.authority_id &&
        permitted.url === document.url && permitted.kind === reference.kind), "source_not_admitted");
    } else {
      requireRule(authority && authority.urls.includes(document.url) &&
        authority.election_issuer === data.election.issuer && authority.election_key === data.election.official_key,
      "source_not_admitted");
    }
    context.documents.set(document.id, document);
  }
  for (const entry of data.evidence) {
    requireRule(exact(entry, ["id", "subject", "kind", "value", ...PROVENANCE_FIELDS,
      ...(entry.kind === "contest_metadata" ? ["fields", "supporting_sources"] : [])]) &&
      identifier(entry.id) && !context.evidence.has(entry.id) &&
      exact(entry.subject, ["kind", "id"]) && ENTITY_KINDS.includes(entry.subject.kind) &&
      context.identities.get(entry.subject.id)?.kind === entry.subject.kind &&
      EVIDENCE_KINDS.includes(entry.kind) && validSubjectKind(entry.kind, entry.subject.kind), "invalid_evidence");
    const { authority, mapping } = inspectProvenance(context, entry, entry, now);
    requireRule(!SUPPORT_ONLY_FIELDS[authority.source_type], "source_not_admitted");
    requireRule((authority.source_type === "official_finance") === (entry.kind === "finance"), "source_not_admitted");
    requireRule(validValue(entry, context, authority), "invalid_evidence");
    if (entry.kind === "contest_metadata") {
      requireRule(validFields(entry.fields) && entry.fields.every((field) => mapping.allowed_fields.includes(field)) &&
        Array.isArray(entry.supporting_sources), "invalid_evidence");
      const groups = new Set(["primary"]);
      const fields = new Set(entry.fields);
      for (const input of entry.supporting_sources) {
        requireRule(exact(input, ["id", "fields", ...PROVENANCE_FIELDS]) && identifier(input.id) &&
          !groups.has(input.id) && validFields(input.fields), "invalid_evidence");
        const support = input as ContestSupportingSource;
        const admitted = inspectProvenance(context, entry, support, now);
        requireRule(admitted.authority.source_type !== "official_finance" &&
          support.fields.every((field) => admitted.mapping.allowed_fields.includes(field)), "source_not_admitted");
        groups.add(support.id);
        support.fields.forEach((field) => fields.add(field));
      }
      requireRule(CONTEST_FIELDS.every((field) => fields.has(field)), "invalid_evidence");
    }
    if (Object.hasOwn(STATUS_VALUES, entry.kind)) {
      const value = entry.kind === "outcome" ? entry.value.status : entry.value;
      requireRule(typeof value === "string" && mapping.values.includes(value), "source_not_admitted");
    }
    context.evidence.set(entry.id, entry);
  }
  const jurisdictions = new Map<string, Set<string>>();
  for (const entry of data.evidence) {
    if (entry.kind === "election_metadata" || entry.kind === "contest_metadata") {
      const values = jurisdictions.get(entry.subject.id) ?? new Set<string>();
      values.add(entry.value.jurisdiction_id);
      jurisdictions.set(entry.subject.id, values);
    }
  }
  for (const entry of data.evidence) {
    const lineageJurisdictions = ancestors(context, entry.subject.id)
      .flatMap((ancestor) => [...(jurisdictions.get(ancestor.record.id) ?? [])]);
    for (const source of provenanceGroups(entry)) {
      const authority = context.authorities.get(context.documents.get(source.document_id)!.authority_id)!;
      requireRule(lineageJurisdictions.length > 0 &&
        lineageJurisdictions.every((jurisdiction) => jurisdiction === authority.jurisdiction_id), "source_not_admitted");
    }
    if (entry.kind === "ballot_continuation") {
      const withdrawal = context.evidence.get(entry.value.withdrawal_evidence_id);
      requireRule(withdrawal?.kind === "intent" && withdrawal.value === "withdrawn" &&
        sameSubject(withdrawal.subject, entry.subject) && entry.verified_at >= withdrawal.verified_at, "invalid_evidence");
    }
    if (entry.kind === "retirement") {
      const replacement = context.identities.get(entry.value.replacement_id);
      requireRule(replacement?.kind === entry.subject.kind && replacement.record.revision_of === entry.subject.id, "invalid_identity");
    }
  }
  const seenLinks = new Set<string>();
  for (const link of data.supersessions) {
    requireRule(exact(link, ["replacement_id", "predecessor_id", "reason"]) &&
      identifier(link.replacement_id) && identifier(link.predecessor_id) && publicText(link.reason, 500),
    "invalid_supersession");
    const replacement = context.evidence.get(link.replacement_id);
    const predecessor = context.evidence.get(link.predecessor_id);
    const key = JSON.stringify([link.replacement_id, link.predecessor_id]);
    requireRule(replacement && predecessor && replacement.id !== predecessor.id &&
      replacement.kind === predecessor.kind && sameSubject(replacement.subject, predecessor.subject) &&
      sourceMapping(context, replacement).allows_supersession && !seenLinks.has(key), "invalid_supersession");
    seenLinks.add(key);
  }
  requireRule(!cyclic(data.supersessions.map((link) => [link.replacement_id, link.predecessor_id] as const)), "invalid_supersession");
  const effects = new Map(data.evidence.map((entry) => [entry.id, applicability(context, entry, now)]));
  const superseded = new Set(data.supersessions.filter((link) => effects.get(link.replacement_id)!.begun)
    .map((link) => link.predecessor_id));
  const stageLinks = data.evidence.flatMap((entry) => entry.kind === "stage_metadata" &&
    effects.get(entry.id)!.applies && !superseded.has(entry.id)
    ? entry.value.successor_stage_ids.map((id) => [entry.subject.id, id] as const) : []);
  requireRule(!cyclic(stageLinks), "invalid_evidence");
  return context;
}

function validAuthority(value: SourceAuthorityPolicy): boolean {
  if (!exact(value, ["id", "source_type", "election_issuer", "election_key", "jurisdiction_id",
    "stage_keys", "contest_keys", "urls", "mappings", "access_approval", "retention_approval",
    "retention", "current_display_until", "enabled"]) ||
    !identifier(value.id) || !identifier(value.election_issuer) || !publicText(value.election_key) ||
    !["official_election_authority", "official_ballot_feed", "official_finance", "official_court_record",
      "official_statute", "division_identifier_registry"].includes(value.source_type) ||
    !stateDivision(value.jurisdiction_id) || !textArray(value.stage_keys, 1_000) ||
    !textArray(value.contest_keys, 1_000) || !Array.isArray(value.urls) ||
    value.urls.length === 0 || !value.urls.every(safeSourceUrl) ||
    new Set(value.urls).size !== value.urls.length ||
    !Array.isArray(value.mappings) || value.mappings.length > 100 ||
    !publicText(value.access_approval, 500) || !publicText(value.retention_approval, 500) ||
    value.retention !== "indefinite" || typeof value.enabled !== "boolean" ||
    !(value.current_display_until === null || instant(value.current_display_until))) return false;
  const mappings = new Set<string>();
  return value.mappings.every((input) => {
    const mapping = input as ClaimMapping;
    if (!exact(mapping, ["id", "kind", "subject_kind", "values", "allowed_fields", "allows_supersession",
      "supports_current_snapshot", "date_rule", ...(Object.hasOwn(mapping, "stage_calendar") ? ["stage_calendar"] : [])]) || !identifier(mapping.id) ||
      mappings.has(mapping.id) || !EVIDENCE_KINDS.includes(mapping.kind) ||
      !validSubjectKind(mapping.kind, mapping.subject_kind) || !textArray(mapping.values, 20) ||
      typeof mapping.allows_supersession !== "boolean" || typeof mapping.supports_current_snapshot !== "boolean") return false;
    if (mapping.kind === "contest_metadata" ? !validFields(mapping.allowed_fields) :
      !Array.isArray(mapping.allowed_fields) || mapping.allowed_fields.length !== 0) return false;
    const supportFields = SUPPORT_ONLY_FIELDS[value.source_type];
    if (supportFields && (mapping.kind !== "contest_metadata" || mapping.allows_supersession ||
      !mapping.allowed_fields.every((field) => supportFields.includes(field)))) return false;
    if (Object.hasOwn(mapping, "stage_calendar") && (mapping.kind !== "stage_metadata" ||
      value.source_type === "official_finance" || !validCalendarBasis(mapping.stage_calendar!) ||
      mapping.stage_calendar!.jurisdiction_id !== value.jurisdiction_id)) return false;
    mappings.add(mapping.id);
    if (mapping.date_rule !== null && (!exact(mapping.date_rule, ["time_zone", "start", "end"]) ||
      !validTimeZone(mapping.date_rule.time_zone) ||
      !["start_of_day", "after_date"].includes(mapping.date_rule.start) ||
      !["start_of_day", "end_of_day"].includes(mapping.date_rule.end))) return false;
    if (Object.hasOwn(STATUS_VALUES, mapping.kind)) {
      const allowed: readonly string[] = STATUS_VALUES[mapping.kind as keyof typeof STATUS_VALUES];
      return mapping.values.length > 0 && mapping.values.every((item) => allowed.includes(item));
    }
    return mapping.values.length === 0;
  });
}

function validCalendarBasis(basis: CalendarBasisPolicy): boolean {
  return exact(basis, ["basis_id", "jurisdiction_id", "time_zone", "references", "enabled", "current_display_until"]) &&
    identifier(basis.basis_id) && stateDivision(basis.jurisdiction_id) && validTimeZone(basis.time_zone) &&
    typeof basis.enabled === "boolean" && (basis.current_display_until === null || instant(basis.current_display_until)) &&
    Array.isArray(basis.references) && basis.references.length > 0 &&
    basis.references.every((reference) => exact(reference, ["id", "authority_id", "url", "kind", "access_approval", "retention_approval", "retention"]) &&
      identifier(reference.id) && identifier(reference.authority_id) && safeSourceUrl(reference.url) &&
      (reference.kind === "iana_tzdb" || reference.kind === "time_zone_regulation") &&
      publicText(reference.access_approval, 500) && publicText(reference.retention_approval, 500) && reference.retention === "indefinite") &&
    new Set(basis.references.map((reference) => reference.id)).size === basis.references.length;
}

function calendarMeaning(basis: CalendarBasisPolicy): string {
  return canonical({
    jurisdiction_id: basis.jurisdiction_id, time_zone: basis.time_zone,
    references: basis.references.map(({ id, authority_id, url, kind }) => ({ id, authority_id, url, kind }))
      .sort((a, b) => compareText(a.id, b.id)),
  });
}

function validSubjectKind(kind: EvidenceKind, subject: EntityKind): boolean {
  if (kind.endsWith("_metadata")) return kind === subject + "_metadata";
  if (kind === "retirement") return ENTITY_KINDS.includes(subject);
  return subject === "candidacy" || subject === "ballot_line";
}

function validValue(entry: ElectionEvidence, context: Context, authority: SourceAuthorityPolicy): boolean {
  const value = entry.value;
  switch (entry.kind) {
    case "election_metadata": {
      const item = entry.value;
      return exact(item, ["name", "jurisdiction_id", "kind", "coverage"]) &&
        publicText(item.name) && item.jurisdiction_id === authority.jurisdiction_id &&
        ["regular", "special"].includes(item.kind) &&
        exact(item.coverage, ["state", "contest_ids", "notes"]) &&
        ["complete_in_admitted_contests", "partial"].includes(item.coverage.state) &&
        textArray(item.coverage.contest_ids, 1_000) && textArray(item.coverage.notes, 20, 500) &&
        item.coverage.contest_ids.every((id) => context.identities.get(id)?.kind === "contest");
    }
    case "stage_metadata": {
      const item = entry.value;
      return exact(item, ["name", "kind", "date", "time_zone", "successor_stage_ids"]) &&
        publicText(item.name) && ["primary", "general", "runoff", "other"].includes(item.kind) &&
        (item.date === null || calendarDate(item.date)) && (item.time_zone === null || validTimeZone(item.time_zone)) &&
        textArray(item.successor_stage_ids, 1_000) &&
        item.successor_stage_ids.every((id) => id !== entry.subject.id && context.identities.get(id)?.kind === "stage");
    }
    case "contest_metadata": {
      const item = entry.value;
      return exact(item, ["name", "office", "district", "term", "seats", "form", "level",
        "jurisdiction_id", "division_ids", "partisanship"]) &&
        [item.name, item.office, item.district, item.term].every((text) => publicText(text)) &&
        Number.isSafeInteger(item.seats) && item.seats >= 1 && item.seats <= 100 &&
        item.form === (item.seats === 1 ? "candidate_single_seat" : "candidate_multi_seat") &&
        ["local", "state", "federal"].includes(item.level) && item.jurisdiction_id === authority.jurisdiction_id &&
        textArray(item.division_ids, 100) && item.division_ids.length > 0 &&
        item.division_ids.every((id) => publicDivision(id) && (id === item.jurisdiction_id || id.startsWith(item.jurisdiction_id + "/"))) &&
        ["partisan", "nonpartisan", "unknown"].includes(item.partisanship);
    }
    case "candidacy_metadata": {
      const item = entry.value;
      return exact(item, ["name", "official_person_id"]) && publicText(item.name) &&
        (item.official_person_id === null ||
          (exact(item.official_person_id, ["issuer", "value"]) && identifier(item.official_person_id.issuer) &&
            publicText(item.official_person_id.value)));
    }
    case "ballot_line_metadata":
      return exact(entry.value, ["name", "party_label"]) && publicText(entry.value.name) &&
        (entry.value.party_label === null || publicText(entry.value.party_label));
    case "outcome":
      return exact(entry.value, ["status", "destination_contest_id"]) &&
        STATUS_VALUES.outcome.includes(entry.value.status) &&
        (entry.value.destination_contest_id === null ||
          (entry.value.status === "advanced" && context.identities.get(entry.value.destination_contest_id)?.kind === "contest" &&
            !ancestors(context, entry.subject.id).some((item) => item.record.id === entry.value.destination_contest_id)));
    case "ballot_continuation":
      return exact(entry.value, ["withdrawal_evidence_id", "appearance"]) &&
        identifier(entry.value.withdrawal_evidence_id) && ["listed_for_ballot", "printed"].includes(entry.value.appearance);
    case "retirement":
      return exact(entry.value, ["replacement_id"]) && identifier(entry.value.replacement_id);
    default: {
      const allowed: readonly string[] = STATUS_VALUES[entry.kind];
      return typeof value === "string" && allowed.includes(value);
    }
  }
}

function ancestors(context: Context, id: string): LocatedIdentity[] {
  const result: LocatedIdentity[] = [];
  let current = context.identities.get(id);
  while (current) {
    result.push(current);
    const record = current.record;
    const parent = record.candidacy_id ?? record.contest_id ?? record.stage_id ?? record.election_id;
    current = parent ? context.identities.get(parent) : undefined;
  }
  return result;
}

function sourceMapping(context: Context, entry: EvidenceProvenance): ClaimMapping {
  const document = context.documents.get(entry.document_id)!;
  return context.authorities.get(document.authority_id)!.mappings.find((mapping) => mapping.id === entry.mapping_id)!;
}

function validFields(value: unknown): value is ContestField[] {
  return textArray(value, CONTEST_FIELDS.length) && value.length > 0 &&
    value.every((field) => (CONTEST_FIELDS as readonly string[]).includes(field));
}

function provenanceGroups(entry: ElectionEvidence): readonly EvidenceProvenance[] {
  return entry.kind === "contest_metadata" ? [entry, ...entry.supporting_sources] : [entry];
}

function calendarDocuments(context: Context, source: EvidenceProvenance): readonly SourceDocument[] {
  return sourceMapping(context, source).stage_calendar?.references.map((reference) =>
    context.documents.get(reference.id)!).sort((a, b) => compareText(a.url, b.url) || compareText(a.id, b.id)) ?? [];
}

function inspectProvenance(context: Context, entry: ElectionEvidence, source: EvidenceProvenance, now: Date) {
  requireRule(identifier(source.document_id) && identifier(source.mapping_id) &&
    publicText(source.locator, 500) && publicText(source.original_term, 500), "invalid_evidence");
  const document = context.documents.get(source.document_id);
  const authority = document ? context.authorities.get(document.authority_id) : undefined;
  const mapping = authority?.mappings.find((item) => item.id === source.mapping_id);
  requireRule(authority && mapping && !document?.calendar_reference && mapping.kind === entry.kind && mapping.subject_kind === entry.subject.kind,
    "source_not_admitted");
  if (mapping.stage_calendar) {
    const basis = mapping.stage_calendar;
    requireRule(document?.calendar_basis_id === basis.basis_id && entry.kind === "stage_metadata" &&
      entry.value.time_zone === basis.time_zone, "source_not_admitted");
    for (const required of basis.references) {
      const reference = context.documents.get(required.id);
      requireRule(reference?.calendar_reference?.basis_id === basis.basis_id && reference.authority_id === required.authority_id &&
        reference.url === required.url && reference.calendar_reference.kind === required.kind, "source_not_admitted");
    }
  } else if (entry.kind === "stage_metadata") requireRule(!document?.calendar_basis_id, "source_not_admitted");
  const lineage = ancestors(context, entry.subject.id);
  const stage = lineage.find((item) => item.kind === "stage");
  const contest = lineage.find((item) => item.kind === "contest");
  requireRule((!stage || authority.stage_keys.includes(stage.record.official_key)) &&
    (!contest || authority.contest_keys.includes(contest.record.official_key)), "source_not_admitted");
  requireRule(instant(source.retrieved_at) && instant(source.verified_at) && instant(source.current_until) &&
    source.retrieved_at <= source.verified_at && Date.parse(source.verified_at) <= now.getTime() &&
    Date.parse(source.current_until) > Date.parse(source.verified_at) &&
    Date.parse(source.current_until) - Date.parse(source.verified_at) <= DAY &&
    validEffect(source.effective), "invalid_time");
  return { authority, mapping };
}

function validEffect(effect: EffectiveTime): boolean {
  if (effect?.precision === "unknown") return exact(effect, ["precision", "reason"]) && effect.reason === "not_published";
  if (!exact(effect, ["precision", "start", "end"])) return false;
  const valid = effect.precision === "instant" ? instant : effect.precision === "date" ? calendarDate : () => false;
  return valid(effect.start) && (effect.end === null || (valid(effect.end) && effect.end > effect.start));
}

function sourceWindow(context: Context, entry: EvidenceProvenance): readonly [number, number] | null {
  const effect = entry.effective;
  const mapping = sourceMapping(context, entry);
  if (effect.precision === "instant") {
    return [Date.parse(effect.start), effect.end === null ? Infinity : Date.parse(effect.end)];
  }
  if (effect.precision === "date") {
    const rule = mapping.date_rule;
    if (!rule) return null;
    const start = civilBoundary(effect.start, rule.time_zone, rule.start === "after_date");
    const end = effect.end === null ? Infinity : civilBoundary(effect.end, rule.time_zone, rule.end === "end_of_day");
    return start === null || end === null ? null : [start, end];
  }
  return mapping.supports_current_snapshot ? [Date.parse(entry.verified_at), Infinity] : null;
}

function applicability(context: Context, entry: ElectionEvidence, now: Date) {
  const groups = provenanceGroups(entry);
  const windows = groups.map((group) => sourceWindow(context, group));
  const known = windows.every((window) => window !== null);
  const start = Math.max(...windows.map((window) => window?.[0] ?? Infinity));
  const end = Math.min(...windows.map((window) => window?.[1] ?? -Infinity));
  const begun = known && start < end && now.getTime() >= start;
  const fresh = groups.every((group) => {
    const authority = context.authorities.get(context.documents.get(group.document_id)!.authority_id)!;
    const calendar = sourceMapping(context, group).stage_calendar;
    return authority.enabled && now.getTime() < Date.parse(group.current_until) &&
      (authority.current_display_until === null || now.getTime() < Date.parse(authority.current_display_until)) &&
      (!calendar || (calendar.enabled &&
        (calendar.current_display_until === null || now.getTime() < Date.parse(calendar.current_display_until)) &&
        calendarDocuments(context, group).every((document) => now.getTime() < Date.parse(document.calendar_reference!.current_until))));
  });
  return { begun, applies: begun && now.getTime() < end, known, fresh };
}

function sourceReference(context: Context, source: EvidenceProvenance): SourceReference {
  const document = context.documents.get(source.document_id)!;
  const authority = context.authorities.get(document.authority_id)!;
  const calendar = sourceMapping(context, source).stage_calendar;
  return {
    source_url: document.url, source_type: authority.source_type,
    authority_id: authority.id, source_label: document.label, original_term: source.original_term,
    document_sha256: document.sha256, locator: source.locator, retrieved_at: source.retrieved_at,
    verified_at: source.verified_at, effective: structuredClone(source.effective), current_until: source.current_until,
    ...(calendar ? { calendar_basis: {
      basis_id: calendar.basis_id, mapping_id: source.mapping_id,
      jurisdiction_id: calendar.jurisdiction_id, time_zone: calendar.time_zone,
      references: calendarDocuments(context, source).map((reference) => ({
        ...reference.calendar_reference!, source_url: reference.url, source_label: reference.label,
        document_sha256: reference.sha256, authority_id: reference.authority_id,
      })),
    } } : {}),
  };
}

function interpret(context: Context, now: Date) {
  const effects = new Map(context.data.evidence.map((entry) => [entry.id, applicability(context, entry, now)]));
  const superseded = new Set(context.data.supersessions
    .filter((link) => effects.get(link.replacement_id)!.begun)
    .map((link) => link.predecessor_id));
  const grouped = new Map<string, ElectionEvidence[]>();
  const references = new Map<string, EvidenceRef>();
  for (const entry of context.data.evidence) {
    const key = entry.subject.kind + ":" + entry.subject.id;
    const entries = grouped.get(key) ?? [];
    entries.push(entry);
    grouped.set(key, entries);
    const reference: EvidenceRef = { id: entry.id, ...sourceReference(context, entry) };
    if (entry.kind === "contest_metadata") {
      const groups = [{ ...entry, id: "primary" }, ...entry.supporting_sources].sort((a, b) => compareText(a.id, b.id));
      const field_sources = Object.fromEntries(CONTEST_FIELDS.map((field) => [field,
        groups.filter((group) => group.fields.includes(field)).map((group) =>
          ({ group_id: group.id, ...sourceReference(context, group) })),
      ])) as Record<ContestField, FieldSourceReference[]>;
      references.set(entry.id, { ...reference, field_sources });
    } else references.set(entry.id, reference);
  }
  const precedence: readonly SourceType[] = [
    "official_election_authority", "official_court_record", "official_ballot_feed", "official_finance",
  ];
  const compareEvidence = (a: ElectionEvidence, b: ElectionEvidence) =>
    precedence.indexOf(references.get(a.id)!.source_type) - precedence.indexOf(references.get(b.id)!.source_type) ||
    compareText(a.id, b.id);
  for (const entries of grouped.values()) entries.sort(compareEvidence);
  const entriesFor = (kind: EntityKind, id: string) => grouped.get(kind + ":" + id) ?? [];
  const retired = (kind: EntityKind, id: string) => ancestors(context, id).some((ancestor) =>
    entriesFor(ancestor.kind, ancestor.record.id).some((entry) =>
      entry.kind === "retirement" && effects.get(entry.id)!.begun)) ||
    entriesFor(kind, id).some((entry) => entry.kind === "retirement" && effects.get(entry.id)!.begun);
  const sourced = <K extends EvidenceKind>(entry: ElectionEvidence<K>): SourcedAssertion<EvidenceValues[K]> =>
    ({ value: structuredClone(entry.value), evidence: references.get(entry.id)! });
  function claim<K extends EvidenceKind>(kind: EntityKind, id: string, claimKind: K): EvidenceState<EvidenceValues[K]> {
    const entries = entriesFor(kind, id).filter((entry) => entry.kind === claimKind) as ElectionEvidence<K>[];
    const unresolved = entries.filter((entry) => !superseded.has(entry.id));
    const operative = unresolved.filter((entry) => effects.get(entry.id)!.applies);
    if (new Set(operative.map((entry) => canonical(entry.value))).size > 1) {
      return { state: "conflict", assertions: operative.map(sourced) };
    }
    const current = operative.filter((entry) => effects.get(entry.id)!.fresh &&
      (claimKind === "retirement" || !retired(kind, id)));
    if (current.length > 0) {
      return {
        state: "verified", value: structuredClone(current[0].value),
        evidence: current.map((entry) => references.get(entry.id)!),
        verified_at: current.map((entry) => provenanceGroups(entry as ElectionEvidence).flatMap((group) => [
          group.verified_at, ...calendarDocuments(context, group).map((document) => document.calendar_reference!.verified_at),
        ]).sort(compareText)[0])
          .sort(compareText).at(-1)!,
      };
    }
    const previous = unresolved.filter((entry) => effects.get(entry.id)!.begun);
    if (previous.length > 0) return { state: "stale", previous: previous.map(sourced) };
    return { state: "unknown", last_checked_at: entries.map((entry) => entry.verified_at).sort(compareText).at(-1) ?? null };
  }
  function history(kind: EntityKind, id: string, selected?: ReadonlySet<string>): EvidenceHistory[] {
    return entriesFor(kind, id).filter((entry) => !selected || selected.has(entry.id)).map((entry) => {
      const effect = effects.get(entry.id)!;
      const replaced = superseded.has(entry.id);
      return {
        kind: entry.kind, subject: { ...entry.subject }, value: structuredClone(entry.value),
        evidence: references.get(entry.id)!,
        applicability: !effect.known ? "unknown" : !effect.begun ? "scheduled" :
          effect.applies && effect.fresh && !replaced &&
            (entry.kind === "retirement" || !retired(kind, id)) ? "current" : "historical",
        superseded: replaced,
      };
    });
  }
  function tracks(kind: "candidacy" | "ballot_line", id: string): CandidateTracks {
    const intent = claim(kind, id, "intent");
    const appearance = claim(kind, id, "ballot_appearance");
    const continuation = claim(kind, id, "ballot_continuation");
    let continued: EvidenceState<"withdrawn_still_on_ballot"> | null = null;
    if (intent.state === "verified" && intent.value === "withdrawn" &&
      appearance.state === "verified" && continuation.state === "verified" &&
      appearance.value === continuation.value.appearance &&
      intent.evidence.some((source) => source.id === continuation.value.withdrawal_evidence_id)) {
      const sources = [...intent.evidence, ...appearance.evidence, ...continuation.evidence];
      continued = {
        state: "verified", value: "withdrawn_still_on_ballot", evidence: sources,
        verified_at: sources.map((source) => source.verified_at).sort(compareText)[0],
      };
    }
    return {
      intent, filing: claim(kind, id, "filing"),
      ballot_qualification: claim(kind, id, "ballot_qualification"),
      ballot_appearance: appearance, outcome: claim(kind, id, "outcome"),
      finance: claim(kind, id, "finance"), continued_ballot_label: continued,
    };
  }
  return {
    claim, history, tracks,
    retired,
  };
}

function displayable(state: EvidenceState<unknown>): boolean {
  return state.state === "verified" || (state.state === "stale" &&
    state.previous.length > 0 && new Set(state.previous.map((entry) => canonical(entry.value))).size === 1);
}

function displayValue<T>(state: EvidenceState<T>): T | null {
  return state.state === "verified" ? state.value : state.state === "stale" ? state.previous[0]?.value ?? null : null;
}

function sameSubject(a: Subject, b: Subject) { return a.kind === b.kind && a.id === b.id; }
function compareText(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
function identifier(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(value); }
function publicText(value: unknown, maximum = 200): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
function textArray(value: unknown, maximum: number, stringMaximum = 200): value is string[] {
  return Array.isArray(value) && value.length <= maximum &&
    value.every((item) => publicText(item, stringMaximum)) && new Set(value).size === value.length;
}
function stateDivision(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^ocd-division\/country:us\/state:([a-z]{2})$/.exec(value);
  return !!match && STATE_CODES.has(match[1]);
}
function publicDivision(value: unknown): value is string {
  return typeof value === "string" && value.length <= 500 &&
    (/^ocd-division\/country:us\/state:[a-z]{2}(?:\/(?:cd|sldu|sldl|county|place):[a-z0-9][a-z0-9_-]{0,199})*$/.test(value) ||
      /^ocd-division\/country:us\/state:ca\/board_of_equalization:[1-4]$/.test(value));
}
function safeSourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.toString() === value && url.protocol === "https:" && !url.username && !url.password &&
      !url.port && !url.search && !url.hash && url.hostname !== "localhost" &&
      !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) && !url.hostname.includes(":");
  } catch { return false; }
}
function instant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function calendarDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && instant(value + "T00:00:00.000Z");
}
function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0); return true; } catch { return false; }
}
function civilDate(now: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const part = (type: string) => parts.find((item) => item.type === type)?.value;
    return part("year") + "-" + part("month") + "-" + part("day");
  } catch { return null; }
}
// Internal interval boundary only. Source date precision and its reviewed rule remain unchanged.
function civilBoundary(date: string, timeZone: string, after: boolean): number | null {
  let low = Date.parse(date + "T00:00:00.000Z") - 2 * DAY;
  let high = low + 4 * DAY;
  const atBoundary = (time: number) => {
    const local = civilDate(new Date(time), timeZone);
    return local && calendarDate(local) ? (after ? local > date : local >= date) : null;
  };
  if (atBoundary(low) !== false || atBoundary(high) !== true) return null;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    const reached = atBoundary(middle);
    if (reached === null) return null;
    if (reached) high = middle;
    else low = middle;
  }
  return high;
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function canonical(value: unknown, field?: string, normalizeSets = true): string {
  if (Array.isArray(value)) {
    const values = value.map((item) => canonical(item, undefined, normalizeSets));
    if (normalizeSets && (field === "division_ids" || field === "contest_ids" || field === "successor_stage_ids")) values.sort(compareText);
    return "[" + values.join(",") + "]";
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort(compareText).map((key) => JSON.stringify(key) + ":" + canonical(record[key], key, normalizeSets)).join(",") + "}";
  }
  return JSON.stringify(value);
}
function plainData(value: unknown, bounded = true): boolean {
  const active = new Set<object>();
  let nodes = 0;
  function visit(item: unknown, depth: number): boolean {
    if ((++nodes > 200_000 && bounded) || depth > 20) return false;
    if (item === null || typeof item === "boolean" || typeof item === "string") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item !== "object" || active.has(item)) return false;
    const array = Array.isArray(item);
    if (!array && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) return false;
    if (array && ((bounded && item.length > 10_000) || keys.length !== item.length + 1 ||
      !Array.from({ length: item.length }, (_, index) => Object.hasOwn(descriptors, index)).every(Boolean))) return false;
    active.add(item);
    for (const key of keys as string[]) {
      if (array && key === "length") continue;
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value") || !visit(descriptor.value, depth + 1)) return false;
    }
    active.delete(item);
    return true;
  }
  try { return visit(value, 0); } catch { return false; }
}
function cyclic(edges: readonly (readonly [string, string])[]): boolean {
  const links = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const [from, to] of edges) {
    const destinations = links.get(from) ?? [];
    destinations.push(to);
    links.set(from, destinations);
    incoming.set(from, incoming.get(from) ?? 0);
    incoming.set(to, (incoming.get(to) ?? 0) + 1);
  }
  const ready = [...incoming].filter(([, count]) => count === 0).map(([node]) => node);
  for (let index = 0; index < ready.length; index += 1) {
    for (const destination of links.get(ready[index]) ?? []) {
      const count = incoming.get(destination)! - 1;
      incoming.set(destination, count);
      if (count === 0) ready.push(destination);
    }
  }
  return ready.length !== incoming.size;
}
