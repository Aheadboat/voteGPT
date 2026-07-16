import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Freshness, Office, Person, SourceRef, Term } from "@/lib/federal-officials";

import { FederalProfile } from "./federal-profile";

const checkedAt = "2026-07-16T12:00:00.000Z";
const person: Person = {
  id: "bioguide:H000001",
  bioguideId: "H000001",
  name: "Alex House",
};
const office: Office = {
  id: "federal:house:GA:13",
  chamber: "house",
  stateCode: "GA",
  district: 13,
  title: "U.S. Representative",
};
const term: Term = {
  officeId: office.id,
  personId: person.id,
  congress: 119,
  startYear: 2025,
  endYear: 2027,
  status: "serving",
};
const source: SourceRef = {
  publisher: "Congress.gov",
  sourceType: "member",
  url: "https://api.congress.gov/v3/member/H000001",
  retrievedAt: checkedAt,
  recordUpdatedAt: "2026-07-15T00:00:00.000Z",
  effectiveAt: "2025-01-03T00:00:00.000Z",
};
const freshness: Freshness = {
  checkedAt,
  refreshAfter: "2026-07-16T18:00:00.000Z",
  staleAfter: "2026-07-18T12:00:00.000Z",
  state: "fresh",
};
const profile = { person, office, term, sources: [source], freshness };

describe("FederalProfile", () => {
  it("server-renders only a verified current profile with adjacent source times", () => {
    const { container } = render(
      <FederalProfile result={{ status: "available", profile }} />,
    );

    const article = screen.getByRole("article", {
      name: "Alex House — U.S. Representative",
    });
    expect(
      within(article).getByRole("heading", { level: 2, name: "Alex House" }),
    ).toBeInTheDocument();
    expect(within(article).getByText("U.S. Representative")).toBeInTheDocument();
    expect(within(article).getByText("GA District 13")).toBeInTheDocument();
    expect(within(article).getByText("119th Congress")).toBeInTheDocument();
    expect(within(article).getByText("2025–2027")).toBeInTheDocument();

    const link = within(article).getByRole("link", {
      name: "Congress.gov member source",
    });
    expect(link).toHaveAttribute("href", source.url);
    expect(link.tabIndex).toBe(0);
    expect(link.closest("li")?.querySelector("time")).toHaveAttribute(
      "dateTime",
      checkedAt,
    );
    expect(article.querySelector(`time[datetime="${checkedAt}"]`)).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/address|latitude|longitude|party/i);
    expect(
      renderToStaticMarkup(
        <FederalProfile result={{ status: "available", profile }} />,
      ),
    ).not.toMatch(/<script|onClick=/i);
  });

  it("shows stale-below-expiry profile facts with an explicit warning", () => {
    render(
      <FederalProfile
        result={{
          status: "available",
          profile: {
            ...profile,
            freshness: { ...freshness, state: "stale" },
          },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "This profile is stale but not expired. Verify it with the linked official source.",
    );
    expect(screen.getByRole("heading", { name: "Alex House" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Congress.gov member source" })).toBeVisible();
  });

  it("hides expired profile facts and keeps checked-time recovery evidence", () => {
    render(
      <FederalProfile
        result={{
          status: "available",
          profile: {
            ...profile,
            freshness: { ...freshness, state: "expired" },
          },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Federal profile data has expired. Refresh before relying on this officeholder.",
    );
    expect(screen.getByText(checkedAt).closest("time")).toHaveAttribute(
      "dateTime",
      checkedAt,
    );
    expect(screen.getByRole("link", { name: "Check Congress.gov" })).toHaveAttribute(
      "href",
      "https://www.congress.gov/members",
    );
    expect(screen.queryByText("Alex House")).toBeNull();
    expect(screen.queryByText("U.S. Representative")).toBeNull();
    expect(screen.queryByRole("link", { name: "Congress.gov member source" })).toBeNull();
  });

  it("fails closed when normalized current-term relationships do not match", () => {
    render(
      <FederalProfile
        result={{
          status: "available",
          profile: {
            ...profile,
            term: { ...term, personId: "bioguide:OTHER" },
          },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Federal profile information is unavailable.",
    );
    expect(screen.queryByText("Alex House")).toBeNull();
  });

  it("renders unavailable recovery without person, office, or source facts", () => {
    render(<FederalProfile result={{ status: "unavailable" }} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Federal profile information is unavailable.",
    );
    expect(screen.getByRole("link", { name: "Check Congress.gov" })).toHaveAttribute(
      "href",
      "https://www.congress.gov/members",
    );
    expect(screen.queryByText("Alex House")).toBeNull();
    expect(screen.queryByText("U.S. Representative")).toBeNull();
    expect(screen.queryByRole("link", { name: /member source/i })).toBeNull();
  });
});
