import { describe, expect, it } from "vitest";
import { parseElectionImport } from "./election-import";
import { fixturePackage } from "../../tests/fixtures/elections/domain";

describe("local normalized election package parsing", () => {
  it("accepts JSON formatting without changing values or array order", () => {
    const input = fixturePackage();
    expect(parseElectionImport(JSON.stringify(input, null, 2).replaceAll("\n", "\r\n")))
      .toEqual({ status: "parsed", input });
  });

  it.each(["", "null", "[]", "42", '{"private_address":"123 Private Lane",'])
    ("rejects malformed/nonobject input without echoing contents: %s", (text) => {
      expect(parseElectionImport(text)).toEqual({ status: "rejected", reason: "invalid_package" });
    });
});
