import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { FEDERAL_CENSUS_DATA } from "../src/lib/federal-policy.generated";
// @ts-expect-error Node and Vitest execute the checked-in .mts generator directly.
import * as generator from "../scripts/generate-federal-policy";

const apportionmentUrl =
  "https://www2.census.gov/programs-surveys/decennial/2020/data/apportionment/apportionment.csv";
const stateUrl = "https://www2.census.gov/geo/docs/reference/state.txt";
const repoRoot = resolve(process.cwd());
const sourceOfficialVersions = {
  [apportionmentUrl]: "2021-04-26T19:10:06.000Z",
  [stateUrl]: "2013-03-13T18:26:28.000Z",
};
const rawIdentitySeatContractError =
  "Census source does not match the immutable 2020 apportionment identity/seat contract.";
const metadataIdentitySeatContractError =
  "Metadata Census identity manifest does not match the immutable 2020 apportionment identity/seat contract.";

type SourceMetadata = {
  url: string;
  officialRelease: string;
  officialVersion: string;
  retrievedAt: string;
  upstreamSha256: string;
  canonicalSha256: string;
};
type CensusIdentityManifest = {
  votingStates: Array<{
    code: string;
    fips: string;
    representativeCount: number;
  }>;
  nonlaunchJurisdictions: Array<{ code: string; fips: string }>;
  totalVotingStates: number;
  totalRepresentativeCount: number;
  totalNonlaunchJurisdictions: number;
};
type GenerationInput = {
  apportionmentCsv: string;
  stateTxt: string;
  metadata: {
    sources: SourceMetadata[];
    generatedAt: string;
    effectiveCongress: { first: number; last: number };
    censusIdentityManifest?: CensusIdentityManifest;
  };
};
const { checkFederalPolicy, checkFederalPolicyFiles, generateFederalPolicy } = generator;

describe("checked-in Census policy generation", () => {
  it("has no mutable Census refresh entry point", () => {
    const scriptText = readFileSync(
      resolve(repoRoot, "scripts/generate-federal-policy.mts"),
      "utf8",
    );

    expect("refreshFederalPolicy" in generator).toBe(false);
    expect(scriptText).not.toContain("--refresh");
    for (const prohibited of [
      "writeFileSync",
      "renameSync",
      "unlinkSync",
      "mkdirSync",
      "rmdirSync",
      "randomUUID",
      "fetchCensusSource",
    ]) {
      expect(scriptText).not.toContain(prohibited);
    }

    const command = spawnSync(
      process.execPath,
      [resolve(repoRoot, "scripts/generate-federal-policy.mts"), "--refresh"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(command.status).toBe(1);
    expect(command.stdout).toBe("");
    expect(command.stderr).toContain(
      "Usage: node scripts/generate-federal-policy.mts --check",
    );
    expect(command.stderr).not.toContain("--refresh");
  });

  it("deep-freezes generated Census policy data", () => {
    expect(Object.isFrozen(FEDERAL_CENSUS_DATA)).toBe(true);
    expect(Object.isFrozen(FEDERAL_CENSUS_DATA.effectiveCongress)).toBe(true);
    expect(Object.isFrozen(FEDERAL_CENSUS_DATA.votingStates)).toBe(true);
    expect(Object.isFrozen(FEDERAL_CENSUS_DATA.votingStates[0])).toBe(true);
    expect(Object.isFrozen(FEDERAL_CENSUS_DATA.nonlaunchJurisdictions)).toBe(true);
    expect(Object.isFrozen(FEDERAL_CENSUS_DATA.nonlaunchJurisdictionFips)).toBe(true);
    expect(
      Reflect.set(
        FEDERAL_CENSUS_DATA.effectiveCongress,
        "first",
        FEDERAL_CENSUS_DATA.effectiveCongress.first,
      ),
    ).toBe(false);
  });

  it("derives fifty voting states from the raw official schemas", () => {
    const input = checkedInInput();

    expect(input.apportionmentCsv).toMatch(/^Name,Geography Type,Year,/);
    expect(input.apportionmentCsv).toContain(
      'Alabama,State,2020,"5,024,279",5.1,99.2,29,7,0,"718,579"',
    );
    expect(input.stateTxt).toMatch(/^STATE\|STUSAB\|STATE_NAME\|STATENS/);
    expect(input.stateTxt).toContain("74|UM|U.S. Minor Outlying Islands|01878752");

    const result = generateFederalPolicy(input);

    expect(result.censusData.votingStates).toHaveLength(50);
    expect(result.censusData.totalVotingStates).toBe(50);
    expect(result.censusData.totalRepresentativeCount).toBe(435);
    expect(result.censusData.effectiveCongress).toEqual({ first: 118, last: 119 });
    expect(
      result.censusData.votingStates.find(
        (state: { code: string }) => state.code === "CA",
      ),
    ).toEqual({ code: "CA", fips: "06", representativeCount: 52 });
    expect(result.censusData.nonlaunchJurisdictionFips).toEqual({
      DC: "11",
      AS: "60",
      GU: "66",
      MP: "69",
      PR: "72",
      VI: "78",
    });
  });

  it("rejects text after a closing quote in an ignored historical row", () => {
    const input = checkedInInput();
    input.apportionmentCsv = input.apportionmentCsv.replace(
      "Alabama,State,1910",
      '"Alabama"x,State,1910',
    );

    expect(() => generateFederalPolicy(input)).toThrow(
      "Apportionment source data is malformed.",
    );
  });

  it("accepts escaped quotes in a quoted ignored historical field", () => {
    const input = checkedInInput();
    input.apportionmentCsv = input.apportionmentCsv.replace(
      "Alabama,State,1910",
      '"Alab""ama",State,1910',
    );

    expect(() => generateFederalPolicy(input)).not.toThrow();
  });

  it("pins canonical official source versions from Census Last-Modified headers", () => {
    expect(
      Object.fromEntries(
        checkedInInput().metadata.sources.map((source) => [
          source.url,
          source.officialVersion,
        ]),
      ),
    ).toEqual(sourceOfficialVersions);
  });

  it.each([
    ["Alabama-to-Arkansas seat reallocation", (input: MutableInput) => {
      input.apportionmentCsv = input.apportionmentCsv
        .replace(
          'Alabama,State,2020,"5,024,279",5.1,99.2,29,7,0,"718,579"',
          'Alabama,State,2020,"5,024,279",5.1,99.2,29,6,0,"718,579"',
        )
        .replace(
          'Arkansas,State,2020,"3,011,524",3.3,57.9,36,4,0,"753,439"',
          'Arkansas,State,2020,"3,011,524",3.3,57.9,36,5,0,"753,439"',
        );
      expect(input.apportionmentCsv).toContain(
        'Alabama,State,2020,"5,024,279",5.1,99.2,29,6,0,"718,579"',
      );
      expect(input.apportionmentCsv).toContain(
        'Arkansas,State,2020,"3,011,524",3.3,57.9,36,5,0,"753,439"',
      );
      const manifest = requireIdentityManifest(input);
      const alabama = manifest.votingStates.find((state) => state.code === "AL");
      const arkansas = manifest.votingStates.find((state) => state.code === "AR");
      if (alabama === undefined || arkansas === undefined) {
        throw new Error("Expected Alabama and Arkansas in the Census identity manifest.");
      }
      alabama.representativeCount = 6;
      arkansas.representativeCount = 5;
      expect(alabama).toEqual({ code: "AL", fips: "01", representativeCount: 6 });
      expect(arkansas).toEqual({ code: "AR", fips: "05", representativeCount: 5 });
    }],
    ["Vermont-to-UM identity/FIPS replacement", (input: MutableInput) => {
      input.apportionmentCsv = input.apportionmentCsv.replace(
        "Vermont,State,2020",
        "U.S. Minor Outlying Islands,State,2020",
      );
      expect(input.apportionmentCsv).toContain(
        'U.S. Minor Outlying Islands,State,2020,"643,077",2.8,69.8,33,1,0,"643,503"',
      );
      const manifest = requireIdentityManifest(input);
      const vermontIndex = manifest.votingStates.findIndex((state) => state.code === "VT");
      if (vermontIndex === -1) {
        throw new Error("Expected Vermont in the Census identity manifest.");
      }
      manifest.votingStates[vermontIndex] = {
        code: "UM",
        fips: "74",
        representativeCount: 1,
      };
      manifest.votingStates.sort((left, right) => left.fips.localeCompare(right.fips));
      expect(manifest.votingStates).toContainEqual({
        code: "UM",
        fips: "74",
        representativeCount: 1,
      });
    }],
  ] as const)("rejects coordinated %s even when metadata mirrors raw source", (_label, mutate) => {
    const input = inputWithManifest();
    mutate(input);

    expect(() => generateFederalPolicy(input)).toThrow(metadataIdentitySeatContractError);
  });

  it.each([
    ["Alabama-to-Arkansas seat reallocation", (input: MutableInput) => {
      input.apportionmentCsv = input.apportionmentCsv
        .replace(
          'Alabama,State,2020,"5,024,279",5.1,99.2,29,7,0,"718,579"',
          'Alabama,State,2020,"5,024,279",5.1,99.2,29,6,0,"718,579"',
        )
        .replace(
          'Arkansas,State,2020,"3,011,524",3.3,57.9,36,4,0,"753,439"',
          'Arkansas,State,2020,"3,011,524",3.3,57.9,36,5,0,"753,439"',
        );
    }],
    ["Vermont-to-UM identity/FIPS replacement", (input: MutableInput) => {
      input.apportionmentCsv = input.apportionmentCsv.replace(
        "Vermont,State,2020",
        "U.S. Minor Outlying Islands,State,2020",
      );
    }],
  ] as const)("rejects raw %s independently of metadata", (_label, mutate) => {
    const input = inputWithManifest();
    mutate(input);

    expect(() => generateFederalPolicy(input)).toThrow(rawIdentitySeatContractError);
  });

  it("rejects coordinated raw and manifest removal of California", () => {
    const input = inputWithManifest();
    const manifest = requireIdentityManifest(input);
    const californiaIndex = manifest.votingStates.findIndex(
      (state) => state.code === "CA",
    );
    const [california] = manifest.votingStates.splice(californiaIndex, 1);
    if (california === undefined) {
      throw new Error("Expected California in the Census identity manifest.");
    }
    input.apportionmentCsv = input.apportionmentCsv.replace(
      /\r?\nCalifornia,State,2020,[^\r\n]*/,
      "",
    );
    manifest.totalVotingStates = manifest.votingStates.length;
    manifest.totalRepresentativeCount -= california.representativeCount;

    expect(() => generateFederalPolicy(input)).toThrow(
      "Metadata Census identity manifest does not match the 2020 apportionment coverage.",
    );
  });

  it("rejects raw 2020 apportionment coverage shortfalls", () => {
    const input = inputWithManifest();
    input.apportionmentCsv = input.apportionmentCsv.replace(
      /\r?\nCalifornia,State,2020,[^\r\n]*/,
      "",
    );

    expect(() => generateFederalPolicy(input)).toThrow(
      "Census source does not match the 2020 apportionment coverage.",
    );
  });

  it.each([
    ["a too-narrow range", { first: 118, last: 118 }],
    ["a too-wide range", { first: 118, last: 120 }],
    ["an unbounded historical and future range", { first: 1, last: 9999 }],
  ])("rejects %s for the 2020 apportionment artifact", (_label, effectiveCongress) => {
    const input = checkedInInput() as MutableInput;
    input.metadata.effectiveCongress = effectiveCongress;

    expect(() => generateFederalPolicy(input)).toThrow(
      "Metadata effective Congress range does not match the 2020 apportionment coverage.",
    );
  });

  it.each(["CA", "AL"])("rejects %s reclassified as nonlaunch by a self-consistent manifest", (code) => {
    const input = inputWithManifest();
    const manifest = requireIdentityManifest(input);
    const stateIndex = manifest.votingStates.findIndex(
      (state) => state.code === code,
    );
    const [reclassifiedState] = manifest.votingStates.splice(stateIndex, 1);
    if (reclassifiedState === undefined) {
      throw new Error(`Expected ${code} in the Census identity manifest.`);
    }
    manifest.nonlaunchJurisdictions.push({
      code: reclassifiedState.code,
      fips: reclassifiedState.fips,
    });
    manifest.nonlaunchJurisdictions.sort((left, right) =>
      left.fips.localeCompare(right.fips),
    );
    manifest.totalVotingStates = manifest.votingStates.length;
    manifest.totalRepresentativeCount -= reclassifiedState.representativeCount;
    manifest.totalNonlaunchJurisdictions = manifest.nonlaunchJurisdictions.length;

    expect(() => generateFederalPolicy(input)).toThrow(
      "Metadata Census identity manifest does not match the 2020 apportionment coverage.",
    );
  });

  it("rejects a VI-to-UM nonlaunch manifest substitution", () => {
    const input = inputWithManifest();
    const manifest = requireIdentityManifest(input);
    const virginIslandsIndex = manifest.nonlaunchJurisdictions.findIndex(
      (jurisdiction) => jurisdiction.code === "VI",
    );
    manifest.nonlaunchJurisdictions[virginIslandsIndex] = {
      code: "UM",
      fips: "74",
    };
    manifest.nonlaunchJurisdictions.sort((left, right) =>
      left.fips.localeCompare(right.fips),
    );

    expect(() => generateFederalPolicy(input)).toThrow(
      "Census source identities do not match metadata manifest.",
    );
  });

  it("rejects a Vermont-to-UM replacement that preserves state and seat totals", () => {
    const input = inputWithManifest();
    input.apportionmentCsv = input.apportionmentCsv.replace(
      "Vermont,State,2020",
      "U.S. Minor Outlying Islands,State,2020",
    );

    expect(() => generateFederalPolicy(input)).toThrow(
      rawIdentitySeatContractError,
    );
  });

  it("rejects changed and missing nonlaunch FIPS from raw state rows", () => {
    const changed = inputWithManifest();
    changed.stateTxt = changed.stateTxt.replace(
      "60|AS|American Samoa|01802701",
      "99|AS|American Samoa|01802701",
    );

    expect(() => generateFederalPolicy(changed)).toThrow(
      "Census source identities do not match metadata manifest.",
    );

    const missing = inputWithManifest();
    missing.stateTxt = missing.stateTxt.replace(
      /\r?\n69\|MP\|Northern Mariana Islands\|01779809/,
      "",
    );

    expect(() => generateFederalPolicy(missing)).toThrow(
      "Census source identities do not match metadata manifest.",
    );
  });

  it.each([
    ["a changed voting-state FIPS identity", (input: MutableInput) => {
      input.stateTxt = input.stateTxt.replace(
        "06|CA|California|01779778",
        "99|CA|California|01779778",
      );
    }],
    ["a missing voting-state apportionment row", (input: MutableInput) => {
      input.apportionmentCsv = input.apportionmentCsv.replace(
        /\r?\nCalifornia,State,2020,[^\r\n]*/,
        "",
      );
    }],
    ["an invalid voting-state representative count", (input: MutableInput) => {
      input.apportionmentCsv = input.apportionmentCsv.replace(
        'Alabama,State,2020,"5,024,279",5.1,99.2,29,7,0,"718,579"',
        'Alabama,State,2020,"5,024,279",5.1,99.2,29,0,0,"718,579"',
      );
    }],
  ] as const)("fails closed for %s", (_label, mutate) => {
    const input = inputWithManifest();
    mutate(input);

    expect(() => generateFederalPolicy(input)).toThrow();
  });

  it.each([
    ["a missing identity manifest", (input: MutableInput) => {
      delete input.metadata.censusIdentityManifest;
    }],
    ["a duplicate voting-state code", (input: MutableInput) => {
      const manifest = requireIdentityManifest(input);
      manifest.votingStates[1] = { ...manifest.votingStates[0], fips: "02" };
    }],
    ["voting states out of FIPS order", (input: MutableInput) => {
      const manifest = requireIdentityManifest(input);
      [manifest.votingStates[0], manifest.votingStates[1]] = [
        manifest.votingStates[1],
        manifest.votingStates[0],
      ];
    }],
    ["totals that do not match manifest identities", (input: MutableInput) => {
      requireIdentityManifest(input).totalRepresentativeCount += 1;
    }],
    ["an altered nonlaunch FIPS identity", (input: MutableInput) => {
      requireIdentityManifest(input).nonlaunchJurisdictions[0].fips = "12";
    }],
  ] as const)("rejects %s", (_label, mutate) => {
    const input = inputWithManifest();
    mutate(input);

    expect(() => generateFederalPolicy(input)).toThrow(
      "Metadata Census identity manifest is malformed.",
    );
  });

  it("rejects a curated three-column state reference as an upstream artifact", () => {
    const input = checkedInInput();
    input.stateTxt = input.stateTxt.replace(
      "STATE|STUSAB|STATE_NAME|STATENS",
      "STATE|STUSAB|STATE_NAME",
    );

    expect(() => generateFederalPolicy(input)).toThrow(
      "Unexpected state reference header.",
    );
  });

  it("keeps normal check offline, byte-stable, and strict about both hashes", () => {
    const before = checkedInBytes();
    const command = spawnSync(
      process.execPath,
      [resolve(repoRoot, "scripts/generate-federal-policy.mts"), "--check"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(command.status).toBe(0);
    expect(checkedInBytes()).toEqual(before);

    const metadata = readMetadata(repoRoot);
    for (const [url, path] of [
      [apportionmentUrl, apportionmentPath(repoRoot)],
      [stateUrl, statePath(repoRoot)],
    ] as const) {
      const source = metadata.sources.find((candidate) => candidate.url === url);
      const bytes = readFileSync(path);

      expect(source?.upstreamSha256).toBe(sha256(bytes));
      expect(source?.canonicalSha256).toBe(canonicalSha256(bytes));
    }
  });

  it("normalizes generated BOM and line endings but rejects content drift", () => {
    const input = checkedInInput();
    const generatedTypeScript = generateFederalPolicy(input).generatedTypeScript;
    const transportVariant = `\uFEFF${generatedTypeScript.replace(/\n/g, "\r\n")}`;

    expect(
      checkFederalPolicy({ ...input, generatedTypeScript: transportVariant })
        .generatedTypeScript,
    ).toBe(generatedTypeScript);
    expect(() =>
      checkFederalPolicy({
        ...input,
        generatedTypeScript: transportVariant.replace(
          '"totalVotingStates": 50',
          '"totalVotingStates": 51',
        ),
      }),
    ).toThrow("Generated federal policy is out of date.");
  });

  it("detects raw-byte drift even when source text canonicalizes identically", () => {
    const root = createCheckRoot();
    try {
      expect(() => checkFederalPolicyFiles(root)).not.toThrow();
      const stateText = readFileSync(statePath(root), "utf8");
      writeFileSync(
        statePath(root),
        `\uFEFF${stateText.replace(/\r?\n/g, "\r\n")}`,
      );

      expect(() => checkFederalPolicyFiles(root)).toThrow(
        `Checked-in source hash drifted for ${stateUrl}.`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects a linked root before reading checked artifacts", () => {
    const root = createCheckRoot();
    const externalRoot = mkdtempSync(join(tmpdir(), "votegpt-external-check-root-"));
    const unsafeRoot = `${root}-junction`;
    const sentinelPath = join(externalRoot, "sentinel");
    const sentinelBytes = Buffer.from("external root must remain untouched");
    try {
      writeFileSync(sentinelPath, sentinelBytes);
      symlinkSync(externalRoot, unsafeRoot, "junction");

      expect(() => checkFederalPolicyFiles(unsafeRoot)).toThrow(/target parent is unsafe/i);

      expect(readFileSync(sentinelPath)).toEqual(sentinelBytes);
    } finally {
      if (existsSync(unsafeRoot)) {
        unlinkSync(unsafeRoot);
      }
      rmSync(root, { recursive: true, force: true });
      rmSync(externalRoot, { recursive: true, force: true });
    }
  });
  it.each([
    ["data", ["data"]],
    ["src/lib", ["src", "lib"]],
  ] as const)(
    "rejects a valid checked artifact behind a %s junction",
    (linkedParent, parentSegments) => {
      const root = createCheckRoot();
      const externalParent = mkdtempSync(
        join(tmpdir(), `votegpt-external-check-${linkedParent.replace("/", "-")}-`),
      );
      const localParent = join(root, ...parentSegments);
      const sentinelPath = join(externalParent, "sentinel");
      const sentinelBytes = Buffer.from("external bytes must remain untouched");
      try {
        if (linkedParent === "data") {
          rmSync(localParent, { recursive: true, force: true });
          mkdirSync(join(externalParent, "census"), { recursive: true });
          for (const [source, target] of [
            [apportionmentPath(repoRoot), join(externalParent, "census", "2020-apportionment.csv")],
            [statePath(repoRoot), join(externalParent, "census", "state.txt")],
            [metadataPath(repoRoot), join(externalParent, "census", "2020-apportionment.metadata.json")],
          ]) {
            writeFileSync(target, readFileSync(source));
          }
        } else {
          rmSync(localParent, { recursive: true, force: true });
          writeFileSync(
            join(externalParent, "federal-policy.generated.ts"),
            readFileSync(generatedPath(repoRoot)),
          );
        }
        writeFileSync(sentinelPath, sentinelBytes);
        symlinkSync(externalParent, localParent, "junction");

        expect(() => checkFederalPolicyFiles(root)).toThrow(/target parent is unsafe/i);

        expect(readFileSync(sentinelPath)).toEqual(sentinelBytes);
      } finally {
        if (existsSync(localParent)) {
          unlinkSync(localParent);
        }
        rmSync(root, { recursive: true, force: true });
        rmSync(externalParent, { recursive: true, force: true });
      }
    },
  );
  it.each([
    ["missing official release", (input: MutableInput) => { input.metadata.sources[0].officialRelease = ""; }],
    ["missing official version", (input: MutableInput) => { input.metadata.sources[0].officialVersion = ""; }],
    ["placeholder official version", (input: MutableInput) => { input.metadata.sources[0].officialVersion = "2020"; }],
    ["date-only retrievedAt", (input: MutableInput) => { input.metadata.sources[0].retrievedAt = "2026-07-18"; }],
    ["malformed generatedAt", (input: MutableInput) => { input.metadata.generatedAt = "not-a-time"; }],
    ["wrong official URL", (input: MutableInput) => { input.metadata.sources[0].url = "https://example.test/not-census"; }],
    ["missing upstream hash", (input: MutableInput) => { input.metadata.sources[0].upstreamSha256 = ""; }],
    ["malformed canonical hash", (input: MutableInput) => { input.metadata.sources[0].canonicalSha256 = "z".repeat(64); }],
    ["duplicate source record", (input: MutableInput) => { input.metadata.sources.push({ ...input.metadata.sources[0] }); }],
    ["missing source record", (input: MutableInput) => { input.metadata.sources.pop(); }],
    ["invalid Congress range", (input: MutableInput) => { input.metadata.effectiveCongress = { first: 120, last: 119 }; }],
  ] as const)("rejects %s", (_label, mutate) => {
    const input = checkedInInput() as MutableInput;
    mutate(input);
    expect(() => generateFederalPolicy(input)).toThrow();
  });

  it.each([
    ["a non-leap-year February 29", "2025-02-29T00:00:00Z"],
    ["April 31", "2026-04-31T00:00:00.000Z"],
    ["24:00", "2026-07-18T24:00:00Z"],
  ])("rejects calendar-normalized RFC3339 UTC timestamps for %s", (_label, timestamp) => {
    const input = checkedInInput() as MutableInput;
    input.metadata.sources[0].retrievedAt = timestamp;

    expect(() => generateFederalPolicy(input)).toThrow(
      "Metadata source provenance is incomplete or malformed.",
    );
  });

  it.each([
    ["an official version after retrieval", (input: MutableInput) => {
      const source = input.metadata.sources[0];
      source.officialVersion = laterRfc3339Instant(source.retrievedAt);
    }],
    ["a retrieval after generation", (input: MutableInput) => {
      input.metadata.sources[0].retrievedAt = laterRfc3339Instant(input.metadata.generatedAt);
    }],
  ] as const)("rejects provenance with %s", (_label, mutate) => {
    const input = checkedInInput() as MutableInput;
    mutate(input);

    expect(() => generateFederalPolicy(input)).toThrow(
      "Metadata source provenance timestamps are out of order.",
    );
  });

  it("accepts equal source provenance timestamps", () => {
    const input = checkedInInput() as MutableInput;
    for (const source of input.metadata.sources) {
      source.officialVersion = input.metadata.generatedAt;
      source.retrievedAt = input.metadata.generatedAt;
    }

    expect(() => generateFederalPolicy(input)).not.toThrow();
  });

  it.each([
    ["a leap-day timestamp", "2024-02-29T00:00:00Z"],
    ["a millisecond timestamp", "2024-02-29T00:00:00.123Z"],
  ])("accepts valid RFC3339 UTC timestamps for %s", (_label, timestamp) => {
    const input = checkedInInput() as MutableInput;
    input.metadata.generatedAt = timestamp;
    for (const source of input.metadata.sources) {
      source.retrievedAt = timestamp;
    }

    expect(() => generateFederalPolicy(input)).not.toThrow();
  });
});

type MutableInput = {
  apportionmentCsv: string;
  stateTxt: string;
  metadata: {
    sources: SourceMetadata[];
    generatedAt: string;
    effectiveCongress: { first: number; last: number };
    censusIdentityManifest?: CensusIdentityManifest;
  };
};

function checkedInInput(root = repoRoot): GenerationInput {
  return {
    apportionmentCsv: readFileSync(apportionmentPath(root), "utf8"),
    stateTxt: readFileSync(statePath(root), "utf8"),
    metadata: readMetadata(root),
  };
}

function inputWithManifest(): MutableInput {
  return checkedInInput() as MutableInput;
}

function requireIdentityManifest(input: MutableInput): CensusIdentityManifest {
  const manifest = input.metadata.censusIdentityManifest;
  if (manifest === undefined) {
    throw new Error("Expected a valid test Census identity manifest.");
  }
  return manifest;
}

function checkedInBytes(): Record<string, Buffer> {
  return Object.fromEntries(
    [
      apportionmentPath(repoRoot),
      statePath(repoRoot),
      metadataPath(repoRoot),
      generatedPath(repoRoot),
    ].map((path) => [path, readFileSync(path)]),
  );
}

function readMetadata(root: string): GenerationInput["metadata"] {
  return JSON.parse(readFileSync(metadataPath(root), "utf8")) as GenerationInput["metadata"];
}

function laterRfc3339Instant(timestamp: string): string {
  return new Date(new Date(timestamp).valueOf() + 1).toISOString();
}

function createCheckRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "votegpt-census-check-"));
  mkdirSync(join(root, "data", "census"), { recursive: true });
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  for (const [source, target] of [
    [apportionmentPath(repoRoot), apportionmentPath(root)],
    [statePath(repoRoot), statePath(root)],
    [metadataPath(repoRoot), metadataPath(root)],
    [generatedPath(repoRoot), generatedPath(root)],
  ]) {
    writeFileSync(target, readFileSync(source));
  }
  return root;
}
function apportionmentPath(root: string): string {
  return resolve(root, "data/census/2020-apportionment.csv");
}

function statePath(root: string): string {
  return resolve(root, "data/census/state.txt");
}

function metadataPath(root: string): string {
  return resolve(root, "data/census/2020-apportionment.metadata.json");
}

function generatedPath(root: string): string {
  return resolve(root, "src/lib/federal-policy.generated.ts");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalSha256(bytes: Uint8Array): string {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return sha256(Buffer.from(source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")));
}
