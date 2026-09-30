// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("synthetic browser review artifacts", () => {
  it("retains only test screenshots and traces for seven days, including failed runs", () => {
    const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    const artifact = workflow.split("- name: Retain synthetic browser evidence")[1]?.split("\n      - name:")[0];
    expect(artifact).toBeDefined();
    expect(artifact).toContain("if: always()");
    expect(artifact).toContain("uses: actions/upload-artifact@v7");
    expect(artifact).toContain("retention-days: 7");
    expect(artifact).toContain("if-no-files-found: ignore");
    expect(artifact).toContain("include-hidden-files: false");
    expect(artifact).toContain("test-results/**/*.png");
    expect(artifact).toContain("test-results/**/trace.zip");
    expect(artifact).not.toContain(".env");
    expect(artifact).not.toContain("**/*.log");
  });
});
