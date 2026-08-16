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

describe("normalizeCandidateName", () => {
  it.each([
    ["  JOSÉ\u00a0O’Neil, JR.  ", "josé o’neil, jr."],
    ["Ａvery\u2003Van Buren", "avery van buren"],
    ["\u0085Avery\u0085Example\u0085", "avery example"],
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

  it("rejects a required string containing only Unicode whitespace", () => {
    expect(
      validateCandidateParticipation(
        candidateParticipationWith({ candidate_name: "\u0085" }),
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
    "2026-08-15T12:00:00",
    "2026-08-15T12:00:00+24:00",
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
    ["a non-object alias", ["Avery Q. Example"]],
    ["an extra alias key", [aliasWith({ confidence: 1 })]],
    ["a missing alias key", [aliasWithout("locator")]],
    ["a blank alias name", [aliasWith({ name: "\u2003" })]],
    ["a blank alias source URL", [aliasWith({ source_url: " " })]],
    ["a blank alias locator", [aliasWith({ locator: "\u00a0" })]],
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
      "partisan nonpartisan",
      "nonpartisan",
      "qualified",
      "printed",
      ["Independent"],
    ],
    ["withdrawn nonpartisan", "nonpartisan", "withdrawn", "printed", []],
    ["write-in nonpartisan", "nonpartisan", "qualified", "write_in", []],
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
    ["withdrawn write-in", "write_in", "withdrawn", "write_in", []],
    ["printed write-in", "write_in", "qualified", "printed", []],
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
