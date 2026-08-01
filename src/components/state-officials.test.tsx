import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StateOfficialsView } from "@/lib/state-officials";

import { StateOfficials } from "./state-officials";

const checkedAt = "2026-07-31T12:00:00.000Z";
const source = {
  sourceType: "official" as const,
  publicUrl: "https://legislature.example.test/members",
  retrievedAt: checkedAt,
  effectiveAt: "2026-01-01T00:00:00.000Z",
};
const jurisdiction = {
  stateCode: "GA",
  stateDivisionId: "ocd-division/country:us/state:ga",
  jurisdictionId: "ocd-jurisdiction/country:us/state:ga/government",
  legislature: "bicameral" as const,
  districts: [
    {
      chamber: "upper" as const,
      district: "2",
      divisionId: "ocd-division/country:us/state:ga/sldu:2",
    },
    {
      chamber: "lower" as const,
      district: "10",
      divisionId: "ocd-division/country:us/state:ga/sldl:10",
    },
  ],
};
const view = {
  jurisdiction,
  freshness: {
    checkedAt,
    refreshAfter: "2026-08-01T12:00:00.000Z",
    staleAfter: "2026-08-03T12:00:00.000Z",
    state: "fresh" as const,
  },
  chambers: [
    {
      chamber: "upper" as const,
      districts: [
        {
          district: "2",
          seats: [
            {
              status: "serving" as const,
              seat: "District 2",
              people: [
                { id: "a", name: "Alex Avery", sources: [source] },
                { id: "b", name: "Blair Baker", sources: [source] },
              ],
              sources: [source],
            },
            {
              status: "vacant" as const,
              seat: "District 2 Seat B",
              people: [],
              sources: [{ ...source, sourceType: "vacancy" as const }],
            },
          ],
        },
      ],
    },
    {
      chamber: "lower" as const,
      districts: [
        {
          district: "10",
          seats: [
            {
              status: "unknown" as const,
              seat: "District 10",
              people: [],
              sources: [],
            },
          ],
        },
      ],
    },
  ],
} as const satisfies StateOfficialsView;

describe("StateOfficials", () => {
  it("renders equal chamber, district, and seat cards with adjacent source evidence", () => {
    const { container } = render(
      <StateOfficials result={{ status: "available", view }} />,
    );

    const roster = screen.getByRole("region", {
      name: "State legislature for GA",
    });
    expect(within(roster).getByRole("heading", { level: 2 })).toHaveTextContent(
      "State officials",
    );
    expect(
      within(roster).getAllByRole("heading", { level: 3 }).map(({ textContent }) => textContent),
    ).toEqual(["Upper chamber — District 2", "Lower chamber — District 10"]);

    const cards = within(roster).getAllByRole("article");
    expect(cards).toHaveLength(3);
    expect(cards.map(({ className }) => className)).toEqual([
      cards[0].className,
      cards[0].className,
      cards[0].className,
    ]);
    expect(cards[0]).toHaveAccessibleName("District 2: Alex Avery, Blair Baker");
    expect(cards[0]).toHaveTextContent("Alex Avery");
    expect(cards[0]).toHaveTextContent("Blair Baker");
    expect(within(cards[0]).getAllByText("Verified current officeholder")).toHaveLength(2);
    expect(cards[1]).toHaveTextContent("This seat is verified vacant.");
    expect(cards[2]).toHaveTextContent("Current officeholder is unknown.");
    expect(cards[2]).toHaveTextContent("No qualifying source is available for this seat.");

    const sources = within(cards[0]).getByRole("region", {
      name: "Sources for District 2",
    });
    const link = within(sources).getByRole("link", { name: "Official source" });
    expect(link).toHaveAttribute("href", source.publicUrl);
    expect(link.tabIndex).toBe(0);
    expect(sources.querySelector(`time[datetime="${checkedAt}"]`)).not.toBeNull();
    expect(sources.querySelector(`time[datetime="${source.effectiveAt}"]`)).not.toBeNull();
    expect(cards[0].querySelector(`time[datetime="${checkedAt}"]`)).not.toBeNull();
    expect(container).not.toHaveTextContent(/\bAI\b|address|latitude|longitude|party|recommended/i);
    expect(renderToStaticMarkup(<StateOfficials result={{ status: "available", view }} />)).not.toMatch(/<script|onClick=/i);
  });

  it("marks an unexpired stale roster for verification without changing card treatment", () => {
    render(
      <StateOfficials
        result={{
          status: "available",
          view: { ...view, freshness: { ...view.freshness, state: "stale" } },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("stale but not expired");
    for (const card of screen.getAllByRole("article")) {
      expect(card).toHaveTextContent("verify before use");
    }
  });

  it("labels unknown-seat provenance as not qualifying current-officeholder evidence", () => {
    render(
      <StateOfficials
        result={{
          status: "available",
          view: {
            ...view,
            chambers: [
              view.chambers[0],
              {
                ...view.chambers[1],
                districts: [
                  {
                    ...view.chambers[1].districts[0],
                    seats: [
                      {
                        ...view.chambers[1].districts[0].seats[0],
                        sources: [source],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }}
      />,
    );

    const unknown = screen.getByRole("article", {
      name: "District 10: officeholder unknown",
    });
    expect(unknown).toHaveTextContent("not qualifying evidence of a current officeholder");
    expect(
      within(unknown).getByRole("link", {
        name: "Official source not qualifying current officeholder evidence",
      }),
    ).toHaveAttribute("href", source.publicUrl);
  });

  it("uses recovery states for expired and unavailable results", () => {
    const { rerender } = render(
      <StateOfficials
        result={{
          status: "available",
          view: { ...view, freshness: { ...view.freshness, state: "expired" } },
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("expired");
    expect(screen.queryByRole("article")).toBeNull();

    rerender(<StateOfficials result={{ status: "unavailable" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("unavailable");
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("explains verified-empty coverage instead of rendering a blank roster", () => {
    render(
      <StateOfficials
        result={{ status: "available", view: { ...view, chambers: [] } }}
      />,
    );

    expect(screen.getByText("No verified state legislature offices are available for this saved coverage.")).toBeVisible();
    expect(screen.getByText(/Upper chamber — District 2/)).toHaveTextContent(
      "No qualifying source is available for this district.",
    );
    expect(screen.getByText(/Lower chamber — District 10/)).toHaveTextContent(
      "No qualifying source is available for this district.",
    );
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("marks requested districts without verified seats as incomplete coverage", () => {
    render(
      <StateOfficials
        result={{ status: "available", view: { ...view, chambers: [view.chambers[0]] } }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("coverage is incomplete");
    expect(screen.getByText(/Lower chamber — District 10/)).toHaveTextContent(
      "No qualifying source is available for this district.",
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });
});
