import { render, screen, within } from "@testing-library/react";
import { notFound } from "next/navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "@/db";
import { getRuntimeAuth } from "@/lib/auth";
import { fetchCongressRoster } from "@/lib/congress-gov";
import {
  createFederalOfficialCacheRepository,
  createFederalOfficialsService,
  type FederalOfficialCacheRecord,
  type FederalOfficialCacheRepository,
  type FederalProfileCachePayload,
} from "@/lib/federal-officials-service";
import { fetchCurrentHouseVacancies } from "@/lib/house-clerk-vacancy";

import FederalOfficialProfilePage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/db", () => ({ createDatabase: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRuntimeAuth: vi.fn() }));
vi.mock("@/lib/congress-gov", () => ({ fetchCongressRoster: vi.fn() }));
vi.mock("@/lib/house-clerk-vacancy", () => ({
  fetchCurrentHouseVacancies: vi.fn(),
}));
vi.mock("@/lib/federal-officials-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/federal-officials-service")>();
  return {
    ...actual,
    createFederalOfficialCacheRepository: vi.fn(),
    createFederalOfficialsService: vi.fn(actual.createFederalOfficialsService),
  };
});

const HOUR = 60 * 60 * 1_000;
const NOW = new Date("2026-07-16T12:00:00.000Z");
const DATABASE_URL = "postgresql://route.test/profile";
const cacheRead = vi.fn<FederalOfficialCacheRepository["read"]>();
const cacheReplace = vi.fn<FederalOfficialCacheRepository["replaceRoster"]>();
const cache: FederalOfficialCacheRepository = {
  read: cacheRead,
  replaceRoster: cacheReplace,
};

describe("public federal official profile page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("DATABASE_URL", DATABASE_URL);
    vi.stubEnv("CONGRESS_GOV_API_KEY", "must-not-be-used");
    vi.mocked(createDatabase).mockResolvedValue({} as never);
    vi.mocked(createFederalOfficialCacheRepository).mockReturnValue(cache);
    cacheReplace.mockResolvedValue({ status: "written" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    ["lowercase", "h000001"],
    ["leading prefix", "XXH000001"],
    ["too short", "H00001"],
    ["seventh digit", "H0000010"],
    ["extra suffix", "H000001-extra"],
    ["empty", ""],
  ])("rejects a %s Bioguide parameter before service access", async (_label, id) => {
    await expect(loadPage(id)).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(createDatabase).not.toHaveBeenCalled();
    expect(createFederalOfficialCacheRepository).not.toHaveBeenCalled();
    expect(createFederalOfficialsService).not.toHaveBeenCalled();
    expect(cacheRead).not.toHaveBeenCalled();
    expectNoProviderOrAuthWork();
  });

  it("renders unavailable recovery without infrastructure work when DATABASE_URL is blank", async () => {
    vi.stubEnv("DATABASE_URL", "");

    render(await loadPage("H000001"));

    expect(notFound).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Federal official profile",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Federal profile information is unavailable.",
    );
    expect(
      screen.getByRole("link", { name: "Check Congress.gov" }),
    ).toHaveAttribute("href", "https://www.congress.gov/members");
    expect(screen.queryByText("Alex House")).toBeNull();
    expect(screen.queryByText("U.S. Representative")).toBeNull();
    expect(screen.queryByText("GA District 13")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Congress.gov member source" }),
    ).toBeNull();
    expect(createDatabase).not.toHaveBeenCalled();
    expect(createFederalOfficialCacheRepository).not.toHaveBeenCalled();
    expect(createFederalOfficialsService).not.toHaveBeenCalled();
    expect(cacheRead).not.toHaveBeenCalled();
    expect(cacheReplace).not.toHaveBeenCalled();
    expectNoProviderOrAuthWork();
  });

  it("server-renders a verified current cached profile without authentication or JavaScript", async () => {
    const record = profileRecord(1);
    cacheRead.mockResolvedValueOnce(record);

    const page = await loadPage("H000001");
    const markup = renderToStaticMarkup(page);
    render(page);

    const article = screen.getByRole("article", {
      name: /Alex House.*U\.S\. Representative/,
    });
    expect(
      within(article).getByRole("heading", { level: 1, name: "Alex House" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(article).getByText("U.S. Representative")).toBeInTheDocument();
    expect(within(article).getByText("GA District 13")).toBeInTheDocument();
    expect(within(article).getByText("119th Congress")).toBeInTheDocument();
    expect(within(article).getByText(/2025.*2027/)).toBeInTheDocument();
    expect(article).toHaveTextContent("Fresh at last check.");

    const sourceLink = within(article).getByRole("link", {
      name: "Congress.gov member source",
    });
    expect(sourceLink).toHaveAttribute(
      "href",
      "https://api.congress.gov/v3/member/H000001?format=json",
    );
    expect(
      within(article).getByRole("link", {
        name: "Office of the Clerk, U.S. House of Representatives current vacancies list source",
      }),
    ).toHaveAttribute(
      "href",
      "https://clerk.house.gov/Members/ViewVacancies",
    );
    expect(
      within(article).getByRole("heading", {
        level: 2,
        name: "Sources and retrieval times",
      }),
    ).toBeInTheDocument();
    expect(
      article.querySelectorAll(
        `time[datetime="${record.retrievedAt.toISOString()}"]`,
      ),
    ).toHaveLength(3);
    expect(markup).not.toMatch(/<script|onClick=/i);
    expect(markup).not.toMatch(
      /address|latitude|longitude|userId|session|credential|party|\bAI\b/i,
    );

    expect(createDatabase).toHaveBeenCalledWith(DATABASE_URL);
    expect(createFederalOfficialCacheRepository).toHaveBeenCalledTimes(1);
    expect(createFederalOfficialsService).toHaveBeenCalledWith(
      expect.objectContaining({
        cache,
        fetchCongressRoster,
        fetchCurrentHouseVacancies,
      }),
    );
    expect(cacheRead).toHaveBeenCalledWith("profile:v2:H000001");
    expect(notFound).not.toHaveBeenCalled();
    expectNoProviderOrAuthWork();
  });

  it("renders a below-expiry stale profile with an explicit warning", async () => {
    cacheRead.mockResolvedValueOnce(profileRecord(25));

    render(await loadPage("H000001"));

    expect(screen.getByRole("status")).toHaveTextContent(
      "This profile is stale but not expired. Verify it with the linked official source.",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Alex House" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Congress.gov member source" }),
    ).toBeInTheDocument();
    expect(cacheRead).toHaveBeenCalledWith("profile:v2:H000001");
    expect(notFound).not.toHaveBeenCalled();
    expectNoProviderOrAuthWork();
  });

  it("returns not-found for a valid ID with a true cache miss", async () => {
    cacheRead.mockResolvedValueOnce(null);
    await expect(loadPage("H000001")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(cacheRead).toHaveBeenCalledTimes(1);
    expect(cacheRead).toHaveBeenCalledWith("profile:v2:H000001");
    expect(cacheReplace).not.toHaveBeenCalled();
    expectNoProviderOrAuthWork();
  });

  it("renders explicit expired recovery with checked time and no person facts", async () => {
    const record = profileRecord(72);
    cacheRead.mockResolvedValueOnce(record);

    render(await loadPage("H000001"));

    expect(notFound).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Federal official profile",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Federal profile data has expired. Refresh before relying on this officeholder.",
    );
    expect(screen.getByText(record.retrievedAt.toISOString()).closest("time"))
      .toHaveAttribute("dateTime", record.retrievedAt.toISOString());
    expect(
      screen.getByRole("link", { name: "Check Congress.gov" }),
    ).toHaveAttribute("href", "https://www.congress.gov/members");
    expect(screen.queryByText("Alex House")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Congress.gov member source" }),
    ).toBeNull();
    expect(cacheRead).toHaveBeenCalledWith("profile:v2:H000001");
    expectNoProviderOrAuthWork();
  });

  it.each(["cache read error", "malformed cache row"] as const)(
    "renders explicit unavailable recovery for a %s",
    async (state) => {
      if (state === "cache read error") {
        cacheRead.mockRejectedValueOnce(new Error("cache unavailable"));
      } else {
        const malformed = profileRecord(1);
        cacheRead.mockResolvedValueOnce({
          ...malformed,
          payload: null,
        });
      }

      render(await loadPage("H000001"));

      expect(notFound).not.toHaveBeenCalled();
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Federal official profile",
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        "Federal profile information is unavailable.",
      );
      expect(
        screen.getByRole("link", { name: "Check Congress.gov" }),
      ).toHaveAttribute("href", "https://www.congress.gov/members");
      expect(screen.queryByText("Alex House")).toBeNull();
      expect(cacheRead).toHaveBeenCalledWith("profile:v2:H000001");
      expect(cacheReplace).not.toHaveBeenCalled();
      expectNoProviderOrAuthWork();
    },
  );
});

function loadPage(bioguideId: string) {
  return FederalOfficialProfilePage({
    params: Promise.resolve({ bioguideId }),
  });
}

function profileRecord(ageHours: number): FederalOfficialCacheRecord {
  const retrievedAt = new Date(NOW.getTime() - ageHours * HOUR);
  const person = {
    id: "bioguide:H000001" as const,
    bioguideId: "H000001",
    name: "Alex House",
  };
  const office = {
    id: "federal:house:GA:13",
    chamber: "house" as const,
    stateCode: "GA",
    district: 13,
    title: "U.S. Representative" as const,
  };
  const payload = {
    person,
    office,
    term: {
      officeId: office.id,
      personId: person.id,
      congress: 119,
      startYear: 2025,
      endYear: 2027,
      status: "serving" as const,
    },
    sources: [
      {
        publisher: "Congress.gov" as const,
        sourceType: "member" as const,
        url: "https://api.congress.gov/v3/member/H000001?format=json",
        retrievedAt: retrievedAt.toISOString(),
        recordUpdatedAt: new Date(
          retrievedAt.getTime() - HOUR,
        ).toISOString(),
        effectiveAt: null,
      },
      {
        publisher:
          "Office of the Clerk, U.S. House of Representatives" as const,
        sourceType: "vacancy" as const,
        url: "https://clerk.house.gov/Members/ViewVacancies",
        retrievedAt: retrievedAt.toISOString(),
        recordUpdatedAt: null,
        effectiveAt: null,
      },
    ],
  } satisfies FederalProfileCachePayload;
  return {
    cacheKey: "profile:v2:H000001",
    payload,
    retrievedAt,
    refreshAfter: new Date(retrievedAt.getTime() + 24 * HOUR),
    staleAfter: new Date(retrievedAt.getTime() + 72 * HOUR),
  };
}

function expectNoProviderOrAuthWork() {
  expect(fetchCongressRoster).not.toHaveBeenCalled();
  expect(fetchCurrentHouseVacancies).not.toHaveBeenCalled();
  expect(getRuntimeAuth).not.toHaveBeenCalled();
}
