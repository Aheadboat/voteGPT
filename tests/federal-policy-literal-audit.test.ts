import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  CONGRESS_CALENDAR_POLICY,
  FEDERAL_CACHE_POLICY,
  FEDERAL_NETWORK_POLICY,
  FEDERAL_OFFICIAL_FIELD_POLICY,
  FEDERAL_POLICY_LITERAL_AUDIT,
  FEDERAL_PROVIDER_RESPONSE_POLICY,
  FEDERAL_PROVIDER_URL_POLICY,
} from "../src/lib/federal-policy";
import { FEDERAL_PROVIDER_HOSTS } from "../src/lib/federal-provider-host-policy.mjs";

describe("federal policy literal ownership audit", () => {
  describe("scanner behavior", () => {
    it("ignores type-only and structural generic numbers", () => {
      expect(
        policyLiteralViolations(
          "fixture.ts",
          String.raw`
            type Cardinality = { first: 0; only: 1; pair: 2; trio: 3; hour: 17 };
            const firstState = states[0];
            const onlyState = states.length === 1;
          `,
          policyLiterals([0, 1, 2, 3, 17]),
        ),
      ).toEqual([]);
    });

    it("ignores structural element-access indexes", () => {
      expect(
        policyLiteralViolations(
          "fixture.ts",
          "const firstState = states[0];",
          policyLiterals([0]),
        ),
      ).toEqual([]);
    });

    it("does not hide low policy values outside structural contexts", () => {
      expect(
        policyLiteralViolations(
          "fixture.ts",
          String.raw`
            const termLengthYears = 2;
            const turnover = Date.UTC(year, 0, 3, 17);
            const epoch = new Date(0);
          `,
          policyLiterals([0, 2, 3, 17]),
        ),
      ).toEqual([
        "fixture.ts: 0",
        "fixture.ts: 17",
        "fixture.ts: 2",
        "fixture.ts: 3",
      ]);
    });

    it("normalizes signed and evaluated numeric runtime expressions", () => {
      expect(
        policyLiteralViolations(
          "fixture.ts",
          "const sentinel = -1; const maxBodyBytes = 1024 * 1024;",
          policyLiterals([1, 1024 * 1024]),
        ),
      ).toEqual(["fixture.ts: 1048576"]);
    });

    it("ignores syntactically structural runtime numbers", () => {
      expect(
        policyLiteralViolations(
          "fixture.ts",
          String.raw`
            for (let index = 0; index < values.length; index += 1) {}
            const segment = values.slice(1, 2 + 3);
            const padded = value.padStart(17, "0");
          `,
          policyLiterals([0, 1, 2, 3, 17]),
        ),
      ).toEqual([]);
    });

    it("detects slice and substring end-position policy caps", () => {
      const forbidden = policyLiterals([1_048_576]);
      expect(
        policyLiteralViolations(
          "fixture.ts",
          "const payload = responseBody.slice(0, 1_048_576);",
          forbidden,
        ),
      ).toEqual(["fixture.ts: 1048576"]);
      expect(
        policyLiteralViolations(
          "fixture.ts",
          "const payload = responseBody.substring(0, 1_048_576);",
          forbidden,
        ),
      ).toEqual(["fixture.ts: 1048576"]);
    });

    it("detects provider hosts inside static URLs and template fragments", () => {
      expect(
        policyLiteralViolations(
          "fixture.ts",
          [
            'const staticUrl = "https://api.congress.gov/v3/member";',
            "const templateUrl = `https://clerk.house.gov/members/${state}`;",
          ].join("\n"),
          policyLiterals(["api.congress.gov", "clerk.house.gov"]),
        ),
      ).toEqual([
        "fixture.ts: api.congress.gov",
        "fixture.ts: clerk.house.gov",
      ]);
    });

    it("detects provider hosts before URL ports in static text", () => {
      expect(
        policyLiteralViolations(
          "fixture.ts",
          [
            'const staticUrl = "https://api.congress.gov:443/v3/member";',
            "const templateUrl = `https://clerk.house.gov:443/members/${state}`;",
          ].join("\n"),
          policyLiterals(["api.congress.gov", "clerk.house.gov"]),
        ),
      ).toEqual([
        "fixture.ts: api.congress.gov",
        "fixture.ts: clerk.house.gov",
      ]);
    });

    it("reports raw numeric, string, and regex policy literals", () => {
      expect(
        policyLiteralViolations(
          "fixture.ts",
          String.raw`
            const timeoutMilliseconds = 5_000;
            const contentType = "application/json";
            const stateCode = /^[A-Z]{2}$/;
          `,
          policyLiterals([5_000, "application/json", /^[A-Z]{2}$/]),
        ),
      ).toEqual([
        "fixture.ts: 5000",
        "fixture.ts: ^[A-Z]{2}$",
        "fixture.ts: application/json",
      ]);
    });
  });

  it("derives forbidden policy tokens and permits no adapter/service owner", () => {
    const inventory = [...FEDERAL_POLICY_LITERAL_AUDIT.productionFiles];
    expect(inventory).toEqual([...inventory].sort());
    for (const path of inventory) {
      expect(FEDERAL_POLICY_LITERAL_AUDIT.allowlistedPaths[path]).toBeUndefined();
    }
    for (const [path, reason] of Object.entries(
      FEDERAL_POLICY_LITERAL_AUDIT.allowlistedPaths,
    )) {
      expect(path).not.toMatch(/(?:congress-gov|house-clerk-vacancy|federal-officials-service)\.ts$/);
      expect(reason).toMatch(/^(?:named_handwritten_policy_owner|node_loadable_provider_host_owner|generated_census_data|official_source|provider_metadata|generated_source|boundary_test)$/);
    }

    const forbidden = policyLiterals([
      CONGRESS_CALENDAR_POLICY,
      FEDERAL_CACHE_POLICY,
      FEDERAL_NETWORK_POLICY,
      FEDERAL_PROVIDER_RESPONSE_POLICY,
      FEDERAL_PROVIDER_URL_POLICY,
      FEDERAL_OFFICIAL_FIELD_POLICY,
      FEDERAL_PROVIDER_HOSTS,
      FEDERAL_POLICY_LITERAL_AUDIT.epochLiteralValues,
    ]);
    expect(forbidden.map(policyLiteralToken)).toEqual(expect.arrayContaining(
      FEDERAL_POLICY_LITERAL_AUDIT.epochLiteralValues.map(String),
    ));

    const violations = inventory.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return policyLiteralViolations(path, source, forbidden);
    });
    expect(violations).toEqual([]);
  });

  it("allows host literals only in Node-loadable host owner", () => {
    const ownerPath = "src/lib/federal-provider-host-policy.mjs";
    const hosts = policyLiterals(Object.values(FEDERAL_PROVIDER_HOSTS));
    const owner = readFileSync(ownerPath, "utf8");
    expect(policyLiteralViolations(ownerPath, owner, hosts)).toEqual(
      hosts.map((host) => `${ownerPath}: ${policyLiteralToken(host)}`),
    );
    for (const path of FEDERAL_POLICY_LITERAL_AUDIT.productionFiles) {
      expect(policyLiteralViolations(path, readFileSync(path, "utf8"), hosts)).toEqual(
        [],
      );
    }
  });
});

type PolicyLiteral =
  | Readonly<{ kind: "number"; value: number }>
  | Readonly<{ kind: "regex"; source: string; flags: string }>
  | Readonly<{ kind: "string"; value: string }>;

function policyLiterals(values: readonly unknown[]): PolicyLiteral[] {
  const literals = new Map<string, PolicyLiteral>();
  const add = (literal: PolicyLiteral) => {
    literals.set(policyLiteralKey(literal), literal);
  };
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      add({ kind: "string", value });
    } else if (typeof value === "number") {
      add({ kind: "number", value });
    } else if (value instanceof RegExp) {
      add({ kind: "regex", source: value.source, flags: value.flags });
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value !== null && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  values.forEach(visit);
  return [...literals.values()].sort(comparePolicyLiterals);
}

function policyLiteralViolations(
  path: string,
  source: string,
  forbidden: readonly PolicyLiteral[],
): string[] {
  const found = sourcePolicyLiteralKeys(path, source, forbidden);
  return forbidden
    .filter((literal) => found.has(policyLiteralKey(literal)))
    .map((literal) => `${path}: ${policyLiteralToken(literal)}`);
}

function sourcePolicyLiteralKeys(
  path: string,
  source: string,
  forbidden: readonly PolicyLiteral[],
): Set<string> {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
  const found = new Set<string>();
  const forbiddenKeys = new Set(forbidden.map(policyLiteralKey));
  const forbiddenHosts = forbidden.filter(
    (literal): literal is Readonly<{ kind: "string"; value: string }> =>
      literal.kind === "string" && isHostName(literal.value),
  );
  const add = (literal: PolicyLiteral) => {
    const key = policyLiteralKey(literal);
    if (forbiddenKeys.has(key)) {
      found.add(key);
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) {
      return;
    }
    const numericValue = numericExpressionValue(node);
    if (numericValue !== undefined) {
      if (!isStructuralNumericExpression(node)) {
        add({ kind: "number", value: numericValue });
      }
      return;
    }
    const literal = policyLiteralFromNode(node);
    if (literal !== undefined) {
      add(literal);
    }
    const staticText = staticTextFromNode(node);
    if (staticText !== undefined) {
      for (const host of forbiddenHosts) {
        if (containsHost(staticText, host.value)) {
          add(host);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function policyLiteralFromNode(node: ts.Node): PolicyLiteral | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: "string", value: node.text };
  }
  if (ts.isRegularExpressionLiteral(node)) {
    const closingSlash = node.text.lastIndexOf("/");
    const pattern = node.text.slice(1, closingSlash);
    const flags = node.text.slice(closingSlash + 1);
    const expression = new RegExp(pattern, flags);
    return {
      kind: "regex",
      source: expression.source,
      flags: expression.flags,
    };
  }
  return undefined;
}

function staticTextFromNode(node: ts.Node): string | undefined {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    return node.text;
  }
  return undefined;
}

function numericExpressionValue(node: ts.Node): number | undefined {
  if (ts.isNumericLiteral(node)) {
    return finiteNumber(node.text.replaceAll("_", ""));
  }
  if (ts.isParenthesizedExpression(node)) {
    return numericExpressionValue(node.expression);
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = numericExpressionValue(node.operand);
    if (operand === undefined) {
      return undefined;
    }
    switch (node.operator) {
      case ts.SyntaxKind.PlusToken:
        return operand;
      case ts.SyntaxKind.MinusToken:
        return finiteNumber(-operand);
      case ts.SyntaxKind.TildeToken:
        return finiteNumber(~operand);
      default:
        return undefined;
    }
  }
  if (!ts.isBinaryExpression(node)) {
    return undefined;
  }
  const left = numericExpressionValue(node.left);
  const right = numericExpressionValue(node.right);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  switch (node.operatorToken.kind) {
    case ts.SyntaxKind.PlusToken:
      return finiteNumber(left + right);
    case ts.SyntaxKind.MinusToken:
      return finiteNumber(left - right);
    case ts.SyntaxKind.AsteriskToken:
      return finiteNumber(left * right);
    case ts.SyntaxKind.SlashToken:
      return finiteNumber(left / right);
    case ts.SyntaxKind.PercentToken:
      return finiteNumber(left % right);
    case ts.SyntaxKind.AsteriskAsteriskToken:
      return finiteNumber(left ** right);
    default:
      return undefined;
  }
}

function finiteNumber(value: number | string): number | undefined {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function isStructuralNumericExpression(node: ts.Node): boolean {
  return (
    isElementAccessIndex(node) ||
    isLengthCardinalityCheck(node) ||
    isForLoopBookkeeping(node) ||
    isStructuralStandardLibraryArgument(node)
  );
}

function isElementAccessIndex(node: ts.Node): boolean {
  return (
    ts.isElementAccessExpression(node.parent) &&
    node.parent.argumentExpression === node
  );
}

function isLengthCardinalityCheck(node: ts.Node): boolean {
  return (
    ts.isBinaryExpression(node.parent) &&
    ((node.parent.left === node && isLengthAccess(node.parent.right)) ||
      (node.parent.right === node && isLengthAccess(node.parent.left)))
  );
}

function isForLoopBookkeeping(node: ts.Node): boolean {
  for (let ancestor = node.parent; ancestor !== undefined; ancestor = ancestor.parent) {
    if (!ts.isForStatement(ancestor)) {
      continue;
    }
    return (
      isWithin(node, ancestor.initializer) ||
      isWithin(node, ancestor.incrementor)
    );
  }
  return false;
}

function isWithin(node: ts.Node, ancestor: ts.Node | undefined): boolean {
  for (let current: ts.Node | undefined = node; current !== undefined; current = current.parent) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}

function isStructuralStandardLibraryArgument(node: ts.Node): boolean {
  if (!ts.isCallExpression(node.parent)) {
    return false;
  }
  const argumentIndex = node.parent.arguments.indexOf(node as ts.Expression);
  if (argumentIndex === -1 || !ts.isPropertyAccessExpression(node.parent.expression)) {
    return false;
  }
  switch (node.parent.expression.name.text) {
    case "at":
    case "padEnd":
    case "padStart":
      return argumentIndex === 0;
    case "slice":
    case "substring":
      return argumentIndex === 0;
    default:
      return false;
  }
}

function isLengthAccess(node: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === "length";
}

function isHostName(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value) && value.includes(".");
}

function containsHost(text: string, host: string): boolean {
  let index = text.indexOf(host);
  while (index !== -1) {
    const before = text[index - 1];
    const after = text[index + host.length];
    if (
      (before === undefined || /[/:?&=@]/.test(before)) &&
      (after === undefined || /[/:?&#]/.test(after))
    ) {
      return true;
    }
    index = text.indexOf(host, index + host.length);
  }
  return false;
}

function policyLiteralKey(literal: PolicyLiteral): string {
  switch (literal.kind) {
    case "number":
      return `number:${literal.value}`;
    case "regex":
      return `regex:${literal.source}/${literal.flags}`;
    case "string":
      return `string:${literal.value}`;
  }
}

function policyLiteralToken(literal: PolicyLiteral): string {
  switch (literal.kind) {
    case "number":
      return String(literal.value);
    case "regex":
      return literal.source;
    case "string":
      return literal.value;
  }
}

function comparePolicyLiterals(left: PolicyLiteral, right: PolicyLiteral): number {
  const leftKey = policyLiteralKey(left);
  const rightKey = policyLiteralKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}
