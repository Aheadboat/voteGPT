import { afterEach, describe, expect, it, vi } from "vitest";
import { validateElectionPackage } from "./elections";
import { getElectionSourceOptions } from "./election-source-policy";
import { fixturePackage, NOW } from "../../tests/fixtures/elections/domain";

afterEach(() => vi.unstubAllEnvs());

describe("protected production election admission", () => {
  it("rejects synthetic packages even when an environment flag requests them", () => {
    vi.stubEnv("ELECTION_ALLOW_SYNTHETIC", "true");
    const options = getElectionSourceOptions();
    expect(options.policy.dataset_kind).toBe("official");
    expect(validateElectionPackage(fixturePackage(), options.policy, NOW).status).toBe("rejected");
  });

  it("has no receipt before an exact release artifact is admitted", () => {
    vi.stubEnv("ELECTION_APPROVAL_FILE", "unreviewed.approval.json");
    expect(getElectionSourceOptions().approvedReceipts).toEqual([]);
  });
});
