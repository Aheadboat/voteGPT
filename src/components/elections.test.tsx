import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { projectContest } from "@/lib/elections";
import { evidence, fixturePackage, fixturePolicy, NOW, VERIFIED_AT } from "../../tests/fixtures/elections/domain";
import { ElectionContest } from "./elections";

describe("source-backed election contest", () => {
  it("renders equal candidates and independent status evidence in HTML without client interaction", () => {
    const ledger = fixturePackage();
    ledger.evidence.push(
      evidence("filing", "accepted"),
      evidence("ballot_qualification", "certified"),
      evidence("intent", "withdrawn"),
      evidence("ballot_appearance", "listed_for_ballot"),
    );
    const result = projectContest({
      ledger, policy: fixturePolicy(), contest_id: "contest-house",
      completeness: { current: "complete", supersession: "complete", history: "complete" },
      history_page: { offset: 0, limit: 100 },
    }, NOW);
    expect(result.status).toBe("available");
    render(<ElectionContest result={result} />);
    const avery = screen.getByRole("article", { name: "Avery Example" });
    const blair = screen.getByRole("article", { name: "Blair Sample" });
    for (const candidate of [avery, blair]) {
      for (const track of ["Intent", "Filing", "Ballot qualification", "Ballot appearance", "Outcome", "Finance filing"]) {
        expect(within(candidate).getByText(track, { exact: true })).toBeInTheDocument();
      }
    }
    for (const status of ["accepted", "certified", "withdrawn", "listed_for_ballot"]) {
      expect(within(avery).getByText(status, { exact: true })).toBeInTheDocument();
    }
    expect(within(avery).getAllByRole("link", { name: "Synthetic election office list" }).length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(<ElectionContest result={result} />);
    expect(html).toContain(`dateTime="${VERIFIED_AT}"`);
    expect(html).toContain("<details");
    expect(html).not.toContain("<script");
    expect(html.indexOf("Avery Example")).toBeLessThan(html.indexOf("Blair Sample"));
  });
});
