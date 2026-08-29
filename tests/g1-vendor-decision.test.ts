// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const decisionPath = resolve(root, "G1-VENDOR-DECISION.md");
const projectMapPath = resolve(root, "PROJECT-MAP.md");

const primarySources = [
  {
    id: "BP-DICT",
    url: "https://developer.ballotpedia.org/dictionaries-and-terms/data-dictionary-candidates",
    hashRequired: true,
  },
  {
    id: "BP-EDGE",
    url: "https://developer.ballotpedia.org/dictionaries-and-terms/about-the-candidates-data-set",
    hashRequired: true,
  },
  {
    id: "BP-TERMS",
    url: "https://developer.ballotpedia.org/dictionaries-and-terms/terms-of-use",
    hashRequired: true,
  },
  {
    id: "BP-SCHEMA",
    url: "https://developer.ballotpedia.org/geographic-apis/getting-started-with-geographic-apis",
    hashRequired: true,
  },
  {
    id: "BR-TIERS",
    url: "https://support.ballotready.org/article/733-ballotready-data-tiers",
    hashRequired: true,
  },
  {
    id: "BR-RESEARCH",
    url: "https://www.ballotready.org/research-process",
    hashRequired: true,
  },
  {
    id: "BR-API",
    url: "https://organizations.ballotready.org/ballotready-api",
    hashRequired: true,
  },
  {
    id: "GOOGLE",
    url: "https://developers.google.com/civic-information/docs/data_guidelines",
    hashRequired: false,
  },
  {
    id: "AP",
    url: "https://www.ap.org/elections/our-role-in-the-u-s-elections/",
    hashRequired: true,
  },
  {
    id: "DDHQ",
    url: "https://docs.decisiondeskhq.com/reference/get_api-v4-race-calls",
    hashRequired: true,
  },
] as const;

const requiredDecisionFacts: readonly (readonly [string, RegExp])[] = [
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
  [
    "T3 separate gates",
    /\bT3\b.{0,200}technical.{0,100}rights.{0,100}operations.{0,100}quote/i,
  ],
  ["Google limits", /Google Civic.{0,160}address-bound.{0,100}ephemeral/i],
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
  ["sample handling", /contract-permitted sample handling.{0,120}retention/i],
  ["credential handoff", /approved credential handoff/i],
  [
    "production price",
    /exact production price.{0,100}(?:and|with).{0,40}limits/i,
  ],
  ["provenance mapping", /package coverage.{0,140}provenance-field mapping/i],
  ["legal approval", /separate legal-terms approval/i],
  ["quote approval", /quote.{0,100}(?:explicitly )?approved/i],
  ["fail closed", /missing.{0,100}unknown.{0,100}denied.{0,160}NO-GO/i],
  ["T5 boundary", /\bT5\b.{0,120}separate.{0,100}authorization/i],
  ["T6 boundary", /\bT6\b.{0,120}separate.{0,100}authorization/i],
  [
    "prohibited actions",
    /no secrets.{0,80}credentials.{0,100}(?:vendor )?contact.{0,100}quote.{0,100}spend.{0,120}production enablement/i,
  ],
];

const requiredDecisionHeadings = [
  "G1 candidate-data vendor decision",
  "Current decision",
  "Tested provider-neutral design",
  "Primary-source evidence",
  "Provider decision matrix",
  "Reopen criteria",
  "Authorization boundaries",
] as const;

const technicalThresholds = [
  {
    metric: "False Confirmed on ballot claims",
    threshold: /^0(?:\s+required)?$/i,
  },
  {
    metric: "Unmatched vendor Confirmed claims in sampled contests",
    threshold: /^0(?:\s+required)?$/i,
  },
  {
    metric: "Matched-row contradictions",
    threshold: /^0.{0,40}fatal/i,
  },
  {
    metric: "Overall presence recall",
    threshold: /^(?:at least|>=)\s*95\/100$/i,
  },
  {
    metric: "Positive recall",
    threshold: /^(?:at least|>=)\s*95%$/i,
  },
  {
    metric: "Each edge-stratum recall",
    threshold: /^(?:at least|>=)\s*9\/10$/i,
  },
  { metric: "Truth row-level provenance", threshold: /^100%$/ },
  { metric: "Vendor row-level provenance", threshold: /^100%$/ },
] as const;

const providerSuitability = [
  {
    provider: "Ballotpedia",
    suitability: /first.{0,100}(?:later )?diligence/i,
  },
  {
    provider: "BallotReady/CivicEngine",
    suitability: /second.{0,100}(?:later )?diligence/i,
  },
  {
    provider: "Google Civic",
    suitability: /rejected.{0,120}primary candidate-source/i,
  },
  {
    provider: "AP Elections",
    suitability: /rejected.{0,120}results-first/i,
  },
  {
    provider: "Decision Desk HQ",
    suitability: /rejected.{0,120}results-first/i,
  },
] as const;

const providerMatrixHeader = [
  "provider",
  "current suitability",
  "rights",
  "operations",
  "package",
  "price",
] as const;

const rfc3339 = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/;
const sha256 = /\b[0-9a-f]{64}\b/;

type MarkdownTable = Readonly<{
  header: readonly string[];
  rows: readonly (readonly string[])[];
}>;

function normalizeCell(value: string): string {
  return value.replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
}

function markdownHeadings(markdown: string): string[] {
  return markdown.split(/\r?\n/).flatMap((line) => {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    return match === null ? [] : [normalizeCell(match[1]!)];
  });
}

function markdownTables(markdown: string): MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  const lines = markdown.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    if (!/^\s*\|.*\|\s*$/.test(lines[index]!)) {
      index += 1;
      continue;
    }
    const rows: string[][] = [];
    while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index]!)) {
      rows.push(
        lines[index]!.trim().slice(1, -1).split("|").map(normalizeCell),
      );
      index += 1;
    }
    if (
      rows.length >= 2 &&
      rows[1]!.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      tables.push({ header: rows[0]!, rows: rows.slice(2) });
    }
  }
  return tables;
}

function normalizedHeader(table: MarkdownTable): string[] {
  return table.header.map((cell) => cell.toLowerCase());
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe("G1 public-evidence vendor decision", () => {
  it("routes the durable decision from the project map", () => {
    const projectMap = readFileSync(projectMapPath, "utf8");
    const routeHeadings = [
      ...projectMap.matchAll(
        /^### [^\r\n]*candidate(?:-data| data)?[^\r\n]*vendor[^\r\n]*decision\s*$/gim,
      ),
    ];

    expect(
      routeHeadings,
      "unique candidate vendor decision route heading",
    ).toHaveLength(1);
    if (routeHeadings.length !== 1) {
      return;
    }
    const routeStart = routeHeadings[0]!.index;
    const route = projectMap.slice(routeStart).split(/\r?\n### /, 1)[0]!;
    expect(route).toMatch(/Start: \[[^\]]+\]\(G1-VENDOR-DECISION\.md\)/);
    expect(route).toContain(
      "Check: `npm.cmd test -- tests/g1-vendor-decision.test.ts`.",
    );
    expect(
      [...projectMap.matchAll(/\[[^\]]+\]\(G1-VENDOR-DECISION\.md\)/g)],
      "unique decision route",
    ).toHaveLength(1);
    expect(
      countOccurrences(
        projectMap,
        "Check: `npm.cmd test -- tests/g1-vendor-decision.test.ts`.",
      ),
      "unique focused check",
    ).toBe(1);
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
    const headings = markdownHeadings(decision);
    const normalizedHeadings = headings.map((heading) => heading.toLowerCase());
    expect(new Set(normalizedHeadings).size, "unique decision headings").toBe(
      normalizedHeadings.length,
    );
    for (const heading of requiredDecisionHeadings) {
      expect(
        normalizedHeadings.filter((value) => value === heading.toLowerCase()),
        `unique ${heading} heading`,
      ).toHaveLength(1);
    }
    expect(
      headings.filter((heading) =>
        /\b(?:vendor scores?|scoring|rankings?)\b/i.test(heading),
      ),
      "no vendor score, scoring, or ranking section",
    ).toEqual([]);

    const stateFields = lines.flatMap((line) => {
      const plain = normalizeCell(line.replace(/^\s*[-*]\s+/, ""));
      const match = /^(Decision state|Current state|State):\s*(.+)$/i.exec(
        plain,
      );
      return match === null
        ? []
        : [
            {
              label: match[1]!.toLowerCase(),
              value: match[2]!.trim(),
            },
          ];
    });
    expect(stateFields, "one exact fail-closed decision state").toEqual([
      { label: "decision state", value: "NO-GO (reopenable)" },
    ]);

    const tables = markdownTables(decision);
    const technicalTables = tables.filter(
      (table) =>
        JSON.stringify(normalizedHeader(table)) ===
        JSON.stringify(["metric", "threshold"]),
    );
    expect(technicalTables, "unique technical threshold table").toHaveLength(1);
    if (technicalTables.length === 1) {
      const technicalRows = technicalTables[0]!.rows;
      expect(technicalRows, "one row per named technical metric").toHaveLength(
        technicalThresholds.length,
      );
      const thresholdsByMetric = new Map(
        technicalRows.map((row) => [row[0], row[1]] as const),
      );
      expect(thresholdsByMetric.size, "unique technical metrics").toBe(
        technicalRows.length,
      );
      for (const threshold of technicalThresholds) {
        expect(
          thresholdsByMetric.get(threshold.metric),
          threshold.metric,
        ).toMatch(threshold.threshold);
      }
    }

    const providerTables = tables.filter(
      (table) => normalizedHeader(table)[0] === "provider",
    );
    expect(providerTables, "one provider matrix").toHaveLength(1);
    if (providerTables.length === 1) {
      const providerTable = providerTables[0]!;
      expect(
        normalizedHeader(providerTable),
        "six-column provider matrix",
      ).toEqual(providerMatrixHeader);
      expect(providerTable.rows, "five complete provider rows").toHaveLength(
        providerSuitability.length,
      );
      expect(
        providerTable.rows.every(
          (row) => row.length === 6 && row.every((cell) => cell.length > 0),
        ),
        "complete provider rows",
      ).toBe(true);
      const rowsByProvider = new Map(
        providerTable.rows.map((row) => [row[0], row] as const),
      );
      expect(rowsByProvider.size, "unique provider rows").toBe(
        providerTable.rows.length,
      );
      for (const provider of providerSuitability) {
        const row = rowsByProvider.get(provider.provider);
        expect(row, provider.provider).toBeDefined();
        expect(row?.[1], `${provider.provider} suitability`).toMatch(
          provider.suitability,
        );
        for (const field of row?.slice(2) ?? []) {
          expect(field, `${provider.provider} evidence state`).toMatch(
            /^(?:allowed|unknown|denied)\b/i,
          );
        }
      }
    }

    const evidenceTables = tables.filter((table) => {
      const header = normalizedHeader(table).join(" ");
      return (
        header.includes("exact final url") &&
        header.includes("retriev") &&
        /sha-?256/.test(header)
      );
    });
    expect(evidenceTables, "unique primary-source evidence table").toHaveLength(
      1,
    );

    for (const source of primarySources) {
      expect(
        countOccurrences(decision, source.url),
        `unique primary source ${source.id}`,
      ).toBe(1);
      const sourceLine = lines.find((line) => line.includes(source.url));
      expect(sourceLine, `primary source ${source.id}`).toBeDefined();
      expect(sourceLine, `source id ${source.id}`).toMatch(
        new RegExp(`\\|\\s*${source.id}\\s*\\|`),
      );
      expect(sourceLine, `retrieval time ${source.id}`).toMatch(rfc3339);
      if (source.hashRequired) {
        expect(sourceLine, `raw-content hash ${source.id}`).toMatch(sha256);
      } else {
        expect(sourceLine, "Google dynamic evidence").toMatch(/dynamic/i);
        expect(sourceLine, "Google localized evidence").toMatch(/locali[sz]/i);
        expect(sourceLine, "Google digest boundary").toMatch(
          /no (?:raw )?digest promoted/i,
        );
        expect(sourceLine, "no invented Google digest").not.toMatch(sha256);
      }
    }
  });
});
