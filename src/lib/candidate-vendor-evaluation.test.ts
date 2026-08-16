import { describe, expect, it } from "vitest";

import {
  normalizeCandidateName,
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

function arrayWithOwnIterator<T>(stored: unknown[], yielded: readonly T[]) {
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
