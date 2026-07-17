import { createHmac } from "node:crypto";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";
const authSecret = "e2e-secret-at-least-thirty-two-characters";

test("serves a sourced federal profile anonymously from SSR", async ({
  page,
}) => {
  const requests = auditRequests(page);
  const response = await page.goto("/officials/federal/H000001");

  expect(response?.status()).toBe(200);
  const html = await response!.text();
  expect(html).toContain("Georgia Representative");
  expect(html).toContain("Congress.gov");
  expect(html).toContain("Office of the Clerk");

  const profile = page.getByRole("article", {
    name: /Georgia Representative.*U\.S\. Representative/,
  });
  await expect(profile).toBeVisible();
  await expect(profile.getByRole("heading", { name: "Georgia Representative" })).toBeVisible();
  await expect(profile.getByText("Fresh at last check.")).toBeVisible();

  const sources = profile.getByRole("region", { name: "Profile sources" });
  const congress = sources.getByRole("link", {
    name: "Congress.gov member source",
  });
  const clerk = sources.getByRole("link", {
    name: /Office of the Clerk.*vacancy source/,
  });
  await expect(congress).toHaveAttribute(
    "href",
    "https://api.congress.gov/v3/member/H000001?format=json",
  );
  await expect(clerk).toHaveAttribute(
    "href",
    "https://clerk.house.gov/Members/ViewVacancies",
  );
  await expect(sources.getByText(/^Retrieved /)).toHaveCount(2);
  await tabTo(page, congress);

  await assertSafeSurface(page, requests);
});

test("keeps the public federal profile usable without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  const requests = auditRequests(page);

  try {
    const response = await page.goto("/officials/federal/H000001");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Georgia Representative" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Profile sources" }),
    ).toBeVisible();
    await assertSafeSurface(page, requests);
  } finally {
    await context.close();
  }
});

test("fails closed for malformed, missing, and expired profiles", async ({
  page,
}) => {
  const requests = auditRequests(page);

  for (const path of [
    "/officials/federal/not-a-bioguide",
    "/officials/federal/M000001",
    "/officials/federal/T000001",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByRole("link", { name: /source/i })).toHaveCount(0);
    await assertSafeSurface(page, requests);
  }
});

test("labels below-72-hour profiles and rosters as stale", async ({
  context,
  page,
}) => {
  const requests = auditRequests(page);
  const response = await page.goto("/officials/federal/C000001");

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("status"),
  ).toHaveText(
    "This profile is stale but not expired. Verify it with the linked official source.",
  );
  await expect(
    page.getByRole("link", { name: "Congress.gov member source" }),
  ).toBeVisible();
  await assertSafeSurface(page, requests);

  await installSessionCookie(context, "ca-01-stale");
  await page.goto("/dashboard");
  const roster = page.getByRole("region", {
    name: "Federal officials for CA District 1",
  });
  await expect(roster.getByRole("status")).toHaveText(
    "This roster is stale but not expired.",
  );
  const expectedCards = [
    {
      bioguideId: "C000001",
      name: "California Representative",
    },
    { bioguideId: "C000002", name: "California Senator One" },
    { bioguideId: "C000003", name: "California Senator Two" },
  ];
  const cards = roster.getByRole("article");
  await expect(cards).toHaveCount(expectedCards.length);
  for (const [index, expected] of expectedCards.entries()) {
    const card = cards.nth(index);
    await expect(
      card.getByText("Stale but not expired; verify before use."),
    ).toBeVisible();
    await expect(
      card.getByRole("link", { name: "Congress.gov member source" }),
    ).toHaveAttribute(
      "href",
      `https://api.congress.gov/v3/member/${expected.bioguideId}?format=json`,
    );
    await expect(
      card.getByRole("link", { name: expected.name }),
    ).toHaveAttribute("href", `/officials/federal/${expected.bioguideId}`);
  }
  await expect(
    cards.nth(0).getByRole("link", {
      name: /Office of the Clerk.*vacancy source/,
    }),
  ).toHaveAttribute(
    "href",
    "https://clerk.house.gov/Members/ViewVacancies",
  );
  await assertSafeSurface(page, requests);
});

test("prompts an authenticated voter without a saved home", async ({
  context,
  page,
}) => {
  await installSessionCookie(context, "no-home");
  const requests = auditRequests(page);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "In office" })).toBeVisible();
  await expect(
    page.getByText("Save a voting residence to see federal officials", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await assertSafeSurface(page, requests);
});

test("renders the GA-13 House and Senate roster equally and deterministically", async ({
  context,
  page,
}) => {
  await installSessionCookie(context, "ga-13");
  const requests = auditRequests(page);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "In office" })).toBeVisible();
  const roster = page.getByRole("region", {
    name: "Federal officials for GA District 13",
  });
  const list = roster.getByRole("list", { name: "Federal offices" });
  const cards = list.getByRole("article");
  await expect(cards).toHaveCount(3);
  expect(
    await cards.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label")),
    ),
  ).toEqual([
    "U.S. Representative \u2014 District 13: Georgia Representative",
    "U.S. Senator: Georgia Senator One",
    "U.S. Senator: Georgia Senator Two",
  ]);

  const expectedCards = [
    { bioguideId: "H000001", name: "Georgia Representative" },
    { bioguideId: "G000001", name: "Georgia Senator One" },
    { bioguideId: "G000002", name: "Georgia Senator Two" },
  ];
  for (const [index, expected] of expectedCards.entries()) {
    const card = cards.nth(index);
    await expect(card.getByRole("heading", { level: 3 })).toBeVisible();
    await expect(card.getByText(/^Checked /)).toBeVisible();
    await expect(
      card.getByRole("heading", { name: "Sources and retrieval times" }),
    ).toBeVisible();
    await expect(
      card.getByRole("link", { name: expected.name }),
    ).toHaveAttribute("href", `/officials/federal/${expected.bioguideId}`);
    await expect(
      card.getByRole("link", { name: "Congress.gov member source" }),
    ).toHaveAttribute(
      "href",
      `https://api.congress.gov/v3/member/${expected.bioguideId}?format=json`,
    );
  }

  const house = cards.nth(0);
  await expect(
    house.getByRole("link", { name: "Congress.gov member source" }),
  ).toBeVisible();
  await expect(
    house.getByRole("link", { name: /Office of the Clerk.*vacancy source/ }),
  ).toHaveAttribute(
    "href",
    "https://clerk.house.gov/Members/ViewVacancies",
  );
  const deepLink = house.getByRole("link", { name: "Georgia Representative" });
  await expect(deepLink).toHaveAttribute(
    "href",
    "/officials/federal/H000001",
  );
  await tabTo(page, deepLink);

  await assertResponsiveRoster(page, list);
  await assertSafeSurface(page, requests);
});

test("renders at-large and verified-vacancy House seats honestly", async ({
  context,
  page,
}) => {
  const requests = auditRequests(page);

  await installSessionCookie(context, "ak-at-large");
  await page.goto("/dashboard");
  const alaska = page.getByRole("region", {
    name: "Federal officials for AK at-large",
  });
  await expect(
    alaska.getByRole("article", {
      name: /U\.S\. Representative.*At-large: Alaska Representative/,
    }),
  ).toBeVisible();
  await assertSafeSurface(page, requests);

  await installSessionCookie(context, "ga-14-vacancy");
  await page.goto("/dashboard");
  const georgia = page.getByRole("region", {
    name: "Federal officials for GA District 14",
  });
  const vacancy = georgia.getByRole("article", {
    name: /U\.S\. Representative.*District 14: vacant/,
  });
  await expect(vacancy.getByText("This seat is verified vacant.")).toBeVisible();
  const vacancySources = vacancy.getByRole("link", {
    name: /Office of the Clerk.*vacancy source/,
  });
  expect(
    await vacancySources.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href")),
    ),
  ).toEqual([
    "https://clerk.house.gov/Members/ViewVacancies",
    "https://clerk.house.gov/members/GA14/vacancy",
  ]);
  await assertSafeSurface(page, requests);
});

test("renders expired and unsupported dashboard recovery states", async ({
  context,
  page,
}) => {
  const requests = auditRequests(page);

  await installSessionCookie(context, "tx-01-expired");
  await page.goto("/dashboard");
  await expect(
    page.getByRole("region", { exact: true, name: "Federal officials" }),
  ).toContainText("Federal roster information is unavailable.");
  await expect(page.getByRole("article")).toHaveCount(0);
  await assertSafeSurface(page, requests);

  await installSessionCookie(context, "dc-unsupported");
  await page.goto("/dashboard");
  await expect(
    page.getByText(
      "Federal official coverage is not available for this jurisdiction yet.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await assertSafeSurface(page, requests);
});

async function installSessionCookie(
  context: BrowserContext,
  slug: string,
) {
  const token = `e2e-federal-${slug}-session-token`;
  const signature = createHmac("sha256", authSecret)
    .update(token)
    .digest("base64");

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
  for (const forbidden of [
    /\bAI\b/,
    /CONGRESS_GOV_API_KEY/i,
    /e2e-secret/i,
    /session-token/i,
    /profile:v2:/i,
    /roster:v1:/i,
    /fixture-(?:ciphertext|iv|tag)/i,
    /123 Main St/i,
  ]) {
    expect(surface).not.toMatch(forbidden);
  }
  for (const request of requests) {
    expect(new URL(request).hostname, request).toBe("127.0.0.1");
  }
}

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expect(target).toBeFocused();
      return;
    }
  }
  throw new Error("Keyboard focus did not reach the federal link.");
}

async function assertResponsiveRoster(page: Page, list: Locator) {
  const layouts: Array<{ rows: number }> = [];
  for (const viewport of [
    { height: 812, width: 375 },
    { height: 720, width: 1280 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await list.evaluate((element) => {
      const boxes = [element, ...element.querySelectorAll("*")]
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0);
      const itemTops = Array.from(element.children, (child) =>
        Math.round(child.getBoundingClientRect().top),
      );
      return {
        clippedNodes: boxes.filter(
          (box) => box.left < 0 || box.right > window.innerWidth,
        ).length,
        horizontalOverflow:
          document.documentElement.scrollWidth > window.innerWidth,
        rows: new Set(itemTops).size,
        visibleCards: itemTops.length,
      };
    });
    expect(layout).toMatchObject({
      clippedNodes: 0,
      horizontalOverflow: false,
      visibleCards: 3,
    });
    for (const card of await list.getByRole("article").all()) {
      await expect(card).toBeVisible();
    }
    layouts.push({ rows: layout.rows });
  }
  expect(layouts[0].rows).toBeGreaterThan(layouts[1].rows);
}
