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
import { fetchStateLegislators } from "@/lib/openstates";
import {
  getSavedResidence,
  getSavedResidenceDivisions,
  type SavedResidenceDivision,
  type SavedResidenceView,
} from "@/lib/saved-residence";
import {
  stateJurisdictionFromDivisions,
  type StateOfficialsView,
} from "@/lib/state-officials";
import {
  createStateOfficialCacheRepository,
  createStateOfficialsService,
} from "@/lib/state-officials-service";
import { matchedResidenceResponse } from "../../../tests/fixtures/residence-responses";
import DashboardPage from "./page";

const {
  federalCache,
  getOfficials,
  getStateOfficials,
  governmentNavigationProps,
  runtimeDatabase,
  stateCache,
} = vi.hoisted(() => ({
  federalCache: { kind: "federal-cache" },
  getOfficials: vi.fn(),
  getStateOfficials: vi.fn(),
  governmentNavigationProps: vi.fn(),
  runtimeDatabase: { kind: "runtime-database" },
  stateCache: { kind: "state-cache" },
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
vi.mock("@/lib/openstates", () => ({ fetchStateLegislators: vi.fn() }));
vi.mock("@/components/government-navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/government-navigation")>();
  return {
    ...actual,
    GovernmentNavigation(properties: Parameters<typeof actual.GovernmentNavigation>[0]) {
      governmentNavigationProps(properties);
      return actual.GovernmentNavigation(properties);
    },
  };
});
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
vi.mock("@/lib/state-officials", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/state-officials")>();
  return {
    ...actual,
    stateJurisdictionFromDivisions: vi.fn(actual.stateJurisdictionFromDivisions),
  };
});
vi.mock("@/lib/state-officials-service", () => ({
  createStateOfficialCacheRepository: vi.fn(() => stateCache),
  createStateOfficialsService: vi.fn(() => ({ getOfficials: getStateOfficials })),
}));
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
const stateDivisions = [
  {
    id: "ocd-division/country:us/state:ga",
    idScheme: "ocd",
    name: "Georgia",
    type: "state",
  },
  {
    id: "ocd-division/country:us/state:ga/sldu:2",
    idScheme: "ocd",
    name: "Georgia Senate District 2",
    type: "state_upper",
  },
  {
    id: "ocd-division/country:us/state:ga/sldl:10",
    idScheme: "ocd",
    name: "Georgia House District 10",
    type: "state_lower",
  },
] as const satisfies readonly SavedResidenceDivision[];
const checkedAt = "2026-07-16T12:00:00.000Z";
const stateSource = {
  sourceType: "official" as const,
  publicUrl: "https://legislature.example.test/officials",
  retrievedAt: checkedAt,
  effectiveAt: "2026-01-03T00:00:00.000Z",
};
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
const stateOfficialsView = {
  jurisdiction: {
    stateCode: "GA",
    stateDivisionId: stateDivisions[0].id,
    jurisdictionId: "ocd-jurisdiction/country:us/state:ga/government",
    legislature: "bicameral" as const,
    districts: [
      { chamber: "upper" as const, district: "2", divisionId: stateDivisions[1].id },
      { chamber: "lower" as const, district: "10", divisionId: stateDivisions[2].id },
    ],
  },
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
              people: [{ id: "state-1", name: "Avery State", sources: [stateSource] }],
              sources: [stateSource],
            },
          ],
        },
      ],
    },
  ],
} as const satisfies StateOfficialsView;
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
      within(main).getByRole("heading", {
        level: 1,
        name: "Your dashboard",
      }),
    ).toBeInTheDocument();
    expect(within(main).getAllByRole("heading", { level: 1 })).toHaveLength(1);
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

  it("explains expired district coverage without asking for a new residence", async () => {
    vi.mocked(getSavedResidenceDivisions).mockResolvedValue(supportedDivisions);
    vi.mocked(federalJurisdictionFromDivisions).mockReturnValueOnce({
      status: "policy_expired",
    });

    const page = await DashboardPage();
    render(page);

    expect(
      screen.getByText(
        "Federal officials are temporarily unavailable while district coverage is updated for the new Congress. Your saved residence does not need to be changed.",
        { exact: true },
      ),
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

  it("uses only public saved divisions to render selected State legislature officials", async () => {
    vi.mocked(getSavedResidenceDivisions).mockResolvedValue(stateDivisions);
    getStateOfficials.mockResolvedValue({
      status: "available",
      view: stateOfficialsView,
    });

    render(await dashboardFor({ level: "state", mode: "in-office" }));

    expect(getSavedResidenceDivisions).toHaveBeenCalledOnce();
    expect(getSavedResidenceDivisions).toHaveBeenCalledWith(sessionUserId);
    expect(getSavedResidence).not.toHaveBeenCalled();
    expect(stateJurisdictionFromDivisions).toHaveBeenCalledWith(stateDivisions);
    expect(createDatabase).toHaveBeenCalledOnce();
    expect(createStateOfficialCacheRepository).toHaveBeenCalledWith(runtimeDatabase);
    expect(createStateOfficialsService).toHaveBeenCalledWith(
      expect.objectContaining({
        cache: stateCache,
        fetchStateLegislators,
        environment: { OPENSTATES_API_KEY: process.env.OPENSTATES_API_KEY },
      }),
    );
    expect(getStateOfficials).toHaveBeenCalledWith(stateOfficialsView.jurisdiction);
    expect(createFederalOfficialCacheRepository).not.toHaveBeenCalled();
    expect(createFederalOfficialsService).not.toHaveBeenCalled();
    expect(getOfficials).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "State legislature for GA" }),
    ).toHaveTextContent("Avery State");
    expect(screen.queryByText(ownerVisibleAddress)).toBeNull();
  });

  it("keeps missing or incomplete State coverage out of state provider work", async () => {
    const missing = render(
      await dashboardFor({ level: "state", mode: "in-office" }),
    );
    expect(screen.getByText(/save a voting residence/i)).toBeVisible();
    expect(stateJurisdictionFromDivisions).not.toHaveBeenCalled();
    expectNoStateLookup();
    missing.unmount();

    vi.clearAllMocks();
    vi.mocked(getSavedResidenceDivisions).mockResolvedValue([stateDivisions[0]]);
    render(await dashboardFor({ level: "state", mode: "in-office" }));
    expect(screen.getByText(/state-legislative coverage is incomplete/i)).toBeVisible();
    expect(stateJurisdictionFromDivisions).toHaveBeenCalledWith([stateDivisions[0]]);
    expectNoStateLookup();
  });

  it("shows State provider unavailability without starting the federal stack", async () => {
    vi.mocked(getSavedResidenceDivisions).mockResolvedValue(stateDivisions);
    getStateOfficials.mockResolvedValue({ status: "unavailable" });

    render(await dashboardFor({ level: "state", mode: "in-office" }));

    expect(
      screen.getByText(/State legislature information is unavailable/),
    ).toBeVisible();
    expect(createFederalOfficialCacheRepository).not.toHaveBeenCalled();
    expect(createFederalOfficialsService).not.toHaveBeenCalled();
    expect(getOfficials).not.toHaveBeenCalled();
  });

  it("keeps Local and every Elections panel honest without any official infrastructure", async () => {
    const selections = [
      { level: "local", mode: "in-office" },
      { level: "local", mode: "elections" },
      { level: "state", mode: "elections" },
      { level: "federal", mode: "elections" },
    ] as const;

    for (const selection of selections) {
      vi.clearAllMocks();
      const page = render(await dashboardFor(selection));
      expect(
        page.getByText(
          selection.mode === "elections"
            ? /unavailable until F7/i
            : /Local coverage is unavailable/i,
        ),
      ).toBeVisible();
      expect(getSavedResidenceDivisions).not.toHaveBeenCalled();
      expect(getSavedResidence).not.toHaveBeenCalled();
      expectNoStateLookup();
      expectNoFederalLookup();
      page.unmount();
    }
  });

  it("normalizes invalid or repeated directives before selecting one safe federal panel", async () => {
    render(
      await dashboardFor({
        level: ["state", "federal"],
        mode: "surprise",
        address: ownerVisibleAddress,
      }),
    );

    expect(screen.getByRole("tab", { name: "Federal" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByText(ownerVisibleAddress)).toBeNull();
    expect(screen.queryByText("surprise")).toBeNull();
    const clientProperties = governmentNavigationProps.mock.calls.at(-1)?.[0];
    expect(Object.keys(clientProperties)).toEqual(["panels", "searchParams"]);
    expect(clientProperties.searchParams).toEqual({
      level: "federal",
      mode: "in-office",
    });
    expect(Object.keys(clientProperties.panels)).toEqual(["federal"]);
    expect(clientProperties.panels.federal).toBeTruthy();
    const serializedProperties = JSON.stringify(clientProperties);
    expect(serializedProperties).not.toContain(sessionUserId);
    expect(serializedProperties).not.toContain(ownerVisibleAddress);
    expect(serializedProperties).not.toContain("surprise");
    expect(stateJurisdictionFromDivisions).not.toHaveBeenCalled();
    expectNoStateLookup();
    expect(getSavedResidence).not.toHaveBeenCalled();
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
    expect(createStateOfficialCacheRepository).not.toHaveBeenCalled();
    expect(createStateOfficialsService).not.toHaveBeenCalled();
    expect(getStateOfficials).not.toHaveBeenCalled();
    expect(fetchStateLegislators).not.toHaveBeenCalled();

    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", {
        level: 1,
        name: "Your dashboard",
      }),
    ).toBeVisible();
    expect(within(main).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      within(main).getAllByRole("heading", {
        level: 2,
        name: "In office",
      }),
    ).toHaveLength(1);
    expect(
      within(main).queryByRole("heading", {
        level: 2,
        name: "Federal officials",
      }),
    ).toBeNull();
    expect(
      within(main).getByRole("heading", { level: 2, name: "In office" }),
    ).toBeVisible();
    const roster = within(main).getByRole("region", {
      name: "Federal officials for GA District 13",
    });
    const cards = [
      {
        article: /U\.S\. Representative.*Alex House/i,
        heading: /U\.S\. Representative.*District 13/i,
        sources: [
          "Biographical Directory of the United States Congress member source",
          "Office of the Clerk, U.S. House of Representatives current vacancies list source",
        ],
      },
      {
        article: /U\.S\. Senator.*Bailey Senate/i,
        heading: "U.S. Senator",
        sources: [
          "Biographical Directory of the United States Congress member source",
        ],
      },
      {
        article: /U\.S\. Senator.*Casey Senate/i,
        heading: "U.S. Senator",
        sources: [
          "Biographical Directory of the United States Congress member source",
        ],
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

function expectNoStateLookup() {
  expect(createDatabase).not.toHaveBeenCalled();
  expect(createStateOfficialCacheRepository).not.toHaveBeenCalled();
  expect(createStateOfficialsService).not.toHaveBeenCalled();
  expect(getStateOfficials).not.toHaveBeenCalled();
  expect(fetchStateLegislators).not.toHaveBeenCalled();
}

function dashboardFor(
  searchParams: Record<string, string | readonly string[] | undefined>,
) {
  return (
    DashboardPage as unknown as (properties: {
      searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
    }) => ReturnType<typeof DashboardPage>
  )({ searchParams: Promise.resolve(searchParams) });
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
        publisher: "Biographical Directory of the United States Congress",
        sourceType: "member",
        publicUrl: `https://bioguide.congress.gov/search/bio/${bioguideId}`,
        ingestionUrl: `https://api.congress.gov/v3/member/${bioguideId}?format=json`,
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
              publicUrl: "https://clerk.house.gov/Members/ViewVacancies",
              ingestionUrl: "https://clerk.house.gov/Members/ViewVacancies",
              retrievedAt: checkedAt,
              recordUpdatedAt: null,
              effectiveAt: null,
            },
          ]
        : []),
    ],
  };
}
