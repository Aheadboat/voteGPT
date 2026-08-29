// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const decisionPath = resolve(root, "G1-VENDOR-DECISION.md");
const projectMapPath = resolve(root, "PROJECT-MAP.md");

const primarySourceUrls = [
  "https://developer.ballotpedia.org/dictionaries-and-terms/data-dictionary-candidates",
  "https://developer.ballotpedia.org/dictionaries-and-terms/about-the-candidates-data-set",
  "https://developer.ballotpedia.org/dictionaries-and-terms/terms-of-use",
  "https://developer.ballotpedia.org/geographic-apis/getting-started-with-geographic-apis",
  "https://support.ballotready.org/article/733-ballotready-data-tiers",
  "https://www.ballotready.org/research-process",
  "https://organizations.ballotready.org/ballotready-api",
  "https://developers.google.com/civic-information/docs/data_guidelines",
] as const;

const requiredDecisionFacts: readonly (readonly [string, RegExp])[] = [
  ["current decision", /NO-GO \(reopenable\)/i],
  [
    "vendor access disabled",
    /vendor data access.{0,120}(?:disabled|not authorized|NO-GO)/i,
  ],
  [
    "production disabled",
    /production.{0,120}(?:disabled|not authorized|NO-GO)/i,
  ],
  ["official fallback", /official-source fallback/i],
  ["public evidence only", /public evidence only/i],
  ["no score", /no vendor score/i],
  ["provider-neutral design", /provider-neutral/i],
  [
    "T1 official fixture",
    /\bT1\b.{0,200}(?:official.{0,80}100|100.{0,80}official)/i,
  ],
  ["T2 evaluator", /\bT2\b.{0,200}(?:exact match|evaluator)/i],
  ["zero false confirmations", /zero false.{0,80}Confirmed on ballot/i],
  ["zero unmatched confirmations", /zero unmatched.{0,100}Confirmed/i],
  ["overall recall", /95\/100/],
  ["positive recall", /95%/],
  ["edge recall", /9\/10/],
  ["provenance", /100%.{0,80}provenance/i],
  ["fatal contradictions", /contradictions?.{0,80}fatal/i],
  [
    "T3 separate gates",
    /\bT3\b.{0,200}technical.{0,100}rights.{0,100}operations.{0,100}quote/i,
  ],
  [
    "Ballotpedia order",
    /Ballotpedia.{0,100}first.{0,100}(?:later )?diligence/i,
  ],
  ["BallotReady order", /BallotReady(?:\/CivicEngine)?.{0,100}second/i],
  ["Google limits", /Google Civic.{0,160}address-bound.{0,100}ephemeral/i],
  [
    "Google rejection",
    /Google Civic.{0,200}(?:rejected|not (?:a )?primary).{0,100}candidate/i,
  ],
  ["AP rejection", /\bAP\b.{0,120}results-first/i],
  ["DDHQ rejection", /(?:Decision Desk HQ|DDHQ).{0,120}results-first/i],
  [
    "written redisplay rights",
    /written.{0,100}public redisplay.{0,200}normalized candidate.{0,100}contest.{0,100}status.{0,100}source/i,
  ],
  [
    "no bulk extraction",
    /bulk raw.{0,80}(?:extraction|exposure).{0,100}(?:prevented|prohibited|not allowed)/i,
  ],
  ["cache minimum", /current-response cach.{0,100}30 days/i],
  [
    "audit retention",
    /normalized.{0,100}(?:change )?history.{0,100}audit.{0,120}24 months.{0,100}certification/i,
  ],
  [
    "derived use",
    /derived normalized records.{0,120}non-reconstructive metrics/i,
  ],
  ["correction audit", /correction.{0,100}tombstone.{0,100}audit trail/i],
  [
    "termination",
    /termination.{0,160}raw data.{0,80}30 days.{0,140}backups?.{0,80}90 days.{0,220}separately permitted normalized audit facts/i,
  ],
  ["refresh", /daily (?:content )?refresh/i],
  [
    "status delivery",
    /status alert.{0,100}tombstone.{0,120}24 hours.{0,120}provider ingestion/i,
  ],
  [
    "correction acknowledgement",
    /correction acknowledgement.{0,100}one business day/i,
  ],
  [
    "correction disposition",
    /correction.{0,100}(?:reasoned )?disposition.{0,100}two business days/i,
  ],
  [
    "schema notice",
    /nonbreaking.{0,80}30[ -]day.{0,120}breaking.{0,80}90[ -]day/i,
  ],
  [
    "package coverage",
    /purchased package.{0,120}every sampled jurisdiction.{0,100}stage.{0,100}stratum/i,
  ],
  ["quote approval", /quote.{0,100}(?:explicitly )?approved/i],
  ["fail closed", /missing.{0,100}unknown.{0,100}denied.{0,160}NO-GO/i],
  ["T5 boundary", /\bT5\b.{0,120}separate.{0,100}authorization/i],
  ["T6 boundary", /\bT6\b.{0,120}separate.{0,100}authorization/i],
  [
    "prohibited actions",
    /no secrets.{0,80}credentials.{0,100}(?:vendor )?contact.{0,100}quote.{0,100}spend.{0,120}production enablement/i,
  ],
];

const rfc3339 = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/;
const sha256 = /\b[0-9a-f]{64}\b/;

describe("G1 public-evidence vendor decision", () => {
  it("routes the durable decision from the project map", () => {
    const projectMap = readFileSync(projectMapPath, "utf8");
    const routeStart = projectMap.search(
      /^### [^\r\n]*candidate(?:-data| data)?[^\r\n]*vendor[^\r\n]*decision/im,
    );

    expect(
      routeStart,
      "candidate vendor decision route heading",
    ).toBeGreaterThanOrEqual(0);
    if (routeStart < 0) {
      return;
    }
    const route = projectMap.slice(routeStart).split(/\r?\n### /, 1)[0]!;
    expect(route).toMatch(/Start: \[[^\]]+\]\(G1-VENDOR-DECISION\.md\)/);
    expect(route).toContain(
      "Check: `npm.cmd test -- tests/g1-vendor-decision.test.ts`.",
    );
  });

  it("records the reopenable NO-GO and exact public-evidence boundaries", () => {
    const exists = existsSync(decisionPath);
    expect(exists, "G1-VENDOR-DECISION.md must exist").toBe(true);
    if (!exists) {
      return;
    }

    const decision = readFileSync(decisionPath, "utf8");
    const normalizedDecision = decision.replace(/\s+/g, " ");
    for (const [label, pattern] of requiredDecisionFacts) {
      expect(normalizedDecision, label).toMatch(pattern);
    }

    const lines = decision.split(/\r?\n/);
    const providerHeader = lines.find(
      (line) =>
        /^\|/.test(line) &&
        /Provider/i.test(line) &&
        /Rights/i.test(line) &&
        /Operations/i.test(line) &&
        /Package/i.test(line) &&
        /Price/i.test(line) &&
        /Result/i.test(line),
    );
    expect(providerHeader, "provider decision matrix header").toBeDefined();

    const providerRows = lines.filter((line) =>
      /^\|\s*(?:Ballotpedia|BallotReady(?:\/CivicEngine)?|Google Civic|AP|Associated Press|DDHQ|Decision Desk HQ)\s*\|/i.test(
        line,
      ),
    );
    expect(providerRows, "five provider matrix rows").toHaveLength(5);
    expect(providerRows.join(" "), "unknown limits").toMatch(/\bunknown\b/i);
    expect(providerRows.join(" "), "denied limits").toMatch(/\bdenied\b/i);

    const evidenceHeader = lines.find(
      (line) =>
        /^\|/.test(line) &&
        /Primary source/i.test(line) &&
        /Title|version/i.test(line) &&
        /Effective/i.test(line) &&
        /Retrieved/i.test(line) &&
        /SHA-?256/i.test(line),
    );
    expect(evidenceHeader, "primary-source evidence header").toBeDefined();

    for (const url of primarySourceUrls) {
      const sourceLine = lines.find((line) => line.includes(url));
      expect(sourceLine, `primary source ${url}`).toBeDefined();
      expect(sourceLine, `retrieval time ${url}`).toMatch(rfc3339);
      expect(sourceLine, `raw-content hash ${url}`).toMatch(sha256);
    }
  });
});
