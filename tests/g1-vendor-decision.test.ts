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
    evidenceStates: ["unknown", "unknown", "unknown", "unknown"],
  },
  {
    provider: "BallotReady/CivicEngine",
    suitability: /second.{0,100}(?:later )?diligence/i,
    evidenceStates: ["unknown", "unknown", "unknown", "unknown"],
  },
  {
    provider: "Google Civic",
    suitability: /rejected.{0,120}primary candidate-source/i,
    evidenceStates: ["denied", "unknown", "denied", "unknown"],
  },
  {
    provider: "AP Elections",
    suitability: /rejected.{0,120}results-first/i,
    evidenceStates: ["unknown", "unknown", "unknown", "unknown"],
  },
  {
    provider: "Decision Desk HQ",
    suitability: /rejected.{0,120}results-first/i,
    evidenceStates: ["unknown", "unknown", "unknown", "unknown"],
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

function renderedEvidence(markdown: string): string {
  const withoutComments = markdown.replace(
    /<!--[\s\S]*?(?:-->|$)/g,
    (comment) => comment.replace(/[^\r\n]/g, " "),
  );
  const rendered: string[] = [];
  let fence: { marker: string; minimumLength: number } | null = null;

  for (const line of withoutComments.split(/\r?\n/)) {
    if (fence === null) {
      const opening = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (opening === null) {
        rendered.push(line);
        continue;
      }
      fence = {
        marker: opening[1]![0]!,
        minimumLength: opening[1]!.length,
      };
      rendered.push("");
      continue;
    }

    const closing = new RegExp(
      `^\\s{0,3}${fence.marker}{${fence.minimumLength},}\\s*$`,
    );
    if (closing.test(line)) {
      fence = null;
    }
    rendered.push("");
  }

  return rendered.join("\n");
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

function decisionStateFields(
  markdown: string,
): ReadonlyArray<Readonly<{ label: string; value: string }>> {
  const stateField = (labelValue: string, fieldValue: string) => {
    const label = normalizeCell(labelValue);
    const value = normalizeCell(fieldValue);
    const canonicalLabel = /^(?:decision state|current state|state)$/i.test(
      label,
    );
    const alternateDecisionLabel =
      /\b(?:state|decision|status|recommendation)\b/i.test(label) &&
      /\b(?:GO|HOLD)\b/i.test(value);
    if (!canonicalLabel && !alternateDecisionLabel) {
      return [];
    }
    return [{ label: label.toLowerCase(), value }];
  };
  const lineFields = markdown.split(/\r?\n/).flatMap((line) => {
    const plain = normalizeCell(line.replace(/^\s*[-*]\s+/, ""));
    const match = /^([^:]+):\s*(.+)$/.exec(plain);
    return match === null ? [] : stateField(match[1]!, match[2]!);
  });
  const tableFields = markdownTables(markdown).flatMap((table) =>
    table.rows.flatMap((row) =>
      row.length < 2 ? [] : stateField(row[0]!, row[1]!),
    ),
  );
  return [...lineFields, ...tableFields];
}

function prohibitedVendorDecisionSurfaces(
  markdown: string,
): ReadonlyArray<
  Readonly<{ kind: "heading" | "field" | "table"; value: string }>
> {
  const scoreLanguage = /\b(?:scores?|scoring|rankings?|rank)\b/i;
  const headings = markdownHeadings(markdown)
    .filter((heading) => scoreLanguage.test(heading))
    .map((value) => ({ kind: "heading" as const, value }));
  const fields = markdown.split(/\r?\n/).flatMap((line) => {
    const plain = normalizeCell(line.replace(/^\s*[-*]\s+/, ""));
    const match = /^([^:]+):\s*(.+)$/.exec(plain);
    return match !== null && scoreLanguage.test(match[1]!)
      ? [{ kind: "field" as const, value: plain }]
      : [];
  });
  const tables = markdownTables(markdown)
    .filter((table) =>
      [table.header, ...table.rows].some((row) =>
        row.some((cell) => scoreLanguage.test(cell)),
      ),
    )
    .map((table) => ({
      kind: "table" as const,
      value: table.header.join(" | "),
    }));
  return [...headings, ...fields, ...tables];
}

function providerStateMismatches(
  rows: ReadonlyArray<readonly string[]>,
): string[] {
  const rowsByProvider = new Map(rows.map((row) => [row[0], row] as const));
  return providerSuitability.flatMap(({ provider, evidenceStates }) => {
    const row = rowsByProvider.get(provider);
    if (row === undefined) {
      return [`${provider}:missing`];
    }
    return evidenceStates.flatMap((expected, index) =>
      new RegExp(`^${expected}\\b`, "i").test(row[index + 2] ?? "")
        ? []
        : [`${provider}:${providerMatrixHeader[index + 2]!}`],
    );
  });
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe("G1 public-evidence vendor decision", () => {
  it("routes the durable decision from the project map", () => {
    const projectMap = renderedEvidence(readFileSync(projectMapPath, "utf8"));
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

    const decision = renderedEvidence(readFileSync(decisionPath, "utf8"));
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
      prohibitedVendorDecisionSurfaces(decision),
      "no vendor score, scoring, or ranking heading, field, or table",
    ).toEqual([]);

    const stateFields = decisionStateFields(decision);
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
      }
      expect(
        providerStateMismatches(providerTable.rows),
        "reviewed provider-specific evidence states",
      ).toEqual([]);
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

describe("G1 vendor decision parser self-checks", () => {
  it("ignores semantic evidence hidden in comments and fenced code", () => {
    const markdown = [
      "Visible context only.",
      "<!--",
      "### G1 candidate-data vendor decision",
      "Decision state: GO",
      "official-source fallback",
      "| Provider | Score |",
      "| --- | --- |",
      "| Ballotpedia | 100 |",
      "-->",
      "```markdown",
      "### Vendor ranking",
      "Decision: HOLD",
      "official-source fallback",
      "| Provider | Score |",
      "| --- | --- |",
      "| BallotReady/CivicEngine | 100 |",
      "```",
    ].join("\n");

    const rendered = renderedEvidence(markdown);

    expect(rendered).toContain("Visible context only.");
    expect(rendered).not.toContain("official-source fallback");
    expect(markdownHeadings(rendered)).toEqual([]);
    expect(markdownTables(rendered)).toEqual([]);
    expect(decisionStateFields(rendered)).toEqual([]);
    expect(prohibitedVendorDecisionSurfaces(rendered)).toEqual([]);
  });

  it("detects alternate decision states and score surfaces", () => {
    const approved = renderedEvidence("Decision state: NO-GO (reopenable)");
    expect(decisionStateFields(approved)).toEqual([
      { label: "decision state", value: "NO-GO (reopenable)" },
    ]);
    expect(prohibitedVendorDecisionSurfaces(approved)).toEqual([]);

    const bypass = renderedEvidence(
      [
        "Decision state: NO-GO (reopenable)",
        "Current state: GO",
        "Decision: HOLD",
        "### Vendor ranking",
        "Vendor score: 100",
        "| Attribute | Value |",
        "| --- | --- |",
        "| Launch status | GO |",
        "| Vendor scoring | 100 |",
      ].join("\n"),
    );

    expect(decisionStateFields(bypass)).toEqual([
      { label: "decision state", value: "NO-GO (reopenable)" },
      { label: "current state", value: "GO" },
      { label: "decision", value: "HOLD" },
      { label: "launch status", value: "GO" },
    ]);
    expect(
      prohibitedVendorDecisionSurfaces(bypass).map(({ kind }) => kind),
    ).toEqual(["heading", "field", "table"]);
  });

  it("binds provider evidence states to the reviewed provider row", () => {
    const validRows = markdownTables(`
| Provider | Current suitability | Rights | Operations | Package | Price |
| --- | --- | --- | --- | --- | --- |
| Ballotpedia | first later diligence | unknown - bounded allowance | unknown - partial allowances | unknown - not established | unknown - not published |
| BallotReady/CivicEngine | second later diligence | unknown - not established | unknown - partial allowance | unknown - not established | unknown - not published |
| Google Civic | rejected as primary candidate-source | denied - incompatible minima | unknown - not established | denied - incompatible coverage | unknown - not established |
| AP Elections | rejected as results-first | unknown - not established | unknown - not established | unknown - not established | unknown - not established |
| Decision Desk HQ | rejected as results-first | unknown - not established | unknown - not established | unknown - not established | unknown - not established |
`)[0]!.rows;
    expect(providerStateMismatches(validRows)).toEqual([]);

    const allAllowed = validRows.map((row) => [
      row[0]!,
      row[1]!,
      "allowed",
      "allowed",
      "allowed",
      "allowed",
    ]);
    expect(providerStateMismatches(allAllowed)).toHaveLength(20);

    const crossProvider = validRows.map((row) => {
      if (row[0] === "Ballotpedia") {
        return [row[0], row[1], ...validRows[2]!.slice(2)];
      }
      if (row[0] === "Google Civic") {
        return [row[0], row[1], ...validRows[0]!.slice(2)];
      }
      return row;
    });
    expect(providerStateMismatches(crossProvider)).toEqual([
      "Ballotpedia:rights",
      "Ballotpedia:package",
      "Google Civic:rights",
      "Google Civic:package",
    ]);
  });
});
