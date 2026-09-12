// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  electionScopeFromDivisions, projectContest, serializeElectionPackage, validateElectionPackage,
  type ContestField, type ContestView, type ElectionGraph, type ElectionEvidence, type EvidenceKind,
} from "./elections";
import {
  evidence, fixtureGraph, NOW, VERIFIED_AT, CURRENT_UNTIL, STATE, DISTRICT,
  type Mutable, type FixtureGraph,
} from "../../tests/fixtures/elections/domain";

describe("deterministic election evidence", () => {
  it("withholds a verified contest when persisted graph data is missing", () => {
    expect(
      projectContest(null as unknown as ElectionGraph, new Date("2026-09-12T12:00:00.000Z")),
    ).toEqual({ status: "unverified", reason: "invalid_graph" });
  });

  it("admits complete synthetic evidence only against an injected synthetic test policy", () => {
    const graph = fixtureGraph();
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
  });

  it("keeps FEC-type finance filing separate from ballot qualification and election filing", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("finance", "filed"));
    const result = projectContest(readGraph(graph), NOW);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected sourced contest");
    const candidate = result.candidates[0];
    expect(candidate.tracks.finance).toMatchObject({
      state: "verified", value: "filed", verified_at: "2026-09-12T12:00:00.000Z",
      evidence: [{ source_type: "official_finance", source_url: "https://finance.example.test/2026/filings" }],
    });
    expect(candidate.tracks.filing.state).toBe("unknown");
    expect(candidate.tracks.ballot_qualification.state).toBe("unknown");
    expect(candidate.tracks.ballot_appearance.state).toBe("unknown");
  });

  it("does not turn accepted election filing into certified ballot qualification", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("filing", "accepted"));
    const result = projectContest(readGraph(graph), NOW);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected sourced contest");
    expect(result.candidates[0].tracks.filing).toMatchObject({ state: "verified", value: "accepted" });
    expect(result.candidates[0].tracks.ballot_qualification.state).toBe("unknown");
  });
});

function view(graph = fixtureGraph(), now = NOW): ContestView {
  const result = projectContest(readGraph(graph), now);
  expect(result.status).toBe("available");
  if (result.status !== "available") throw new Error("Expected sourced contest");
  return result;
}

function metadata<K extends EvidenceKind>(graph: FixtureGraph, kind: K) {
  return graph.package.evidence.find((entry) => entry.kind === kind) as Mutable<ElectionEvidence<K>>;
}

function qualificationChange() {
  const graph = fixtureGraph();
  graph.package.evidence.push(
    evidence("ballot_qualification", "certified", { id: "qualified-before" }),
    evidence("ballot_qualification", "removed", {
      id: "removed-later",
      effective: { precision: "instant", start: "2026-09-12T14:00:00.000Z", end: null },
    }),
  );
  graph.package.supersessions.push({
    predecessor_id: "qualified-before", replacement_id: "removed-later", reason: "Synthetic operative correction",
  });
  return graph;
}

describe("independent, sourced legal claims", () => {
  it.each([
    ["intent", "declared"], ["intent", "withdrawn"],
    ["filing", "filed"], ["filing", "pending"], ["filing", "accepted"],
    ["ballot_qualification", "pending"], ["ballot_qualification", "certified"],
    ["ballot_qualification", "removed"], ["ballot_qualification", "disqualified"],
    ["ballot_appearance", "listed_for_ballot"], ["ballot_appearance", "printed"],
    ["ballot_appearance", "write_in_eligible"], ["ballot_appearance", "not_on_ballot"],
    ["finance", "filed"],
  ] as const)("preserves %s=%s only on its own track with provenance", (kind, value) => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence(kind, value));
    const tracks = view(graph).candidates[0].tracks;
    expect(tracks[kind]).toMatchObject({
      state: "verified", value, verified_at: VERIFIED_AT,
      evidence: [{
        source_url: kind === "finance" ? "https://finance.example.test/2026/filings" : "https://elections.example.test/2026/candidates",
        source_type: kind === "finance" ? "official_finance" : "official_election_authority",
        original_term: value, locator: "Synthetic row 1", verified_at: VERIFIED_AT,
      }],
    });
    for (const other of ["intent", "filing", "ballot_qualification", "ballot_appearance", "outcome", "finance"] as const) {
      if (other !== kind) expect(tracks[other].state).toBe("unknown");
    }
    expect(tracks.continued_ballot_label).toBeNull();
  });

  it.each(["advanced", "won", "lost"] as const)("preserves explicit outcome %s without inferring qualification", (status) => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("outcome", { status, destination_contest_id: null }));
    expect(view(graph).candidates[0].tracks.outcome).toMatchObject({ state: "verified", value: { status } });
    expect(view(graph).candidates[0].tracks.ballot_qualification.state).toBe("unknown");
  });

  it("preserves certification without inventing physical printing", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("ballot_qualification", "certified"), evidence("ballot_appearance", "listed_for_ballot"));
    expect(view(graph).candidates[0].tracks.ballot_appearance).toMatchObject({ state: "verified", value: "listed_for_ballot" });
  });

  it("does not combine a new withdrawal with an older listing into continued appearance", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(
      evidence("ballot_appearance", "listed_for_ballot"),
      evidence("intent", "withdrawn", { effective: { precision: "instant", start: VERIFIED_AT, end: null } }),
    );
    const candidate = view(graph).candidates[0];
    expect(candidate.tracks.intent).toMatchObject({ state: "verified", value: "withdrawn" });
    expect(candidate.tracks.ballot_appearance).toMatchObject({ state: "verified", value: "listed_for_ballot" });
    expect(candidate.tracks.continued_ballot_label).toBeNull();
  });

  it("requires direct current continued-ballot evidence referencing that withdrawal", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(
      evidence("intent", "withdrawn", { id: "withdrawal" }),
      evidence("ballot_appearance", "listed_for_ballot"),
      evidence("ballot_continuation", { withdrawal_evidence_id: "withdrawal", appearance: "listed_for_ballot" }),
    );
    expect(view(graph).candidates[0].tracks.continued_ballot_label).toMatchObject({
      state: "verified", value: "withdrawn_still_on_ballot",
    });
    const direct = metadata(graph, "ballot_continuation");
    direct.current_until = "2026-09-12T12:30:00.000Z";
    expect(view(graph).candidates[0].tracks.continued_ballot_label).toBeNull();
  });

  it("keeps disqualification independent from removal or ballot appearance", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("ballot_qualification", "disqualified"), evidence("ballot_appearance", "printed"));
    expect(view(graph).candidates[0].tracks.ballot_qualification).toMatchObject({ state: "verified", value: "disqualified" });
    expect(view(graph).candidates[0].tracks.ballot_appearance).toMatchObject({ state: "verified", value: "printed" });
  });

  it("does not inherit candidacy or other party-line qualification into an unverified line", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(
      evidence("ballot_qualification", "certified"),
      evidence("ballot_qualification", "certified", { subject: { kind: "ballot_line", id: "line-a-one" } }),
    );
    const lines = view(graph).candidates[0].ballot_lines;
    expect(lines[0].tracks.ballot_qualification).toMatchObject({ state: "verified", value: "certified" });
    expect(lines[1].tracks.ballot_qualification.state).toBe("unknown");
  });

  it("keeps contradictory unsuperseded sources visible regardless of assertion order or age", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(
      evidence("ballot_qualification", "certified", { id: "certified-old", current_until: "2026-09-12T12:30:00.000Z" }),
      evidence("ballot_qualification", "removed", { id: "removed-new" }),
    );
    const result = view(graph);
    const state = result.candidates[0].tracks.ballot_qualification;
    expect(state.state).toBe("conflict");
    if (state.state !== "conflict") throw new Error("Expected conflict");
    expect(state.assertions.map((assertion) => assertion.value).sort()).toEqual(["certified", "removed"]);
    expect(state.assertions).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "certified", evidence: expect.objectContaining({
        source_url: "https://elections.example.test/2026/candidates", source_type: "official_election_authority",
        original_term: "certified", locator: "Synthetic row 1", verified_at: VERIFIED_AT,
      }) }),
      expect.objectContaining({ value: "removed", evidence: expect.objectContaining({
        source_url: "https://elections.example.test/2026/candidates", source_type: "official_election_authority",
        original_term: "removed", locator: "Synthetic row 1", verified_at: VERIFIED_AT,
      }) }),
    ]));
    expect(result.candidates[0].history).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "ballot_qualification", value: "certified",
        evidence: expect.objectContaining({
          source_url: "https://elections.example.test/2026/candidates", source_type: "official_election_authority",
          original_term: "certified", locator: "Synthetic row 1", verified_at: VERIFIED_AT,
        }) }),
    ]));
    graph.package.evidence.reverse();
    graph.package.candidacies.reverse();
    graph.package.ballot_lines.reverse();
    expect(view(graph)).toEqual(result);
  });

  it("corroborates identical claims without duplicating candidates or making a conflict", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(
      evidence("ballot_qualification", "certified", { id: "source-one" }),
      evidence("ballot_qualification", "certified", { id: "source-two" }),
    );
    const result = view(graph);
    expect(result.candidates).toHaveLength(2);
    const state = result.candidates[0].tracks.ballot_qualification;
    expect(state.state).toBe("verified");
    if (state.state !== "verified") throw new Error("Expected verified");
    expect(state.evidence.map((source) => source.id)).toEqual(["source-one", "source-two"]);
  });

  it("does not interpret an absent candidate status as withdrawn, lost, or removed", () => {
    const candidate = view().candidates[0];
    expect(candidate.tracks.intent).toEqual({ state: "unknown", last_checked_at: null });
    expect(candidate.tracks.outcome).toEqual({ state: "unknown", last_checked_at: null });
    expect(candidate.tracks.ballot_qualification).toEqual({ state: "unknown", last_checked_at: null });
  });

  it("represents special, nonpartisan and multi-seat candidate contests without inferring outcomes", () => {
    const graph = fixtureGraph();
    metadata(graph, "election_metadata").value.kind = "special";
    const contest = metadata(graph, "contest_metadata").value;
    contest.seats = 2;
    contest.form = "candidate_multi_seat";
    contest.partisanship = "nonpartisan";
    expect(view(graph).election).toMatchObject({ state: "verified", value: { kind: "special" } });
    expect(view(graph).contest).toMatchObject({ state: "verified", value: { seats: 2, partisanship: "nonpartisan" } });
    expect(view(graph).candidates.every((candidate) => candidate.tracks.outcome.state === "unknown")).toBe(true);
  });
});

describe("effective time and durable supersession", () => {
  it.each([
    ["2026-09-12T13:59:59.999Z", "certified"],
    ["2026-09-12T14:00:00.000Z", "removed"],
  ])("does not retire a predecessor before the replacement starts at %s", (time, expected) => {
    expect(view(qualificationChange(), new Date(time)).candidates[0].tracks.ballot_qualification)
      .toMatchObject({ state: "verified", value: expected });
  });

  it("does not resurrect a retired predecessor when its replacement goes stale", () => {
    const graph = qualificationChange();
    graph.package.evidence.find((entry) => entry.id === "removed-later")!.current_until = "2026-09-12T14:30:00.000Z";
    const candidate = view(graph, new Date("2026-09-12T15:00:00.000Z")).candidates[0];
    expect(candidate.tracks.ballot_qualification).toMatchObject({
      state: "stale", previous: [{ value: "removed", evidence: { id: "removed-later" } }],
    });
    expect(candidate.history.find((entry) => entry.evidence.id === "qualified-before")?.superseded).toBe(true);
  });

  it("does not resurrect a predecessor after an operative replacement interval ends", () => {
    const graph = qualificationChange();
    graph.package.evidence.find((entry) => entry.id === "removed-later")!.effective = {
      precision: "instant", start: "2026-09-12T14:00:00.000Z", end: "2026-09-12T15:00:00.000Z",
    };
    expect(view(graph, new Date("2026-09-12T15:00:00.000Z")).candidates[0].tracks.ballot_qualification.state).toBe("stale");
  });

  it.each([
    ["2026-09-12T12:59:59.999Z", "unknown"],
    ["2026-09-12T13:00:00.000Z", "verified"],
    ["2026-09-12T14:00:00.000Z", "stale"],
  ])("uses start-inclusive/end-exclusive operative instants at %s", (time, state) => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("intent", "declared", {
      effective: { precision: "instant", start: "2026-09-12T13:00:00.000Z", end: "2026-09-12T14:00:00.000Z" },
    }));
    expect(view(graph, new Date(time)).candidates[0].tracks.intent.state).toBe(state);
  });

  it("expires current verification at exactly 24 hours while retaining dated history", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("ballot_qualification", "certified"));
    const result = view(graph, new Date(CURRENT_UNTIL));
    expect(result.verification).toBe("historical");
    expect(result.candidates[0].tracks.ballot_qualification).toMatchObject({
      state: "stale", previous: [{ value: "certified", evidence: { verified_at: VERIFIED_AT } }],
    });
    expect(result.upcoming).toBeNull();
  });

  it.each(["expiry", "withdrawal"] as const)("suppresses current claims after policy %s without deleting permitted history", (change) => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("ballot_qualification", "certified"));
    if (change === "expiry") graph.policy.authorities[0].current_display_until = "2026-09-12T12:30:00.000Z";
    else graph.policy.authorities[0].enabled = false;
    const result = view(graph);
    expect(result.verification).toBe("historical");
    expect(result.candidates[0].tracks.ballot_qualification.state).toBe("stale");
    expect(result.candidates[0].history.some((entry) => entry.kind === "ballot_qualification")).toBe(true);
  });

  it.each([
    ["2026-09-13T06:59:59.999Z", "unknown"],
    ["2026-09-13T07:00:00.000Z", "verified"],
  ])("withholds a date-only claim until its local date ends at %s", (time, state) => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("intent", "declared", {
      effective: { precision: "date", start: "2026-09-12", end: null },
    }));
    expect(view(graph, new Date(time)).candidates[0].tracks.intent.state).toBe(state);
  });

  it("applies source-reviewed start-of-day semantics without changing source date precision", () => {
    const graph = fixtureGraph();
    graph.policy.authorities[0].mappings.find((item) => item.id === "intent:candidacy")!.date_rule!.start = "start_of_day";
    graph.package.evidence.push(evidence("intent", "declared", {
      effective: { precision: "date", start: "2026-09-12", end: null },
    }));
    const intent = view(graph).candidates[0].tracks.intent;
    expect(intent).toMatchObject({ state: "verified", evidence: [{ effective: { precision: "date", start: "2026-09-12" } }] });
  });

  it("stops a date-only expiry at the start of its local date under conservative mapping", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("intent", "declared", {
      effective: { precision: "date", start: "2026-09-01", end: "2026-09-13" },
    }));
    expect(view(graph, new Date("2026-09-13T06:59:59.999Z")).candidates[0].tracks.intent.state).toBe("verified");
    expect(view(graph, new Date("2026-09-13T07:00:00.000Z")).candidates[0].tracks.intent.state).toBe("stale");
  });

  it.each([false, true])("requires an explicit current-snapshot mapping for unknown effective time: %s", (supported) => {
    const graph = fixtureGraph();
    graph.policy.authorities[0].mappings.find((item) => item.id === "intent:candidacy")!.supports_current_snapshot = supported;
    graph.package.evidence.push(evidence("intent", "declared", {
      effective: { precision: "unknown", reason: "not_published" },
    }));
    expect(view(graph).candidates[0].tracks.intent.state).toBe(supported ? "verified" : "unknown");
  });

  it("keeps date-only applicability unknown without an admitted timezone rule", () => {
    const graph = fixtureGraph();
    graph.policy.authorities[0].mappings.find((item) => item.id === "intent:candidacy")!.date_rule = null;
    graph.package.evidence.push(evidence("intent", "declared", { effective: { precision: "date", start: "2026-09-01", end: null } }));
    expect(view(graph).candidates[0].tracks.intent.state).toBe("unknown");
  });
});

describe("package admission and identity trust boundaries", () => {
  const invalidCases: readonly [string, (graph: FixtureGraph) => void][] = [
    ["unknown package fields", (g) => { Object.assign(g.package, { address: "PRIVATE-ADDRESS-SENTINEL" }); }],
    ["unknown metadata fields", (g) => { Object.assign(metadata(g, "candidacy_metadata").value, { email: "private@example.test" }); }],
    ["unsupported dataset", (g) => { g.package.dataset_kind = "official"; }],
    ["unadmitted document source", (g) => { g.package.documents[0].authority_id = "unapproved"; }],
    ["lookalike source host", (g) => { g.package.documents[0].url = "https://elections.example.test.attacker.test/2026/candidates"; }],
    ["source URL query", (g) => { g.package.documents[0].url += "?address=PRIVATE-ADDRESS-SENTINEL"; }],
    ["source URL credentials", (g) => { g.package.documents[0].url = "https://name:secret@elections.example.test/2026/candidates"; }],
    ["source URL fragment", (g) => { g.package.documents[0].url += "#claim"; }],
    ["source non-HTTPS URL", (g) => { g.package.documents[0].url = "http://elections.example.test/2026/candidates"; }],
    ["unknown source path", (g) => { g.package.documents[0].url = "https://elections.example.test/anything"; }],
    ["missing document digest", (g) => { g.package.documents[0].sha256 = ""; }],
    ["unknown mapping", (g) => { g.package.evidence[0].mapping_id = "unapproved"; }],
    ["empty original term", (g) => { g.package.evidence[0].original_term = ""; }],
    ["empty exact locator", (g) => { g.package.evidence[0].locator = ""; }],
    ["control characters", (g) => { metadata(g, "candidacy_metadata").value.name = "Name\nPRIVATE-ADDRESS-SENTINEL"; }],
    ["future review", (g) => {
      g.package.evidence[0].verified_at = "2026-09-13T12:00:00.000Z";
      g.package.evidence[0].current_until = "2026-09-14T12:00:00.000Z";
    }],
    ["retrieval after review", (g) => { g.package.evidence[0].retrieved_at = "2026-09-12T12:01:00.000Z"; }],
    ["more than 24-hour verification", (g) => { g.package.evidence[0].current_until = "2026-09-13T12:00:00.001Z"; }],
    ["nonpositive verification window", (g) => { g.package.evidence[0].current_until = VERIFIED_AT; }],
    ["impossible calendar date", (g) => { metadata(g, "stage_metadata").value.date = "2026-02-30"; }],
    ["unknown timezone", (g) => { metadata(g, "stage_metadata").value.time_zone = "Not/A-Timezone"; }],
    ["invalid effective interval", (g) => { g.package.evidence[0].effective = { precision: "instant", start: VERIFIED_AT, end: VERIFIED_AT }; }],
    ["date precision with invented instant", (g) => { g.package.evidence[0].effective = { precision: "date", start: VERIFIED_AT, end: null }; }],
    ["unknown precision hiding future effect", (g) => { g.package.evidence[0].effective = Object.assign({ precision: "unknown" as const, reason: "not_published" as const }, { start: "2027-01-01" }); }],
    ["duplicate application identity", (g) => { g.package.candidacies[1].id = g.package.candidacies[0].id; }],
    ["duplicate scoped official identity", (g) => { g.package.candidacies[1].official_key = g.package.candidacies[0].official_key; }],
    ["dangling parent identity", (g) => { g.package.candidacies[0].contest_id = "missing"; }],
    ["dangling revision", (g) => { g.package.candidacies[0].revision_of = "missing"; }],
    ["self revision", (g) => { g.package.candidacies[0].revision_of = g.package.candidacies[0].id; }],
    ["duplicate document ID", (g) => { g.package.documents[1].id = g.package.documents[0].id; }],
    ["duplicate evidence ID", (g) => { g.package.evidence[1].id = g.package.evidence[0].id; }],
    ["dangling evidence subject", (g) => { g.package.evidence[0].subject.id = "missing"; }],
    ["claim on wrong subject type", (g) => { g.package.evidence[0].subject = { kind: "candidacy", id: "candidate-avery" }; }],
    ["unsupported contest form", (g) => { Object.assign(metadata(g, "contest_metadata").value, { form: "judicial_retention_question" }); }],
    ["seat count/form disagreement", (g) => { metadata(g, "contest_metadata").value.seats = 2; }],
    ["wrong jurisdiction", (g) => { metadata(g, "contest_metadata").value.jurisdiction_id = "ocd-division/country:us/state:ny"; }],
    ["unknown successor stage", (g) => { metadata(g, "stage_metadata").value.successor_stage_ids = ["missing"]; }],
    ["self successor stage", (g) => { metadata(g, "stage_metadata").value.successor_stage_ids = ["stage-general"]; }],
    ["unreviewed stage scope", (g) => { g.policy.authorities[0].stage_keys = ["another-stage"]; }],
    ["unreviewed contest scope", (g) => { g.policy.authorities[0].contest_keys = ["another-contest"]; }],
    ["unreviewed election scope", (g) => { g.policy.authorities[0].election_key = "another-election"; }],
    ["unknown rights", (g) => { g.policy.authorities[0].access_approval = ""; }],
    ["unknown retention", (g) => { g.policy.authorities[0].retention_approval = ""; }],
    ["finite retention", (g) => { Object.assign(g.policy.authorities[0], { retention: "30-days" }); }],
    ["removal-required retention", (g) => { Object.assign(g.policy.authorities[0], { retention: "erase-on-termination" }); }],
  ];

  it.each(invalidCases)("rejects %s while admitting its unmodified control", (_label, mutate) => {
    const graph = fixtureGraph();
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    mutate(graph);
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("rejected");
    expect(projectContest(readGraph(graph), NOW).status).toBe("unverified");
  });

  it("rejects an unknown import policy version before records can enter the ledger", () => {
    const graph = fixtureGraph();
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    graph.package.policy_version = "self-approved";
    expect(validateElectionPackage(graph.package, graph.policy, NOW)).toEqual({ status: "rejected", reason: "source_not_admitted" });
  });

  it("never grants FEC-type finance evidence a ballot claim even with an overbroad mapping", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("finance", "filed"));
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    graph.policy.authorities[1].mappings.push({
      ...graph.policy.authorities[0].mappings.find((item) => item.id === "ballot_qualification:candidacy")!,
    });
    graph.package.evidence.push(evidence("ballot_qualification", "certified", { document_id: "finance-document" }));
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("rejected");
  });

  it("rejects unsupported status vocabulary even when incoming mapping configuration names it", () => {
    const graph = fixtureGraph();
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    graph.policy.authorities[0].mappings.find((item) => item.id === "ballot_qualification:candidacy")!.values.push("assumed");
    graph.package.evidence.push(Object.assign(evidence("ballot_qualification", "certified"), { value: "assumed" }) as Mutable<ElectionEvidence>);
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("rejected");
  });

  it("does not execute accessor or toJSON code while validating incoming objects", () => {
    const graph = fixtureGraph();
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    let executed = false;
    Object.defineProperty(graph.package, "toJSON", {
      enumerable: true,
      get() { executed = true; throw new Error("Must not execute"); },
    });
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("rejected");
    expect(executed).toBe(false);
  });

  it("rejects cyclic objects and sparse arrays before serialization", () => {
    const graph = fixtureGraph();
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    Object.assign(graph.package, { cycle: graph.package });
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("rejected");
    const sparse = fixtureGraph();
    delete (sparse.package.documents as Partial<typeof sparse.package.documents>)[0];
    expect(validateElectionPackage(sparse.package, sparse.policy, NOW).status).toBe("rejected");
  });

  it.each(["dangling", "cycle", "cross_subject", "cross_track", "unauthorized"] as const)(
    "rejects %s supersession without accepting a partial graph", (kind) => {
      const graph = qualificationChange();
      expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
      if (kind === "dangling") graph.package.supersessions[0].predecessor_id = "missing";
      if (kind === "cycle") graph.package.supersessions.push({ predecessor_id: "removed-later", replacement_id: "qualified-before", reason: "Cycle" });
      if (kind === "cross_subject") graph.package.evidence.find((entry) => entry.id === "removed-later")!.subject.id = "candidate-blair";
      if (kind === "cross_track") Object.assign(graph.package.evidence.find((entry) => entry.id === "removed-later")!, { kind: "intent", value: "withdrawn", mapping_id: "intent:candidacy" });
      if (kind === "unauthorized") graph.policy.authorities[0].mappings.find((item) => item.id === "ballot_qualification:candidacy")!.allows_supersession = false;
      expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("rejected");
    },
  );

  it("withholds a current contest when required metadata conflicts, without hiding its evidence", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("contest_metadata", {
      ...metadata(graph, "contest_metadata").value, office: "A different official office",
    }, { id: "conflicting-office", subject: { kind: "contest", id: "contest-house" } }));
    const result = projectContest(readGraph(graph), NOW);
    expect(result).toMatchObject({ status: "unverified", reason: "unverified_metadata" });
    expect(result.status === "unverified" && result.history?.some((item) => item.evidence.id === "conflicting-office")).toBe(true);
  });

  it("keeps distinct same-name people separate and does not transfer claims to a corrected identity", () => {
    const graph = fixtureGraph();
    const second = graph.package.evidence.find((entry) => entry.kind === "candidacy_metadata" && entry.subject.id === "candidate-blair")!;
    if (second.kind !== "candidacy_metadata") throw new Error("Expected metadata");
    second.value.name = "Avery Example";
    graph.package.evidence.push(evidence("ballot_qualification", "certified"));
    expect(view(graph).candidates.map((candidate) => candidate.id)).toEqual(["candidate-avery", "candidate-blair"]);
    graph.package.candidacies.push({
      ...graph.package.candidacies[0], id: "candidate-corrected", revision: "correction-1", revision_of: "candidate-avery",
    });
    graph.package.evidence.push(
      evidence("candidacy_metadata", { name: "Avery Corrected", official_person_id: { issuer: "fixture-office", value: "person-a" } },
        { subject: { kind: "candidacy", id: "candidate-corrected" } }),
      evidence("retirement", { replacement_id: "candidate-corrected" }),
    );
    const result = view(graph);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["candidate-corrected", "candidate-blair"]);
    expect(result.candidates[0].tracks.ballot_qualification.state).toBe("unknown");
    expect(result.retired_candidates.map((candidate) => candidate.id)).toEqual(["candidate-avery"]);
    expect(result.retired_candidates[0].tracks.ballot_qualification).toMatchObject({
      state: "stale", previous: [{ value: "certified", evidence: { verified_at: VERIFIED_AT } }],
    });
    expect(result.retired_candidates[0].history.find((entry) => entry.kind === "ballot_qualification")?.applicability).toBe("historical");
    expect(result.retired_candidates[0]).toMatchObject({
      ballot_lines: [],
      retired_ballot_lines: [
        { id: "line-a-one", history: [{ applicability: "historical" }] },
        { id: "line-a-two", history: [{ applicability: "historical" }] },
      ],
    });
  });

  it("retains a corrected ballot line's sourced history without transferring its qualification", () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("ballot_qualification", "certified", {
      subject: { kind: "ballot_line", id: "line-a-one" },
    }));
    expect(view(graph).candidates[0].ballot_lines[0].tracks.ballot_qualification.state).toBe("verified");
    graph.package.ballot_lines.push({
      ...graph.package.ballot_lines[0], id: "line-corrected", revision: "correction-1", revision_of: "line-a-one",
    });
    graph.package.evidence.push(
      evidence("ballot_line_metadata", { name: "Synthetic corrected line", party_label: "Corrected Example" },
        { subject: { kind: "ballot_line", id: "line-corrected" } }),
      evidence("retirement", { replacement_id: "line-corrected" },
        { subject: { kind: "ballot_line", id: "line-a-one" } }),
    );
    const result = view(graph);
    expect(result.candidates[0].ballot_lines.map((line) => line.id)).toEqual(["line-corrected", "line-a-two"]);
    expect(result.candidates[0].ballot_lines[0].tracks.ballot_qualification.state).toBe("unknown");
    expect(result.candidates[0]).toMatchObject({
      retired_ballot_lines: [{
        id: "line-a-one",
        tracks: { ballot_qualification: { state: "stale", previous: [{
          value: "certified", evidence: {
            source_url: "https://elections.example.test/2026/candidates", source_type: "official_election_authority",
            original_term: "certified", locator: "Synthetic row 1", verified_at: VERIFIED_AT,
          },
        }] } },
        history: expect.arrayContaining([{ kind: "ballot_qualification", subject: { kind: "ballot_line", id: "line-a-one" },
          value: "certified", applicability: "historical", superseded: false, evidence: expect.objectContaining({
            source_url: "https://elections.example.test/2026/candidates", original_term: "certified", locator: "Synthetic row 1",
          }),
        }]),
      }],
    });
  });
});

describe("public division and civil-date boundaries", () => {
  const stateDivision = { type: "state" as const, idScheme: "ocd" as const, id: STATE, name: "California" };
  const houseDivision = { type: "congressional_district" as const, idScheme: "ocd" as const, id: DISTRICT, name: "District 12" };

  it("uses exact public divisions without echoing their labels or inferring another district", () => {
    expect(electionScopeFromDivisions([stateDivision, houseDivision], "federal")).toEqual({
      status: "available", coverage: "exact",
      scope: { level: "federal", jurisdiction_id: STATE, division_ids: [STATE, DISTRICT] },
    });
  });

  it("keeps statewide coverage partial when the exact congressional division is missing", () => {
    expect(electionScopeFromDivisions([stateDivision], "federal")).toMatchObject({
      status: "available", coverage: "partial", scope: { division_ids: [STATE] },
    });
  });

  it("matches upper/lower state divisions exactly, with honest statewide-only partial coverage", () => {
    const upper = { type: "state_upper" as const, idScheme: "ocd", id: STATE + "/sldu:4", name: "Upper 4" };
    const lower = { type: "state_lower" as const, idScheme: "ocd", id: STATE + "/sldl:7", name: "Lower 7" };
    expect(electionScopeFromDivisions([lower, stateDivision, upper], "state")).toEqual({
      status: "available", coverage: "exact",
      scope: { level: "state", jurisdiction_id: STATE, division_ids: [STATE, STATE + "/sldl:7", STATE + "/sldu:4"] },
    });
    expect(electionScopeFromDivisions([stateDivision], "state")).toEqual({
      status: "available", coverage: "partial",
      scope: { level: "state", jurisdiction_id: STATE, division_ids: [STATE] },
    });
    expect(electionScopeFromDivisions([stateDivision, { ...upper, id: "ocd-division/country:us/state:ny/sldu:4" }, lower], "state")).toEqual({ status: "invalid" });
    expect(electionScopeFromDivisions([stateDivision, { ...upper, type: "state_lower" }, lower], "state")).toEqual({ status: "invalid" });
  });

  it.each([
    ["no residence", [], "federal", "missing"],
    ["unsupported local boundaries", [stateDivision, houseDivision], "local", "unsupported"],
    ["unsupported Census scheme", [{ ...stateDivision, idScheme: "census", id: "06" }], "federal", "unsupported"],
    ["mismatched state", [stateDivision, { ...houseDivision, id: "ocd-division/country:us/state:ny/cd:12" }], "federal", "invalid"],
    ["mismatched division type", [stateDivision, { ...houseDivision, type: "state_upper" }], "federal", "invalid"],
    ["a label cannot stand in for ID", [stateDivision, { ...houseDivision, id: "District 12" }], "federal", "invalid"],
  ] as const)("handles %s without a guessed scope", (_label, divisions, level, status) => {
    expect(electionScopeFromDivisions(divisions, level)).toEqual({ status });
  });

  it.each([
    ["2026-11-03", "2026-11-04T07:59:59.999Z", true],
    ["2026-11-03", "2026-11-04T08:00:00.000Z", false],
    ["2026-11-01", "2026-11-02T07:59:59.999Z", true],
    ["2026-11-01", "2026-11-02T08:00:00.000Z", false],
  ])("filters date %s at local midnight/DST boundary %s without a polls-open claim", (date, now, upcoming) => {
    const graph = fixtureGraph();
    metadata(graph, "stage_metadata").value.date = date;
    const reviewed = new Date(new Date(now).getTime() - 60_000);
    for (const entry of graph.package.evidence) {
      entry.verified_at = reviewed.toISOString();
      entry.retrieved_at = reviewed.toISOString();
      entry.current_until = new Date(reviewed.getTime() + 86_400_000).toISOString();
    }
    expect(view(graph, new Date(now)).upcoming).toBe(upcoming);
  });

  it.each(["date", "time_zone"] as const)("cannot establish upcoming inclusion without %s", (field) => {
    const graph = fixtureGraph();
    metadata(graph, "stage_metadata").value[field] = null;
    expect(view(graph).upcoming).toBeNull();
  });
});

describe("linked stages and bounded input", () => {
  it("keeps a linked primary advancement separate from the same person's general candidacy", () => {
    const graph = fixtureGraph();
    graph.package.stages.push({
      ...graph.package.stages[0], id: "stage-primary", official_key: "primary",
    });
    graph.package.contests.push({
      ...graph.package.contests[0], id: "contest-primary", official_key: "house-12-primary", stage_id: "stage-primary",
    });
    graph.package.candidacies.push({
      ...graph.package.candidacies[0], id: "candidate-primary", contest_id: "contest-primary",
    });
    metadata(graph, "election_metadata").value.coverage.contest_ids.push("contest-primary");
    graph.package.evidence.push(
      evidence("stage_metadata", {
        name: "Synthetic primary", kind: "primary", date: "2026-06-02",
        time_zone: "America/Los_Angeles", successor_stage_ids: ["stage-general"],
      }, { subject: { kind: "stage", id: "stage-primary" } }),
      evidence("contest_metadata", metadata(graph, "contest_metadata").value,
        { subject: { kind: "contest", id: "contest-primary" } }),
      evidence("candidacy_metadata", metadata(graph, "candidacy_metadata").value,
        { subject: { kind: "candidacy", id: "candidate-primary" } }),
      evidence("outcome", { status: "advanced", destination_contest_id: "contest-house" },
        { subject: { kind: "candidacy", id: "candidate-primary" } }),
      evidence("ballot_qualification", "certified",
        { subject: { kind: "candidacy", id: "candidate-primary" } }),
    );
    const general = view(graph);
    expect(general.candidates.map((candidate) => candidate.id)).toEqual(["candidate-avery", "candidate-blair"]);
    expect(general.candidates[0].tracks.outcome.state).toBe("unknown");
    expect(general.candidates[0].tracks.ballot_qualification.state).toBe("unknown");
    graph.contest_id = "contest-primary";
    expect(view(graph).candidates[0].tracks.outcome).toMatchObject({ state: "verified", value: { status: "advanced" } });
    // Removing an existing general-stage participation cannot make advancement recreate it.
    graph.package.candidacies = graph.package.candidacies.filter((candidate) => candidate.id !== "candidate-avery");
    graph.package.ballot_lines = [];
    graph.package.evidence = graph.package.evidence.filter((entry) =>
      entry.subject.id !== "candidate-avery" && entry.subject.kind !== "ballot_line");
    graph.contest_id = "contest-house";
    expect(view(graph).candidates.map((candidate) => candidate.id)).toEqual(["candidate-blair"]);
  });

  it("admits 1,000 distinct candidacies and rejects 1,001 without truncation", () => {
    const graph = fixtureGraph();
    for (let index = 2; index <= 1_000; index += 1) {
      const candidate = {
        ...graph.package.candidacies[0], id: "candidate-" + index, official_key: "candidate-key-" + index,
      };
      graph.package.candidacies.push(candidate);
      graph.package.evidence.push(evidence("candidacy_metadata", {
        name: "Synthetic Person " + index, official_person_id: { issuer: "fixture-office", value: "person-" + index },
      }, { subject: { kind: "candidacy", id: candidate.id } }));
      if (index === 999) {
        expect(graph.package.candidacies).toHaveLength(1_000);
        expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
      }
    }
    expect(graph.package.candidacies).toHaveLength(1_001);
    expect(validateElectionPackage(graph.package, graph.policy, NOW)).toEqual({ status: "rejected", reason: "limit_exceeded" });
  });

  it("admits 20 distinct approved document references and rejects 21", () => {
    const graph = fixtureGraph();
    for (let index = 2; index <= 20; index += 1) {
      const url = "https://elections.example.test/2026/document-" + index;
      graph.policy.authorities[0].urls.push(url);
      graph.package.documents.push({
        ...graph.package.documents[0], id: "document-" + index, url,
      });
      if (index === 19) {
        expect(graph.package.documents).toHaveLength(20);
        expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
      }
    }
    expect(validateElectionPackage(graph.package, graph.policy, NOW)).toEqual({ status: "rejected", reason: "limit_exceeded" });
  });

  it("admits exactly 2 MiB and rejects one additional permitted text byte", () => {
    const graph = fixtureGraph();
    const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value) + "\n", "utf8");
    const maximum = 2 * 1_024 * 1_024;
    let bytes = size(graph.package);
    for (let index = 0; ; index += 1) {
      const entry = evidence("intent", "declared", {
        id: "bounded-" + index, original_term: "x".repeat(500), locator: "y".repeat(500),
      });
      const added = Buffer.byteLength(JSON.stringify(entry), "utf8") + 1;
      if (bytes + added > maximum) break;
      graph.package.evidence.push(entry);
      bytes += added;
    }
    for (const entry of graph.package.evidence) {
      for (const field of ["locator", "original_term"] as const) {
        const extra = Math.min(500 - entry[field].length, maximum - bytes);
        entry[field] += "x".repeat(extra);
        bytes += extra;
      }
      if (bytes === maximum) break;
    }
    expect(size(graph.package)).toBe(2_097_152);
    expect(graph.package.evidence.length).toBeLessThan(10_000);
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    const expandable = graph.package.evidence.find((entry) => entry.locator.length < 500)!;
    expandable.locator += "z";
    expect(size(graph.package)).toBe(2_097_153);
    const oversized = validateElectionPackage(graph.package, graph.policy, NOW);
    expect(oversized.status).toBe("rejected");
    if (oversized.status === "rejected") expect(oversized.reason).toBe("limit_exceeded");
  });

  it("rejects 10,001 distinct assertions without treating duplicate IDs as the reason", () => {
    const graph = fixtureGraph();
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    for (let index = graph.package.evidence.length; index < 10_001; index += 1) {
      graph.package.evidence.push(evidence("intent", "declared", { id: "assertion-" + index }));
    }
    expect(new Set(graph.package.evidence.map((entry) => entry.id)).size).toBe(10_001);
    // The required provenance fields already make this exceed 2 MiB; both ceilings apply.
    expect(Buffer.byteLength(JSON.stringify(graph.package), "utf8")).toBeGreaterThan(2_097_152);
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("rejected");
  });
});

function readGraph(graph = fixtureGraph(), offset = 0, limit = 100): Mutable<ElectionGraph> {
  const { schema_version, policy_version, ...ledger } = graph.package;
  void schema_version;
  void policy_version;
  return {
    ledger,
    policy: graph.policy, contest_id: graph.contest_id,
    completeness: { current: "complete", supersession: "complete", history: "complete" },
    history_page: { offset, limit },
  };
}

function ledgerView(graph: ReturnType<typeof readGraph>): ContestView {
  const result = projectContest(graph as unknown as ElectionGraph, NOW);
  expect(result.status).toBe("available");
  if (result.status !== "available") throw new Error("Expected complete ledger view");
  return result;
}

function displayedHistory(result: ContestView) {
  return [...result.history, ...[...result.candidates, ...result.retired_candidates].flatMap((candidate) =>
    [...candidate.history, ...[...candidate.ballot_lines, ...candidate.retired_ballot_lines].flatMap((line) => line.history)])];
}

describe("accumulated ledger reads and bounded history display", () => {
  it("retains more than 20 distinct explicitly admitted historical source URLs", () => {
    const graph = readGraph();
    for (let index = 0; index < 20; index += 1) {
      const url = "https://elections.example.test/retained-" + index;
      graph.policy.authorities[0].urls.push(url);
      graph.ledger.documents.push({ ...graph.ledger.documents[0], id: "retained-url-" + index, url });
      if (index === 18) ledgerView(graph);
    }
    expect(graph.policy.authorities[0].urls).toHaveLength(21);
    expect(ledgerView(graph).status).toBe("available");
  });

  it("reads an accumulated ledger beyond import byte, assertion, document, and link limits", () => {
    const fixture = fixtureGraph();
    expect(validateElectionPackage(fixture.package, fixture.policy, NOW).status).toBe("valid");
    for (let index = 0; index < 10_010; index += 1) {
      fixture.package.evidence.push(evidence("intent", "declared", { id: "review-" + index }));
      if (index > 0) fixture.package.supersessions.push({
        replacement_id: "review-" + index, predecessor_id: "review-" + (index - 1), reason: "Synthetic renewed review",
      });
    }
    for (let index = 0; index < 21; index += 1) {
      fixture.package.documents.push({ ...fixture.package.documents[0], id: "retained-document-" + index });
    }
    expect(Buffer.byteLength(JSON.stringify(fixture.package), "utf8")).toBeGreaterThan(2_097_152);
    expect(validateElectionPackage(fixture.package, fixture.policy, NOW).status).toBe("rejected");
    const result = ledgerView(readGraph(fixture));
    expect(result.candidates[0].tracks.intent).toMatchObject({
      state: "verified", value: "declared", evidence: [{ id: "review-10009" }],
    });
    expect(displayedHistory(result)).toHaveLength(100);
    expect(result).toMatchObject({
      history_page: { offset: 0, limit: 100, total: fixture.package.evidence.length, next_offset: 100, completeness: "complete" },
    });
    fixture.package.supersessions.reverse();
    expect(ledgerView(readGraph(fixture)).candidates[0].tracks.intent).toEqual(result.candidates[0].tracks.intent);
  });

  it("exposes stable next history pages without dropping records or hiding current assertions", () => {
    const fixture = fixtureGraph();
    fixture.package.evidence.push(evidence("ballot_qualification", "certified", { id: "zzz-qualified" }));
    const first = ledgerView(readGraph(fixture, 0, 2));
    const second = ledgerView(readGraph(fixture, 2, 2));
    expect(displayedHistory(first)).toHaveLength(2);
    expect(displayedHistory(second)).toHaveLength(2);
    const firstIds = displayedHistory(first).map((entry) => entry.evidence.id);
    const secondIds = displayedHistory(second).map((entry) => entry.evidence.id);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
    expect(first.candidates[0].tracks.ballot_qualification).toMatchObject({ state: "verified", value: "certified" });
    expect(first).toMatchObject({ history_page: { offset: 0, limit: 2, total: 8, next_offset: 2, completeness: "complete" } });
    fixture.package.evidence.reverse();
    expect(displayedHistory(ledgerView(readGraph(fixture, 0, 2))).map((entry) => entry.evidence.id)).toEqual(firstIds);
    const last = ledgerView(readGraph(fixture, 6, 2));
    expect(last).toMatchObject({ history_page: { offset: 6, limit: 2, total: 8, next_offset: null } });
    const allIds = [0, 2, 4, 6].flatMap((offset) => displayedHistory(ledgerView(readGraph(fixture, offset, 2))).map((entry) => entry.evidence.id));
    expect(new Set(allIds).size).toBe(fixture.package.evidence.length);
  });

  it("keeps conflicting track assertions visible when both fall outside the history page", () => {
    const fixture = fixtureGraph();
    fixture.package.evidence.push(
      evidence("ballot_qualification", "certified", { id: "zzz-qualified" }),
      evidence("ballot_qualification", "removed", { id: "zzz-removed" }),
    );
    const result = ledgerView(readGraph(fixture, 0, 1));
    expect(displayedHistory(result)).toHaveLength(1);
    expect(result.candidates[0].tracks.ballot_qualification).toMatchObject({
      state: "conflict", assertions: [
        { value: "certified", evidence: { id: "zzz-qualified", source_url: "https://elections.example.test/2026/candidates" } },
        { value: "removed", evidence: { id: "zzz-removed", source_url: "https://elections.example.test/2026/candidates" } },
      ],
    });
  });

  it("bounds history in metadata-conflict recovery while exposing both conflicting sources", () => {
    const fixture = fixtureGraph();
    for (let index = 0; index < 110; index += 1) {
      fixture.package.evidence.push(evidence("stage_metadata", metadata(fixture, "stage_metadata").value, {
        id: "old-stage-" + index, subject: { kind: "stage", id: "stage-general" },
        effective: { precision: "instant", start: "2026-09-01T00:00:00.000Z", end: "2026-09-02T00:00:00.000Z" },
      }));
    }
    fixture.package.evidence.push(evidence("contest_metadata", {
      ...metadata(fixture, "contest_metadata").value, office: "Synthetic conflicting office",
    }, { id: "zzz-conflicting-office", subject: { kind: "contest", id: "contest-house" } }));
    const result = projectContest(readGraph(fixture, 0, 1), NOW);
    expect(result.status).toBe("unverified");
    expect(result).toMatchObject({
      reason: "unverified_metadata",
      history_page: { offset: 0, limit: 1, total: 118, next_offset: 1, completeness: "complete" },
      metadata_conflicts: expect.arrayContaining([
        expect.objectContaining({ evidence: expect.objectContaining({ id: "contest-house:contest_metadata" }) }),
        expect.objectContaining({ evidence: expect.objectContaining({ id: "zzz-conflicting-office" }) }),
      ]),
    });
    if (result.status !== "unverified") throw new Error("Expected conflicting metadata");
    expect(result.history).toHaveLength(1);
  });

  it.each(["current", "supersession", "history"] as const)("rejects an incomplete %s read after a valid complete control", (field) => {
    const graph = readGraph();
    ledgerView(graph);
    graph.completeness[field] = "incomplete";
    expect(projectContest(graph as unknown as ElectionGraph, NOW)).toEqual({ status: "unverified", reason: "incomplete_graph" });
  });

  it.each([[-1, 10], [0, 0], [0, 101], [0.5, 10], [0, 2.5], [Number.MAX_SAFE_INTEGER + 1, 10]])(
    "rejects invalid history page offset %s / limit %s after a valid control", (offset, limit) => {
      ledgerView(readGraph());
      expect(projectContest(readGraph(fixtureGraph(), offset, limit) as unknown as ElectionGraph, NOW))
        .toEqual({ status: "unverified", reason: "invalid_graph" });
    },
  );

  it.each(["source", "identity"] as const)("still validates persisted %s records outside the selected page", (field) => {
    const graph = readGraph();
    ledgerView(graph);
    if (field === "source") graph.ledger.documents[0].url = "https://unknown.example.test/candidates";
    else graph.ledger.candidacies[0].contest_id = "missing-contest";
    expect(projectContest(graph as unknown as ElectionGraph, NOW).status).toBe("unverified");
  });
});

function withRunoffStage() {
  const graph = fixtureGraph();
  graph.package.stages.push({ ...graph.package.stages[0], id: "stage-runoff", official_key: "runoff" });
  graph.package.evidence.push(evidence("stage_metadata", {
    ...metadata(graph, "stage_metadata").value, name: "Synthetic runoff", kind: "runoff", successor_stage_ids: [],
  }, { subject: { kind: "stage", id: "stage-runoff" } }));
  return graph;
}

describe("independent review regressions", () => {
  it.each([1, 2, 3, 4])("accepts the admitted canonical California board division %s", (district) => {
    const graph = fixtureGraph();
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    const contest = metadata(graph, "contest_metadata").value;
    contest.office = "Synthetic board office";
    contest.district = String(district);
    contest.level = "state";
    contest.division_ids = [STATE + "/board_of_equalization:" + district];
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    expect(view(graph).contest).toMatchObject({ state: "verified", value: { division_ids: contest.division_ids } });
  });

  it.each(["boe:1", "board_of_equalization:0", "board_of_equalization:5", "board_of_equalization:first"])(
    "rejects unsupported board division alias/value %s", (division) => {
      const graph = fixtureGraph();
      expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
      metadata(graph, "contest_metadata").value.division_ids = [STATE + "/" + division];
      expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("rejected");
      expect(projectContest(readGraph(graph), NOW).status).toBe("unverified");
    },
  );

  it.each(["import", "read"] as const)("rejects wrong-jurisdiction status authority at the %s boundary", (boundary) => {
    const graph = fixtureGraph();
    const authority = structuredClone(graph.policy.authorities[0]);
    authority.id = "second-election-authority";
    graph.policy.authorities.push(authority);
    graph.package.documents.push({ ...graph.package.documents[0], id: "second-document", authority_id: authority.id });
    graph.package.evidence.push(evidence("ballot_qualification", "certified", { document_id: "second-document" }));
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    expect(view(graph).candidates[0].tracks.ballot_qualification.state).toBe("verified");
    authority.jurisdiction_id = "ocd-division/country:us/state:ny";
    if (boundary === "import") {
      expect(validateElectionPackage(graph.package, graph.policy, NOW)).toEqual({ status: "rejected", reason: "source_not_admitted" });
    } else {
      expect(projectContest(readGraph(graph), NOW)).toEqual({ status: "unverified", reason: "invalid_graph" });
    }
  });

  it.each(["division_ids", "contest_ids", "successor_stage_ids"] as const)(
    "corroborates equivalent %s sets while retaining each assertion's original order", (field) => {
      const graph = withRunoffStage();
      graph.package.stages.push({ ...graph.package.stages[0], id: "stage-primary", official_key: "primary" });
      graph.package.evidence.push(evidence("stage_metadata", {
        ...metadata(graph, "stage_metadata").value, name: "Synthetic primary", kind: "primary", successor_stage_ids: [],
      }, { subject: { kind: "stage", id: "stage-primary" } }));
      graph.package.contests.push({ ...graph.package.contests[0], id: "contest-other", official_key: "other-contest" });
      graph.package.evidence.push(evidence("contest_metadata", metadata(graph, "contest_metadata").value,
        { subject: { kind: "contest", id: "contest-other" } }));
      const original = field === "division_ids" ? metadata(graph, "contest_metadata") :
        field === "contest_ids" ? metadata(graph, "election_metadata") : metadata(graph, "stage_metadata");
      if (original.kind === "contest_metadata") original.value.division_ids = [STATE, DISTRICT];
      if (original.kind === "election_metadata") original.value.coverage.contest_ids = ["contest-house", "contest-other"];
      if (original.kind === "stage_metadata") original.value.successor_stage_ids = ["stage-primary", "stage-runoff"];
      const duplicate = structuredClone(original);
      duplicate.id = "equivalent-reversed-set";
      if (duplicate.kind === "contest_metadata") duplicate.value.division_ids.reverse();
      if (duplicate.kind === "election_metadata") duplicate.value.coverage.contest_ids.reverse();
      if (duplicate.kind === "stage_metadata") duplicate.value.successor_stage_ids.reverse();
      const originalValue = structuredClone(original.value);
      const reversedValue = structuredClone(duplicate.value);
      expect(view(graph).status).toBe("available");
      graph.package.evidence.push(duplicate);
      const result = view(graph);
      const state = field === "division_ids" ? result.contest : field === "contest_ids" ? result.election : result.stage;
      expect(state).toMatchObject({ state: "verified", evidence: expect.arrayContaining([
        expect.objectContaining({ id: original.id }), expect.objectContaining({ id: duplicate.id }),
      ]) });
      expect(result.history.find((entry) => entry.evidence.id === original.id)?.value).toEqual(originalValue);
      expect(result.history.find((entry) => entry.evidence.id === duplicate.id)?.value).toEqual(reversedValue);
      expect(original.value).toEqual(originalValue);
      expect(duplicate.value).toEqual(reversedValue);
    },
  );

  it.each([false, true])("exposes every candidate and line metadata conflict with stable order (reversed=%s)", (reversed) => {
    const graph = fixtureGraph();
    view(graph);
    const conflicts = graph.package.evidence.filter((entry) => entry.kind === "candidacy_metadata" ||
      (entry.kind === "ballot_line_metadata" && entry.subject.id === "line-a-one"));
    for (const entry of conflicts) {
      const alternative = structuredClone(entry);
      alternative.id = "conflict:" + entry.id;
      if (alternative.kind === "candidacy_metadata" || alternative.kind === "ballot_line_metadata") {
        alternative.value.name += " alternate";
      }
      graph.package.evidence.push(alternative);
    }
    const expectedIds = conflicts.flatMap((entry) => [entry.id, "conflict:" + entry.id]).sort();
    if (reversed) {
      graph.package.candidacies.reverse();
      graph.package.ballot_lines.reverse();
      graph.package.evidence.reverse();
    }
    const result = projectContest(readGraph(graph, 0, 1), NOW);
    expect(result.status).toBe("unverified");
    if (result.status !== "unverified") throw new Error("Expected metadata recovery");
    expect(result.metadata_conflicts?.map((entry) => entry.evidence.id)).toEqual(expectedIds);
    expect(result.history).toHaveLength(1);
    expect(result.metadata_conflicts?.every((entry) => entry.evidence.source_url === "https://elections.example.test/2026/candidates" &&
      entry.evidence.locator === "Synthetic row 1")).toBe(true);
  });

  it("does not reapply the generic 10,000-array import bound to retained source policy URLs", () => {
    const graph = readGraph();
    graph.policy.authorities[0].urls.push(...Array.from({ length: 9_999 }, (_, index) =>
      "https://elections.example.test/retained-policy-" + index));
    expect(graph.policy.authorities[0].urls).toHaveLength(10_000);
    ledgerView(graph);
    const url = "https://elections.example.test/retained-policy-final";
    graph.policy.authorities[0].urls.push(url);
    graph.ledger.documents.push({ ...graph.ledger.documents[0], id: "retained-policy-final", url });
    expect(ledgerView(graph).status).toBe("available");
  });

  it.each(["import", "read"] as const)("allows corrected operative stage edges at the %s boundary without erasing history", (boundary) => {
    const graph = withRunoffStage();
    const general = metadata(graph, "stage_metadata");
    general.value.successor_stage_ids = ["stage-runoff"];
    const runoff = graph.package.evidence.find((entry) => entry.kind === "stage_metadata" && entry.subject.id === "stage-runoff")!;
    if (runoff.kind !== "stage_metadata") throw new Error("Expected runoff metadata");
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    view(graph);
    graph.package.evidence.push(
      evidence("stage_metadata", { ...general.value, successor_stage_ids: [] }, {
        id: "general-revised", subject: general.subject,
        effective: { precision: "instant", start: "2026-09-12T12:30:00.000Z", end: null },
      }),
      evidence("stage_metadata", { ...runoff.value, successor_stage_ids: ["stage-general"] }, {
        id: "runoff-revised", subject: runoff.subject,
        effective: { precision: "instant", start: "2026-09-12T12:30:00.000Z", end: null },
      }),
    );
    graph.package.supersessions.push(
      { predecessor_id: general.id, replacement_id: "general-revised", reason: "Synthetic stage correction" },
      { predecessor_id: runoff.id, replacement_id: "runoff-revised", reason: "Synthetic stage correction" },
    );
    if (boundary === "import") {
      expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    } else {
      const result = view(graph);
      expect(result.stage).toMatchObject({ state: "verified", value: { successor_stage_ids: [] } });
      expect(result.history.find((entry) => entry.evidence.id === general.id)).toMatchObject({
        superseded: true, value: { successor_stage_ids: ["stage-runoff"] },
      });
      expect(view(graph, new Date("2026-09-12T12:29:59.999Z")).stage)
        .toMatchObject({ state: "verified", value: { successor_stage_ids: ["stage-runoff"] } });
    }
  });

  it("still rejects genuinely operative multi-stage cycles", () => {
    const graph = withRunoffStage();
    metadata(graph, "stage_metadata").value.successor_stage_ids = ["stage-runoff"];
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    const runoff = graph.package.evidence.find((entry) => entry.kind === "stage_metadata" && entry.subject.id === "stage-runoff")!;
    if (runoff.kind !== "stage_metadata") throw new Error("Expected runoff metadata");
    runoff.value.successor_stage_ids = ["stage-general"];
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("rejected");
    expect(projectContest(readGraph(graph), NOW).status).toBe("unverified");
  });
});

const CONTEST_FIELDS: ContestField[] = ["name", "office", "district", "term", "seats", "form", "level", "jurisdiction_id", "division_ids", "partisanship"];

function compositeFixture() {
  const graph = fixtureGraph();
  for (const authority of graph.policy.authorities) {
    for (const mapping of authority.mappings) {
      Object.assign(mapping, { allowed_fields: mapping.kind === "contest_metadata" ? [...CONTEST_FIELDS] : [] });
    }
  }
  const original = metadata(graph, "contest_metadata");
  const source = {
    retrieved_at: original.retrieved_at, verified_at: original.verified_at, effective: structuredClone(original.effective),
    current_until: original.current_until,
  };
  const primaryFields = CONTEST_FIELDS.filter((field) => !["term", "seats", "form"].includes(field));
  const statute = structuredClone(graph.policy.authorities[0]);
  Object.assign(statute, {
    id: "fixture-statute", source_type: "official_statute", urls: ["https://law.example.test/office"],
    mappings: [{ ...statute.mappings.find((mapping) => mapping.kind === "contest_metadata")!,
      id: "statute-fields", allowed_fields: ["term", "seats", "form"], allows_supersession: false }],
  });
  const registry = structuredClone(graph.policy.authorities[0]);
  Object.assign(registry, {
    id: "fixture-registry", source_type: "division_identifier_registry", urls: ["https://registry.example.test/divisions"],
    mappings: [{ ...registry.mappings.find((mapping) => mapping.kind === "contest_metadata")!,
      id: "registry-fields", allowed_fields: ["division_ids"], allows_supersession: false }],
  });
  graph.policy.authorities.push(statute, registry);
  graph.package.documents.push(
    { id: "statute-document", authority_id: statute.id, url: statute.urls[0], sha256: "c".repeat(64), label: "Synthetic statute" },
    { id: "registry-document", authority_id: registry.id, url: registry.urls[0], sha256: "d".repeat(64), label: "Synthetic identifier registry" },
  );
  const snapshot = Object.assign(original, {
    fields: primaryFields,
    supporting_sources: [
      { ...structuredClone(source), id: "statute", fields: ["term", "seats", "form"], document_id: "statute-document",
        mapping_id: "statute-fields", locator: "Synthetic section 1", original_term: "Synthetic seat and term rule" },
      { ...structuredClone(source), id: "registry", fields: ["division_ids"], document_id: "registry-document",
        mapping_id: "registry-fields", locator: "Synthetic registry row 1", original_term: DISTRICT },
    ],
  }) as Mutable<ElectionEvidence<"contest_metadata">>;
  return { graph, snapshot, statute, registry };
}

function previousCompositeSnapshot(fixture: ReturnType<typeof compositeFixture>) {
  const previous = structuredClone(fixture.snapshot);
  previous.id = "contest-before";
  previous.fields = [...CONTEST_FIELDS];
  previous.supporting_sources = [];
  fixture.graph.package.evidence.push(previous);
  fixture.snapshot.value.term = "Synthetic revised term";
  fixture.graph.package.supersessions.push({
    predecessor_id: previous.id, replacement_id: fixture.snapshot.id, reason: "Synthetic whole-snapshot correction",
  });
  return previous;
}

function expectFieldSources(reference: unknown) {
  const shared = { retrieved_at: "2026-09-12T11:00:00.000Z", verified_at: VERIFIED_AT,
    current_until: CURRENT_UNTIL, effective: { precision: "instant", start: "2026-09-01T00:00:00.000Z", end: null } };
  const primary = { ...shared, group_id: "primary", source_url: "https://elections.example.test/2026/candidates",
    source_type: "official_election_authority", original_term: "Synthetic official term", locator: "Synthetic row 1" };
  const statute = { ...shared, group_id: "statute", source_url: "https://law.example.test/office", source_type: "official_statute",
    original_term: "Synthetic seat and term rule", locator: "Synthetic section 1" };
  const registry = { ...shared, group_id: "registry", source_url: "https://registry.example.test/divisions",
    source_type: "division_identifier_registry", original_term: DISTRICT, locator: "Synthetic registry row 1" };
  for (const field of CONTEST_FIELDS) {
    const sources = ["term", "seats", "form"].includes(field) ? [statute] : field === "division_ids" ? [primary, registry] : [primary];
    expect(reference).toMatchObject({ field_sources: { [field]: sources } });
  }
}

describe("complete metadata snapshots with field-specific supporting sources", () => {
  it("admits one whole snapshot and attributes every field to its actual supporting sources", () => {
    const { graph } = compositeFixture();
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    const result = view(graph);
    expect(result.contest.state).toBe("verified");
    if (result.contest.state !== "verified") throw new Error("Expected complete sourced snapshot");
    expectFieldSources(result.contest.evidence[0]);
    expectFieldSources(result.history.find((entry) => entry.kind === "contest_metadata")!.evidence);
    expect(result.candidates.every((candidate) => candidate.tracks.ballot_qualification.state === "unknown")).toBe(true);
  });

  it("retains exact per-field provenance on each conflicting complete snapshot", () => {
    const { graph, snapshot } = compositeFixture();
    expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
    const other = structuredClone(snapshot);
    other.id = "contested-composite";
    other.value.term = "Another synthetic term";
    graph.package.evidence.push(other);
    const result = projectContest(readGraph(graph), NOW);
    expect(result).toMatchObject({ status: "unverified", reason: "unverified_metadata" });
    if (result.status !== "unverified") throw new Error("Expected whole-snapshot conflict");
    expect(result.metadata_conflicts).toHaveLength(2);
    for (const entry of result.metadata_conflicts!) expectFieldSources(entry.evidence);
  });

  it.each(["primary_fields", "missing_field", "unknown_field", "unknown_document", "unknown_mapping", "duplicate_group", "self_approval", "wrong_jurisdiction", "wrong_contest"] as const)(
    "rejects %s support after admitting a complete control", (change) => {
      const fixture = compositeFixture();
      const { graph, snapshot, statute } = fixture;
      expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("valid");
      if (change === "primary_fields") Object.assign(snapshot, { fields: undefined });
      if (change === "missing_field") snapshot.supporting_sources[0].fields = ["seats", "form"];
      if (change === "unknown_field") Object.assign(snapshot.supporting_sources[0], { fields: ["term", "seats", "form", "invented_field"] });
      if (change === "unknown_document") snapshot.supporting_sources[0].document_id = "unknown";
      if (change === "unknown_mapping") snapshot.supporting_sources[0].mapping_id = "unknown";
      if (change === "duplicate_group") snapshot.supporting_sources[1].id = snapshot.supporting_sources[0].id;
      if (change === "self_approval") Object.assign(snapshot.supporting_sources[0], { approval_reference: "package-self-approval" });
      if (change === "wrong_jurisdiction") statute.jurisdiction_id = "ocd-division/country:us/state:ny";
      if (change === "wrong_contest") statute.contest_keys = ["other-contest"];
      expect(validateElectionPackage(graph.package, graph.policy, NOW).status).toBe("rejected");
      expect(projectContest(readGraph(graph), NOW).status).toBe("unverified");
    },
  );

  it.each(["statute", "registry"] as const)("hard-denies %s status, retirement, and standalone correction grants", (role) => {
    for (const kind of ["ballot_qualification", "retirement", "correction"] as const) {
      const fixture = compositeFixture();
      expect(validateElectionPackage(fixture.graph.package, fixture.graph.policy, NOW).status).toBe("valid");
      const authority = fixture[role];
      if (kind === "correction") authority.mappings[0].allows_supersession = true;
      else Object.assign(authority.mappings[0], {
        kind, subject_kind: "candidacy", values: kind === "ballot_qualification" ? ["certified"] : [], allowed_fields: [],
      });
      expect(validateElectionPackage(fixture.graph.package, fixture.graph.policy, NOW).status).toBe("rejected");
    }
  });

  it.each(["statute", "registry"] as const)("rejects an overbroad %s field grant even if source policy names it", (role) => {
    const fixture = compositeFixture();
    expect(validateElectionPackage(fixture.graph.package, fixture.graph.policy, NOW).status).toBe("valid");
    Object.assign(fixture[role].mappings[0], { allowed_fields: [...CONTEST_FIELDS] });
    expect(validateElectionPackage(fixture.graph.package, fixture.graph.policy, NOW).status).toBe("rejected");
  });

  it.each(["stale", "disabled", "future", "unknown"] as const)("cannot verify a snapshot with %s required support", (change) => {
    const fixture = compositeFixture();
    expect(view(fixture.graph).verification).toBe("current");
    if (change === "stale") fixture.snapshot.supporting_sources[0].current_until = NOW.toISOString();
    if (change === "disabled") fixture.statute.enabled = false;
    if (change === "future") fixture.snapshot.supporting_sources[0].effective = {
      precision: "instant", start: "2026-09-12T14:00:00.000Z", end: null,
    };
    if (change === "unknown") {
      fixture.snapshot.supporting_sources[0].effective = { precision: "unknown", reason: "not_published" };
      fixture.statute.mappings[0].supports_current_snapshot = false;
    }
    const result = projectContest(readGraph(fixture.graph), NOW);
    if (result.status === "available") {
      expect(result.verification).toBe("historical");
      expect(result.contest.state).toBe("stale");
    } else expect(result.status).toBe("unverified");
  });

  it("waits for joint support effect before replacing a whole snapshot and never resurrects it after expiry", () => {
    const fixture = compositeFixture();
    previousCompositeSnapshot(fixture);
    fixture.snapshot.supporting_sources[0].effective = { precision: "instant", start: "2026-09-12T14:00:00.000Z", end: null };
    fixture.snapshot.supporting_sources[1].effective = { precision: "instant", start: "2026-09-12T15:00:00.000Z", end: null };
    fixture.snapshot.supporting_sources[0].current_until = "2026-09-12T16:00:00.000Z";
    expect(view(fixture.graph, new Date("2026-09-12T14:59:59.999Z")).contest)
      .toMatchObject({ state: "verified", value: { term: "2027-2029" } });
    expect(view(fixture.graph, new Date("2026-09-12T15:00:00.000Z")).contest)
      .toMatchObject({ state: "verified", value: { term: "Synthetic revised term" } });
    expect(view(fixture.graph, new Date("2026-09-12T16:00:00.000Z")).contest)
      .toMatchObject({ state: "stale", previous: [{ value: { term: "Synthetic revised term" } }] });
  });

  it("never retires a previous whole snapshot when its replacement supports have no common operative interval", () => {
    const fixture = compositeFixture();
    previousCompositeSnapshot(fixture);
    fixture.snapshot.supporting_sources[0].effective = {
      precision: "instant", start: "2026-09-01T00:00:00.000Z", end: "2026-09-12T14:00:00.000Z",
    };
    fixture.snapshot.supporting_sources[1].effective = { precision: "instant", start: "2026-09-12T15:00:00.000Z", end: null };
    const result = view(fixture.graph, new Date("2026-09-12T15:30:00.000Z"));
    expect(result.contest).toMatchObject({ state: "verified", value: { term: "2027-2029" } });
    expect(result.history.find((entry) => entry.evidence.id === "contest-before")?.superseded).toBe(false);
  });

  it("cannot borrow an omitted field's support from the previous snapshot", () => {
    const fixture = compositeFixture();
    previousCompositeSnapshot(fixture);
    expect(validateElectionPackage(fixture.graph.package, fixture.graph.policy, NOW).status).toBe("valid");
    fixture.snapshot.supporting_sources[0].fields = ["seats", "form"];
    expect(validateElectionPackage(fixture.graph.package, fixture.graph.policy, NOW).status).toBe("rejected");
  });

  it("preserves whole-snapshot projection and per-field attribution when support group order changes", () => {
    const fixture = compositeFixture();
    fixture.snapshot.supporting_sources.push({
      ...fixture.snapshot.supporting_sources[0], id: "cohort", fields: ["term", "seats"],
      document_id: "election-document", mapping_id: "contest_metadata:contest", original_term: "Synthetic election cohort",
    });
    const first = view(fixture.graph);
    fixture.snapshot.supporting_sources.reverse();
    expect(view(fixture.graph)).toEqual(first);
  });

  it("uses the oldest required support review as the whole snapshot's last verification", () => {
    const fixture = compositeFixture();
    expect(view(fixture.graph).contest).toMatchObject({ state: "verified", verified_at: VERIFIED_AT });
    fixture.snapshot.supporting_sources[0].verified_at = "2026-09-12T11:30:00.000Z";
    fixture.snapshot.supporting_sources[0].current_until = "2026-09-13T11:30:00.000Z";
    const result = view(fixture.graph);
    expect(result.contest).toMatchObject({ state: "verified", verified_at: "2026-09-12T11:30:00.000Z" });
    expect(result.contest.state === "verified" && result.contest.evidence[0].field_sources?.term[0].verified_at)
      .toBe("2026-09-12T11:30:00.000Z");
  });

  it("intersects reviewed civil-date support with an instant interval across a daylight-saving boundary", () => {
    const fixture = compositeFixture();
    previousCompositeSnapshot(fixture);
    const before = new Date("2026-11-01T06:59:59.999Z");
    for (const entry of fixture.graph.package.evidence) {
      const groups = entry.kind === "contest_metadata" ? [entry, ...entry.supporting_sources] : [entry];
      for (const group of groups) Object.assign(group, {
        retrieved_at: "2026-11-01T05:00:00.000Z", verified_at: "2026-11-01T06:00:00.000Z",
        current_until: "2026-11-02T06:00:00.000Z",
      });
    }
    fixture.snapshot.supporting_sources[0].effective = { precision: "date", start: "2026-10-31", end: "2026-11-02" };
    fixture.snapshot.supporting_sources[1].effective = { precision: "instant", start: "2026-11-01T07:00:00.000Z", end: null };
    expect(view(fixture.graph, before).contest).toMatchObject({ state: "verified", value: { term: "2027-2029" } });
    const result = view(fixture.graph, new Date("2026-11-01T07:00:00.000Z"));
    expect(result.contest).toMatchObject({ state: "verified", value: { term: "Synthetic revised term" } });
    expect(result.contest.state === "verified" && result.contest.evidence[0].field_sources?.term[0].effective)
      .toEqual({ precision: "date", start: "2026-10-31", end: "2026-11-02" });
  });

  it("does not supersede through disjoint reviewed dates in different time zones", () => {
    const fixture = compositeFixture();
    previousCompositeSnapshot(fixture);
    fixture.statute.mappings[0].date_rule = { time_zone: "America/New_York", start: "start_of_day", end: "start_of_day" };
    fixture.snapshot.supporting_sources[0].effective = { precision: "date", start: "2026-09-01", end: "2026-09-12" };
    fixture.registry.mappings[0].date_rule = { time_zone: "America/Los_Angeles", start: "start_of_day", end: "end_of_day" };
    fixture.snapshot.supporting_sources[1].effective = { precision: "date", start: "2026-09-12", end: null };
    const result = view(fixture.graph);
    expect(result.contest).toMatchObject({ state: "verified", value: { term: "2027-2029" } });
    expect(result.history.find((entry) => entry.evidence.id === "contest-before")?.superseded).toBe(false);
  });

  it("expires on a supporting authority's display cutoff while preserving field-specific history", () => {
    const fixture = compositeFixture();
    expect(view(fixture.graph).contest.state).toBe("verified");
    fixture.registry.current_display_until = NOW.toISOString();
    const result = view(fixture.graph);
    expect(result.contest.state).toBe("stale");
    if (result.contest.state !== "stale") throw new Error("Expected stale complete snapshot");
    expectFieldSources(result.contest.previous[0].evidence);
  });

  it.each(["future_review", "retrieval_after_review", "overlong_freshness", "zero_freshness", "invalid_effect", "duplicate_field", "reserved_group_id", "unmapped_primary_field"] as const)(
    "rejects %s supporting provenance after an admitted control", (change) => {
      const fixture = compositeFixture();
      expect(validateElectionPackage(fixture.graph.package, fixture.graph.policy, NOW).status).toBe("valid");
      const support = fixture.snapshot.supporting_sources[0];
      if (change === "future_review") Object.assign(support, { verified_at: "2026-09-12T14:00:00.000Z", current_until: "2026-09-13T14:00:00.000Z" });
      if (change === "retrieval_after_review") support.retrieved_at = "2026-09-12T12:30:00.000Z";
      if (change === "overlong_freshness") support.current_until = "2026-09-13T12:00:00.001Z";
      if (change === "zero_freshness") support.current_until = support.verified_at;
      if (change === "invalid_effect") support.effective = { precision: "instant", start: "2026-09-31T00:00:00.000Z", end: null };
      if (change === "duplicate_field") support.fields.push("term");
      if (change === "reserved_group_id") support.id = "primary";
      if (change === "unmapped_primary_field") fixture.graph.policy.authorities[0].mappings.find((mapping) => mapping.kind === "contest_metadata")!.allowed_fields = ["term"];
      expect(validateElectionPackage(fixture.graph.package, fixture.graph.policy, NOW).status).toBe("rejected");
      expect(projectContest(readGraph(fixture.graph), NOW).status).toBe("unverified");
    },
  );
});

describe("reviewed normalized package representation", () => {
  it("has one object-key-order-independent UTF-8 representation with preserved arrays, values and one LF", () => {
    const graph = fixtureGraph();
    metadata(graph, "contest_metadata").value.division_ids = [DISTRICT, STATE];
    const reverseKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(reverseKeys) :
      value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)])) : value;
    const source = serializeElectionPackage(graph.package);
    expect(source.startsWith('{"ballot_lines":')).toBe(true);
    expect(source.endsWith("}\n")).toBe(true);
    expect(source.split("\n")).toHaveLength(2);
    const reordered = JSON.parse(JSON.stringify(reverseKeys(graph.package), null, 2).replaceAll("\n", "\r\n"));
    expect(serializeElectionPackage(reordered)).toBe(source);
    expect(JSON.parse(source)).toEqual(graph.package);
    reordered.candidacies.reverse();
    expect(serializeElectionPackage(reordered)).not.toBe(source);
    const reversedDivisions = structuredClone(graph.package);
    reversedDivisions.evidence.find((entry) => entry.kind === "contest_metadata")!.value.division_ids.reverse();
    expect(serializeElectionPackage(reversedDivisions)).not.toBe(source);
    const changed = structuredClone(graph.package);
    changed.evidence[0].original_term = "Synthetic changed source term";
    expect(serializeElectionPackage(changed)).not.toBe(source);
    expect(graph.package.documents[0].sha256).toBe("a".repeat(64));
  });
});
