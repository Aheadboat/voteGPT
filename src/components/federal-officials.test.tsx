import { readFileSync } from "node:fs";

import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FederalOfficialsView, Freshness, SourceRef } from "@/lib/federal-officials";

import { FederalOfficials } from "./federal-officials";

type ServingSeat = Extract<FederalOfficialsView["house"], { status: "serving" }>;

const checkedAt = "2026-07-16T12:00:00.000Z";
const fresh: Freshness = {
  checkedAt,
  refreshAfter: "2026-07-16T18:00:00.000Z",
  staleAfter: "2026-07-18T12:00:00.000Z",
  state: "fresh",
};

const clerkSource: SourceRef = {
  publisher: "Office of the Clerk, U.S. House of Representatives",
  sourceType: "vacancy",
  url: "https://clerk.house.gov/Members/ViewVacancies",
  retrievedAt: checkedAt,
  recordUpdatedAt: null,
  effectiveAt: null,
};

const house = servingSeat("house", "Alex House", "H000001", 13);
const firstSenator = servingSeat("senate", "Bailey Senate", "S000001", null);
const secondSenator = servingSeat("senate", "Casey Senate", "S000002", null);

const view: FederalOfficialsView = {
  jurisdiction: {
    stateCode: "GA",
    district: 13,
    divisionIds: [
      "ocd-division/country:us/state:ga",
      "ocd-division/country:us/state:ga/cd:13",
    ],
  },
  house,
  senate: [firstSenator, secondSenator],
  coverage: { house: "verified", senate: "verified" },
  freshness: fresh,
};

describe("FederalOfficials", () => {
  it("renders equal House-then-Senate cards with adjacent source and freshness evidence", () => {
    const { container } = render(
      <FederalOfficials result={{ status: "available", view }} />,
    );

    const roster = screen.getByRole("region", {
      name: "Federal officials for GA District 13",
    });
    expect(
      within(roster).getByRole("heading", {
        level: 2,
        name: "Federal officials",
      }),
    ).toBeInTheDocument();

    const cards = within(roster).getAllByRole("article");
    expect(cards).toHaveLength(3);
    expect(cards.map(({ className }) => className)).toEqual([
      cards[0].className,
      cards[0].className,
      cards[0].className,
    ]);
    expect(
      cards.map((card) =>
        within(card).getByRole("heading", { level: 3 }).textContent,
      ),
    ).toEqual([
      "U.S. Representative — District 13",
      "U.S. Senator",
      "U.S. Senator",
    ]);
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("Alex House"),
      expect.stringContaining("Bailey Senate"),
      expect.stringContaining("Casey Senate"),
    ]);

    for (const card of cards) {
      const links = within(card).getAllByRole("link");
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link).toHaveAttribute("href");
        expect(link.tabIndex).toBe(0);
        expect(link.closest("li")?.querySelector("time")).toHaveAttribute(
          "dateTime",
          checkedAt,
        );
      }
      expect(card.querySelector(`time[datetime="${checkedAt}"]`)).not.toBeNull();
    }

    expect(container.querySelector("input, [aria-current], [aria-selected]")).toBeNull();
    expect(container).not.toHaveTextContent(/party|ranked|recommended|preselected/i);
    expect(container.innerHTML).not.toMatch(/address|latitude|longitude/i);
    expect(
      renderToStaticMarkup(
        <FederalOfficials result={{ status: "available", view }} />,
      ),
    ).not.toMatch(/<script|onClick=/i);
  });

  it("labels an at-large House office without inventing District 0", () => {
    const atLargeHouse = servingSeat("house", "Avery Atlarge", "A000001", 0);
    render(
      <FederalOfficials
        result={{
          status: "available",
          view: {
            ...view,
            jurisdiction: {
              stateCode: "AK",
              district: 0,
              divisionIds: ["ocd-division/country:us/state:ak/cd:0"],
            },
            house: atLargeHouse,
          },
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "U.S. Representative — At-large",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/District 0/i)).toBeNull();
  });

  it("states vacant, unknown, and conflicting House evidence without inferred officeholders", () => {
    const states: FederalOfficialsView[] = [
      {
        ...view,
        house: {
          status: "vacant",
          office: house.office,
          term: {
            ...house.term,
            personId: null,
            status: "vacant",
          },
          sources: [clerkSource],
        },
        coverage: { ...view.coverage, house: "vacant" },
      },
      {
        ...view,
        house: {
          status: "unknown",
          office: house.office,
          sources: [],
        },
        coverage: { ...view.coverage, house: "unknown" },
      },
      {
        ...view,
        house: {
          ...house,
          status: "conflict",
          sources: [...house.sources, clerkSource],
        },
        coverage: { ...view.coverage, house: "partial" },
      },
    ];

    const { rerender } = render(
      <FederalOfficials result={{ status: "available", view: states[0] }} />,
    );
    expect(screen.getByText("This seat is verified vacant.")).toBeInTheDocument();
    expect(screen.queryByText("Alex House")).toBeNull();

    rerender(<FederalOfficials result={{ status: "available", view: states[1] }} />);
    expect(
      screen.getByText(
        "Current House officeholder is unknown. Check an official source before relying on this seat.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Alex House")).toBeNull();

    rerender(<FederalOfficials result={{ status: "available", view: states[2] }} />);
    expect(
      screen.getByText(
        "Sources conflict on current House seat status. Congress.gov lists Alex House; Clerk vacancy evidence disagrees.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Verified current officeholder")).toBeNull();
  });

  it("keeps partial and stale coverage explicit while retaining qualified facts", () => {
    render(
      <FederalOfficials
        result={{
          status: "available",
          view: {
            ...view,
            senate: [firstSenator],
            coverage: { house: "partial", senate: "partial" },
            freshness: { ...fresh, state: "stale" },
          },
        }}
      />,
    );

    expect(screen.getByText("This roster is stale but not expired.")).toBeInTheDocument();
    expect(
      screen.getByText("House coverage is partial. Some current-seat evidence is unavailable."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Senate coverage is partial. One current seat is verified; another may be unavailable.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Alex House")).toBeInTheDocument();
    expect(screen.getByText("Bailey Senate")).toBeInTheDocument();
    expect(screen.queryByText("Casey Senate")).toBeNull();
  });

  it("hides expired facts and gives a safe recovery action", () => {
    render(
      <FederalOfficials
        result={{
          status: "available",
          view: { ...view, freshness: { ...fresh, state: "expired" } },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Federal roster data has expired. Refresh before relying on current officeholders.",
    );
    expect(screen.getByRole("link", { name: "Check Congress.gov" })).toHaveAttribute(
      "href",
      "https://www.congress.gov/members",
    );
    expect(screen.getByText(checkedAt).closest("time")).toHaveAttribute(
      "dateTime",
      checkedAt,
    );
    expect(screen.queryByText("Alex House")).toBeNull();
    expect(screen.queryByRole("link", { name: /member source/i })).toBeNull();
  });

  it.each([
    [
      "unsupported",
      { status: "unsupported", code: "PR" } as const,
      "Federal roster coverage is not supported for PR.",
    ],
    [
      "unavailable",
      { status: "unavailable" } as const,
      "Federal roster information is unavailable.",
    ],
  ])("renders factual %s recovery state", (_label, result, message) => {
    render(<FederalOfficials result={result} />);

    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.getByRole("link", { name: "Check Congress.gov" })).toHaveAttribute(
      "href",
      "https://www.congress.gov/members",
    );
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("keeps feature CSS neutral, responsive, focus-visible, and motion-free", () => {
    const css = readFileSync(
      "src/components/federal-officials.module.css",
      "utf8",
    );

    expect(css).toMatch(/#fff(?:fff)?/i);
    expect(css).toMatch(/#f[1-8][f1-8][f1-8]/i);
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/@media\s*\(min-width:/);
    expect(css).not.toMatch(/green|animation|transition/i);
  });
});

function servingSeat(
  chamber: "house" | "senate",
  name: string,
  bioguideId: string,
  district: number | null,
): ServingSeat {
  const officeId = `federal:${chamber}:GA:${district ?? bioguideId}`;
  const personId = `bioguide:${bioguideId}` as const;
  return {
    status: "serving",
    office: {
      id: officeId,
      chamber,
      stateCode: "GA",
      district,
      title: chamber === "house" ? "U.S. Representative" : "U.S. Senator",
    },
    person: { id: personId, bioguideId, name },
    term: {
      officeId,
      personId,
      congress: 119,
      startYear: 2025,
      endYear: 2027,
      status: "serving",
    },
    sources: [
      {
        publisher: "Congress.gov",
        sourceType: "member",
        url: `https://api.congress.gov/v3/member/${bioguideId}`,
        retrievedAt: checkedAt,
        recordUpdatedAt: "2026-07-15T00:00:00.000Z",
        effectiveAt: "2025-01-03T00:00:00.000Z",
      },
    ],
  };
}
