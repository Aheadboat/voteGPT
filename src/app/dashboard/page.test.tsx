import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createDatabase } from "@/db";
import { getRuntimeAuth } from "@/lib/auth";
import { fetchCongressRoster } from "@/lib/congress-gov";
import {
  federalJurisdictionFromDivisions,
  type FederalOfficialsView,
} from "@/lib/federal-officials";
import {
  createFederalOfficialCacheRepository,
  createFederalOfficialsService,
} from "@/lib/federal-officials-service";
import { fetchCurrentHouseVacancies } from "@/lib/house-clerk-vacancy";
import {
  getSavedResidence,
  getSavedResidenceDivisions,
  type SavedResidenceDivision,
  type SavedResidenceView,
} from "@/lib/saved-residence";
import { matchedResidenceResponse } from "../../../tests/fixtures/residence-responses";
import DashboardPage from "./page";

const { federalCache, getOfficials, runtimeDatabase } = vi.hoisted(() => ({
  federalCache: { kind: "federal-cache" },
  getOfficials: vi.fn(),
  runtimeDatabase: { kind: "runtime-database" },
}));

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRuntimeAuth: vi.fn() }));
vi.mock("@/db", () => ({
  createDatabase: vi.fn(async () => runtimeDatabase),
}));
vi.mock("@/lib/congress-gov", () => ({ fetchCongressRoster: vi.fn() }));
vi.mock("@/lib/house-clerk-vacancy", () => ({
  fetchCurrentHouseVacancies: vi.fn(),
}));
vi.mock("@/lib/federal-officials-service", () => ({
  createFederalOfficialCacheRepository: vi.fn(() => federalCache),
  createFederalOfficialsService: vi.fn(() => ({
    getOfficials,
    getProfile: vi.fn(),
  })),
}));
vi.mock("@/lib/federal-officials", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/federal-officials")>();
  return {
    ...actual,
    federalJurisdictionFromDivisions: vi.fn(
      actual.federalJurisdictionFromDivisions,
    ),
  };
});
vi.mock("@/lib/saved-residence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/saved-residence")>();
  return {
    ...actual,
    getSavedResidence: vi.fn(),
    getSavedResidenceDivisions: vi.fn(),
  };
});

const sessionUserId = "user-dashboard-1";
const ownerVisibleAddress = "123 Main Street, Springfield";
const supportedDivisions = [
  {
    id: "ocd-division/country:us/state:ga",
    idScheme: "ocd",
    name: "Georgia",
    type: "state",
  },
  {
    id: "ocd-division/country:us/state:ga/cd:13",
    idScheme: "ocd",
    name: "Georgia's 13th congressional district",
    type: "congressional_district",
  },
] as const satisfies readonly SavedResidenceDivision[];
const unsupportedDivisions = [
  {
    id: "ocd-division/country:us/state:dc",
    idScheme: "ocd",
    name: "District of Columbia",
    type: "state",
  },
  {
    id: "ocd-division/country:us/state:dc/cd:0",
    idScheme: "ocd",
    name: "District of Columbia at-large district",
    type: "congressional_district",
  },
] as const satisfies readonly SavedResidenceDivision[];
const checkedAt = "2026-07-16T12:00:00.000Z";
const federalOfficialsView = {
  jurisdiction: {
    stateCode: "GA",
    district: 13,
    divisionIds: supportedDivisions.map(({ id }) => id),
  },
  house: servingSeat("house", "Alex House", "H000001", 13),
  senate: [
    servingSeat("senate", "Bailey Senate", "S000001", null),
    servingSeat("senate", "Casey Senate", "S000002", null),
  ],
  coverage: { house: "verified", senate: "verified" },
  freshness: {
    checkedAt,
    refreshAfter: "2026-07-17T12:00:00.000Z",
    staleAfter: "2026-07-19T12:00:00.000Z",
    state: "fresh",
  },
} as const satisfies FederalOfficialsView;
const savedResidence = {
  address: ownerVisibleAddress,
  resolution: {
    status: matchedResidenceResponse.status,
    divisions: matchedResidenceResponse.divisions,
    source: matchedResidenceResponse.source,
    coverageNotes: matchedResidenceResponse.coverageNotes,
  },
  consent: {
    version: "saved-residence-v1",
    acceptedAt: "2026-07-16T08:00:00.000Z",
  },
  createdAt: "2026-07-16T08:00:00.000Z",
  updatedAt: "2026-07-16T08:00:00.000Z",
} as const satisfies SavedResidenceView;

describe("signed-in dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(
      new Headers({
        cookie: "better-auth.session_token=synthetic-session",
      }) as never,
    );
    vi.mocked(getRuntimeAuth).mockResolvedValue({
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: { id: sessionUserId, email: "voter@example.test" },
        }),
      },
    } as never);
    vi.mocked(getSavedResidenceDivisions).mockResolvedValue([]);
    vi.mocked(getSavedResidence).mockRejectedValue(
      new Error("Exact residence access is forbidden in federal lookup"),
    );
    getOfficials.mockResolvedValue({ status: "unavailable" });
  });

  it("keeps saved-home account state before one manual-first residence preview", async () => {
    const page = await DashboardPage();
    render(page);

    expect(redirect).not.toHaveBeenCalled();
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { name: "Your dashboard" }),
    ).toBeInTheDocument();
    const savedResidenceHeading = within(main).getByRole("heading", {
      name: "Saved residence",
    });
    const previewHeading = within(main).getByRole("heading", {
      name: "Preview your voting residence",
    });
    expect(
      savedResidenceHeading.compareDocumentPosition(previewHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(main).getByRole("textbox", {
        name: "Voting residence address",
      }),
    ).toBeInTheDocument();
    expect(
      within(main).getByRole("button", { name: "Use this device once" }),
    ).toBeInTheDocument();
  });

  it("prompts for a saved voting residence without federal cache or provider work", async () => {
    const page = await DashboardPage();
    render(page);

    expect(getSavedResidenceDivisions).toHaveBeenCalledOnce();
    expect(getSavedResidenceDivisions).toHaveBeenCalledWith(sessionUserId);
    expect(
      screen.getByText("Save a voting residence to see federal officials", {
        exact: true,
      }),
    ).toBeVisible();
    expect(federalJurisdictionFromDivisions).not.toHaveBeenCalled();
    expectNoFederalLookup();
  });

  it("explains incomplete saved-residence coverage without federal lookup", async () => {
    vi.mocked(getSavedResidenceDivisions).mockResolvedValue([
      supportedDivisions[0],
    ]);

    const page = await DashboardPage();
    render(page);

    expect(federalJurisdictionFromDivisions).toHaveBeenCalledOnce();
    expect(federalJurisdictionFromDivisions).toHaveBeenCalledWith([
      supportedDivisions[0],
    ]);
    expect(
      screen.getByText(/saved residence.*incomplete.*coverage/i),
    ).toBeVisible();
    expectNoFederalLookup();
  });

  it("states unsupported jurisdiction coverage without federal lookup", async () => {
    vi.mocked(getSavedResidenceDivisions).mockResolvedValue(
      unsupportedDivisions,
    );

    const page = await DashboardPage();
    render(page);

    expect(federalJurisdictionFromDivisions).toHaveBeenCalledWith(
      unsupportedDivisions,
    );
    expect(
      screen.getByText(
        "Federal official coverage is not available for this jurisdiction yet.",
        { exact: true },
      ),
    ).toBeVisible();
    expectNoFederalLookup();
  });

  it("uses saved divisions to render sourced federal officials", async () => {
    vi.mocked(getSavedResidenceDivisions).mockResolvedValue(supportedDivisions);
    getOfficials.mockResolvedValue({
      status: "available",
      view: federalOfficialsView,
    });

    const page = await DashboardPage();
    render(page);

    expect(getSavedResidenceDivisions).toHaveBeenCalledWith(sessionUserId);
    expect(federalJurisdictionFromDivisions).toHaveBeenCalledOnce();
    expect(federalJurisdictionFromDivisions).toHaveBeenCalledWith(
      supportedDivisions,
    );
    expect(getSavedResidence).not.toHaveBeenCalled();
    expect(createDatabase).toHaveBeenCalledOnce();
    expect(createFederalOfficialCacheRepository).toHaveBeenCalledOnce();
    expect(createFederalOfficialCacheRepository).toHaveBeenCalledWith(
      runtimeDatabase,
    );
    expect(createFederalOfficialsService).toHaveBeenCalledOnce();
    expect(createFederalOfficialsService).toHaveBeenCalledWith(
      expect.objectContaining({
        cache: federalCache,
        fetchCongressRoster,
        fetchCurrentHouseVacancies,
      }),
    );
    expect(getOfficials).toHaveBeenCalledOnce();
    expect(getOfficials).toHaveBeenCalledWith({
      stateCode: "GA",
      district: 13,
      divisionIds: supportedDivisions.map(({ id }) => id),
    });

    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { name: "In office" }),
    ).toBeVisible();
    const roster = within(main).getByRole("region", {
      name: "Federal officials for GA District 13",
    });
    const cards = [
      {
        article: /U\.S\. Representative.*Alex House/i,
        heading: /U\.S\. Representative.*District 13/i,
        sources: [
          /Congress\.gov member source/i,
          /Office of the Clerk.*vacancy source/i,
        ],
      },
      {
        article: /U\.S\. Senator.*Bailey Senate/i,
        heading: "U.S. Senator",
        sources: [/Congress\.gov member source/i],
      },
      {
        article: /U\.S\. Senator.*Casey Senate/i,
        heading: "U.S. Senator",
        sources: [/Congress\.gov member source/i],
      },
    ] as const;

    for (const expected of cards) {
      const card = within(roster).getByRole("article", {
        name: expected.article,
      });
      expect(
        within(card).getByRole("heading", {
          level: 3,
          name: expected.heading,
        }),
      ).toBeVisible();
      const checked = [...card.querySelectorAll("p")].find(({ textContent }) =>
        textContent?.trim().startsWith("Checked"),
      );
      expect(checked).toBeDefined();
      expect(
        checked!.querySelector(`time[datetime="${checkedAt}"]`),
      ).not.toBeNull();

      const sources = within(card).getByRole("region", {
        name: /Sources for/i,
      });
      expect(within(sources).getAllByRole("link")).toHaveLength(
        expected.sources.length,
      );
      for (const sourceName of expected.sources) {
        const source = within(sources).getByRole("link", { name: sourceName });
        const sourceItem = source.closest("li");
        expect(sourceItem).not.toBeNull();
        expect(sourceItem).toHaveTextContent(/Retrieved/i);
        expect(
          sourceItem?.querySelector(`time[datetime="${checkedAt}"]`),
        ).not.toBeNull();
      }
    }
    expect(main).not.toHaveTextContent(ownerVisibleAddress);
    expect(main).not.toHaveTextContent(/\bAI\b/i);
    expect(fetchCongressRoster).not.toHaveBeenCalled();
    expect(fetchCurrentHouseVacancies).not.toHaveBeenCalled();
  });

  it("removes saved-home UI after the account is deleted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (
          url === "/api/v1/residence" &&
          (!init?.method || init.method === "GET")
        ) {
          return Response.json({ status: "saved", residence: savedResidence });
        }

        if (url === "/api/account" && init?.method === "DELETE") {
          return new Response(null, { status: 204 });
        }

        throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
      }),
    );

    const page = await DashboardPage();
    render(page);

    await screen.findByText(ownerVisibleAddress, { exact: false });
    expect(
      screen.getByRole("region", { name: "Saved residence" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Type "DELETE" to confirm'), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(
      await screen.findByRole("heading", { name: "Account deleted" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText(ownerVisibleAddress, { exact: false }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "Saved residence" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Delete saved residence" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: "Return to public information" }),
    ).toHaveAttribute("href", "/");
  });
});

function expectNoFederalLookup() {
  expect(createDatabase).not.toHaveBeenCalled();
  expect(createFederalOfficialCacheRepository).not.toHaveBeenCalled();
  expect(createFederalOfficialsService).not.toHaveBeenCalled();
  expect(getOfficials).not.toHaveBeenCalled();
  expect(fetchCongressRoster).not.toHaveBeenCalled();
  expect(fetchCurrentHouseVacancies).not.toHaveBeenCalled();
  expect(getSavedResidence).not.toHaveBeenCalled();
}

function servingSeat(
  chamber: "house" | "senate",
  name: string,
  bioguideId: string,
  district: number | null,
): Extract<FederalOfficialsView["house"], { status: "serving" }> {
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
        url: `https://api.congress.gov/v3/member/${bioguideId}?format=json`,
        retrievedAt: checkedAt,
        recordUpdatedAt: "2026-07-15T00:00:00.000Z",
        effectiveAt: "2025-01-03T00:00:00.000Z",
      },
      ...(chamber === "house"
        ? [
            {
              publisher:
                "Office of the Clerk, U.S. House of Representatives" as const,
              sourceType: "vacancy" as const,
              url: "https://clerk.house.gov/Members/ViewVacancies",
              retrievedAt: checkedAt,
              recordUpdatedAt: null,
              effectiveAt: null,
            },
          ]
        : []),
    ],
  };
}
