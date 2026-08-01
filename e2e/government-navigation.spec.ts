import { createHmac } from "node:crypto";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { Pool } from "pg";
import {
  reconcileStateOfficials,
  type StateJurisdiction,
  type StateOfficialsView,
} from "../src/lib/state-officials";

const baseURL = "http://127.0.0.1:3000";
const authSecret = "e2e-secret-at-least-thirty-two-characters";
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL?.trim();
const stateCacheKeys = [
  "state-roster:v1:GA:U-2:L-10",
  "state-roster:v1:CA:U-1:L-1",
  "state-roster:v1:TX:U-1:L-1",
  "state-roster:v1:FL:U-1:L-1",
] as const;
const privateSentinels = [
  authSecret,
  "e2e-current",
  "fixture-ciphertext",
  "fixture-iv",
  "fixture-tag",
  ...stateCacheKeys,
  ...["fresh", "stale", "expired", "unavailable"].flatMap((slug) => [
    `e2e-state-${slug}-user`,
    `e2e-state-${slug}-session`,
    `e2e-state-${slug}-session-token`,
    `e2e-state-${slug}-account`,
    `e2e-state-${slug}-google-account`,
  ]),
] as const;

type StateCacheRow = {
  cache_key: string;
  payload: unknown;
  retrieved_at: Date;
  refresh_after: Date;
  stale_after: Date;
};

const expectedStateView = {
  "state-roster:v1:GA:U-2:L-10": [
    {
      chamber: "upper",
      district: "2",
      seats: [
        {
          people: [
            {
              id: "ga-upper-avery",
              name: "Avery State",
              sources: [{ sourceType: "official", publicUrl: "https://www.legis.ga.gov/members/senate/2" }],
            },
            {
              id: "ga-upper-blair",
              name: "Blair State",
              sources: [{ sourceType: "official", publicUrl: "https://www.legis.ga.gov/members/senate/3" }],
            },
          ],
          seat: "District 2",
          sources: [
            { sourceType: "official", publicUrl: "https://www.legis.ga.gov/members/senate/2" },
            { sourceType: "official", publicUrl: "https://www.legis.ga.gov/members/senate/3" },
          ],
          status: "serving",
        },
        {
          people: [],
          seat: "District 2 Seat B",
          sources: [{ sourceType: "vacancy", publicUrl: "https://www.legis.ga.gov/vacancies" }],
          status: "vacant",
        },
      ],
    },
    {
      chamber: "lower",
      district: "10",
      seats: [
        {
          people: [],
          seat: "District 10",
          sources: [{ sourceType: "official", publicUrl: "https://www.legis.ga.gov/members/house/10" }],
          status: "unknown",
        },
      ],
    },
  ],
  "state-roster:v1:CA:U-1:L-1": [
    {
      chamber: "upper",
      district: "1",
      seats: [
        {
          people: [
            {
              id: "ca-upper-stale",
              name: "California State Senator",
              sources: [{ sourceType: "official", publicUrl: "https://www.senate.ca.gov/senate/1" }],
            },
          ],
          seat: "District 1",
          sources: [{ sourceType: "official", publicUrl: "https://www.senate.ca.gov/senate/1" }],
          status: "serving",
        },
      ],
    },
    {
      chamber: "lower",
      district: "1",
      seats: [
        {
          people: [
            {
              id: "ca-lower-stale",
              name: "California State Assemblymember",
              sources: [{ sourceType: "official", publicUrl: "https://www.assembly.ca.gov/assemblymembers/1" }],
            },
          ],
          seat: "District 1",
          sources: [{ sourceType: "official", publicUrl: "https://www.assembly.ca.gov/assemblymembers/1" }],
          status: "serving",
        },
      ],
    },
  ],
  "state-roster:v1:TX:U-1:L-1": [
    {
      chamber: "upper",
      district: "1",
      seats: [
        {
          people: [
            {
              id: "tx-upper-expired",
              name: "Texas State Senator",
              sources: [{ sourceType: "official", publicUrl: "https://capitol.texas.gov/senate/1" }],
            },
          ],
          seat: "District 1",
          sources: [{ sourceType: "official", publicUrl: "https://capitol.texas.gov/senate/1" }],
          status: "serving",
        },
      ],
    },
  ],
} as const;

test("renders a fresh State legislature roster with ordered sourced seats", async ({
  context,
  page,
}, testInfo) => {
  await installSessionCookie(context, "fresh");
  const requests = auditRequests(page);
  const response = await page.goto("/dashboard?level=state&mode=in-office");

  expect(response?.status()).toBe(200);
  const stateTab = page.getByRole("tab", { name: "State" });
  await expect(stateTab).toHaveAttribute("aria-selected", "true");
  await expect(stateTab).toHaveAttribute(
    "href",
    "?level=state&mode=in-office&category=legislature",
  );
  await expect(page.getByRole("link", { name: "In office" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const panel = page.getByRole("tabpanel");
  await expect(panel).toHaveAttribute("aria-labelledby", "government-level-state-tab");
  await expect(panel.getByRole("heading", { level: 2, name: "In office" })).toBeVisible();

  const roster = panel.getByRole("region", { name: "State legislature for GA" });
  await expect(roster).toBeVisible();
  const cards = roster.getByRole("article");
  await expect(cards).toHaveCount(3);
  await expect(roster.getByText("Fresh at last check.")).toHaveCount(3);
  await expect(roster.getByText(/stale/i)).toHaveCount(0);
  await expect(roster.getByRole("status")).toHaveCount(0);
  await expect(cards.nth(0)).toHaveAttribute(
    "aria-label",
    "District 2: Avery State, Blair State",
  );
  await expect(cards.nth(1)).toHaveAttribute("aria-label", "District 2 Seat B: vacant");
  await expect(cards.nth(2)).toHaveAttribute(
    "aria-label",
    "District 10: officeholder unknown",
  );
  await expect(cards.nth(1).getByText("This seat is verified vacant.")).toBeVisible();
  await expect(cards.nth(2).getByText("Current officeholder is unknown.")).toBeVisible();
  await expect(cards.nth(2).getByText(
    "Listed sources are not qualifying evidence of a current officeholder.",
  )).toBeVisible();

  for (const [name, href] of [
    ["Avery State", "https://www.legis.ga.gov/members/senate/2"],
    ["Blair State", "https://www.legis.ga.gov/members/senate/3"],
  ]) {
    const source = cards.nth(0).getByRole("link", {
      name: `Official source for ${name}`,
    });
    await expect(source).toHaveAttribute("href", href);
    await expect(source.locator("xpath=..").getByText(/^Retrieved /)).toBeVisible();
    await expect(source.locator("xpath=..").getByText(/^Effective /)).toHaveCount(0);
  }
  const vacancySource = cards.nth(1).getByRole("link", { name: "Vacancy source" });
  await expect(vacancySource).toHaveAttribute(
    "href",
    "https://www.legis.ga.gov/vacancies",
  );
  await expect(vacancySource.locator("xpath=..").getByText(/^Retrieved /)).toBeVisible();
  await expect(vacancySource.locator("xpath=..").getByText(/^Effective /)).toHaveCount(0);
  const unknownSource = cards.nth(2).getByRole("link", {
    name: "Official source not qualifying current officeholder evidence",
  });
  await expect(unknownSource).toHaveAttribute(
    "href",
    "https://www.legis.ga.gov/members/house/10",
  );
  await expect(unknownSource.locator("xpath=..").getByText(/^Retrieved /)).toBeVisible();
  await expect(unknownSource.locator("xpath=..").getByText(/^Effective /)).toHaveCount(0);

  const source = cards.nth(0).getByRole("link", {
    name: "Official source for Avery State",
  });
  await tabTo(page, source);
  const focus = await source.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(focus.style).not.toBe("none");
  expect(Number.parseFloat(focus.width)).toBeGreaterThanOrEqual(2);

  const tabs = page.getByRole("tablist", { name: "Government level" });
  const local = tabs.getByRole("tab", { name: "Local" });
  const state = tabs.getByRole("tab", { name: "State" });
  const federal = tabs.getByRole("tab", { name: "Federal" });
  await expect(local).toHaveAttribute(
    "href",
    "?level=local&mode=in-office",
  );
  await expect(state).toHaveAttribute(
    "href",
    "?level=state&mode=in-office&category=legislature",
  );
  await expect(federal).toHaveAttribute(
    "href",
    "?level=federal&mode=in-office&category=congress",
  );
  await expect(page.getByRole("link", { name: "Elections" })).toHaveAttribute(
    "href",
    "?level=state&mode=elections",
  );

  await assertReducedMotion(page, tabs);
  await assertSafeSurface(page, requests);
  await assertResponsiveGovernmentSurface(
    page,
    testInfo,
    requests,
    roster,
    roster.getByRole("list", { name: "Upper chamber District 2 seats" }),
  );

  await state.focus();
  await assertTabStops(local, state, federal, "state");
  await page.keyboard.press("ArrowRight");
  await expect(federal).toBeFocused();
  await assertTabStops(local, state, federal, "federal");
  await page.keyboard.press("ArrowRight");
  await expect(local).toBeFocused();
  await assertTabStops(local, state, federal, "local");
  await page.keyboard.press("ArrowLeft");
  await expect(federal).toBeFocused();
  await assertTabStops(local, state, federal, "federal");
  await page.keyboard.press("Home");
  await expect(local).toBeFocused();
  await assertTabStops(local, state, federal, "local");
  await page.keyboard.press("End");
  await expect(federal).toBeFocused();
  await assertTabStops(local, state, federal, "federal");
  await expect(state).toHaveAttribute("aria-selected", "true");
  await assertVisibleFocus(federal);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/level=federal&mode=in-office&category=congress/);
  await expect(page.getByRole("tabpanel").getByRole("region", {
    name: "Federal officials for GA District 13",
  })).toBeVisible();
  await assertSafeSurface(page, requests);
});

test("serves State and unavailable recovery panels without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  const requests = auditRequests(page);

  try {
    await installSessionCookie(context, "fresh");
    await page.goto("/dashboard");
    await page.getByRole("tab", { name: "State" }).click();
    await expect(page).toHaveURL(/level=state&mode=in-office&category=legislature/);
    await expect(page.getByRole("tabpanel").getByRole("region", {
      name: "State legislature for GA",
    })).toBeVisible();
    await assertSafeSurface(page, requests);

    await page.getByRole("tab", { name: "Local" }).click();
    await expect(page).toHaveURL(/level=local&mode=in-office/);
    await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText(
      "Local coverage is unavailable for verified display. Choose State or Federal for current coverage.",
    );
    await expect(page.getByRole("tabpanel").getByRole("article")).toHaveCount(0);
    await page.getByRole("link", { name: "Elections" }).click();
    await expect(page).toHaveURL(/level=local&mode=elections/);
    await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText(
      "Election information is unavailable until F7. Choose In office for current officials.",
    );
    await page.getByRole("tab", { name: "State" }).click();
    await expect(page).toHaveURL(/level=state&mode=elections/);
    await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText(
      "Election information is unavailable until F7. Choose In office for current officials.",
    );
    await page.getByRole("tab", { name: "Federal" }).click();
    await expect(page).toHaveURL(/level=federal&mode=elections/);
    await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText(
      "Election information is unavailable until F7. Choose In office for current officials.",
    );
    await page.getByRole("link", { name: "In office" }).click();
    await expect(page).toHaveURL(/level=federal&mode=in-office&category=congress/);
    await expect(page.getByRole("tabpanel").getByRole("region", {
      name: "Federal officials for GA District 13",
    })).toBeVisible();
    await assertSafeSurface(page, requests);
  } finally {
    await context.close();
  }
});

test("labels stale cache and recovers from expired and absent State cache", async ({
  context,
  page,
}) => {
  const requests = auditRequests(page);
  const postgres = await openStateCacheInspection();
  try {
    if (postgres) {
      await assertSeededStateCache(postgres);
    }
  } finally {
    await postgres?.end();
  }

  await installSessionCookie(context, "stale");
  await page.goto("/dashboard?level=state&mode=in-office");
  const staleRoster = page.getByRole("region", { name: "State legislature for CA" });
  await expect(staleRoster.getByRole("status")).toHaveText(
    "This roster is stale but not expired. Verify before use.",
  );
  const staleCards = staleRoster.getByRole("article");
  await expect(staleCards).toHaveCount(2);
  for (const card of await staleCards.all()) {
    await expect(card).toContainText("Stale but not expired; verify before use.");
  }
  await assertSafeSurface(page, requests);

  await installSessionCookie(context, "expired");
  await page.goto("/dashboard?level=state&mode=in-office");
  await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText(
    "State legislature information is unavailable. Try again later.",
  );
  await expect(page.getByRole("tabpanel").getByRole("article")).toHaveCount(0);
  await assertSafeSurface(page, requests);

  await installSessionCookie(context, "unavailable");
  await page.goto("/dashboard?level=state&mode=in-office");
  await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText(
    "State legislature information is unavailable. Try again later.",
  );
  await expect(page.getByRole("tabpanel").getByRole("article")).toHaveCount(0);
  await assertSafeSurface(page, requests);
});

async function installSessionCookie(context: BrowserContext, slug: string) {
  const token = `e2e-state-${slug}-session-token`;
  const signature = createHmac("sha256", authSecret).update(token).digest("base64");
  await context.addCookies([
    {
      httpOnly: true,
      name: "better-auth.session_token",
      sameSite: "Lax",
      secure: false,
      url: baseURL,
      value: encodeURIComponent(`${token}.${signature}`),
    },
  ]);
}

function auditRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  return requests;
}

async function assertSafeSurface(page: Page, requests: readonly string[]) {
  const surface = `${await page.locator("body").innerText()}\n${await page.content()}\n${page.url()}\n${requests.join("\n")}`;
  for (const sentinel of privateSentinels) {
    expect(surface).not.toContain(sentinel);
  }
  for (const forbidden of [
    /OPENSTATES_API_KEY/i,
    /v3\.openstates\.org|api\.congress\.gov|X-API-KEY/i,
  ]) {
    expect(surface).not.toMatch(forbidden);
  }
  for (const request of requests) {
    expect(new URL(request).hostname, request).toBe("127.0.0.1");
  }
}

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expect(target).toBeFocused();
      return;
    }
  }
  throw new Error("Keyboard focus did not reach State source link.");
}

async function assertTabStops(
  local: Locator,
  state: Locator,
  federal: Locator,
  current: "local" | "state" | "federal",
) {
  await expect(local).toHaveAttribute("tabindex", current === "local" ? "0" : "-1");
  await expect(state).toHaveAttribute("tabindex", current === "state" ? "0" : "-1");
  await expect(federal).toHaveAttribute("tabindex", current === "federal" ? "0" : "-1");
}

async function assertVisibleFocus(target: Locator) {
  const focus = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      style: style.outlineStyle,
      width: style.outlineWidth,
    };
  });
  expect(focus.style).not.toBe("none");
  expect(focus.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(Number.parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
}

async function assertReducedMotion(page: Page, tabs: Locator) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  const controls = tabs.getByRole("tab").or(
    page.getByRole("navigation", { name: "Official status" }).getByRole("link"),
  );
  await expect(controls).toHaveCount(5);
  const motion = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        animationName: style.animationName,
        scrollBehavior: style.scrollBehavior,
        transitionDuration: style.transitionDuration,
      };
    }),
  );
  for (const value of motion) {
    expect(value.animationName.split(", ")).toEqual(["none"]);
    expect(value.animationDuration.split(", ").every((duration) => duration === "0s")).toBe(true);
    expect(value.transitionDuration.split(", ").every((duration) => duration === "0s")).toBe(true);
    expect(value.scrollBehavior).toBe("auto");
  }
}

async function assertResponsiveGovernmentSurface(
  page: Page,
  testInfo: TestInfo,
  requests: readonly string[],
  roster: Locator,
  list: Locator,
) {
  const layouts: number[] = [];
  for (const viewport of [
    { height: 812, name: "government-mobile-375x812", width: 375 },
    { height: 720, name: "government-desktop-1280x720", width: 1280 },
  ]) {
    await page.setViewportSize(viewport);
    const targets = [
      page.getByRole("tablist", { name: "Government level" }),
      page.getByRole("navigation", { name: "Official status" }),
      page.getByRole("tabpanel"),
      ...(await page.getByRole("tab").all()),
      ...(await page.getByRole("navigation", { name: "Official status" }).getByRole("link").all()),
      ...(await roster.getByRole("article").all()),
      ...(await roster.getByRole("link").all()),
    ];
    for (const target of targets) {
      await expect(target).toBeVisible();
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box!.y).toBeLessThan(viewport.height);
      expect(box!.y + box!.height).toBeGreaterThan(0);
    }
    const layout = await page.locator("main#main-content").evaluate((element) => {
      const boxes = [element, ...element.querySelectorAll("*")]
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0);
      return {
        clipped: boxes.filter(
          (box) => box.left < -0.5 || box.right > innerWidth + 0.5,
        ).length,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(layout).toMatchObject({ clipped: 0, overflow: false });
    layouts.push(
      await list.evaluate(
        (element) =>
          new Set(
            Array.from(element.children, (child) =>
              Math.round(child.getBoundingClientRect().top),
            ),
          ).size,
      ),
    );
    const path = testInfo.outputPath(`${viewport.name}.png`);
    await assertSafeSurface(page, requests);
    await page.screenshot({ fullPage: true, path });
    await assertSafeSurface(page, requests);
    await testInfo.attach(viewport.name, { contentType: "image/png", path });
  }
  expect(layouts[0]).toBeGreaterThan(layouts[1]!);
}

async function openStateCacheInspection(): Promise<Pool | null> {
  const hosted = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  if (!e2eDatabaseUrl) {
    if (hosted) {
      throw new Error(
        "Hosted government-navigation E2E requires the authoritative PostgreSQL database.",
      );
    }
    return null;
  }
  if (!/^postgres(?:ql)?:\/\//i.test(e2eDatabaseUrl)) {
    throw new Error("Government-navigation E2E database is not PostgreSQL.");
  }
  return new Pool({ connectionString: e2eDatabaseUrl });
}

async function assertSeededStateCache(pool: Pool) {
  const result = await pool.query<StateCacheRow>(
    `select "cache_key", "payload", "retrieved_at", "refresh_after", "stale_after"
     from "state_official_cache"
     where "cache_key" = any($1::text[])
     order by "cache_key" asc`,
    [[...stateCacheKeys]],
  );
  expect(result.rows.map(({ cache_key: cacheKey }) => cacheKey)).toEqual([
    "state-roster:v1:CA:U-1:L-1",
    "state-roster:v1:GA:U-2:L-10",
    "state-roster:v1:TX:U-1:L-1",
  ]);
  const byKey = new Map(result.rows.map((row) => [row.cache_key, row]));
  expect(byKey.has("state-roster:v1:FL:U-1:L-1")).toBe(false);

  for (const row of result.rows) {
    expect(row.refresh_after.getTime() - row.retrieved_at.getTime()).toBe(
      24 * 60 * 60 * 1_000,
    );
    expect(row.stale_after.getTime() - row.retrieved_at.getTime()).toBe(
      72 * 60 * 60 * 1_000,
    );
    const payload = requireRecord(row.payload, `${row.cache_key} payload`);
    expect(Object.keys(payload).sort()).toEqual(["jurisdiction", "roster"]);
    const expectedJurisdiction = jurisdictionFromCacheKey(row.cache_key);
    expect(payload.jurisdiction).toEqual(expectedJurisdiction);
    const view = reconcileStateOfficials(expectedJurisdiction, payload.roster);
    expect(view).not.toBeNull();
    if (view === null) {
      throw new Error(`${row.cache_key} roster failed public validation.`);
    }
    expect(view.freshness).toEqual({
      checkedAt: row.retrieved_at.toISOString(),
      refreshAfter: row.refresh_after.toISOString(),
      staleAfter: row.stale_after.toISOString(),
      state: "fresh",
    });
    expect(projectStateView(view)).toEqual(
      expectedStateView[row.cache_key as keyof typeof expectedStateView],
    );
    const sources = view.chambers.flatMap((chamber) =>
      chamber.districts.flatMap((district) =>
        district.seats.flatMap((seat) => seat.sources),
      ),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.retrievedAt).toBe(row.retrieved_at.toISOString());
      expect(source.effectiveAt).toBeNull();
    }
  }

  const inspectedAt = Date.now();
  const fresh = byKey.get("state-roster:v1:GA:U-2:L-10")!;
  const stale = byKey.get("state-roster:v1:CA:U-1:L-1")!;
  const expired = byKey.get("state-roster:v1:TX:U-1:L-1")!;
  expect(inspectedAt).toBeLessThan(fresh.refresh_after.getTime());
  expect(inspectedAt).toBeGreaterThanOrEqual(stale.refresh_after.getTime());
  expect(inspectedAt).toBeLessThan(stale.stale_after.getTime());
  expect(inspectedAt).toBeGreaterThanOrEqual(expired.stale_after.getTime());
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function jurisdictionFromCacheKey(cacheKey: string): StateJurisdiction {
  const match = /^state-roster:v1:([A-Z]{2}):U-([a-z0-9][a-z0-9_-]{0,199}):L-([a-z0-9][a-z0-9_-]{0,199})$/.exec(
    cacheKey,
  );
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Unexpected State cache key: ${cacheKey}`);
  }
  const [stateCode, upperDistrict, lowerDistrict] = match.slice(1) as [
    string,
    string,
    string,
  ];
  const state = stateCode.toLowerCase();
  return {
    stateCode,
    stateDivisionId: `ocd-division/country:us/state:${state}`,
    jurisdictionId: `ocd-jurisdiction/country:us/state:${state}/government`,
    legislature: "bicameral",
    districts: [
      {
        chamber: "upper",
        district: upperDistrict,
        providerTargets: [{
          label: upperDistrict,
          divisionId: `ocd-division/country:us/state:${state}/sldu:${upperDistrict}`,
        }],
        divisionId: `ocd-division/country:us/state:${state}/sldu:${upperDistrict}`,
      },
      {
        chamber: "lower",
        district: lowerDistrict,
        providerTargets: [{
          label: lowerDistrict,
          divisionId: `ocd-division/country:us/state:${state}/sldl:${lowerDistrict}`,
        }],
        divisionId: `ocd-division/country:us/state:${state}/sldl:${lowerDistrict}`,
      },
    ],
  };
}

function projectStateView(view: StateOfficialsView) {
  return view.chambers.flatMap((chamber) =>
    chamber.districts.map((district) => ({
      chamber: chamber.chamber,
      district: district.district,
      seats: district.seats.map((seat) => ({
        people: seat.people.map((person) => ({
          id: person.id,
          name: person.name,
          sources: person.sources.map(projectSource),
        })),
        seat: seat.seat,
        sources: seat.sources.map(projectSource),
        status: seat.status,
      })),
    })),
  );
}

function projectSource(source: StateOfficialsView["chambers"][number]["districts"][number]["seats"][number]["sources"][number]) {
  return { publicUrl: source.publicUrl, sourceType: source.sourceType };
}
