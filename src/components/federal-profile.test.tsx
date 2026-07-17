import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Freshness, Office, Person, SourceRef, Term } from "@/lib/federal-officials";

import { FederalProfile } from "./federal-profile";

type ProfileFixture = {
  person: Person;
  office: Office;
  term: Term;
  sources: SourceRef[];
  freshness: Freshness;
};

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
  url: "https://api.congress.gov/v3/member/H000001?format=json",
  retrievedAt: checkedAt,
  recordUpdatedAt: "2026-07-15T00:00:00.000Z",
  effectiveAt: "2025-01-03T00:00:00.000Z",
};
const clerkListSource: SourceRef = {
  publisher: "Office of the Clerk, U.S. House of Representatives",
  sourceType: "vacancy",
  url: "https://clerk.house.gov/Members/ViewVacancies",
  retrievedAt: checkedAt,
  recordUpdatedAt: null,
  effectiveAt: null,
};
const clerkDistrictSource: SourceRef = {
  ...clerkListSource,
  url: "https://clerk.house.gov/members/GA13/vacancy",
};
const freshness: Freshness = {
  checkedAt,
  refreshAfter: "2026-07-16T18:00:00.000Z",
  staleAfter: "2026-07-18T12:00:00.000Z",
  state: "fresh",
};
const profile: ProfileFixture = {
  person,
  office,
  term,
  sources: [source, clerkListSource],
  freshness,
};
const senatorPerson: Person = {
  id: "bioguide:S000001",
  bioguideId: "S000001",
  name: "Jordan Senate",
};
const senatorOffice: Office = {
  id: "federal:senate:GA:S000001",
  chamber: "senate",
  stateCode: "GA",
  district: null,
  title: "U.S. Senator",
};
const senatorTerm: Term = {
  officeId: senatorOffice.id,
  personId: senatorPerson.id,
  congress: 119,
  startYear: 2023,
  endYear: 2029,
  status: "serving",
};
const senatorSource: SourceRef = {
  ...source,
  url: "https://api.congress.gov/v3/member/S000001?format=json",
};
const senatorProfile: ProfileFixture = {
  person: senatorPerson,
  office: senatorOffice,
  term: senatorTerm,
  sources: [senatorSource],
  freshness,
};

const invalidCurrentProfiles: Array<readonly [string, ProfileFixture]> = [
  [
    "a person ID and bioguide mismatch",
    {
      ...profile,
      person: { ...person, id: "bioguide:OTHER" },
      term: { ...term, personId: "bioguide:OTHER" },
    },
  ],
  [
    "a non-serving term",
    { ...profile, term: { ...term, status: "vacant" } },
  ],
  [
    "a wrong term person ID",
    { ...profile, term: { ...term, personId: "bioguide:OTHER" } },
  ],
  [
    "a wrong term office ID",
    { ...profile, term: { ...term, officeId: "federal:house:GA:12" } },
  ],
  ["empty sources", { ...profile, sources: [] }],
  ["a House member source without the Clerk list", { ...profile, sources: [source] }],
  [
    "House member and district-vacancy evidence without the Clerk list",
    { ...profile, sources: [source, clerkDistrictSource] },
  ],
  [
    "contradictory House current-list and district-vacancy evidence",
    { ...profile, sources: [source, clerkListSource, clerkDistrictSource] },
  ],
  [
    "Senate member evidence mixed with Clerk evidence",
    { ...senatorProfile, sources: [senatorSource, clerkListSource] },
  ],
  [
    "an unrelated Congress.gov member source",
    {
      ...profile,
      sources: [
        {
          ...source,
          url: "https://api.congress.gov/v3/member/OTHER?format=json",
        },
      ],
    },
  ],
  [
    "a vacancy source",
    {
      ...profile,
      sources: [
        {
          ...source,
          publisher: "Office of the Clerk, U.S. House of Representatives",
          sourceType: "vacancy",
          url: "https://clerk.house.gov/Members/ViewVacancies",
        },
      ],
    },
  ],
];

describe("FederalProfile", () => {
  it("server-renders only a verified current profile with adjacent source times", () => {
    const { container } = render(
      <FederalProfile result={{ status: "available", profile }} />,
    );

    const article = screen.getByRole("article", {
      name: "Alex House — U.S. Representative",
    });
    expect(
      within(article).getByRole("heading", { level: 1, name: "Alex House" }),
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
    expect(
      within(article).getByRole("link", {
        name: "Office of the Clerk, U.S. House of Representatives current vacancies list source",
      }),
    ).toHaveAttribute("href", clerkListSource.url);
    expect(
      within(article).getByRole("heading", {
        level: 2,
        name: "Sources and retrieval times",
      }),
    ).toBeInTheDocument();
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

  it("accepts a current Senate profile with member evidence only", () => {
    render(
      <FederalProfile result={{ status: "available", profile: senatorProfile }} />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Jordan Senate" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Verified federal profile")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Congress.gov member source" }),
    ).toHaveAttribute("href", senatorSource.url);
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
    expect(
      screen.getByRole("heading", { level: 1, name: "Alex House" }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Federal official profile",
      }),
    ).toBeInTheDocument();
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

  it.each(invalidCurrentProfiles)("fails closed for %s", (_label, invalidProfile) => {
    render(
      <FederalProfile
        result={{
          status: "available",
          profile: invalidProfile,
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Federal profile information is unavailable.",
    );
    expect(screen.queryByText(invalidProfile.person.name)).toBeNull();
    expect(screen.queryByText("Verified federal profile")).toBeNull();
  });

  it("renders unavailable recovery without person, office, or source facts", () => {
    render(<FederalProfile result={{ status: "unavailable" }} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Federal profile information is unavailable.",
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Federal official profile",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check Congress.gov" })).toHaveAttribute(
      "href",
      "https://www.congress.gov/members",
    );
    expect(screen.queryByText("Alex House")).toBeNull();
    expect(screen.queryByText("U.S. Representative")).toBeNull();
    expect(screen.queryByRole("link", { name: /member source/i })).toBeNull();
  });
});
