import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";
const authSecret = "e2e-secret-at-least-thirty-two-characters";

test("renders a fresh State legislature roster with ordered sourced seats", async ({
  context,
  page,
}) => {
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
    await expect(source.locator("xpath=..").getByText(/^Effective /)).toBeVisible();
  }
  const vacancySource = cards.nth(1).getByRole("link", { name: "Vacancy source" });
  await expect(vacancySource).toHaveAttribute(
    "href",
    "https://www.legis.ga.gov/vacancies",
  );
  await expect(vacancySource.locator("xpath=..").getByText(/^Retrieved /)).toBeVisible();
  await expect(vacancySource.locator("xpath=..").getByText(/^Effective /)).toBeVisible();
  const unknownSource = cards.nth(2).getByRole("link", {
    name: "Official source not qualifying current officeholder evidence",
  });
  await expect(unknownSource).toHaveAttribute(
    "href",
    "https://www.legis.ga.gov/members/house/10",
  );
  await expect(unknownSource.locator("xpath=..").getByText(/^Retrieved /)).toBeVisible();
  await expect(unknownSource.locator("xpath=..").getByText(/^Effective /)).toBeVisible();

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
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await assertResponsiveRoster(page, roster.getByRole("list", { name: "Upper chamber District 2 seats" }));

  const tabs = page.getByRole("tablist", { name: "Government level" });
  const state = tabs.getByRole("tab", { name: "State" });
  const motion = await state.evaluate((element) => {
    const style = getComputedStyle(element);
    return { animationName: style.animationName, transitionDuration: style.transitionDuration };
  });
  expect(motion).toEqual({ animationName: "none", transitionDuration: "0s" });
  await expect(tabs.getByRole("tab", { name: "Local" })).toHaveAttribute(
    "href",
    "?level=local&mode=in-office",
  );
  await expect(tabs.getByRole("tab", { name: "State" })).toHaveAttribute(
    "href",
    "?level=state&mode=in-office&category=legislature",
  );
  await expect(tabs.getByRole("tab", { name: "Federal" })).toHaveAttribute(
    "href",
    "?level=federal&mode=in-office&category=congress",
  );
  await expect(page.getByRole("link", { name: "Elections" })).toHaveAttribute(
    "href",
    "?level=state&mode=elections",
  );

  await state.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Federal" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Local" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.getByRole("tab", { name: "Federal" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tabs.getByRole("tab", { name: "Local" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "Federal" })).toBeFocused();
  await expect(state).toHaveAttribute("aria-selected", "true");

  await tabs.getByRole("tab", { name: "Federal" }).click();
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

  await installSessionCookie(context, "expired");
  await page.goto("/dashboard?level=state&mode=in-office");
  await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText(
    "State legislature information is unavailable. Try again later.",
  );
  await expect(page.getByRole("tabpanel").getByRole("article")).toHaveCount(0);

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
  for (const forbidden of [
    /OPENSTATES_API_KEY/i,
    /e2e-state-[a-z-]+-session-token/i,
    /state-roster:v1:/i,
    /fixture-(?:ciphertext|iv|tag)/i,
    /e2e-state-(?:fresh|stale|expired|unavailable)-(?:user|session|account)/i,
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

async function assertResponsiveRoster(page: Page, list: Locator) {
  const layouts: number[] = [];
  for (const viewport of [
    { height: 812, width: 375 },
    { height: 720, width: 1280 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await list.evaluate((element) => {
      const boxes = [element, ...element.querySelectorAll("*")]
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0);
      return {
        clipped: boxes.filter((box) => box.left < 0 || box.right > innerWidth).length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        rows: new Set(Array.from(element.children, (child) => Math.round(child.getBoundingClientRect().top))).size,
      };
    });
    expect(layout).toMatchObject({ clipped: 0, overflow: false });
    layouts.push(layout.rows);
  }
  expect(layouts[0]).toBeGreaterThan(layouts[1]!);
}
