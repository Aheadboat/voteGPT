import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { FEDERAL_CENSUS_DATA } from "./federal-policy.generated";
import {
  assessCensusDistrict,
  assessClerkJurisdiction,
  bioguidePublicUrl,
  canonicalCongressIngestionUrl,
  compareBioguideIds,
  CONGRESS_CALENDAR_POLICY,
  CONGRESS_CRITICAL_PATH_PHASES,
  CONGRESS_EPOCH_FIRST_NUMBER,
  CONGRESS_EPOCH_START_INSTANT_UTC,
  CONGRESS_EPOCH_START_YEAR_UTC,
  CONGRESS_MEMBER_DETAIL_BATCH_LIMIT,
  CONGRESS_STATE_MEMBER_LIST_LIMIT,
  CONGRESS_STATE_MEMBER_MAX_PAGES,
  CONGRESS_TERM_LENGTH_YEARS,
  CONGRESS_TURNOVER_DAY_OF_MONTH,
  CONGRESS_TURNOVER_HOUR_UTC,
  CONGRESS_TURNOVER_MONTH_INDEX,
  CLERK_NATIONAL_VACANCY_LIST_LIMIT,
  clerkNationalVacancyUrl,
  clerkVacancyPublicUrl,
  congressCurrentUrl,
  congressMemberDetailUrl,
  congressStateMemberListUrl,
  createCongressSnapshot,
  FEDERAL_CACHE_POLICY,
  FEDERAL_CACHE_REFRESH_AGE_MS,
  FEDERAL_CACHE_STALE_AGE_MS,
  FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS,
  FEDERAL_NETWORK_POLICY,
  FEDERAL_OFFICIAL_FIELD_POLICY,
  FEDERAL_OFFICIAL_NAME_MAX_CODE_POINTS,
  FEDERAL_POLICY_LITERAL_AUDIT,
  FEDERAL_PROVIDER_HOST_ALLOWLIST,
  FEDERAL_PROVIDER_CONTENT_TYPE_ALLOWLIST,
  FEDERAL_PROVIDER_FETCH_REDIRECT_MODE,
  FEDERAL_PROVIDER_PHASE_BUDGET_MS,
  FEDERAL_PROVIDER_RESPONSE_MAX_BYTES,
  FEDERAL_PROVIDER_RESPONSE_POLICY,
  FEDERAL_PROVIDER_URL_POLICY,
  FEDERAL_REFRESH_DEADLINE_MS,
  isBioguideId,
  isAllowedClerkPublicUrl,
  isAllowedCongressApiUrl,
  isCensusCongressInEffectiveRange,
  isCanonicalOfficialName,
  normalizeOfficialName,
} from "./federal-policy";
import {
  FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS as nodeBlockedHosts,
  FEDERAL_PROVIDER_HOSTS,
} from "./federal-provider-host-policy.mjs";

const currentCongress = FEDERAL_CENSUS_DATA.effectiveCongress.first;
const supportedCongressSnapshot = createCongressSnapshot(
  new Date("2027-01-03T16:59:59.999Z"),
);
const expiredCongressSnapshot = createCongressSnapshot(
  new Date("2027-01-03T17:00:00.000Z"),
);

describe("generated Census district policy", () => {
  it("assesses every voting state, exact district range, and Clerk jurisdiction", () => {
    expect(FEDERAL_CENSUS_DATA.votingStates).toHaveLength(50);
    expect(FEDERAL_CENSUS_DATA.totalVotingStates).toBe(50);
    expect(FEDERAL_CENSUS_DATA.totalRepresentativeCount).toBe(435);
    expect(FEDERAL_CENSUS_DATA.nonlaunchJurisdictions).toEqual([
      "DC", "AS", "GU", "MP", "PR", "VI",
    ]);

    for (const state of FEDERAL_CENSUS_DATA.votingStates) {
      const atLarge = state.representativeCount === 1;
      const firstDistrict = atLarge ? 0 : 1;
      const maximumDistrict = atLarge ? 0 : state.representativeCount;
      expect(
        assessCensusDistrict(state.code, firstDistrict, currentCongress),
      ).toEqual({ status: "valid", maximumDistrict, atLarge });
      expect(
        assessCensusDistrict(state.code, maximumDistrict, currentCongress),
      ).toEqual({ status: "valid", maximumDistrict, atLarge });
      expect(
        assessCensusDistrict(state.code, maximumDistrict + 1, currentCongress),
      ).toEqual({ status: "invalid", maximumDistrict });
      expect(assessClerkJurisdiction(state.code)).toEqual({
        status: "voting_state",
        maximumDistrict,
      });
    }

    for (const code of FEDERAL_CENSUS_DATA.nonlaunchJurisdictions) {
      expect(assessClerkJurisdiction(code)).toEqual({
        status: "known_nonlaunch",
        allowedDistricts: [0],
      });
      expect(assessCensusDistrict(code, 0, currentCongress)).toEqual({
        status: "invalid",
        maximumDistrict: 0,
      });
    }
    for (const district of [-1, 0.5, Number.NaN, 99]) {
      expect(assessCensusDistrict("CA", district, currentCongress)).toMatchObject({
        status: "invalid",
      });
    }
    expect(assessCensusDistrict("ZZ", 1, currentCongress)).toEqual({
      status: "invalid",
      maximumDistrict: 0,
    });
    expect(assessClerkJurisdiction("ZZ")).toEqual({ status: "unknown" });
    expect(
      assessCensusDistrict("CA", 1, FEDERAL_CENSUS_DATA.effectiveCongress.last + 1),
    ).toEqual({ status: "policy_expired" });
  });
});

describe("injected Congress calendar", () => {
  it("uses named epoch and exact turnover policy", () => {
    expect(createCongressSnapshot(new Date(CONGRESS_EPOCH_START_INSTANT_UTC))).toEqual({
      checkedAt: CONGRESS_EPOCH_START_INSTANT_UTC,
      currentCongress: CONGRESS_EPOCH_FIRST_NUMBER,
      startYear: CONGRESS_EPOCH_START_YEAR_UTC,
      endYear: CONGRESS_EPOCH_START_YEAR_UTC + CONGRESS_TERM_LENGTH_YEARS - 1,
    });
    expect(createCongressSnapshot(new Date("2023-01-03T17:00:00.000Z"))?.currentCongress).toBe(118);
    expect(createCongressSnapshot(new Date("2025-01-03T16:59:59.999Z"))?.currentCongress).toBe(118);
    expect(createCongressSnapshot(new Date("2025-01-03T17:00:00.000Z"))?.currentCongress).toBe(119);
    expect(createCongressSnapshot(new Date("2025-01-03T17:00:00.001Z"))?.currentCongress).toBe(119);
    expect(createCongressSnapshot(new Date("1789-03-03T23:59:59.999Z"))).toBeNull();
    expect(createCongressSnapshot(new Date("2024-02-29T12:00:00.000Z"))).toMatchObject({
      currentCongress: 118,
      startYear: 2023,
      endYear: 2024,
    });
    expect(createCongressSnapshot(new Date("not-a-date"))).toBeNull();

    const source = createCongressSnapshot.toString();
    expect(source).toContain("CONGRESS_EPOCH_FIRST_NUMBER");
    expect(source).toContain("CONGRESS_TURNOVER_MONTH_INDEX");
    expect(source).not.toContain(String(CONGRESS_EPOCH_START_YEAR_UTC));
    expect(source).not.toContain(CONGRESS_EPOCH_START_INSTANT_UTC);
  });
});

describe("generated Census Congress range", () => {
  it("admits only snapshots covered by the generated Census policy", () => {
    expect(
      createCongressSnapshot(new Date(CONGRESS_EPOCH_START_INSTANT_UTC)),
    ).toMatchObject({ currentCongress: CONGRESS_EPOCH_FIRST_NUMBER });
    expect(supportedCongressSnapshot).toMatchObject({
      currentCongress: FEDERAL_CENSUS_DATA.effectiveCongress.last,
    });
    expect(expiredCongressSnapshot).toMatchObject({
      currentCongress: FEDERAL_CENSUS_DATA.effectiveCongress.last + 1,
    });

    expect(
      isCensusCongressInEffectiveRange(
        FEDERAL_CENSUS_DATA.effectiveCongress.first,
      ),
    ).toBe(true);
    expect(
      isCensusCongressInEffectiveRange(
        FEDERAL_CENSUS_DATA.effectiveCongress.last,
      ),
    ).toBe(true);
    expect(
      isCensusCongressInEffectiveRange(
        FEDERAL_CENSUS_DATA.effectiveCongress.first - 1,
      ),
    ).toBe(false);
    expect(
      isCensusCongressInEffectiveRange(
        FEDERAL_CENSUS_DATA.effectiveCongress.last + 1,
      ),
    ).toBe(false);
    expect(
      isCensusCongressInEffectiveRange(
        FEDERAL_CENSUS_DATA.effectiveCongress.last + 0.5,
      ),
    ).toBe(false);

    const vacancyUrl = new URL(
      `${FEDERAL_PROVIDER_URL_POLICY.clerk.vacancyPathPrefix}CA12${FEDERAL_PROVIDER_URL_POLICY.clerk.vacancyPathSuffix}`,
      FEDERAL_PROVIDER_URL_POLICY.clerk.origin,
    ).toString();
    expect(clerkVacancyPublicUrl("CA", 12, supportedCongressSnapshot)).toBe(
      vacancyUrl,
    );
    expect(clerkVacancyPublicUrl("CA", 12, expiredCongressSnapshot)).toBeNull();
    expect(clerkVacancyPublicUrl("CA", 12, null)).toBeNull();
    expect(isAllowedClerkPublicUrl(vacancyUrl, supportedCongressSnapshot)).toBe(
      true,
    );
    expect(isAllowedClerkPublicUrl(vacancyUrl, expiredCongressSnapshot)).toBe(
      false,
    );
    expect(isAllowedClerkPublicUrl(vacancyUrl, null)).toBe(false);
    expect(
      isAllowedClerkPublicUrl(
        clerkNationalVacancyUrl().toString(),
        supportedCongressSnapshot,
      ),
    ).toBe(true);
    expect(
      isAllowedClerkPublicUrl(
        clerkNationalVacancyUrl().toString(),
        expiredCongressSnapshot,
      ),
    ).toBe(false);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2027-01-03T16:59:59.999Z"));
      expect(clerkVacancyPublicUrl("CA", 12)).toBe(vacancyUrl);
      expect(isAllowedClerkPublicUrl(vacancyUrl)).toBe(true);

      vi.setSystemTime(new Date("2027-01-03T17:00:00.000Z"));
      expect(clerkVacancyPublicUrl("CA", 12)).toBeNull();
      expect(isAllowedClerkPublicUrl(vacancyUrl)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects Clerk public URLs normalized during parsing", () => {
    const canonical = clerkNationalVacancyUrl().toString();
    const parsed = new URL(canonical);
    const normalizedInputs = [
      ` ${canonical} `,
      canonical.replace(
        `${parsed.protocol}//${parsed.host}`,
        `${parsed.protocol.toUpperCase()}//${parsed.host.toUpperCase()}`,
      ),
      canonical.replace(
        `${parsed.protocol}//${parsed.host}`,
        `${parsed.protocol}//${parsed.host}:443`,
      ),
    ];

    for (const value of normalizedInputs) {
      expect(isAllowedClerkPublicUrl(value, supportedCongressSnapshot)).toBe(false);
    }
  });
});

describe("named federal policy ownership", () => {
  it("uses named field validators for canonical Congress paths", () => {
    const congressPolicy = FEDERAL_PROVIDER_URL_POLICY.congress;
    const currentRequest = congressCurrentUrl("SENTINEL_CONGRESS_KEY");
    const expectedCurrent = new URL(
      congressPolicy.currentCongressPath,
      congressPolicy.origin,
    );
    expectedCurrent.searchParams.set(
      congressPolicy.formatQueryName,
      congressPolicy.formatQueryValue,
    );
    expect(canonicalCongressIngestionUrl(currentRequest)).toBe(
      expectedCurrent.toString(),
    );

    const stateRequest = congressStateMemberListUrl(
      "CA",
      "SENTINEL_CONGRESS_KEY",
    );
    const expectedState = new URL(
      `${congressPolicy.stateMemberPathPrefix}CA`,
      congressPolicy.origin,
    );
    expectedState.searchParams.set(
      congressPolicy.formatQueryName,
      congressPolicy.formatQueryValue,
    );
    expectedState.searchParams.set(
      congressPolicy.currentMemberQueryName,
      congressPolicy.currentMemberQueryValue,
    );
    expectedState.searchParams.set(
      congressPolicy.limitQueryName,
      String(CONGRESS_STATE_MEMBER_LIST_LIMIT),
    );
    expect(canonicalCongressIngestionUrl(stateRequest)).toBe(
      expectedState.toString(),
    );

    const detailRequest = congressMemberDetailUrl(
      "A000001",
      "SENTINEL_CONGRESS_KEY",
    );
    const expectedDetail = new URL(
      `${congressPolicy.memberDetailPathPrefix}A000001`,
      congressPolicy.origin,
    );
    expectedDetail.searchParams.set(
      congressPolicy.formatQueryName,
      congressPolicy.formatQueryValue,
    );
    expect(canonicalCongressIngestionUrl(detailRequest)).toBe(
      expectedDetail.toString(),
    );

    for (const invalidPath of [
      `${congressPolicy.stateMemberPathPrefix}CALI`,
      `${congressPolicy.memberDetailPathPrefix}A00001`,
    ]) {
      const request = new URL(invalidPath, congressPolicy.origin);
      request.searchParams.set(
        congressPolicy.formatQueryName,
        congressPolicy.formatQueryValue,
      );
      expect(canonicalCongressIngestionUrl(request)).toBeNull();
    }

    const sourceFile = ts.createSourceFile(
      "federal-policy.ts",
      readFileSync(resolve("src/lib/federal-policy.ts"), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const canonicalFunction = sourceFile.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === "canonicalCongressIngestionUrl",
    );
    if (canonicalFunction?.body === undefined) {
      throw new Error("canonicalCongressIngestionUrl must have a function body.");
    }

    let usesStateCodeFieldPolicy = false;
    let usesBioguideIdHelper = false;
    let pathRegularExpressionCount = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "test" &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        node.expression.expression.name.text === "stateCodePattern" &&
        ts.isIdentifier(node.expression.expression.expression) &&
        node.expression.expression.expression.text === "FEDERAL_OFFICIAL_FIELD_POLICY"
      ) {
        usesStateCodeFieldPolicy = true;
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "isBioguideId"
      ) {
        usesBioguideIdHelper = true;
      }
      if (
        ts.isRegularExpressionLiteral(node) ||
        (ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "RegExp")
      ) {
        pathRegularExpressionCount += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(canonicalFunction.body);

    expect(usesStateCodeFieldPolicy).toBe(true);
    expect(usesBioguideIdHelper).toBe(true);
    expect(pathRegularExpressionCount).toBe(0);
  });

  it("rejects raw Congress URLs that WHATWG normalizes", () => {
    const congressPolicy = FEDERAL_PROVIDER_URL_POLICY.congress;
    const canonicalRawInputs = [
      congressCurrentUrl("SENTINEL_CONGRESS_KEY").toString(),
      congressStateMemberListUrl("CA", "SENTINEL_CONGRESS_KEY").toString(),
      congressMemberDetailUrl("A000001", "SENTINEL_CONGRESS_KEY").toString(),
    ];

    for (const raw of canonicalRawInputs) {
      const canonical = canonicalCongressIngestionUrl(new URL(raw));
      expect(canonical).not.toBeNull();
      expect(canonicalCongressIngestionUrl(raw)).toBe(
        canonical,
      );
    }

    const raw = canonicalRawInputs[2];
    const normalizedFormatRaw = raw.replace(
      `${congressPolicy.formatQueryName}=${congressPolicy.formatQueryValue}`,
      `${congressPolicy.formatQueryName}=js\non`,
    );
    for (const normalizedRaw of [
      normalizedFormatRaw,
      `${raw}\r`,
      `${raw}\n`,
      `${raw}\t`,
      ` ${raw}`,
      `${raw} `,
    ]) {
      expect(canonicalCongressIngestionUrl(normalizedRaw)).toBeNull();
    }

    expect(canonicalCongressIngestionUrl(new URL(normalizedFormatRaw))).toBe(
      canonicalCongressIngestionUrl(raw),
    );
  });

  it("uses named state-code policy for Clerk vacancy URL validation", () => {
    const sourceFile = ts.createSourceFile(
      "federal-policy.ts",
      readFileSync(resolve("src/lib/federal-policy.ts"), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const clerkValidator = sourceFile.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === "isAllowedClerkPublicUrl",
    );
    if (clerkValidator === undefined) {
      throw new Error("isAllowedClerkPublicUrl must have a function declaration.");
    }

    const validatorSource = clerkValidator.getText(sourceFile);
    expect(validatorSource).toContain(
      "FEDERAL_OFFICIAL_FIELD_POLICY.stateCodePattern.test",
    );
    expect(validatorSource).not.toContain("[A-Z]{2}");
  });

  it("freezes data and policy owners, derives host values, and keeps provenance credential-free", () => {
    for (const value of [
      FEDERAL_CENSUS_DATA,
      CONGRESS_CALENDAR_POLICY,
      FEDERAL_CACHE_POLICY,
      FEDERAL_NETWORK_POLICY,
      FEDERAL_PROVIDER_RESPONSE_POLICY,
      FEDERAL_PROVIDER_URL_POLICY,
      FEDERAL_OFFICIAL_FIELD_POLICY,
      FEDERAL_PROVIDER_HOSTS,
      FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(FEDERAL_PROVIDER_HOST_ALLOWLIST).toEqual(FEDERAL_PROVIDER_HOSTS);
    expect(FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS).toEqual(nodeBlockedHosts);
    expect(nodeBlockedHosts).toEqual([
      FEDERAL_PROVIDER_HOSTS.congressApi,
      FEDERAL_PROVIDER_HOSTS.clerk,
    ]);

    const congressPolicy = FEDERAL_PROVIDER_URL_POLICY.congress;
    const request = congressStateMemberListUrl("CA", "SENTINEL_CONGRESS_KEY");
    expect(request.searchParams.get(congressPolicy.limitQueryName)).toBe(
      String(CONGRESS_STATE_MEMBER_LIST_LIMIT),
    );
    expect(CONGRESS_STATE_MEMBER_LIST_LIMIT).toBe(250);
    expect(request.searchParams.get(congressPolicy.currentMemberQueryName)).toBe(
      congressPolicy.currentMemberQueryValue,
    );
    expect(request.searchParams.get(congressPolicy.apiKeyQueryName)).toBe(
      "SENTINEL_CONGRESS_KEY",
    );
    const canonicalStateMemberUrl = new URL(
      `${congressPolicy.stateMemberPathPrefix}CA`,
      congressPolicy.origin,
    );
    canonicalStateMemberUrl.searchParams.set(
      congressPolicy.formatQueryName,
      congressPolicy.formatQueryValue,
    );
    canonicalStateMemberUrl.searchParams.append(
      congressPolicy.currentMemberQueryName,
      congressPolicy.currentMemberQueryValue,
    );
    canonicalStateMemberUrl.searchParams.append(
      congressPolicy.limitQueryName,
      String(CONGRESS_STATE_MEMBER_LIST_LIMIT),
    );
    expect(canonicalCongressIngestionUrl(request)).toBe(
      canonicalStateMemberUrl.toString(),
    );
    expect(canonicalCongressIngestionUrl(`${request}&unexpected=yes`)).toBeNull();
    const duplicateCurrentMember = new URL(request);
    duplicateCurrentMember.searchParams.append(
      congressPolicy.currentMemberQueryName,
      congressPolicy.currentMemberQueryValue,
    );
    expect(canonicalCongressIngestionUrl(duplicateCurrentMember)).toBeNull();
    const malformedCurrentMember = new URL(request);
    malformedCurrentMember.searchParams.set(
      congressPolicy.currentMemberQueryName,
      `${congressPolicy.currentMemberQueryValue}0`,
    );
    expect(canonicalCongressIngestionUrl(malformedCurrentMember)).toBeNull();
    expect(JSON.stringify(canonicalCongressIngestionUrl(request))).not.toContain(
      "SENTINEL_CONGRESS_KEY",
    );
  });

  it("loads sole host owner in bare Node without a TypeScript or Next loader", () => {
    const moduleUrl = pathToFileURL(
      resolve("src/lib/federal-provider-host-policy.mjs"),
    ).href;
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", `import(${JSON.stringify(moduleUrl)}).then((module) => process.stdout.write(JSON.stringify(module)))`],
      { encoding: "utf8" },
    );
    expect(JSON.parse(output)).toMatchObject({
      FEDERAL_PROVIDER_HOSTS,
      FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS: nodeBlockedHosts,
    });
    const facadeSource = readFileSync("src/lib/federal-policy.ts", "utf8");
    const declarationSource = readFileSync(
      "src/lib/federal-provider-host-policy.d.mts",
      "utf8",
    );
    for (const host of Object.values(FEDERAL_PROVIDER_HOSTS)) {
      expect(facadeSource).not.toContain(host);
      expect(declarationSource).not.toContain(host);
    }
    expect(FEDERAL_POLICY_LITERAL_AUDIT.productionFiles).toContain(
      "src/lib/federal-provider-host-policy.d.mts",
    );
  });

  it("owns validation through named name and Bioguide policies", () => {
    expect(normalizeOfficialName(" Jose\u0301 Rivera ")).toBe("José Rivera");
    expect(normalizeOfficialName("\ufeffAlice")).toBeNull();
    expect(normalizeOfficialName("\tJosé Rivera")).toBeNull();
    expect(normalizeOfficialName("José Rivera\n")).toBeNull();
    expect(normalizeOfficialName(`A${String.fromCharCode(0)}B`)).toBeNull();
    expect(normalizeOfficialName(`A${String.fromCharCode(0x85)}B`)).toBeNull();
    expect(normalizeOfficialName("A\u061cB")).toBeNull();
    expect(normalizeOfficialName("A\u200eB")).toBeNull();
    expect(normalizeOfficialName("A\u200fB")).toBeNull();
    expect(normalizeOfficialName("A\u202eB")).toBeNull();
    expect(normalizeOfficialName("A\ud800B")).toBeNull();
    expect(normalizeOfficialName("A\udc00B")).toBeNull();
    expect(normalizeOfficialName("A😀B")).toBe("A😀B");
    expect(normalizeOfficialName("x".repeat(FEDERAL_OFFICIAL_NAME_MAX_CODE_POINTS + 1))).toBeNull();
    expect(isCanonicalOfficialName("José Rivera")).toBe(true);
    expect(isBioguideId("A000001")).toBe(true);
    expect(isBioguideId("A00001")).toBe(false);
    expect(bioguidePublicUrl("A000001")).toContain("A000001");
    expect(compareBioguideIds("A000001", "B000001")).toBeLessThan(0);
  });

  it("owns immutable named provider field contracts", () => {
    expect(FEDERAL_OFFICIAL_FIELD_POLICY.divisionTypes).toEqual({
      state: "state",
      congressionalDistrict: "congressional_district",
    });
    expect(FEDERAL_OFFICIAL_FIELD_POLICY.district).toEqual({
      atLarge: 0,
      firstNumbered: 1,
      maximumCanonical: 99,
    });
    expect(FEDERAL_OFFICIAL_FIELD_POLICY.congressCurrent).toEqual({
      requiredKeys: ["number", "startYear", "endYear", "url"],
    });
    expect(FEDERAL_OFFICIAL_FIELD_POLICY.congressMember).toEqual({
      requiredKeys: ["bioguideId", "name", "state", "district", "url"],
      chambers: ["House", "Senate"],
    });
    expect(FEDERAL_OFFICIAL_FIELD_POLICY.clerkVacancy).toEqual({
      requiredKeys: ["stateCode", "districtCode", "publicUrl"],
    });

    for (const value of [
      FEDERAL_OFFICIAL_FIELD_POLICY.divisionTypes,
      FEDERAL_OFFICIAL_FIELD_POLICY.district,
      FEDERAL_OFFICIAL_FIELD_POLICY.congressCurrent,
      FEDERAL_OFFICIAL_FIELD_POLICY.congressCurrent.requiredKeys,
      FEDERAL_OFFICIAL_FIELD_POLICY.congressMember,
      FEDERAL_OFFICIAL_FIELD_POLICY.congressMember.requiredKeys,
      FEDERAL_OFFICIAL_FIELD_POLICY.congressMember.chambers,
      FEDERAL_OFFICIAL_FIELD_POLICY.clerkVacancy,
      FEDERAL_OFFICIAL_FIELD_POLICY.clerkVacancy.requiredKeys,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("maps every handwritten policy family to its named export", () => {
    expect(CONGRESS_CALENDAR_POLICY).toMatchObject({
      epoch: {
        firstCongressNumber: CONGRESS_EPOCH_FIRST_NUMBER,
        startYearUtc: CONGRESS_EPOCH_START_YEAR_UTC,
        startInstantUtc: CONGRESS_EPOCH_START_INSTANT_UTC,
      },
      termLengthYears: CONGRESS_TERM_LENGTH_YEARS,
      turnoverUtc: {
        monthIndex: CONGRESS_TURNOVER_MONTH_INDEX,
        dayOfMonth: CONGRESS_TURNOVER_DAY_OF_MONTH,
        hour: CONGRESS_TURNOVER_HOUR_UTC,
      },
    });
    expect(FEDERAL_CACHE_POLICY).toMatchObject({
      refreshAgeMs: FEDERAL_CACHE_REFRESH_AGE_MS,
      staleAgeMs: FEDERAL_CACHE_STALE_AGE_MS,
    });
    expect(FEDERAL_NETWORK_POLICY).toEqual({
      phaseBudgetMs: FEDERAL_PROVIDER_PHASE_BUDGET_MS,
      congressCriticalPathPhases: CONGRESS_CRITICAL_PATH_PHASES,
    });
    expect(FEDERAL_REFRESH_DEADLINE_MS).toBe(
      FEDERAL_PROVIDER_PHASE_BUDGET_MS * CONGRESS_CRITICAL_PATH_PHASES,
    );
    expect(FEDERAL_PROVIDER_RESPONSE_POLICY).toMatchObject({
      maxBodyBytes: FEDERAL_PROVIDER_RESPONSE_MAX_BYTES,
      redirect: FEDERAL_PROVIDER_FETCH_REDIRECT_MODE,
      contentTypes: FEDERAL_PROVIDER_CONTENT_TYPE_ALLOWLIST,
      congress: {
        stateMemberListLimit: CONGRESS_STATE_MEMBER_LIST_LIMIT,
        maxStateMemberPages: CONGRESS_STATE_MEMBER_MAX_PAGES,
        maxMemberDetailRequests: CONGRESS_MEMBER_DETAIL_BATCH_LIMIT,
      },
      clerk: { maxNationalVacancyRows: CLERK_NATIONAL_VACANCY_LIST_LIMIT },
    });
    expect(congressCurrentUrl("key").pathname).toBe(
      FEDERAL_PROVIDER_URL_POLICY.congress.currentCongressPath,
    );
    expect(congressMemberDetailUrl("A000001", "key").pathname).toBe(
      "/v3/member/A000001",
    );
    expect(clerkNationalVacancyUrl().toString()).toBe(
      `${FEDERAL_PROVIDER_URL_POLICY.clerk.origin}${FEDERAL_PROVIDER_URL_POLICY.clerk.nationalVacancyPath}`,
    );
    expect(clerkVacancyPublicUrl("CA", 12, supportedCongressSnapshot)).toBe(
      `${FEDERAL_PROVIDER_URL_POLICY.clerk.origin}/members/CA12/vacancy`,
    );
    expect(isAllowedCongressApiUrl(congressCurrentUrl("key").toString())).toBe(true);
    expect(
      isAllowedClerkPublicUrl(
        clerkNationalVacancyUrl().toString(),
        supportedCongressSnapshot,
      ),
    ).toBe(true);
  });
});
