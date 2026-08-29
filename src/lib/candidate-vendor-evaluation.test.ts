import { describe, expect, it } from "vitest";

import {
  normalizeCandidateName,
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
