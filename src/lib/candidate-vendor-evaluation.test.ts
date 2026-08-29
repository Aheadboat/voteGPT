import { describe, expect, it } from "vitest";

import syntheticVendorFixture from "../../tests/fixtures/g1-candidate-vendor-synthetic.json";

import * as candidateVendorEvaluationModule from "./candidate-vendor-evaluation";
import {
  type CandidateVendorRecord,
  evaluateCandidateVendor,
  normalizeCandidateName,
  serializeCandidateVendorEvaluation,
  validateCandidateComparisonSet,
  validateCandidateParticipation,
} from "./candidate-vendor-evaluation";

function validCandidateParticipation() {
  return {
    record_key: "us-ca-12-2024-general-avery-example",
    contest_key: "us-ca-12-2024-general",
    candidate_name: "Avery Example",
    official_ids: [
      {
        issuer: "California Secretary of State",
        namespace: "candidate_list_id",
        value: "2024-general-ca-12-avery-example",
      },
    ],
    reviewed_aliases: [],
    jurisdiction: "ocd-division/country:us/state:ca/cd:12",
    election_date: "2024-11-05",
    office: "United States Representative",
    district: "12",
    level: "federal",
    stage: "general",
    sample_stratum: "ordinary",
    lifecycle_status: "qualified",
    ballot_appearance: "printed",
    party_lines: ["Democratic"],
    sources: [
      {
        url: "https://elections.example.gov/2024/general/candidates.pdf",
        source_type: "official_ballot",
        retrieved_at: "2026-08-15T12:00:00Z",
        effective_at: "2024-08-29T17:00:00-07:00",
        effective_time_reason: null,
        locator: "page 12, United States Representative District 12",
        sha256:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ],
  };
}

function candidateParticipationWith(overrides: Record<string, unknown>) {
  return { ...validCandidateParticipation(), ...overrides };
}

function candidateParticipationWithout(key: string) {
  const value: Record<string, unknown> = validCandidateParticipation();
  delete value[key];
  return value;
}

function validSource() {
  return validCandidateParticipation().sources[0]!;
}

function sourceWith(overrides: Record<string, unknown>) {
  return { ...validSource(), ...overrides };
}

function sourceWithout(key: string) {
  const value: Record<string, unknown> = validSource();
  delete value[key];
  return value;
}

function validAlias() {
  const source = validSource();
  return {
    name: "Avery Q. Example",
    source_url: source.url,
    locator: source.locator,
  };
}

function aliasWith(overrides: Record<string, unknown>) {
  return { ...validAlias(), ...overrides };
}

function aliasWithout(key: string) {
  const value: Record<string, unknown> = validAlias();
  delete value[key];
  return value;
}

function arrayWithExtraKey<T>(values: T[], key: string | symbol) {
  Object.defineProperty(values, key, {
    configurable: true,
    enumerable: true,
    value: true,
  });
  return values;
}

function arrayWithOwnIterator<TStored, TYielded>(
  stored: TStored[],
  yielded: readonly TYielded[],
) {
  Object.defineProperty(stored, Symbol.iterator, {
    configurable: true,
    value: function* () {
      for (const value of yielded) {
        yield value;
      }
    },
  });
  return stored;
}

function arrayWithInheritedIndex<T>(value: T) {
  const values = new Array(1);
  const prototype = Object.create(Array.prototype) as Record<string, unknown>;
  prototype[0] = value;
  Object.setPrototypeOf(values, prototype);
  return values;
}

function arrayWithAccessorIndex<T>(value: T) {
  const values = [value];
  Object.defineProperty(values, "0", {
    configurable: true,
    enumerable: true,
    get: () => value,
  });
  return values;
}

type TestLevel = "federal" | "state" | "local";
type TestStage = "primary" | "general";
type TestStratum =
  | "ordinary"
  | "nonpartisan"
  | "write_in"
  | "cross_filed"
  | "withdrawn"
  | "disqualified";
type TestCandidateParticipation = Omit<
  ReturnType<typeof validCandidateParticipation>,
  "reviewed_aliases"
> & {
  reviewed_aliases: ReturnType<typeof validAlias>[];
};
type TestAuthority = {
  authority_id: string;
  authority_name: string;
  authority_level: string;
  state_code: string;
};
type TestAuthorityAssignment = {
  record_key: string;
  authority_id: string;
  source_url: string;
  locator: string;
};
type TestManifestCell = {
  level: string;
  stage: string;
  eligible_record_keys: string[];
};
type TestComparisonSet = {
  as_of: string;
  records: TestCandidateParticipation[];
  authorities: TestAuthority[];
  authority_assignments: TestAuthorityAssignment[];
  ordinary_control_manifest: TestManifestCell[];
};

const comparisonCellSpecs = [
  {
    level: "federal",
    stage: "primary",
    eligible: [
      "ordinary-federal-primary-01",
      "ordinary-federal-primary-02",
      "ordinary-federal-primary-03",
      "ordinary-federal-primary-04",
      "ordinary-federal-primary-05",
      "ordinary-federal-primary-06",
      "ordinary-federal-primary-07",
      "ordinary-federal-primary-08",
      "ordinary-federal-primary-09",
    ],
    ordinary: [
      "ordinary-federal-primary-08",
      "ordinary-federal-primary-02",
      "ordinary-federal-primary-09",
      "ordinary-federal-primary-04",
      "ordinary-federal-primary-03",
      "ordinary-federal-primary-07",
      "ordinary-federal-primary-06",
      "ordinary-federal-primary-01",
    ],
    edges: [
      ["nonpartisan", 1],
      ["write_in", 2],
      ["cross_filed", 2],
      ["withdrawn", 2],
      ["disqualified", 2],
    ],
  },
  {
    level: "federal",
    stage: "general",
    eligible: [
      "ordinary-federal-general-01",
      "ordinary-federal-general-02",
      "ordinary-federal-general-03",
      "ordinary-federal-general-04",
      "ordinary-federal-general-05",
      "ordinary-federal-general-06",
      "ordinary-federal-general-07",
      "ordinary-federal-general-08",
      "ordinary-federal-general-09",
      "ordinary-federal-general-10",
    ],
    ordinary: [
      "ordinary-federal-general-04",
      "ordinary-federal-general-10",
      "ordinary-federal-general-01",
      "ordinary-federal-general-02",
      "ordinary-federal-general-09",
      "ordinary-federal-general-06",
      "ordinary-federal-general-03",
      "ordinary-federal-general-08",
      "ordinary-federal-general-07",
    ],
    edges: [
      ["nonpartisan", 1],
      ["write_in", 2],
      ["cross_filed", 2],
      ["withdrawn", 2],
      ["disqualified", 1],
    ],
  },
  {
    level: "state",
    stage: "primary",
    eligible: [
      "ordinary-state-primary-01",
      "ordinary-state-primary-02",
      "ordinary-state-primary-03",
      "ordinary-state-primary-04",
      "ordinary-state-primary-05",
      "ordinary-state-primary-06",
      "ordinary-state-primary-07",
      "ordinary-state-primary-08",
      "ordinary-state-primary-09",
      "ordinary-state-primary-10",
    ],
    ordinary: [
      "ordinary-state-primary-09",
      "ordinary-state-primary-10",
      "ordinary-state-primary-01",
      "ordinary-state-primary-02",
      "ordinary-state-primary-08",
      "ordinary-state-primary-03",
      "ordinary-state-primary-04",
      "ordinary-state-primary-07",
      "ordinary-state-primary-06",
    ],
    edges: [
      ["nonpartisan", 2],
      ["write_in", 1],
      ["cross_filed", 2],
      ["withdrawn", 2],
      ["disqualified", 1],
    ],
  },
  {
    level: "state",
    stage: "general",
    eligible: [
      "ordinary-state-general-01",
      "ordinary-state-general-02",
      "ordinary-state-general-03",
      "ordinary-state-general-04",
      "ordinary-state-general-05",
      "ordinary-state-general-06",
      "ordinary-state-general-07",
      "ordinary-state-general-08",
      "ordinary-state-general-09",
    ],
    ordinary: [
      "ordinary-state-general-01",
      "ordinary-state-general-09",
      "ordinary-state-general-05",
      "ordinary-state-general-08",
      "ordinary-state-general-03",
      "ordinary-state-general-04",
      "ordinary-state-general-06",
      "ordinary-state-general-02",
    ],
    edges: [
      ["nonpartisan", 2],
      ["write_in", 1],
      ["cross_filed", 2],
      ["withdrawn", 1],
      ["disqualified", 2],
    ],
  },
  {
    level: "local",
    stage: "primary",
    eligible: [
      "ordinary-local-primary-01",
      "ordinary-local-primary-02",
      "ordinary-local-primary-03",
      "ordinary-local-primary-04",
      "ordinary-local-primary-05",
      "ordinary-local-primary-06",
      "ordinary-local-primary-07",
      "ordinary-local-primary-08",
      "ordinary-local-primary-09",
    ],
    ordinary: [
      "ordinary-local-primary-06",
      "ordinary-local-primary-09",
      "ordinary-local-primary-01",
      "ordinary-local-primary-04",
      "ordinary-local-primary-07",
      "ordinary-local-primary-02",
      "ordinary-local-primary-05",
      "ordinary-local-primary-03",
    ],
    edges: [
      ["nonpartisan", 2],
      ["write_in", 2],
      ["cross_filed", 1],
      ["withdrawn", 1],
      ["disqualified", 2],
    ],
  },
  {
    level: "local",
    stage: "general",
    eligible: [
      "ordinary-local-general-01",
      "ordinary-local-general-02",
      "ordinary-local-general-03",
      "ordinary-local-general-04",
      "ordinary-local-general-05",
      "ordinary-local-general-06",
      "ordinary-local-general-07",
      "ordinary-local-general-08",
      "ordinary-local-general-09",
    ],
    ordinary: [
      "ordinary-local-general-04",
      "ordinary-local-general-05",
      "ordinary-local-general-08",
      "ordinary-local-general-09",
      "ordinary-local-general-07",
      "ordinary-local-general-03",
      "ordinary-local-general-01",
      "ordinary-local-general-02",
    ],
    edges: [
      ["nonpartisan", 2],
      ["write_in", 2],
      ["cross_filed", 1],
      ["withdrawn", 2],
      ["disqualified", 2],
    ],
  },
] as const satisfies readonly {
  level: TestLevel;
  stage: TestStage;
  eligible: readonly string[];
  ordinary: readonly string[];
  edges: readonly (readonly [Exclude<TestStratum, "ordinary">, number])[];
}[];

const authorityStates = [
  "CT",
  "NY",
  "IL",
  "IA",
  "CA",
  "WA",
  "TX",
  "FL",
  "CO",
  "GA",
] as const;

function syntheticStratumState(
  stratum: TestStratum,
  withdrawnAppearance: "printed" | "not_on_ballot",
) {
  switch (stratum) {
    case "nonpartisan":
      return {
        lifecycle_status: "qualified",
        ballot_appearance: "printed",
        party_lines: [],
      };
    case "write_in":
      return {
        lifecycle_status: "qualified",
        ballot_appearance: "write_in",
        party_lines: [],
      };
    case "cross_filed":
      return {
        lifecycle_status: "qualified",
        ballot_appearance: "printed",
        party_lines: ["Party A", "Party B"],
      };
    case "withdrawn":
      return {
        lifecycle_status: "withdrawn",
        ballot_appearance: withdrawnAppearance,
        party_lines: ["Independent"],
      };
    case "disqualified":
      return {
        lifecycle_status: "disqualified",
        ballot_appearance: "not_on_ballot",
        party_lines: ["Independent"],
      };
    default:
      return {
        lifecycle_status: "qualified",
        ballot_appearance: "printed",
        party_lines: ["Party A"],
      };
  }
}

function syntheticCandidateParticipation(
  recordKey: string,
  level: TestLevel,
  stage: TestStage,
  stratum: TestStratum,
  sequence: number,
  authority: TestAuthority,
  withdrawnAppearance: "printed" | "not_on_ballot",
): TestCandidateParticipation {
  const base = validCandidateParticipation();
  const state = syntheticStratumState(stratum, withdrawnAppearance);
  const sourceUrl = `https://${authority.authority_id}.example.gov/candidates`;
  return {
    ...base,
    record_key: recordKey,
    contest_key: `contest-${recordKey}`,
    candidate_name: `Candidate ${sequence + 1}`,
    official_ids: [
      {
        issuer: authority.authority_name,
        namespace: "candidate",
        value: recordKey,
      },
    ],
    jurisdiction: `ocd-division/country:us/state:${authority.state_code.toLowerCase()}/place:${sequence + 1}`,
    election_date: stage === "primary" ? "2024-06-04" : "2024-11-05",
    office: `Office ${sequence + 1}`,
    district: String(sequence + 1),
    level,
    stage,
    sample_stratum: stratum,
    ...state,
    sources: [
      {
        ...base.sources[0]!,
        url: sourceUrl,
        locator: `record ${recordKey}`,
        sha256: sequence.toString(16).padStart(64, "0"),
      },
    ],
  };
}

function validCandidateComparisonSet(): TestComparisonSet {
  const authorities = authorityStates.map((stateCode, index) => ({
    authority_id: `authority-${index + 1}`,
    authority_name: `Local Election Authority ${index + 1}`,
    authority_level: "local",
    state_code: stateCode,
  }));
  const records: TestCandidateParticipation[] = [];
  const authorityAssignments: TestAuthorityAssignment[] = [];
  let sequence = 0;
  let withdrawnCount = 0;

  const appendRecord = (
    recordKey: string,
    level: TestLevel,
    stage: TestStage,
    stratum: TestStratum,
  ) => {
    const authority = authorities[sequence % authorities.length]!;
    const withdrawnAppearance =
      stratum === "withdrawn" && withdrawnCount >= 5
        ? "not_on_ballot"
        : "printed";
    const row = syntheticCandidateParticipation(
      recordKey,
      level,
      stage,
      stratum,
      sequence,
      authority,
      withdrawnAppearance,
    );
    if (stratum === "withdrawn") {
      withdrawnCount += 1;
    }
    const source = row.sources[0]!;
    records.push(row);
    authorityAssignments.push({
      record_key: row.record_key,
      authority_id: authority.authority_id,
      source_url: source.url,
      locator: source.locator,
    });
    sequence += 1;
  };

  for (const cell of comparisonCellSpecs) {
    for (const recordKey of cell.ordinary) {
      appendRecord(recordKey, cell.level, cell.stage, "ordinary");
    }
    for (const [stratum, count] of cell.edges) {
      for (let index = 0; index < count; index += 1) {
        appendRecord(
          `edge-${cell.level}-${cell.stage}-${stratum}-${String(index + 1).padStart(2, "0")}`,
          cell.level,
          cell.stage,
          stratum,
        );
      }
    }
  }

  return {
    as_of: "2026-08-15T12:00:00Z",
    records,
    authorities,
    authority_assignments: authorityAssignments,
    ordinary_control_manifest: comparisonCellSpecs.map((cell) => ({
      level: cell.level,
      stage: cell.stage,
      eligible_record_keys: [...cell.eligible],
    })),
  };
}

function recordIndex(
  value: TestComparisonSet,
  level: TestLevel,
  stage: TestStage,
  stratum: TestStratum,
  occurrence = 0,
) {
  let remaining = occurrence;
  for (let index = 0; index < value.records.length; index += 1) {
    const row = value.records[index]!;
    if (
      row.level === level &&
      row.stage === stage &&
      row.sample_stratum === stratum
    ) {
      if (remaining === 0) {
        return index;
      }
      remaining -= 1;
    }
  }
  throw new Error("missing synthetic record");
}

function manifestCell(
  value: TestComparisonSet,
  level: TestLevel,
  stage: TestStage,
) {
  const cell = value.ordinary_control_manifest.find(
    (candidate) => candidate.level === level && candidate.stage === stage,
  );
  if (cell === undefined) {
    throw new Error("missing synthetic manifest cell");
  }
  return cell;
}

function copyContest(
  target: TestCandidateParticipation,
  source: TestCandidateParticipation,
) {
  target.contest_key = source.contest_key;
  target.jurisdiction = source.jurisdiction;
  target.election_date = source.election_date;
  target.office = source.office;
  target.district = source.district;
  target.level = source.level;
  target.stage = source.stage;
}

const syntheticVendorTemplate = syntheticVendorFixture.records[0]!;

function vendorRecordFor(
  truth: TestCandidateParticipation,
  index: number,
  overrides: Partial<CandidateVendorRecord> = {},
): CandidateVendorRecord {
  return {
    vendor_record_id: `vendor-${String(index + 1).padStart(3, "0")}`,
    contest_key: truth.contest_key,
    candidate_name: truth.candidate_name,
    official_ids: truth.official_ids.map((value) => ({ ...value })),
    jurisdiction: truth.jurisdiction,
    election_date: truth.election_date,
    office: truth.office,
    district: truth.district,
    level: truth.level as CandidateVendorRecord["level"],
    stage: truth.stage as CandidateVendorRecord["stage"],
    lifecycle_status:
      truth.lifecycle_status as CandidateVendorRecord["lifecycle_status"],
    ballot_appearance:
      truth.ballot_appearance as CandidateVendorRecord["ballot_appearance"],
    party_lines: [...truth.party_lines],
    sources: syntheticVendorTemplate.sources.map((source) => ({ ...source })),
    ...overrides,
  };
}

function validVendorRecords(truth = validCandidateComparisonSet()) {
  return truth.records.map((record, index) => vendorRecordFor(record, index));
}

function diagnosticCodes(result: ReturnType<typeof evaluateCandidateVendor>) {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function evaluateCandidateVendorWithoutThrow(truth: unknown, vendor: unknown) {
  let result: ReturnType<typeof evaluateCandidateVendor> | undefined;
  expect(() => {
    result = evaluateCandidateVendor(truth, vendor);
  }).not.toThrow();
  if (result === undefined) {
    throw new Error("candidate vendor evaluation did not return");
  }
  return result;
}

describe("normalizeCandidateName", () => {
  it.each([
    ["  JOSÉ\u00a0O’Neil, JR.  ", "josé o’neil, jr."],
    ["Ａvery\u2003Van Buren", "avery van buren"],
    ["\u0085Avery\u0085Example\u0085", "avery example"],
    ["\uFEFFAvery\uFEFFExample\uFEFF", "avery example"],
  ])("normalizes %j without losing name meaning", (value, expected) => {
    expect(normalizeCandidateName(value)).toBe(expected);
  });
});

describe("validateCandidateParticipation", () => {
  it("accepts one complete official candidate participation row", () => {
    expect(validateCandidateParticipation(validCandidateParticipation())).toBe(
      true,
    );
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "candidate"],
    ["a missing required key", candidateParticipationWithout("district")],
    [
      "an extra top-level key",
      candidateParticipationWith({ unexpected: true }),
    ],
  ])("rejects %s", (_label, value) => {
    expect(validateCandidateParticipation(value)).toBe(false);
  });

  it("returns false instead of throwing for hostile unknown input", () => {
    const value = Object.defineProperty(
      validCandidateParticipation(),
      "sources",
      {
        enumerable: true,
        get() {
          throw new Error("hostile getter");
        },
      },
    );

    expect(validateCandidateParticipation(value)).toBe(false);
  });

  it("accepts a null-prototype data record", () => {
    const value = Object.assign(
      Object.create(null) as Record<string, unknown>,
      validCandidateParticipation(),
    );

    expect(validateCandidateParticipation(value)).toBe(true);
  });

  it("accepts null-prototype data records at nested schema levels", () => {
    const source = Object.assign(
      Object.create(null) as Record<string, unknown>,
      validSource(),
    );
    const officialId = Object.assign(
      Object.create(null) as Record<string, unknown>,
      validCandidateParticipation().official_ids[0]!,
    );
    const alias = Object.assign(
      Object.create(null) as Record<string, unknown>,
      validAlias(),
    );

    expect(
      validateCandidateParticipation(
        candidateParticipationWith({
          official_ids: [officialId],
          reviewed_aliases: [alias],
          sources: [source],
        }),
      ),
    ).toBe(true);
  });

  it.each([
    [
      "a custom record prototype",
      () =>
        Object.assign(
          Object.create({ inherited: true }) as Record<string, unknown>,
          validCandidateParticipation(),
        ),
    ],
    [
      "a symbol-keyed top-level extra",
      () => {
        const value = validCandidateParticipation();
        Object.defineProperty(value, Symbol("unexpected"), {
          enumerable: true,
          value: true,
        });
        return value;
      },
    ],
    [
      "a non-enumerable top-level extra",
      () => {
        const value = validCandidateParticipation();
        Object.defineProperty(value, "unexpected", { value: true });
        return value;
      },
    ],
    [
      "a getter-backed required value",
      () => {
        const value = validCandidateParticipation();
        Object.defineProperty(value, "candidate_name", {
          enumerable: true,
          get: () => "Avery Example",
        });
        return value;
      },
    ],
    [
      "a changing getter-backed required value",
      () => {
        const value = validCandidateParticipation();
        let reads = 0;
        Object.defineProperty(value, "candidate_name", {
          enumerable: true,
          get: () => (++reads === 1 ? "Avery Example" : "Another Example"),
        });
        return value;
      },
    ],
    [
      "a getter-backed nested source value",
      () => {
        const source = validSource();
        Object.defineProperty(source, "url", {
          enumerable: true,
          get: () =>
            "https://elections.example.gov/2024/general/candidates.pdf",
        });
        return candidateParticipationWith({ sources: [source] });
      },
    ],
    [
      "a symbol-keyed nested source extra",
      () => {
        const source = validSource();
        Object.defineProperty(source, Symbol("unexpected"), {
          enumerable: true,
          value: true,
        });
        return candidateParticipationWith({ sources: [source] });
      },
    ],
  ])("rejects %s", (_label, makeValue) => {
    expect(validateCandidateParticipation(makeValue())).toBe(false);
  });

  it("rejects an inherited substitution for a required key", () => {
    const value = Object.assign(
      Object.create({ district: "12" }) as Record<string, unknown>,
      candidateParticipationWithout("district"),
    );

    expect(validateCandidateParticipation(value)).toBe(false);
  });

  it.each([
    [
      "sources",
      () =>
        candidateParticipationWith({
          sources: arrayWithExtraKey([validSource()], "unexpected"),
        }),
    ],
    [
      "official_ids",
      () =>
        candidateParticipationWith({
          official_ids: arrayWithExtraKey(
            [validCandidateParticipation().official_ids[0]!],
            "unexpected",
          ),
        }),
    ],
    [
      "reviewed_aliases",
      () =>
        candidateParticipationWith({
          reviewed_aliases: arrayWithExtraKey([validAlias()], "unexpected"),
        }),
    ],
    [
      "party_lines",
      () =>
        candidateParticipationWith({
          party_lines: arrayWithExtraKey(["Democratic"], "unexpected"),
        }),
    ],
  ])("rejects custom string keys on %s", (_label, makeValue) => {
    expect(validateCandidateParticipation(makeValue())).toBe(false);
  });

  it.each([
    [
      "sources",
      () =>
        candidateParticipationWith({
          sources: arrayWithExtraKey([validSource()], Symbol("unexpected")),
        }),
    ],
    [
      "official_ids",
      () =>
        candidateParticipationWith({
          official_ids: arrayWithExtraKey(
            [validCandidateParticipation().official_ids[0]!],
            Symbol("unexpected"),
          ),
        }),
    ],
    [
      "reviewed_aliases",
      () =>
        candidateParticipationWith({
          reviewed_aliases: arrayWithExtraKey(
            [validAlias()],
            Symbol("unexpected"),
          ),
        }),
    ],
    [
      "party_lines",
      () =>
        candidateParticipationWith({
          party_lines: arrayWithExtraKey(["Democratic"], Symbol("unexpected")),
        }),
    ],
  ])("rejects custom symbol keys on %s", (_label, makeValue) => {
    expect(validateCandidateParticipation(makeValue())).toBe(false);
  });

  it.each([
    [
      "sources",
      () =>
        candidateParticipationWith({
          sources: arrayWithOwnIterator([null], [validSource()]),
        }),
    ],
    [
      "official_ids",
      () =>
        candidateParticipationWith({
          official_ids: arrayWithOwnIterator(
            [null],
            [validCandidateParticipation().official_ids[0]!],
          ),
        }),
    ],
    [
      "reviewed_aliases",
      () =>
        candidateParticipationWith({
          reviewed_aliases: arrayWithOwnIterator([null], []),
        }),
    ],
    [
      "party_lines",
      () =>
        candidateParticipationWith({
          party_lines: arrayWithOwnIterator([null], ["Democratic"]),
        }),
    ],
  ])("rejects an input-owned iterator on %s", (_label, makeValue) => {
    expect(validateCandidateParticipation(makeValue())).toBe(false);
  });

  it.each([
    [
      "sources",
      () =>
        candidateParticipationWith({
          sources: arrayWithAccessorIndex(validSource()),
        }),
    ],
    [
      "official_ids",
      () =>
        candidateParticipationWith({
          official_ids: arrayWithAccessorIndex(
            validCandidateParticipation().official_ids[0]!,
          ),
        }),
    ],
    [
      "reviewed_aliases",
      () =>
        candidateParticipationWith({
          reviewed_aliases: arrayWithAccessorIndex(validAlias()),
        }),
    ],
    [
      "party_lines",
      () =>
        candidateParticipationWith({
          party_lines: arrayWithAccessorIndex("Democratic"),
        }),
    ],
  ])("rejects an accessor index on %s", (_label, makeValue) => {
    expect(validateCandidateParticipation(makeValue())).toBe(false);
  });

  it.each([
    [
      "sources",
      () =>
        candidateParticipationWith({
          sources: arrayWithInheritedIndex(validSource()),
        }),
    ],
    [
      "official_ids",
      () =>
        candidateParticipationWith({
          official_ids: arrayWithInheritedIndex(
            validCandidateParticipation().official_ids[0]!,
          ),
        }),
    ],
    [
      "reviewed_aliases",
      () =>
        candidateParticipationWith({
          reviewed_aliases: arrayWithInheritedIndex(validAlias()),
        }),
    ],
    [
      "party_lines",
      () =>
        candidateParticipationWith({
          party_lines: arrayWithInheritedIndex("Democratic"),
        }),
    ],
  ])("rejects a prototype-filled hole in %s", (_label, makeValue) => {
    expect(validateCandidateParticipation(makeValue())).toBe(false);
  });

  it("rejects a proxy-filled sparse source array", () => {
    const sources = new Proxy(new Array(1), {
      get(target, key, receiver) {
        return key === "0" ? validSource() : Reflect.get(target, key, receiver);
      },
    });

    expect(
      validateCandidateParticipation(candidateParticipationWith({ sources })),
    ).toBe(false);
  });

  it("returns false when a proxy throws during structural reflection", () => {
    const value = new Proxy(validCandidateParticipation(), {
      getPrototypeOf() {
        throw new Error("hostile prototype trap");
      },
    });

    expect(validateCandidateParticipation(value)).toBe(false);
  });

  it.each([
    [
      "top-level candidate value",
      () =>
        new Proxy(validCandidateParticipation(), {
          get(target, key, receiver) {
            if (key === "candidate_name") {
              return "\uFEFF";
            }
            return Reflect.get(target, key, receiver);
          },
        }),
    ],
    [
      "nested source value",
      () => {
        const source = new Proxy(validSource(), {
          get(target, key, receiver) {
            if (key === "url") {
              return "http://untrusted.example/source";
            }
            return Reflect.get(target, key, receiver);
          },
        });
        return candidateParticipationWith({ sources: [source] });
      },
    ],
  ])("rejects a deceptive %s proxy", (_label, makeValue) => {
    expect(validateCandidateParticipation(makeValue())).toBe(false);
  });

  it.each([
    "record_key",
    "contest_key",
    "candidate_name",
    "jurisdiction",
    "office",
    "district",
  ])("rejects a blank %s", (key) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ [key]: "  " }),
      ),
    ).toBe(false);
  });

  it.each([
    ["candidate_name", "\u0085"],
    ["candidate_name", "\uFEFF"],
    ["district", "\uFEFF"],
  ])("rejects a %s containing only normalization whitespace", (key, value) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ [key]: value }),
      ),
    ).toBe(false);
  });

  it.each([
    ["level", "county"],
    ["stage", "runoff"],
    ["sample_stratum", "incumbent"],
    ["lifecycle_status", "declared"],
    ["ballot_appearance", "unknown"],
  ])("rejects an unknown %s", (key, value) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ [key]: value }),
      ),
    ).toBe(false);
  });

  it.each(["2024-2-05", "2023-02-29", "2024-04-31", "not-a-date"])(
    "rejects invalid election date %s",
    (electionDate) => {
      expect(
        validateCandidateParticipation(
          candidateParticipationWith({ election_date: electionDate }),
        ),
      ).toBe(false);
    },
  );

  it.each([
    ["official_ids", {}],
    ["reviewed_aliases", null],
    ["party_lines", "Democratic"],
    ["sources", {}],
  ])("rejects a non-array %s", (key, value) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ [key]: value }),
      ),
    ).toBe(false);
  });

  it.each([
    "official_election_authority",
    "official_ballot",
    "official_court_record",
  ])("accepts %s provenance", (sourceType) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({
          sources: [sourceWith({ source_type: sourceType })],
        }),
      ),
    ).toBe(true);
  });

  it("accepts an official source whose effective time was not published", () => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({
          sources: [
            sourceWith({
              effective_at: null,
              effective_time_reason: "not_published",
            }),
          ],
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["no sources", []],
    ["a sparse source array", new Array(1)],
    ["a non-object source", ["official source"]],
    ["an extra source key", [sourceWith({ title: "Candidate list" })]],
    ["a missing source key", [sourceWithout("locator")]],
    [
      "an insecure source URL",
      [sourceWith({ url: "http://elections.example.gov/list" })],
    ],
    ["a malformed source URL", [sourceWith({ url: "https://" })]],
    [
      "a repaired single-slash source URL",
      [sourceWith({ url: "https:/elections.example.gov/list" })],
    ],
    [
      "a repaired empty-authority source URL",
      [sourceWith({ url: "https:////elections.example.gov/list" })],
    ],
    [
      "a repaired backslash source URL",
      [sourceWith({ url: "https://elections.example.gov\\official/list" })],
    ],
    ["a bare percent escape", [sourceWith({ url: "https://example.gov/%" })]],
    [
      "an incomplete percent escape",
      [sourceWith({ url: "https://example.gov/%2" })],
    ],
    [
      "a non-hex percent escape",
      [sourceWith({ url: "https://example.gov/%zz" })],
    ],
    ["a raw angle tag", [sourceWith({ url: "https://example.gov/<tag>" })]],
    ["raw double quotes", [sourceWith({ url: 'https://example.gov/"quote"' })]],
    ["raw braces", [sourceWith({ url: "https://example.gov/{x}" })]],
    ["a raw vertical bar", [sourceWith({ url: "https://example.gov/|x" })]],
    ["a raw caret", [sourceWith({ url: "https://example.gov/^x" })]],
    [
      "a rewritten double-at userinfo authority",
      [sourceWith({ url: "https://user@@example.gov/path" })],
    ],
    [
      "a username authority",
      [sourceWith({ url: "https://user@example.gov/path" })],
    ],
    [
      "a username and password authority",
      [sourceWith({ url: "https://user:pass@example.gov/path" })],
    ],
    [
      "a second raw fragment delimiter",
      [sourceWith({ url: "https://example.gov/path#first#second" })],
    ],
    [
      "raw brackets in the path",
      [sourceWith({ url: "https://example.gov/[candidate]" })],
    ],
    [
      "raw brackets in the query",
      [sourceWith({ url: "https://example.gov/path?candidate=[avery]" })],
    ],
    [
      "raw brackets in the fragment",
      [sourceWith({ url: "https://example.gov/path#[candidate]" })],
    ],
    [
      "source URL whitespace",
      [sourceWith({ url: " https://elections.example.gov/list " })],
    ],
    [
      "a source URL hostname tab",
      [sourceWith({ url: "https://elections.exam\tple.gov/list" })],
    ],
    [
      "a source URL path control",
      [sourceWith({ url: "https://elections.example.gov/\nlist" })],
    ],
    ["a blank source locator", [sourceWith({ locator: "\u2003" })]],
    ["an uppercase SHA-256", [sourceWith({ sha256: "A".repeat(64) })]],
    ["a short SHA-256", [sourceWith({ sha256: "a".repeat(63) })]],
    ["a non-hex SHA-256", [sourceWith({ sha256: "g".repeat(64) })]],
  ])("rejects %s", (_label, sources) => {
    expect(
      validateCandidateParticipation(candidateParticipationWith({ sources })),
    ).toBe(false);
  });

  it.each([
    "https://example.gov/%25/%7Btag%7D?q=%22quote%22#encoded",
    "https://example.gov/candidates?office=mayor&name=avery#ballot",
    "https://[2001:db8::1]/candidates",
    "https://example.gov/a%5Bb%5D;v=1:@!$&'()*+,=?q=/?:@!$&'()*+,;=#frag/?:@!$&'()*+,;=",
  ])("accepts an RFC 3986-compatible source URL %s", (url) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ sources: [sourceWith({ url })] }),
      ),
    ).toBe(true);
  });

  it.each([
    "2026-08-15",
    "2026-02-30T12:00:00Z",
    "2026-08-15T24:00:00Z",
    "2026-08-15T12:60:00Z",
    "2024-12-31T23:59:60Z",
    "2026-08-15T12:00:00",
    "2026-08-15T12:00:00+24:00",
    "2023-02-29T12:00:00Z",
    "1900-02-29T12:00:00Z",
  ])("rejects invalid retrieved_at %s", (retrievedAt) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({
          sources: [sourceWith({ retrieved_at: retrievedAt })],
        }),
      ),
    ).toBe(false);
  });

  it.each([
    ["2000-02-29t23:59:59.123456z", "2000-02-29T01:02:03.4+05:45"],
    ["2024-02-29T23:59:59-07:30", "2024-02-29t01:02:03z"],
  ])(
    "accepts RFC 3339 retrieved %s and effective %s",
    (retrievedAt, effectiveAt) => {
      expect(
        validateCandidateParticipation(
          candidateParticipationWith({
            sources: [
              sourceWith({
                retrieved_at: retrievedAt,
                effective_at: effectiveAt,
              }),
            ],
          }),
        ),
      ).toBe(true);
    },
  );

  it.each([
    ["an invalid published effective time", "2024-02-30T12:00:00Z", null],
    ["no effective-time value or reason", null, null],
    [
      "both an effective time and absence reason",
      "2024-08-29T17:00:00Z",
      "not_published",
    ],
    ["an unknown effective-time reason", null, "unknown"],
  ])("rejects a source with %s", (_label, effectiveAt, reason) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({
          sources: [
            sourceWith({
              effective_at: effectiveAt,
              effective_time_reason: reason,
            }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it("accepts a row with no official identifier", () => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ official_ids: [] }),
      ),
    ).toBe(true);
  });

  it("scopes official identifier uniqueness to the exact triple", () => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({
          official_ids: [
            {
              issuer: "California Secretary of State",
              namespace: "candidate_list_id",
              value: "candidate-1",
            },
            {
              issuer: "California Secretary of State",
              namespace: "filing_id",
              value: "candidate-1",
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["a sparse official identifier array", new Array(1)],
    ["a non-object official identifier", ["candidate-1"]],
    [
      "an extra official identifier key",
      [{ issuer: "Board", namespace: "candidate", value: "1", extra: true }],
    ],
    ["a missing official identifier key", [{ issuer: "Board", value: "1" }]],
    [
      "a blank official identifier issuer",
      [{ issuer: " ", namespace: "candidate", value: "1" }],
    ],
    [
      "a blank official identifier namespace",
      [{ issuer: "Board", namespace: " ", value: "1" }],
    ],
    [
      "a blank official identifier value",
      [{ issuer: "Board", namespace: "candidate", value: "\u00a0" }],
    ],
    [
      "a duplicate official identifier triple",
      [
        { issuer: "Board", namespace: "candidate", value: "1" },
        { issuer: "Board", namespace: "candidate", value: "1" },
      ],
    ],
  ])("rejects %s", (_label, officialIds) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ official_ids: officialIds }),
      ),
    ).toBe(false);
  });

  it("accepts an ordinary row with no party line", () => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ party_lines: [] }),
      ),
    ).toBe(true);
  });

  it.each([
    ["a non-string party line", [42]],
    ["a sparse party-line array", new Array(1)],
    ["a blank party line", ["\u2003"]],
    ["a duplicate party line", ["Independent", "Independent"]],
  ])("rejects %s", (_label, partyLines) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ party_lines: partyLines }),
      ),
    ).toBe(false);
  });

  it("accepts a reviewed alias bound to exactly one official source", () => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ reviewed_aliases: [validAlias()] }),
      ),
    ).toBe(true);
  });

  it.each([
    ["a sparse reviewed alias array", new Array(1)],
    ["a non-object alias", ["Avery Q. Example"]],
    ["an extra alias key", [aliasWith({ confidence: 1 })]],
    ["a missing alias key", [aliasWithout("locator")]],
    ["a blank alias name", [aliasWith({ name: "\u2003" })]],
    ["a blank alias source URL", [aliasWith({ source_url: " " })]],
    ["a blank alias locator", [aliasWith({ locator: "\u00a0" })]],
    ["an alias name containing only FEFF", [aliasWith({ name: "\uFEFF" })]],
    [
      "an alias whose URL is not a row source",
      [aliasWith({ source_url: "https://other.example.gov/candidates" })],
    ],
    [
      "an alias whose locator is not a row source locator",
      [aliasWith({ locator: "page 99" })],
    ],
    [
      "an alias equal to the normalized canonical name",
      [aliasWith({ name: "  \uff21VERY\u00a0EXAMPLE  " })],
    ],
    [
      "duplicate normalized aliases",
      [validAlias(), aliasWith({ name: "  \uff21VERY Q.\u2003EXAMPLE " })],
    ],
  ])("rejects %s", (_label, reviewedAliases) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ reviewed_aliases: reviewedAliases }),
      ),
    ).toBe(false);
  });

  it("rejects an alias bound ambiguously to duplicate source references", () => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({
          reviewed_aliases: [validAlias()],
          sources: [validSource(), { ...validSource() }],
        }),
      ),
    ).toBe(false);
  });

  it("rejects an alias combining one source URL with another source locator", () => {
    const sourceA = validSource();
    const sourceB = sourceWith({
      url: "https://elections.example.gov/2024/general/second-source.pdf",
      locator: "page 20",
      sha256: "b".repeat(64),
    });

    expect(
      validateCandidateParticipation(
        candidateParticipationWith({
          reviewed_aliases: [
            aliasWith({
              source_url: sourceA.url,
              locator: sourceB.locator,
            }),
          ],
          sources: [sourceA, sourceB],
        }),
      ),
    ).toBe(false);
  });

  it("does not trust a proxied source filter when binding an alias pair", () => {
    const sourceA = validSource();
    const sourceB = sourceWith({
      url: "https://elections.example.gov/2024/general/second-source.pdf",
      locator: "page 20",
      sha256: "b".repeat(64),
    });
    const sources = new Proxy([sourceA, sourceB], {
      get(target, key, receiver) {
        if (key === "filter") {
          return () => [sourceA];
        }
        return Reflect.get(target, key, receiver);
      },
    });

    expect(
      validateCandidateParticipation(
        candidateParticipationWith({
          reviewed_aliases: [
            aliasWith({
              source_url: sourceA.url,
              locator: sourceB.locator,
            }),
          ],
          sources,
        }),
      ),
    ).toBe(false);
  });

  it.each([
    ["federal", "general"],
    ["state", "primary"],
    ["local", "general"],
  ])("accepts a supported %s %s contest", (level, stage) => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ level, stage }),
      ),
    ).toBe(true);
  });

  it.each([
    ["ordinary", "qualified", "printed", ["Democratic"]],
    ["nonpartisan", "qualified", "printed", []],
    ["cross_filed", "qualified", "printed", ["Democratic", "Working Families"]],
    ["write_in", "qualified", "write_in", []],
    ["withdrawn", "withdrawn", "printed", ["Independent"]],
    ["withdrawn", "withdrawn", "not_on_ballot", ["Independent"]],
    ["disqualified", "disqualified", "not_on_ballot", ["Independent"]],
  ])(
    "accepts %s with %s lifecycle and %s appearance",
    (sampleStratum, lifecycleStatus, ballotAppearance, partyLines) => {
      expect(
        validateCandidateParticipation(
          candidateParticipationWith({
            sample_stratum: sampleStratum,
            lifecycle_status: lifecycleStatus,
            ballot_appearance: ballotAppearance,
            party_lines: partyLines,
          }),
        ),
      ).toBe(true);
    },
  );

  it.each([
    [
      "ordinary with a withdrawn lifecycle",
      "ordinary",
      "withdrawn",
      "printed",
      ["Democratic"],
    ],
    [
      "ordinary with write-in appearance",
      "ordinary",
      "qualified",
      "write_in",
      ["Democratic"],
    ],
    [
      "ordinary with a disqualified lifecycle",
      "ordinary",
      "disqualified",
      "printed",
      ["Democratic"],
    ],
    [
      "ordinary with not-on-ballot appearance",
      "ordinary",
      "qualified",
      "not_on_ballot",
      ["Democratic"],
    ],
    [
      "partisan nonpartisan",
      "nonpartisan",
      "qualified",
      "printed",
      ["Independent"],
    ],
    ["withdrawn nonpartisan", "nonpartisan", "withdrawn", "printed", []],
    ["write-in nonpartisan", "nonpartisan", "qualified", "write_in", []],
    ["disqualified nonpartisan", "nonpartisan", "disqualified", "printed", []],
    [
      "not-on-ballot nonpartisan",
      "nonpartisan",
      "qualified",
      "not_on_ballot",
      [],
    ],
    [
      "single-line cross-filed",
      "cross_filed",
      "qualified",
      "printed",
      ["Democratic"],
    ],
    [
      "withdrawn cross-filed",
      "cross_filed",
      "withdrawn",
      "printed",
      ["Democratic", "Working Families"],
    ],
    [
      "write-in cross-filed",
      "cross_filed",
      "qualified",
      "write_in",
      ["Democratic", "Working Families"],
    ],
    [
      "disqualified cross-filed",
      "cross_filed",
      "disqualified",
      "printed",
      ["Democratic", "Working Families"],
    ],
    [
      "not-on-ballot cross-filed",
      "cross_filed",
      "qualified",
      "not_on_ballot",
      ["Democratic", "Working Families"],
    ],
    ["withdrawn write-in", "write_in", "withdrawn", "write_in", []],
    ["printed write-in", "write_in", "qualified", "printed", []],
    ["disqualified write-in", "write_in", "disqualified", "write_in", []],
    ["not-on-ballot write-in", "write_in", "qualified", "not_on_ballot", []],
    [
      "qualified withdrawn",
      "withdrawn",
      "qualified",
      "printed",
      ["Independent"],
    ],
    [
      "write-in withdrawn",
      "withdrawn",
      "withdrawn",
      "write_in",
      ["Independent"],
    ],
    [
      "disqualified withdrawn",
      "withdrawn",
      "disqualified",
      "printed",
      ["Independent"],
    ],
    [
      "qualified disqualified",
      "disqualified",
      "qualified",
      "not_on_ballot",
      ["Independent"],
    ],
    [
      "printed disqualified",
      "disqualified",
      "disqualified",
      "printed",
      ["Independent"],
    ],
    [
      "withdrawn disqualified",
      "disqualified",
      "withdrawn",
      "not_on_ballot",
      ["Independent"],
    ],
    [
      "write-in disqualified",
      "disqualified",
      "disqualified",
      "write_in",
      ["Independent"],
    ],
  ])(
    "rejects %s stratum state",
    (_label, sampleStratum, lifecycleStatus, ballotAppearance, partyLines) => {
      expect(
        validateCandidateParticipation(
          candidateParticipationWith({
            sample_stratum: sampleStratum,
            lifecycle_status: lifecycleStatus,
            ballot_appearance: ballotAppearance,
            party_lines: partyLines,
          }),
        ),
      ).toBe(false);
    },
  );

  it("rejects FEC registration as ballot-qualification evidence", () => {
    expect(
      validateCandidateParticipation({
        record_key: "us-ca-12-2024-general-avery-example",
        contest_key: "us-ca-12-2024-general",
        candidate_name: "Avery Example",
        official_ids: [
          {
            issuer: "Federal Election Commission",
            namespace: "candidate_id",
            value: "H4CA12000",
          },
        ],
        reviewed_aliases: [],
        jurisdiction: "ocd-division/country:us/state:ca/cd:12",
        election_date: "2024-11-05",
        office: "United States Representative",
        district: "12",
        level: "federal",
        stage: "general",
        sample_stratum: "ordinary",
        lifecycle_status: "qualified",
        ballot_appearance: "printed",
        party_lines: ["Democratic"],
        sources: [
          {
            url: "https://www.fec.gov/data/candidate/H4CA12000/",
            source_type: "fec_registration",
            retrieved_at: "2026-08-15T12:00:00Z",
            effective_at: null,
            effective_time_reason: "not_published",
            locator: "candidate filing",
            sha256:
              "0000000000000000000000000000000000000000000000000000000000000000",
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("validateCandidateComparisonSet", () => {
  it("accepts the exact synthetic 100-row comparison set", () => {
    expect(validateCandidateComparisonSet(validCandidateComparisonSet())).toBe(
      true,
    );
  });

  it("rejects aggregate-only partial truth as the official comparison set", () => {
    expect(
      validateCandidateComparisonSet({
        records: [validCandidateParticipation()],
      }),
    ).toBe(false);
  });

  it.each([
    [
      "a missing top-level key",
      () => {
        const value: Record<string, unknown> = validCandidateComparisonSet();
        Reflect.deleteProperty(value, "as_of");
        return value;
      },
    ],
    [
      "an extra top-level key",
      () => ({ ...validCandidateComparisonSet(), totals: { records: 100 } }),
    ],
  ])("rejects %s", (_label, makeValue) => {
    expect(validateCandidateComparisonSet(makeValue())).toBe(false);
  });

  it("returns false for hostile set input instead of throwing", () => {
    const value = new Proxy(validCandidateComparisonSet(), {
      getPrototypeOf() {
        throw new Error("hostile set prototype");
      },
    });

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects fewer than 100 exhaustive records", () => {
    const value = validCandidateComparisonSet();
    const removed = value.records.pop()!;
    value.authority_assignments = value.authority_assignments.filter(
      (assignment) => assignment.record_key !== removed.record_key,
    );

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects more than 100 exhaustive records", () => {
    const value = validCandidateComparisonSet();
    const extra = structuredClone(value.records[0]!);
    extra.record_key = "extra-federal-primary-ordinary-101";
    extra.contest_key = "contest-extra-federal-primary-ordinary-101";
    extra.candidate_name = "Candidate 101";
    extra.official_ids[0]!.value = extra.record_key;
    extra.sources[0]!.locator = "record extra-federal-primary-ordinary-101";
    value.records.push(extra);
    value.authority_assignments.push({
      record_key: extra.record_key,
      authority_id: "authority-1",
      source_url: extra.sources[0]!.url,
      locator: extra.sources[0]!.locator,
    });

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects a per-cell stratum quota mutation", () => {
    const value = validCandidateComparisonSet();
    const index = recordIndex(value, "federal", "primary", "ordinary");
    value.records[index] = {
      ...value.records[index]!,
      sample_stratum: "nonpartisan",
      party_lines: [],
    };

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects a six-to-four withdrawn appearance split", () => {
    const value = validCandidateComparisonSet();
    const row = value.records.find(
      (candidate) =>
        candidate.sample_stratum === "withdrawn" &&
        candidate.ballot_appearance === "not_on_ballot",
    )!;
    row.ballot_appearance = "printed";

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects one contest key describing two contest tuples", () => {
    const value = validCandidateComparisonSet();
    value.records[1]!.contest_key = value.records[0]!.contest_key;

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects a normalized candidate-name collision within one contest", () => {
    const value = validCandidateComparisonSet();
    copyContest(value.records[1]!, value.records[0]!);
    value.records[1]!.candidate_name = `  ${value.records[0]!.candidate_name.toUpperCase()}  `;

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects a scoped official-ID collision within one contest", () => {
    const value = validCandidateComparisonSet();
    copyContest(value.records[1]!, value.records[0]!);
    value.records[1]!.official_ids = structuredClone(
      value.records[0]!.official_ids,
    );

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects an authority assignment with a split source pair", () => {
    const value = validCandidateComparisonSet();
    value.authority_assignments[0]!.locator =
      value.authority_assignments[1]!.locator;

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it.each([
    [
      "nine assigned states",
      () => {
        const value = validCandidateComparisonSet();
        value.authorities[9]!.state_code = value.authorities[8]!.state_code;
        return value;
      },
    ],
    [
      "no Northeast authority",
      () => {
        const value = validCandidateComparisonSet();
        value.authorities[0]!.state_code = "AZ";
        value.authorities[1]!.state_code = "OR";
        return value;
      },
    ],
    [
      "nine local authorities",
      () => {
        const value = validCandidateComparisonSet();
        value.authorities[0]!.authority_level = "state";
        return value;
      },
    ],
    [
      "eleven records from one authority",
      () => {
        const value = validCandidateComparisonSet();
        const assignment = value.authority_assignments.find(
          (candidate) => candidate.authority_id === "authority-2",
        )!;
        assignment.authority_id = "authority-1";
        return value;
      },
    ],
  ])("rejects coverage with %s", (_label, makeValue) => {
    expect(validateCandidateComparisonSet(makeValue())).toBe(false);
  });

  it("rejects source retrieval after the set as-of instant", () => {
    const value = validCandidateComparisonSet();
    value.records[0]!.sources[0]!.retrieved_at = "2026-08-15T12:00:01Z";

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects sub-millisecond source retrieval after the set as-of instant", () => {
    const value = validCandidateComparisonSet();
    value.as_of = "2026-08-15T12:00:00.0000Z";
    value.records[0]!.sources[0]!.retrieved_at = "2026-08-15T12:00:00.0001Z";

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects FEC-hosted qualification evidence despite its claimed type", () => {
    const value = validCandidateComparisonSet();
    const url = "https://www.fec.gov/data/candidate/H4CA12000/";
    value.records[0]!.sources[0]!.url = url;
    value.authority_assignments[0]!.source_url = url;

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects an ordinary eligible pool with no excluded control", () => {
    const value = validCandidateComparisonSet();
    manifestCell(value, "federal", "primary").eligible_record_keys =
      manifestCell(value, "federal", "primary").eligible_record_keys.filter(
        (recordKey) => recordKey !== "ordinary-federal-primary-05",
      );

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects a non-winning ordinary control in the selected rows", () => {
    const value = validCandidateComparisonSet();
    const winner = "ordinary-federal-primary-08";
    const loser = "ordinary-federal-primary-05";
    const row = value.records.find(
      (candidate) => candidate.record_key === winner,
    )!;
    const assignment = value.authority_assignments.find(
      (candidate) => candidate.record_key === winner,
    )!;
    row.record_key = loser;
    assignment.record_key = loser;

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects a selected edge record in the ordinary manifest", () => {
    const value = validCandidateComparisonSet();
    const cell = manifestCell(value, "federal", "primary");
    const loserIndex = cell.eligible_record_keys.indexOf(
      "ordinary-federal-primary-05",
    );
    cell.eligible_record_keys[loserIndex] =
      "edge-federal-primary-nonpartisan-01";

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it.each([
    [
      "a sparse records array",
      () => {
        const value = validCandidateComparisonSet();
        Reflect.deleteProperty(value.records, "0");
        return value;
      },
    ],
    [
      "a custom authorities array key",
      () => {
        const value = validCandidateComparisonSet();
        value.authorities = arrayWithExtraKey(value.authorities, "unexpected");
        return value;
      },
    ],
    [
      "an accessor assignment index",
      () => {
        const value = validCandidateComparisonSet();
        const first = value.authority_assignments[0]!;
        Object.defineProperty(value.authority_assignments, "0", {
          configurable: true,
          enumerable: true,
          get: () => first,
        });
        return value;
      },
    ],
    [
      "an input-owned manifest iterator",
      () => {
        const value = validCandidateComparisonSet();
        value.ordinary_control_manifest = arrayWithOwnIterator(
          value.ordinary_control_manifest,
          value.ordinary_control_manifest,
        );
        return value;
      },
    ],
  ])("rejects %s", (_label, makeValue) => {
    expect(validateCandidateComparisonSet(makeValue())).toBe(false);
  });

  it.each([
    [
      "an extra authority key",
      () => {
        const value = validCandidateComparisonSet();
        value.authorities[0] = {
          ...value.authorities[0]!,
          unexpected: true,
        } as TestAuthority;
        return value;
      },
    ],
    [
      "a missing assignment key",
      () => {
        const value = validCandidateComparisonSet();
        const assignment = { ...value.authority_assignments[0]! };
        Reflect.deleteProperty(assignment, "locator");
        value.authority_assignments[0] = assignment as TestAuthorityAssignment;
        return value;
      },
    ],
    [
      "a custom manifest-cell prototype",
      () => {
        const value = validCandidateComparisonSet();
        value.ordinary_control_manifest[0] = Object.assign(
          Object.create({ inherited: true }) as Record<string, unknown>,
          value.ordinary_control_manifest[0],
        ) as TestManifestCell;
        return value;
      },
    ],
    [
      "a getter-backed authority field",
      () => {
        const value = validCandidateComparisonSet();
        Object.defineProperty(value.authorities[0], "state_code", {
          enumerable: true,
          get: () => "CT",
        });
        return value;
      },
    ],
  ])("rejects %s", (_label, makeValue) => {
    expect(validateCandidateComparisonSet(makeValue())).toBe(false);
  });

  it("accepts exact null-prototype set metadata", () => {
    const value = validCandidateComparisonSet();
    value.authorities[0] = Object.assign(
      Object.create(null) as Record<string, unknown>,
      value.authorities[0],
    ) as TestAuthority;
    value.authority_assignments[0] = Object.assign(
      Object.create(null) as Record<string, unknown>,
      value.authority_assignments[0],
    ) as TestAuthorityAssignment;
    value.ordinary_control_manifest[0] = Object.assign(
      Object.create(null) as Record<string, unknown>,
      value.ordinary_control_manifest[0],
    ) as TestManifestCell;
    const topLevel = Object.assign(
      Object.create(null) as Record<string, unknown>,
      value,
    );

    expect(validateCandidateComparisonSet(topLevel)).toBe(true);
  });

  it("rejects a deceptive nested authority proxy", () => {
    const value = validCandidateComparisonSet();
    value.authorities[0] = new Proxy(value.authorities[0]!, {
      get(target, key, receiver) {
        return key === "state_code" ? "DC" : Reflect.get(target, key, receiver);
      },
    });

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects two contest keys for one exact contest tuple", () => {
    const value = validCandidateComparisonSet();
    const originalKey = value.records[1]!.contest_key;
    copyContest(value.records[1]!, value.records[0]!);
    value.records[1]!.contest_key = originalKey;

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("rejects a normalized reviewed-alias collision within one contest", () => {
    const value = validCandidateComparisonSet();
    copyContest(value.records[1]!, value.records[0]!);
    const source = value.records[1]!.sources[0]!;
    value.records[1]!.reviewed_aliases = [
      {
        name: value.records[0]!.candidate_name,
        source_url: source.url,
        locator: source.locator,
      },
    ];

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("allows the same official ID in different exact contests", () => {
    const value = validCandidateComparisonSet();
    value.records[1]!.official_ids = structuredClone(
      value.records[0]!.official_ids,
    );

    expect(validateCandidateComparisonSet(value)).toBe(true);
  });

  it("rejects duplicate candidate participation record keys", () => {
    const value = validCandidateComparisonSet();
    value.records[1]!.record_key = value.records[0]!.record_key;

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it.each([
    [
      "a missing record assignment",
      () => {
        const value = validCandidateComparisonSet();
        value.authority_assignments.pop();
        return value;
      },
    ],
    [
      "a duplicate record assignment",
      () => {
        const value = validCandidateComparisonSet();
        value.authority_assignments[1]!.record_key =
          value.authority_assignments[0]!.record_key;
        return value;
      },
    ],
    [
      "a dangling authority assignment",
      () => {
        const value = validCandidateComparisonSet();
        value.authority_assignments[0]!.authority_id = "missing-authority";
        return value;
      },
    ],
    [
      "an unused authority",
      () => {
        const value = validCandidateComparisonSet();
        value.authorities.push({
          authority_id: "authority-11",
          authority_name: "Unused Election Authority",
          authority_level: "state",
          state_code: "AZ",
        });
        return value;
      },
    ],
    [
      "a split duplicate authority identity",
      () => {
        const value = validCandidateComparisonSet();
        value.authorities.push({
          ...value.authorities[0]!,
          authority_id: "authority-11",
        });
        value.authority_assignments.find(
          (assignment) => assignment.authority_id === "authority-1",
        )!.authority_id = "authority-11";
        return value;
      },
    ],
    [
      "a normalized split duplicate authority identity",
      () => {
        const value = validCandidateComparisonSet();
        value.authorities.push({
          ...value.authorities[0]!,
          authority_id: "authority-11",
          authority_name: "LOCAL\u2003ELECTION\u00a0AUTHORITY 1",
        });
        value.authority_assignments.find(
          (assignment) => assignment.authority_id === "authority-1",
        )!.authority_id = "authority-11";
        return value;
      },
    ],
  ])("rejects %s", (_label, makeValue) => {
    expect(validateCandidateComparisonSet(makeValue())).toBe(false);
  });

  it.each([
    [
      "DC",
      () => {
        const value = validCandidateComparisonSet();
        value.authorities[0]!.state_code = "DC";
        return value;
      },
    ],
    [
      "an unknown authority level",
      () => {
        const value = validCandidateComparisonSet();
        value.authorities[0]!.authority_level = "county";
        return value;
      },
    ],
  ])("rejects authority metadata using %s", (_label, makeValue) => {
    expect(validateCandidateComparisonSet(makeValue())).toBe(false);
  });

  it("rejects an invalid set as-of timestamp", () => {
    const value = validCandidateComparisonSet();
    value.as_of = "2026-08-15";

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it("compares retrieval and as-of timestamps as instants", () => {
    const value = validCandidateComparisonSet();
    value.records[0]!.sources[0]!.retrieved_at = "2026-08-15T05:00:00-07:00";

    expect(validateCandidateComparisonSet(value)).toBe(true);
  });

  it("allows an FEC identifier when non-FEC official evidence qualifies", () => {
    const value = validCandidateComparisonSet();
    value.records[0]!.official_ids = [
      {
        issuer: "Federal Election Commission",
        namespace: "candidate_id",
        value: "H4CA12000",
      },
    ];

    expect(validateCandidateComparisonSet(value)).toBe(true);
  });

  it("rejects every FEC subdomain as qualification evidence", () => {
    const value = validCandidateComparisonSet();
    const url = "https://data.api.fec.gov/candidates";
    value.records[0]!.sources[0]!.url = url;
    value.authority_assignments[0]!.source_url = url;

    expect(validateCandidateComparisonSet(value)).toBe(false);
  });

  it.each([
    [
      "a missing cell",
      () => {
        const value = validCandidateComparisonSet();
        value.ordinary_control_manifest.pop();
        return value;
      },
    ],
    [
      "a duplicate cell",
      () => {
        const value = validCandidateComparisonSet();
        value.ordinary_control_manifest[5]!.level = "federal";
        value.ordinary_control_manifest[5]!.stage = "primary";
        return value;
      },
    ],
    [
      "a duplicate eligible key across cells",
      () => {
        const value = validCandidateComparisonSet();
        const target = manifestCell(value, "federal", "general");
        const loserIndex = target.eligible_record_keys.indexOf(
          "ordinary-federal-general-05",
        );
        target.eligible_record_keys[loserIndex] = "ordinary-federal-primary-05";
        return value;
      },
    ],
    [
      "an ordinary key in the wrong cell",
      () => {
        const value = validCandidateComparisonSet();
        const primary = manifestCell(value, "federal", "primary");
        const general = manifestCell(value, "federal", "general");
        const primaryIndex = primary.eligible_record_keys.indexOf(
          "ordinary-federal-primary-08",
        );
        const generalIndex = general.eligible_record_keys.indexOf(
          "ordinary-federal-general-04",
        );
        primary.eligible_record_keys[primaryIndex] =
          "ordinary-federal-general-04";
        general.eligible_record_keys[generalIndex] =
          "ordinary-federal-primary-08";
        return value;
      },
    ],
    [
      "a blank eligible key",
      () => {
        const value = validCandidateComparisonSet();
        const cell = manifestCell(value, "federal", "primary");
        const loserIndex = cell.eligible_record_keys.indexOf(
          "ordinary-federal-primary-05",
        );
        cell.eligible_record_keys[loserIndex] = " ";
        return value;
      },
    ],
  ])("rejects an ordinary manifest with %s", (_label, makeValue) => {
    expect(validateCandidateComparisonSet(makeValue())).toBe(false);
  });
});

describe("evaluateCandidateVendor", () => {
  it("passes the exact synthetic 100-record comparison at every threshold", () => {
    const truth = validCandidateComparisonSet();

    const result = evaluateCandidateVendor(truth, validVendorRecords(truth));

    expect(result).toEqual({
      technical_result: "pass",
      truth_record_count: 100,
      vendor_record_count: 100,
      matched_record_count: 100,
      overall_recall: {
        matched: 100,
        total: 100,
        required: 95,
        passed: true,
      },
      positive_recall: {
        matched: 85,
        total: 85,
        required: 81,
        passed: true,
      },
      strata: [
        {
          sample_stratum: "ordinary",
          matched: 50,
          total: 50,
          required: null,
          passed: true,
        },
        {
          sample_stratum: "nonpartisan",
          matched: 10,
          total: 10,
          required: 9,
          passed: true,
        },
        {
          sample_stratum: "write_in",
          matched: 10,
          total: 10,
          required: 9,
          passed: true,
        },
        {
          sample_stratum: "cross_filed",
          matched: 10,
          total: 10,
          required: 9,
          passed: true,
        },
        {
          sample_stratum: "withdrawn",
          matched: 10,
          total: 10,
          required: 9,
          passed: true,
        },
        {
          sample_stratum: "disqualified",
          matched: 10,
          total: 10,
          required: 9,
          passed: true,
        },
      ],
      provenance: {
        truth_records_complete: 100,
        vendor_records_complete: 100,
        truth_complete: true,
        vendor_complete: true,
      },
      diagnostics: [],
    });
  });

  it("matches an exact normalized, officially reviewed alias", () => {
    const truth = validCandidateComparisonSet();
    const row = truth.records[0]!;
    const source = row.sources[0]!;
    row.reviewed_aliases = [
      {
        name: "Candidate One Alias",
        source_url: source.url,
        locator: source.locator,
      },
    ];
    const vendor = validVendorRecords(truth);
    vendor[0] = vendorRecordFor(row, 0, {
      candidate_name: "  CANDIDATE\u2003ONE ALIAS  ",
      official_ids: [],
    });

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.technical_result).toBe("pass");
    expect(result.matched_record_count).toBe(100);
  });

  it("uses an exact candidate-scoped official ID but rejects an invented name", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    vendor[0] = { ...vendor[0]!, candidate_name: "Invented Candidate Name" };

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.matched_record_count).toBe(100);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "field_conflict",
        fatal: true,
        truth_record_key: truth.records[0]!.record_key,
        vendor_record_id: vendor[0]!.vendor_record_id,
        field: "candidate_name",
      }),
    );
    expect(result.technical_result).toBe("fail");
  });

  it("never lets an official ID bypass exact contest scope", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    vendor[0] = {
      ...vendor[0]!,
      jurisdiction: `${vendor[0]!.jurisdiction}/precinct:other`,
    };

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.matched_record_count).toBe(99);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "field_conflict",
        field: "jurisdiction",
        truth_record_key: truth.records[0]!.record_key,
        vendor_record_id: vendor[0]!.vendor_record_id,
      }),
    );
    expect(diagnosticCodes(result)).toContain("unmatched_vendor_record");
    expect(result.technical_result).toBe("fail");
  });

  it("never uses fuzzy or substring candidate-name matching", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    vendor[0] = {
      ...vendor[0]!,
      candidate_name: "Candidate",
      official_ids: [],
      ballot_appearance: "not_on_ballot",
    };

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.matched_record_count).toBe(99);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "unmatched_vendor_record",
        vendor_record_id: vendor[0]!.vendor_record_id,
      }),
    );
  });

  it("fails closed when name and official ID resolve to different truth candidates", () => {
    const truth = validCandidateComparisonSet();
    copyContest(truth.records[1]!, truth.records[0]!);
    const vendor = validVendorRecords(truth);
    vendor[0] = {
      ...vendor[0]!,
      official_ids: truth.records[1]!.official_ids.map((value) => ({
        ...value,
      })),
    };

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "ambiguous_match",
        fatal: true,
        vendor_record_id: vendor[0]!.vendor_record_id,
      }),
    );
    expect(result.matched_record_count).toBe(99);
    expect(result.technical_result).toBe("fail");
  });

  it("fails closed when canonical and alias rows target one truth candidate", () => {
    const truth = validCandidateComparisonSet();
    const row = truth.records[0]!;
    const source = row.sources[0]!;
    row.reviewed_aliases = [
      {
        name: "Candidate One Alias",
        source_url: source.url,
        locator: source.locator,
      },
    ];
    const vendor = validVendorRecords(truth);
    vendor.push(
      vendorRecordFor(row, vendor.length, {
        candidate_name: "Candidate One Alias",
        official_ids: [],
      }),
    );

    const result = evaluateCandidateVendor(truth, vendor);

    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.code === "ambiguous_match",
      ),
    ).toHaveLength(2);
    expect(result.matched_record_count).toBe(99);
    expect(result.technical_result).toBe("fail");
  });

  it("rejects duplicate truth record keys explicitly", () => {
    const truth = validCandidateComparisonSet();
    truth.records[1] = {
      ...truth.records[1]!,
      record_key: truth.records[0]!.record_key,
    };

    const result = evaluateCandidateVendor(truth, validVendorRecords(truth));

    expect(diagnosticCodes(result)).toContain("duplicate_truth_record_key");
    expect(result.technical_result).toBe("fail");
  });

  it("rejects duplicate vendor record IDs explicitly", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    vendor[1] = {
      ...vendor[1]!,
      vendor_record_id: vendor[0]!.vendor_record_id,
    };

    const result = evaluateCandidateVendor(truth, vendor);

    expect(diagnosticCodes(result)).toContain("duplicate_vendor_record_id");
    expect(result.technical_result).toBe("fail");
  });

  it("rejects an unmatched Confirmed claim inside a sampled contest", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    vendor.push(
      vendorRecordFor(truth.records[0]!, vendor.length, {
        candidate_name: "Unknown Sampled Candidate",
        official_ids: [],
      }),
    );

    const result = evaluateCandidateVendor(truth, vendor);

    expect(diagnosticCodes(result)).toContain("unmatched_confirmed_on_ballot");
    expect(result.technical_result).toBe("fail");
  });

  it("never converts an official qualified write-in into Confirmed on ballot", () => {
    const truth = validCandidateComparisonSet();
    const index = truth.records.findIndex(
      (record) => record.sample_stratum === "write_in",
    );
    const vendor = validVendorRecords(truth);
    vendor[index] = { ...vendor[index]!, ballot_appearance: "printed" };

    const result = evaluateCandidateVendor(truth, vendor);

    expect(diagnosticCodes(result)).toContain("false_confirmed_on_ballot");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "field_conflict",
        field: "ballot_appearance",
        expected: "write_in",
        actual: "printed",
      }),
    );
    expect(result.technical_result).toBe("fail");
  });

  it("rejects an asserted official ID outside the matched truth identity", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    vendor[0] = {
      ...vendor[0]!,
      official_ids: [
        {
          issuer: "Other Election Authority",
          namespace: "candidate",
          value: "other-candidate",
        },
      ],
    };

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "field_conflict",
        fatal: true,
        field: "official_ids",
        truth_record_key: truth.records[0]!.record_key,
        vendor_record_id: vendor[0]!.vendor_record_id,
      }),
    );
    expect(result.technical_result).toBe("fail");
  });

  it.each([
    ["contest_key", "other-contest"],
    ["candidate_name", "Other Candidate"],
    ["jurisdiction", "ocd-division/country:us/state:ct/place:other"],
    ["election_date", "2024-12-01"],
    ["office", "Other Office"],
    ["district", "other"],
    ["level", "state"],
    ["stage", "general"],
    ["lifecycle_status", "withdrawn"],
    ["ballot_appearance", "not_on_ballot"],
  ] as const)("reports a fatal %s conflict", (field, actual) => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    const row = truth.records[0]!;
    const replacement = { ...vendor[0]!, [field]: actual };
    if (field === "candidate_name") {
      replacement.official_ids = row.official_ids.map((value) => ({
        ...value,
      }));
    }
    vendor[0] = replacement;

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "field_conflict",
        fatal: true,
        truth_record_key: row.record_key,
        vendor_record_id: vendor[0]!.vendor_record_id,
        field,
        actual,
      }),
    );
    expect(result.technical_result).toBe("fail");
  });

  it("compares party lines as one exact, order-independent set", () => {
    const truth = validCandidateComparisonSet();
    const crossFiledIndex = truth.records.findIndex(
      (record) => record.sample_stratum === "cross_filed",
    );
    const reordered = validVendorRecords(truth);
    reordered[crossFiledIndex] = {
      ...reordered[crossFiledIndex]!,
      party_lines: ["Party B", "Party A"],
    };

    expect(evaluateCandidateVendor(truth, reordered).technical_result).toBe(
      "pass",
    );

    const conflicting = validVendorRecords(truth);
    conflicting[crossFiledIndex] = {
      ...conflicting[crossFiledIndex]!,
      party_lines: ["Party A", "Party C"],
    };
    const result = evaluateCandidateVendor(truth, conflicting);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "field_conflict",
        fatal: true,
        field: "party_lines",
      }),
    );
    expect(result.technical_result).toBe("fail");
  });

  it("fails truth and vendor record-level provenance gaps", () => {
    const truth = validCandidateComparisonSet();
    truth.records[0] = { ...truth.records[0]!, sources: [] };
    const truthResult = evaluateCandidateVendor(
      truth,
      validVendorRecords(truth),
    );

    expect(diagnosticCodes(truthResult)).toContain("truth_provenance_missing");
    expect(truthResult.provenance.truth_complete).toBe(false);
    expect(truthResult.technical_result).toBe("fail");

    const validTruth = validCandidateComparisonSet();
    const vendor = validVendorRecords(validTruth);
    vendor[0] = { ...vendor[0]!, sources: [] };
    const vendorResult = evaluateCandidateVendor(validTruth, vendor);

    expect(diagnosticCodes(vendorResult)).toContain(
      "vendor_provenance_missing",
    );
    expect(vendorResult.provenance.vendor_complete).toBe(false);
    expect(vendorResult.technical_result).toBe("fail");
  });

  it("returns a stable invalid-truth failure for a throwing truth Proxy", () => {
    const truth = validCandidateComparisonSet();
    const hostileTruth = new Proxy(truth, {
      ownKeys() {
        throw new Error("hostile truth ownKeys");
      },
    });

    const result = evaluateCandidateVendorWithoutThrow(
      hostileTruth,
      validVendorRecords(truth),
    );

    expect(result.technical_result).toBe("fail");
    expect(result.diagnostics).toContainEqual({
      code: "invalid_truth_set",
      fatal: true,
      truth_record_key: null,
      vendor_record_id: null,
      field: null,
      expected: null,
      actual: null,
    });
  });

  it("returns a stable invalid-vendor failure for a throwing vendor-array Proxy", () => {
    const truth = validCandidateComparisonSet();
    const hostileVendor = new Proxy(validVendorRecords(truth), {
      ownKeys() {
        throw new Error("hostile vendor ownKeys");
      },
    });

    const result = evaluateCandidateVendorWithoutThrow(truth, hostileVendor);

    expect(result.technical_result).toBe("fail");
    expect(result.diagnostics).toContainEqual({
      code: "invalid_vendor_record",
      fatal: true,
      truth_record_key: null,
      vendor_record_id: null,
      field: null,
      expected: null,
      actual: null,
    });
  });

  it("rejects a top-level truth accessor without executing its getter", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    const records = truth.records;
    let getterCalls = 0;
    Object.defineProperty(truth, "records", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return records;
      },
    });

    const result = evaluateCandidateVendorWithoutThrow(truth, vendor);

    expect(result.technical_result).toBe("fail");
    expect(getterCalls).toBe(0);
  });

  it("rejects a nested vendor source accessor without executing its getter", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    const source = { ...vendor[0]!.sources[0]! };
    const locator = source.locator;
    let getterCalls = 0;
    Object.defineProperty(source, "locator", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return locator;
      },
    });
    vendor[0] = { ...vendor[0]!, sources: [source] };

    const result = evaluateCandidateVendorWithoutThrow(truth, vendor);

    expect(result.technical_result).toBe("fail");
    expect(getterCalls).toBe(0);
  });

  it("rejects a transparent Proxy-wrapped vendor record and its provenance", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    vendor[0] = new Proxy(vendor[0]!, {});

    const result = evaluateCandidateVendorWithoutThrow(truth, vendor);

    expect(result.technical_result).toBe("fail");
    expect(result.provenance.vendor_complete).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: "invalid_vendor_record",
      fatal: true,
      truth_record_key: null,
      vendor_record_id: null,
      field: null,
      expected: null,
      actual: null,
    });
    expect(result.diagnostics).toContainEqual({
      code: "vendor_provenance_missing",
      fatal: true,
      truth_record_key: null,
      vendor_record_id: null,
      field: null,
      expected: null,
      actual: null,
    });
  });

  it("rejects a proxy vendor row without reflection or unstable ID recovery", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    const trapCalls = {
      getPrototypeOf: 0,
      ownKeys: 0,
      getOwnPropertyDescriptor: 0,
    };
    let spoofedId = 0;
    vendor[0] = new Proxy(vendor[0]!, {
      getPrototypeOf(target) {
        trapCalls.getPrototypeOf += 1;
        return Reflect.getPrototypeOf(target);
      },
      ownKeys(target) {
        trapCalls.ownKeys += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        trapCalls.getOwnPropertyDescriptor += 1;
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (
          key === "vendor_record_id" &&
          descriptor !== undefined &&
          "value" in descriptor
        ) {
          spoofedId += 1;
          return { ...descriptor, value: `spoof-${spoofedId}` };
        }
        return descriptor;
      },
    });

    const first = evaluateCandidateVendorWithoutThrow(truth, vendor);
    const second = evaluateCandidateVendorWithoutThrow(truth, vendor);
    const rejectedIds = [first, second].map(
      (report) =>
        report.diagnostics.find(
          (diagnostic) => diagnostic.code === "invalid_vendor_record",
        )?.vendor_record_id,
    );

    expect(first.technical_result).toBe("fail");
    expect(second.technical_result).toBe("fail");
    expect({
      trapCalls,
      rejectedIds,
      stable:
        serializeCandidateVendorEvaluation(first) ===
        serializeCandidateVendorEvaluation(second),
    }).toEqual({
      trapCalls: {
        getPrototypeOf: 0,
        ownKeys: 0,
        getOwnPropertyDescriptor: 0,
      },
      rejectedIds: [null, null],
      stable: true,
    });
  });

  it("fails every recall gate when invalid input makes recall unavailable", () => {
    const truth = validCandidateComparisonSet();
    const hostileTruth = new Proxy(truth, {
      ownKeys() {
        throw new Error("hostile truth ownKeys");
      },
    });

    const result = evaluateCandidateVendorWithoutThrow(
      hostileTruth,
      validVendorRecords(truth),
    );

    expect({
      technicalResult: result.technical_result,
      overallPassed: result.overall_recall.passed,
      positivePassed: result.positive_recall.passed,
      strataPassed: result.strata.map((stratum) => stratum.passed),
    }).toEqual({
      technicalResult: "fail",
      overallPassed: false,
      positivePassed: false,
      strataPassed: [false, false, false, false, false, false],
    });
  });

  it("rejects a transparent Proxy-wrapped vendor source and its provenance", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    vendor[0] = {
      ...vendor[0]!,
      sources: [new Proxy(vendor[0]!.sources[0]!, {})],
    };

    const result = evaluateCandidateVendorWithoutThrow(truth, vendor);

    expect(result.technical_result).toBe("fail");
    expect(result.provenance.vendor_complete).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: "invalid_vendor_record",
      fatal: true,
      truth_record_key: null,
      vendor_record_id: "vendor-001",
      field: null,
      expected: null,
      actual: null,
    });
    expect(result.diagnostics).toContainEqual({
      code: "vendor_provenance_missing",
      fatal: true,
      truth_record_key: null,
      vendor_record_id: "vendor-001",
      field: null,
      expected: null,
      actual: null,
    });
  });

  it("rejects malformed vendor rows instead of scoring them", () => {
    const truth = validCandidateComparisonSet();
    const vendor: unknown[] = validVendorRecords(truth);
    vendor[0] = {
      ...(vendor[0] as CandidateVendorRecord),
      level: "county",
    };

    const result = evaluateCandidateVendor(truth, vendor);

    expect(diagnosticCodes(result)).toContain("invalid_vendor_record");
    expect(result.technical_result).toBe("fail");
  });

  it("fails aggregate presence below 95 of 100", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth).filter((_, index) => index >= 6);

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.overall_recall).toEqual({
      matched: 94,
      total: 100,
      required: 95,
      passed: false,
    });
    expect(diagnosticCodes(result)).toContain("overall_recall_below_threshold");
    expect(result.technical_result).toBe("fail");
  });

  it("fails positive recall below 95 percent while aggregate recall passes", () => {
    const truth = validCandidateComparisonSet();
    const ordinaryIndexes = truth.records
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => record.sample_stratum === "ordinary")
      .slice(0, 5)
      .map(({ index }) => index);
    const vendor = validVendorRecords(truth).filter(
      (_, index) => !ordinaryIndexes.includes(index),
    );

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.overall_recall.passed).toBe(true);
    expect(result.positive_recall).toEqual({
      matched: 80,
      total: 85,
      required: 81,
      passed: false,
    });
    expect(diagnosticCodes(result)).toContain(
      "positive_recall_below_threshold",
    );
    expect(result.technical_result).toBe("fail");
  });

  it("fails missing qualified write-ins below 9 of 10 while aggregate gates pass", () => {
    const truth = validCandidateComparisonSet();
    const writeInIndexes = truth.records
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => record.sample_stratum === "write_in")
      .slice(0, 2)
      .map(({ index }) => index);
    const vendor = validVendorRecords(truth).filter(
      (_, index) => !writeInIndexes.includes(index),
    );

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.overall_recall.passed).toBe(true);
    expect(result.positive_recall.passed).toBe(true);
    expect(
      result.strata.find((stratum) => stratum.sample_stratum === "write_in"),
    ).toEqual({
      sample_stratum: "write_in",
      matched: 8,
      total: 10,
      required: 9,
      passed: false,
    });
    expect(diagnosticCodes(result)).toContain(
      "edge_stratum_recall_below_threshold",
    );
    expect(result.technical_result).toBe("fail");
  });

  it("passes the exact aggregate, positive, and edge threshold boundaries", () => {
    const truth = validCandidateComparisonSet();
    const ordinaryIndexes = truth.records
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => record.sample_stratum === "ordinary")
      .slice(0, 4)
      .map(({ index }) => index);
    const disqualifiedIndex = truth.records.findIndex(
      (record) => record.sample_stratum === "disqualified",
    );
    const removed = new Set([...ordinaryIndexes, disqualifiedIndex]);
    const vendor = validVendorRecords(truth).filter(
      (_, index) => !removed.has(index),
    );

    const result = evaluateCandidateVendor(truth, vendor);

    expect(result.overall_recall).toEqual({
      matched: 95,
      total: 100,
      required: 95,
      passed: true,
    });
    expect(result.positive_recall).toEqual({
      matched: 81,
      total: 85,
      required: 81,
      passed: true,
    });
    expect(result.technical_result).toBe("pass");
  });

  it("serializes one stable report shape independent of vendor input order", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    vendor[0] = { ...vendor[0]!, lifecycle_status: "withdrawn" };
    vendor[1] = { ...vendor[1]!, party_lines: ["Other Party"] };
    const forward = evaluateCandidateVendor(truth, vendor);
    const reverse = evaluateCandidateVendor(truth, [...vendor].reverse());

    expect(serializeCandidateVendorEvaluation(forward)).toBe(
      serializeCandidateVendorEvaluation(reverse),
    );
    expect(serializeCandidateVendorEvaluation(forward)).toBe(
      JSON.stringify(forward),
    );
    expect(forward.diagnostics).toEqual(
      [...forward.diagnostics].sort((left, right) => {
        const serializedLeft = JSON.stringify(left);
        const serializedRight = JSON.stringify(right);
        return serializedLeft < serializedRight
          ? -1
          : serializedLeft > serializedRight
            ? 1
            : 0;
      }),
    );
  });
});

type TestDecisionEvidenceKind =
  | "legal_permission"
  | "operational_commitment"
  | "package_coverage"
  | "quote"
  | "technical";

type TestDecisionEvidenceRecord = {
  requirement: string;
  status: string;
  scope: string;
  limits: string;
  evidence_url: string;
  document_title: string;
  document_version: string;
  effective_date: string;
  retrieved_at: string;
  raw_content_sha256: string;
  [key: string]: unknown;
};

type TestCandidateVendorDecisionEvidence = {
  legal_permissions: TestDecisionEvidenceRecord[];
  operational_commitments: TestDecisionEvidenceRecord[];
  package_coverage: TestDecisionEvidenceRecord;
  quote_approved?: boolean;
};

type TestCandidateVendorDecisionDiagnostic = {
  code: string;
  evidence_kind: TestDecisionEvidenceKind;
  requirement: string | null;
  field: string | null;
  expected: string | null;
  actual: string | null;
};

type TestCandidateVendorDecision = {
  decision: "go" | "no_go";
  technical_result: "pass" | "fail";
  rights_and_operations_result: "pass" | "fail";
  quote_approved: boolean;
  diagnostics: readonly TestCandidateVendorDecisionDiagnostic[];
};

const candidateVendorDecisionApi =
  candidateVendorEvaluationModule as typeof candidateVendorEvaluationModule & {
    evaluateCandidateVendorDecision: (
      technicalReport: ReturnType<typeof evaluateCandidateVendor>,
      evidence: unknown,
    ) => TestCandidateVendorDecision;
    serializeCandidateVendorDecision: (
      decision: TestCandidateVendorDecision,
    ) => string;
  };

function candidateDecisionEvidenceRecord(
  requirement: string,
  values: Record<string, unknown>,
): TestDecisionEvidenceRecord {
  return {
    requirement,
    status: "allowed",
    scope: `Synthetic scope for ${requirement}.`,
    limits: `Synthetic limits for ${requirement}.`,
    evidence_url: `https://vendor.example.test/evidence/${requirement}`,
    document_title: "Synthetic written rights and operations terms",
    document_version: "v1",
    effective_date: "2026-08-15",
    retrieved_at: "2026-08-15T12:00:00Z",
    raw_content_sha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ...values,
  };
}

function validCandidateVendorDecisionEvidence(): TestCandidateVendorDecisionEvidence {
  return {
    legal_permissions: [
      candidateDecisionEvidenceRecord("public_redisplay", {
        public_use: true,
        normalized_facts: ["candidate", "contest", "status", "source"],
        bulk_raw_extraction: false,
      }),
      candidateDecisionEvidenceRecord("current_response_cache", {
        minimum_days: 30,
      }),
      candidateDecisionEvidenceRecord("normalized_history_and_audit", {
        minimum_months_after_certification: 24,
      }),
      candidateDecisionEvidenceRecord("derived_use", {
        normalized_records: true,
        non_reconstructive_metrics: true,
      }),
      candidateDecisionEvidenceRecord("correction_and_tombstone", {
        correction_processing: true,
        tombstone_processing: true,
        audit_trail: true,
      }),
      candidateDecisionEvidenceRecord("termination", {
        maximum_raw_purge_days: 30,
        maximum_backup_purge_days: 90,
        retains_only_separately_permitted_normalized_audit_facts: true,
      }),
    ],
    operational_commitments: [
      candidateDecisionEvidenceRecord("content_refresh", {
        maximum_interval_hours: 24,
      }),
      candidateDecisionEvidenceRecord("status_alert_and_tombstone", {
        maximum_status_alert_hours_after_ingestion: 24,
        maximum_tombstone_hours_after_ingestion: 24,
      }),
      candidateDecisionEvidenceRecord("correction_acknowledgement", {
        maximum_business_days: 1,
      }),
      candidateDecisionEvidenceRecord("correction_or_disposition", {
        maximum_business_days: 2,
      }),
      candidateDecisionEvidenceRecord("nonbreaking_schema_notice", {
        minimum_notice_days: 30,
      }),
      candidateDecisionEvidenceRecord("breaking_schema_notice", {
        minimum_notice_days: 90,
      }),
    ],
    package_coverage: candidateDecisionEvidenceRecord(
      "purchased_package_coverage",
      {
        covers_every_sampled_jurisdiction: true,
        covers_every_sampled_stage: true,
        covers_every_sampled_stratum: true,
      },
    ),
    quote_approved: true,
  };
}

function legalDecisionEvidence(
  evidence: TestCandidateVendorDecisionEvidence,
  requirement: string,
) {
  const record = evidence.legal_permissions.find(
    (candidate) => candidate.requirement === requirement,
  );
  if (record === undefined) {
    throw new Error(`missing legal evidence ${requirement}`);
  }
  return record;
}

function operationalDecisionEvidence(
  evidence: TestCandidateVendorDecisionEvidence,
  requirement: string,
) {
  const record = evidence.operational_commitments.find(
    (candidate) => candidate.requirement === requirement,
  );
  if (record === undefined) {
    throw new Error(`missing operational evidence ${requirement}`);
  }
  return record;
}

function removeDecisionEvidenceField(
  record: Record<string, unknown>,
  field: string,
) {
  delete record[field];
}

function expectedDecisionDiagnostic(
  code: string,
  evidenceKind: TestDecisionEvidenceKind,
  requirement: string | null,
  field: string | null,
  expected: string | null,
  actual: string | null,
): TestCandidateVendorDecisionDiagnostic {
  return {
    code,
    evidence_kind: evidenceKind,
    requirement,
    field,
    expected,
    actual,
  };
}

function passingCandidateVendorTechnicalReport() {
  const truth = validCandidateComparisonSet();
  return evaluateCandidateVendor(truth, validVendorRecords(truth));
}

type CandidateVendorDecisionFailureCase = {
  name: string;
  mutate: (evidence: TestCandidateVendorDecisionEvidence) => void;
  diagnostic: TestCandidateVendorDecisionDiagnostic;
};

const candidateVendorDecisionFailureCases: readonly CandidateVendorDecisionFailureCase[] =
  [
    {
      name: "rejects internal-only redisplay scope",
      mutate: (evidence) => {
        legalDecisionEvidence(evidence, "public_redisplay").public_use = false;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "public_redisplay",
        "public_use",
        "true",
        "false",
      ),
    },
    {
      name: "rejects redisplay missing normalized source facts",
      mutate: (evidence) => {
        legalDecisionEvidence(evidence, "public_redisplay").normalized_facts = [
          "candidate",
          "contest",
          "status",
        ];
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "public_redisplay",
        "normalized_facts",
        '["candidate","contest","status","source"]',
        '["candidate","contest","status"]',
      ),
    },
    {
      name: "rejects permission for bulk raw extraction",
      mutate: (evidence) => {
        legalDecisionEvidence(
          evidence,
          "public_redisplay",
        ).bulk_raw_extraction = true;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "public_redisplay",
        "bulk_raw_extraction",
        "false",
        "true",
      ),
    },
    {
      name: "rejects current-response cache shorter than 30 days",
      mutate: (evidence) => {
        legalDecisionEvidence(evidence, "current_response_cache").minimum_days =
          29;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "current_response_cache",
        "minimum_days",
        ">=30",
        "29",
      ),
    },
    {
      name: "rejects normalized audit retention shorter than 24 months",
      mutate: (evidence) => {
        legalDecisionEvidence(
          evidence,
          "normalized_history_and_audit",
        ).minimum_months_after_certification = 23;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "normalized_history_and_audit",
        "minimum_months_after_certification",
        ">=24",
        "23",
      ),
    },
    {
      name: "rejects derived use without normalized records",
      mutate: (evidence) => {
        legalDecisionEvidence(evidence, "derived_use").normalized_records =
          false;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "derived_use",
        "normalized_records",
        "true",
        "false",
      ),
    },
    {
      name: "rejects reconstructive derived metrics",
      mutate: (evidence) => {
        legalDecisionEvidence(
          evidence,
          "derived_use",
        ).non_reconstructive_metrics = false;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "derived_use",
        "non_reconstructive_metrics",
        "true",
        "false",
      ),
    },
    {
      name: "rejects missing correction processing",
      mutate: (evidence) => {
        legalDecisionEvidence(
          evidence,
          "correction_and_tombstone",
        ).correction_processing = false;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "correction_and_tombstone",
        "correction_processing",
        "true",
        "false",
      ),
    },
    {
      name: "rejects missing tombstone processing",
      mutate: (evidence) => {
        legalDecisionEvidence(
          evidence,
          "correction_and_tombstone",
        ).tombstone_processing = false;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "correction_and_tombstone",
        "tombstone_processing",
        "true",
        "false",
      ),
    },
    {
      name: "rejects corrections without an audit trail",
      mutate: (evidence) => {
        legalDecisionEvidence(
          evidence,
          "correction_and_tombstone",
        ).audit_trail = false;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "correction_and_tombstone",
        "audit_trail",
        "true",
        "false",
      ),
    },
    {
      name: "rejects termination raw purge longer than 30 days",
      mutate: (evidence) => {
        legalDecisionEvidence(evidence, "termination").maximum_raw_purge_days =
          31;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "termination",
        "maximum_raw_purge_days",
        "<=30",
        "31",
      ),
    },
    {
      name: "rejects termination backup purge longer than 90 days",
      mutate: (evidence) => {
        legalDecisionEvidence(
          evidence,
          "termination",
        ).maximum_backup_purge_days = 91;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "termination",
        "maximum_backup_purge_days",
        "<=90",
        "91",
      ),
    },
    {
      name: "rejects termination retention beyond separately permitted audit facts",
      mutate: (evidence) => {
        legalDecisionEvidence(
          evidence,
          "termination",
        ).retains_only_separately_permitted_normalized_audit_facts = false;
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "termination",
        "retains_only_separately_permitted_normalized_audit_facts",
        "true",
        "false",
      ),
    },
    {
      name: "rejects refresh slower than daily",
      mutate: (evidence) => {
        operationalDecisionEvidence(
          evidence,
          "content_refresh",
        ).maximum_interval_hours = 25;
      },
      diagnostic: expectedDecisionDiagnostic(
        "operational_minimum_not_met",
        "operational_commitment",
        "content_refresh",
        "maximum_interval_hours",
        "<=24",
        "25",
      ),
    },
    {
      name: "rejects status alerts later than 24 hours after ingestion",
      mutate: (evidence) => {
        operationalDecisionEvidence(
          evidence,
          "status_alert_and_tombstone",
        ).maximum_status_alert_hours_after_ingestion = 25;
      },
      diagnostic: expectedDecisionDiagnostic(
        "operational_minimum_not_met",
        "operational_commitment",
        "status_alert_and_tombstone",
        "maximum_status_alert_hours_after_ingestion",
        "<=24",
        "25",
      ),
    },
    {
      name: "rejects tombstones later than 24 hours after ingestion",
      mutate: (evidence) => {
        operationalDecisionEvidence(
          evidence,
          "status_alert_and_tombstone",
        ).maximum_tombstone_hours_after_ingestion = 25;
      },
      diagnostic: expectedDecisionDiagnostic(
        "operational_minimum_not_met",
        "operational_commitment",
        "status_alert_and_tombstone",
        "maximum_tombstone_hours_after_ingestion",
        "<=24",
        "25",
      ),
    },
    {
      name: "rejects correction acknowledgement after one business day",
      mutate: (evidence) => {
        operationalDecisionEvidence(
          evidence,
          "correction_acknowledgement",
        ).maximum_business_days = 2;
      },
      diagnostic: expectedDecisionDiagnostic(
        "operational_minimum_not_met",
        "operational_commitment",
        "correction_acknowledgement",
        "maximum_business_days",
        "<=1",
        "2",
      ),
    },
    {
      name: "rejects correction or disposition after two business days",
      mutate: (evidence) => {
        operationalDecisionEvidence(
          evidence,
          "correction_or_disposition",
        ).maximum_business_days = 3;
      },
      diagnostic: expectedDecisionDiagnostic(
        "operational_minimum_not_met",
        "operational_commitment",
        "correction_or_disposition",
        "maximum_business_days",
        "<=2",
        "3",
      ),
    },
    {
      name: "rejects nonbreaking schema notice shorter than 30 days",
      mutate: (evidence) => {
        operationalDecisionEvidence(
          evidence,
          "nonbreaking_schema_notice",
        ).minimum_notice_days = 29;
      },
      diagnostic: expectedDecisionDiagnostic(
        "operational_minimum_not_met",
        "operational_commitment",
        "nonbreaking_schema_notice",
        "minimum_notice_days",
        ">=30",
        "29",
      ),
    },
    {
      name: "rejects breaking schema notice shorter than 90 days",
      mutate: (evidence) => {
        operationalDecisionEvidence(
          evidence,
          "breaking_schema_notice",
        ).minimum_notice_days = 89;
      },
      diagnostic: expectedDecisionDiagnostic(
        "operational_minimum_not_met",
        "operational_commitment",
        "breaking_schema_notice",
        "minimum_notice_days",
        ">=90",
        "89",
      ),
    },
    {
      name: "rejects package gaps in sampled jurisdictions",
      mutate: (evidence) => {
        evidence.package_coverage.covers_every_sampled_jurisdiction = false;
      },
      diagnostic: expectedDecisionDiagnostic(
        "package_coverage_incomplete",
        "package_coverage",
        "purchased_package_coverage",
        "covers_every_sampled_jurisdiction",
        "true",
        "false",
      ),
    },
    {
      name: "rejects package gaps in sampled stages",
      mutate: (evidence) => {
        evidence.package_coverage.covers_every_sampled_stage = false;
      },
      diagnostic: expectedDecisionDiagnostic(
        "package_coverage_incomplete",
        "package_coverage",
        "purchased_package_coverage",
        "covers_every_sampled_stage",
        "true",
        "false",
      ),
    },
    {
      name: "rejects package gaps in sampled strata",
      mutate: (evidence) => {
        evidence.package_coverage.covers_every_sampled_stratum = false;
      },
      diagnostic: expectedDecisionDiagnostic(
        "package_coverage_incomplete",
        "package_coverage",
        "purchased_package_coverage",
        "covers_every_sampled_stratum",
        "true",
        "false",
      ),
    },
    {
      name: "rejects unknown legal permission",
      mutate: (evidence) => {
        legalDecisionEvidence(evidence, "public_redisplay").status = "unknown";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_status_not_allowed",
        "legal_permission",
        "public_redisplay",
        "status",
        "allowed",
        "unknown",
      ),
    },
    {
      name: "rejects denied legal permission",
      mutate: (evidence) => {
        legalDecisionEvidence(evidence, "public_redisplay").status = "denied";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_status_not_allowed",
        "legal_permission",
        "public_redisplay",
        "status",
        "allowed",
        "denied",
      ),
    },
    {
      name: "rejects unknown operational commitment",
      mutate: (evidence) => {
        operationalDecisionEvidence(evidence, "content_refresh").status =
          "unknown";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_status_not_allowed",
        "operational_commitment",
        "content_refresh",
        "status",
        "allowed",
        "unknown",
      ),
    },
    {
      name: "rejects denied operational commitment",
      mutate: (evidence) => {
        operationalDecisionEvidence(evidence, "content_refresh").status =
          "denied";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_status_not_allowed",
        "operational_commitment",
        "content_refresh",
        "status",
        "allowed",
        "denied",
      ),
    },
    {
      name: "rejects unknown package coverage",
      mutate: (evidence) => {
        evidence.package_coverage.status = "unknown";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_status_not_allowed",
        "package_coverage",
        "purchased_package_coverage",
        "status",
        "allowed",
        "unknown",
      ),
    },
    {
      name: "rejects denied package coverage",
      mutate: (evidence) => {
        evidence.package_coverage.status = "denied";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_status_not_allowed",
        "package_coverage",
        "purchased_package_coverage",
        "status",
        "allowed",
        "denied",
      ),
    },
    {
      name: "rejects a missing legal permission record",
      mutate: (evidence) => {
        evidence.legal_permissions = evidence.legal_permissions.filter(
          (record) => record.requirement !== "current_response_cache",
        );
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_missing",
        "legal_permission",
        "current_response_cache",
        "requirement",
        "present",
        null,
      ),
    },
    {
      name: "rejects a missing operational commitment record",
      mutate: (evidence) => {
        evidence.operational_commitments =
          evidence.operational_commitments.filter(
            (record) => record.requirement !== "content_refresh",
          );
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_missing",
        "operational_commitment",
        "content_refresh",
        "requirement",
        "present",
        null,
      ),
    },
    {
      name: "rejects missing purchased package coverage",
      mutate: (evidence) => {
        removeDecisionEvidenceField(
          evidence as unknown as Record<string, unknown>,
          "package_coverage",
        );
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_missing",
        "package_coverage",
        "purchased_package_coverage",
        "requirement",
        "present",
        null,
      ),
    },
    {
      name: "rejects a missing legal minimum field",
      mutate: (evidence) => {
        removeDecisionEvidenceField(
          legalDecisionEvidence(evidence, "public_redisplay"),
          "public_use",
        );
      },
      diagnostic: expectedDecisionDiagnostic(
        "legal_minimum_not_met",
        "legal_permission",
        "public_redisplay",
        "public_use",
        "true",
        null,
      ),
    },
    {
      name: "rejects a missing operational minimum field",
      mutate: (evidence) => {
        removeDecisionEvidenceField(
          operationalDecisionEvidence(evidence, "content_refresh"),
          "maximum_interval_hours",
        );
      },
      diagnostic: expectedDecisionDiagnostic(
        "operational_minimum_not_met",
        "operational_commitment",
        "content_refresh",
        "maximum_interval_hours",
        "<=24",
        null,
      ),
    },
    {
      name: "rejects a missing package coverage field",
      mutate: (evidence) => {
        removeDecisionEvidenceField(
          evidence.package_coverage,
          "covers_every_sampled_jurisdiction",
        );
      },
      diagnostic: expectedDecisionDiagnostic(
        "package_coverage_incomplete",
        "package_coverage",
        "purchased_package_coverage",
        "covers_every_sampled_jurisdiction",
        "true",
        null,
      ),
    },
    {
      name: "rejects evidence missing its status",
      mutate: (evidence) => {
        removeDecisionEvidenceField(
          legalDecisionEvidence(evidence, "public_redisplay"),
          "status",
        );
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_status_not_allowed",
        "legal_permission",
        "public_redisplay",
        "status",
        "allowed",
        null,
      ),
    },
    {
      name: "rejects evidence missing exact scope",
      mutate: (evidence) => {
        removeDecisionEvidenceField(
          legalDecisionEvidence(evidence, "current_response_cache"),
          "scope",
        );
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_metadata_invalid",
        "legal_permission",
        "current_response_cache",
        "scope",
        "nonblank string",
        null,
      ),
    },
    {
      name: "rejects evidence missing exact limits",
      mutate: (evidence) => {
        removeDecisionEvidenceField(
          operationalDecisionEvidence(evidence, "content_refresh"),
          "limits",
        );
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_metadata_invalid",
        "operational_commitment",
        "content_refresh",
        "limits",
        "nonblank string",
        null,
      ),
    },
    {
      name: "rejects non-HTTPS evidence URL",
      mutate: (evidence) => {
        evidence.package_coverage.evidence_url =
          "http://vendor.example.test/evidence/package";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_metadata_invalid",
        "package_coverage",
        "purchased_package_coverage",
        "evidence_url",
        "HTTPS URL",
        "http://vendor.example.test/evidence/package",
      ),
    },
    {
      name: "rejects evidence missing document title",
      mutate: (evidence) => {
        legalDecisionEvidence(evidence, "derived_use").document_title = "";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_metadata_invalid",
        "legal_permission",
        "derived_use",
        "document_title",
        "nonblank string",
        '""',
      ),
    },
    {
      name: "rejects evidence missing document version",
      mutate: (evidence) => {
        operationalDecisionEvidence(
          evidence,
          "correction_acknowledgement",
        ).document_version = "";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_metadata_invalid",
        "operational_commitment",
        "correction_acknowledgement",
        "document_version",
        "nonblank string",
        '""',
      ),
    },
    {
      name: "rejects invalid document effective date",
      mutate: (evidence) => {
        evidence.package_coverage.effective_date = "not-a-date";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_metadata_invalid",
        "package_coverage",
        "purchased_package_coverage",
        "effective_date",
        "calendar date",
        "not-a-date",
      ),
    },
    {
      name: "rejects invalid evidence retrieval time",
      mutate: (evidence) => {
        legalDecisionEvidence(
          evidence,
          "normalized_history_and_audit",
        ).retrieved_at = "not-rfc3339";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_metadata_invalid",
        "legal_permission",
        "normalized_history_and_audit",
        "retrieved_at",
        "RFC 3339 timestamp",
        "not-rfc3339",
      ),
    },
    {
      name: "rejects invalid raw-content SHA-256",
      mutate: (evidence) => {
        operationalDecisionEvidence(
          evidence,
          "breaking_schema_notice",
        ).raw_content_sha256 = "bad";
      },
      diagnostic: expectedDecisionDiagnostic(
        "evidence_metadata_invalid",
        "operational_commitment",
        "breaking_schema_notice",
        "raw_content_sha256",
        "lowercase 64-hex SHA-256",
        "bad",
      ),
    },
    {
      name: "rejects duplicate evidence requirements",
      mutate: (evidence) => {
        evidence.legal_permissions.push({
          ...legalDecisionEvidence(evidence, "public_redisplay"),
          status: "denied",
        });
      },
      diagnostic: expectedDecisionDiagnostic(
        "duplicate_evidence_requirement",
        "legal_permission",
        "public_redisplay",
        "requirement",
        "unique",
        "duplicate",
      ),
    },
  ];

describe("evaluateCandidateVendorDecision", () => {
  it("returns GO only when technical, rights, operations, package, provenance, and quote minima pass", () => {
    const decision = candidateVendorDecisionApi.evaluateCandidateVendorDecision(
      passingCandidateVendorTechnicalReport(),
      validCandidateVendorDecisionEvidence(),
    );

    expect(decision).toEqual({
      decision: "go",
      technical_result: "pass",
      rights_and_operations_result: "pass",
      quote_approved: true,
      diagnostics: [],
    });
  });

  it.each(candidateVendorDecisionFailureCases)(
    "$name",
    ({ mutate, diagnostic }) => {
      const evidence = validCandidateVendorDecisionEvidence();
      mutate(evidence);

      const decision =
        candidateVendorDecisionApi.evaluateCandidateVendorDecision(
          passingCandidateVendorTechnicalReport(),
          evidence,
        );

      expect(decision).toEqual({
        decision: "no_go",
        technical_result: "pass",
        rights_and_operations_result: "fail",
        quote_approved: true,
        diagnostics: [diagnostic],
      });
    },
  );

  it.each([
    ["an explicitly unapproved quote", false, "false"],
    ["missing quote approval", undefined, null],
  ])("returns NO-GO for %s", (_label, quoteApproved, actual) => {
    const evidence = validCandidateVendorDecisionEvidence();
    if (quoteApproved === undefined) {
      delete evidence.quote_approved;
    } else {
      evidence.quote_approved = quoteApproved;
    }

    const decision = candidateVendorDecisionApi.evaluateCandidateVendorDecision(
      passingCandidateVendorTechnicalReport(),
      evidence,
    );

    expect(decision).toEqual({
      decision: "no_go",
      technical_result: "pass",
      rights_and_operations_result: "pass",
      quote_approved: false,
      diagnostics: [
        expectedDecisionDiagnostic(
          "quote_not_approved",
          "quote",
          null,
          "quote_approved",
          "true",
          actual,
        ),
      ],
    });
  });

  it("preserves a technical failure as NO-GO despite passing rights and operations", () => {
    const truth = validCandidateComparisonSet();
    const vendor = validVendorRecords(truth);
    vendor[0] = { ...vendor[0]!, lifecycle_status: "withdrawn" };
    const technicalReport = evaluateCandidateVendor(truth, vendor);
    expect(technicalReport.technical_result).toBe("fail");

    const decision = candidateVendorDecisionApi.evaluateCandidateVendorDecision(
      technicalReport,
      validCandidateVendorDecisionEvidence(),
    );

    expect(decision).toEqual({
      decision: "no_go",
      technical_result: "fail",
      rights_and_operations_result: "pass",
      quote_approved: true,
      diagnostics: [
        expectedDecisionDiagnostic(
          "technical_evaluation_failed",
          "technical",
          null,
          "technical_result",
          "pass",
          "fail",
        ),
      ],
    });
  });

  it("serializes stable audit output independent of evidence order", () => {
    const forwardEvidence = validCandidateVendorDecisionEvidence();
    legalDecisionEvidence(
      forwardEvidence,
      "current_response_cache",
    ).minimum_days = 29;
    operationalDecisionEvidence(
      forwardEvidence,
      "content_refresh",
    ).maximum_interval_hours = 25;
    forwardEvidence.quote_approved = false;
    const reverseEvidence = validCandidateVendorDecisionEvidence();
    legalDecisionEvidence(
      reverseEvidence,
      "current_response_cache",
    ).minimum_days = 29;
    operationalDecisionEvidence(
      reverseEvidence,
      "content_refresh",
    ).maximum_interval_hours = 25;
    reverseEvidence.quote_approved = false;
    reverseEvidence.legal_permissions.reverse();
    reverseEvidence.operational_commitments.reverse();
    const technicalReport = passingCandidateVendorTechnicalReport();

    const forward = candidateVendorDecisionApi.evaluateCandidateVendorDecision(
      technicalReport,
      forwardEvidence,
    );
    const reverse = candidateVendorDecisionApi.evaluateCandidateVendorDecision(
      technicalReport,
      reverseEvidence,
    );
    const serialized =
      candidateVendorDecisionApi.serializeCandidateVendorDecision(forward);

    expect(serialized).toBe(
      candidateVendorDecisionApi.serializeCandidateVendorDecision(reverse),
    );
    expect(serialized).toBe(JSON.stringify(forward));
    expect(forward.diagnostics).toEqual(
      [...forward.diagnostics].sort((left, right) => {
        const serializedLeft = JSON.stringify(left);
        const serializedRight = JSON.stringify(right);
        return serializedLeft < serializedRight
          ? -1
          : serializedLeft > serializedRight
            ? 1
            : 0;
      }),
    );
  });
});
