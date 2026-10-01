import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

const corrected = "123 Main Street, Example, California 90000";
const newer = "456 Oak Street, Example, California 90001";

test.beforeEach(async ({ context, page }) => {
  const token = "e2e-session-token";
  const signature = createHmac("sha256", "e2e-secret-at-least-thirty-two-characters")
    .update(token).digest("base64");
  await context.addCookies([{
    name: "better-auth.session_token", value: encodeURIComponent(`${token}.${signature}`),
    httpOnly: true, sameSite: "Lax", secure: false, url: "http://127.0.0.1:3000",
  }]);
  await page.route("**/api/v1/residence", (route) => route.fulfill({
    json: { status: "empty" },
  }));
});

test("lets a voter opt in, select a correction with the keyboard, then explicitly verify", async ({ page }, testInfo) => {
  const suggestionBodies: unknown[] = [];
  const resolveBodies: unknown[] = [];
  const requestedUrls: string[] = [];
  page.on("request", (request) => requestedUrls.push(request.url()));
  await page.route("**/api/v1/location/suggest", async (route) => {
    expect(route.request().method()).toBe("POST");
    suggestionBodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: "ok", suggestions: [{ id: "one", address: corrected }] } });
  });
  await page.route("**/api/v1/location/resolve", async (route) => {
    resolveBodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: "no_match", message: "We could not match that residence. Check it and try again." } });
  });
  await page.goto("/dashboard");
  const input = page.getByLabel("Voting residence address");
  await input.fill("123 Mian Street, Example");
  // User pauses beyond the debounce window before granting suggestion consent.
  await page.waitForTimeout(600);
  expect(suggestionBodies).toEqual([]);
  await page.getByRole("checkbox", { name: "Enable address suggestions" }).check();
  await expect(page.getByRole("option", { name: corrected })).toBeVisible();
  expect(suggestionBodies).toEqual([{ query: "123 Mian Street, Example", consent: true }]);
  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await input.scrollIntoViewIfNeeded();
    await expect(page.getByRole("option", { name: corrected })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const checkButton = await page.getByRole("button", { name: "Check residence" }).boundingBox();
    expect(checkButton?.height).toBeLessThanOrEqual(60);
    await page.screenshot({ path: testInfo.outputPath(`address-suggestions-${viewport.width}.png`), fullPage: true });
  }
  await input.focus();
  await page.keyboard.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", "residence-suggestion-0");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue(corrected);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect(resolveBodies).toEqual([]);
  await page.getByRole("button", { name: "Check residence" }).click();
  await expect(page.locator(".residence-status")).toHaveText(/could not match/);
  expect(resolveBodies).toEqual([{ kind: "address", address: corrected }]);
  expect(requestedUrls.join("\n")).not.toContain("123");
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain("Main Street");
});

test("ignores interrupted suggestions, closes on Escape, and recovers after provider failure", async ({ page }) => {
  let pending: (() => Promise<void>) | undefined;
  await page.route("**/api/v1/location/suggest", async (route) => {
    const { query } = route.request().postDataJSON();
    if (query === "123 Main") {
      await new Promise<void>((resolve) => {
        pending = async () => {
          await route.fulfill({ json: { status: "ok", suggestions: [{ id: "old", address: corrected }] } }).catch(() => {});
          resolve();
        };
      });
      return;
    }
    if (query === "offline address") {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ json: { status: "ok", suggestions: [{ id: "new", address: newer }] } });
  });
  await page.goto("/dashboard");
  await page.getByRole("checkbox", { name: "Enable address suggestions" }).check();
  const input = page.getByRole("combobox");
  await input.fill("123 Main");
  await expect.poll(() => Boolean(pending)).toBe(true);
  await input.fill("456 Oak");
  await expect(page.getByRole("option", { name: newer })).toBeVisible();
  await pending!();
  await expect(page.getByRole("option", { name: corrected })).toHaveCount(0);
  const consent = page.getByRole("checkbox", { name: "Enable address suggestions" });
  const consentBeforeDismiss = await consent.boundingBox();
  await input.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect((await consent.boundingBox())?.y).toBe(consentBeforeDismiss?.y);
  await input.fill("offline address");
  await expect(page.locator(".address-suggestion-status")).toHaveText(/Suggestions are unavailable/);
  await expect(input).toBeEnabled();
  await input.fill("456 Oak Street");
  await expect(page.getByRole("option", { name: newer })).toBeVisible();
  await page.getByRole("checkbox", { name: "Enable address suggestions" }).uncheck();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByLabel("Voting residence address")).toHaveValue("456 Oak Street");
});

test("keeps every keyboard-highlighted address visible in an overflowing mobile list", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const suggestions = Array.from({ length: 5 }, (_, index) => ({
    id: String(index),
    address: `${100 + index} Long Example Residential Avenue, Example Township, California 90000`,
  }));
  await page.route("**/api/v1/location/suggest", (route) => route.fulfill({
    json: { status: "ok", suggestions },
  }));
  await page.goto("/dashboard");
  await page.getByRole("checkbox", { name: "Enable address suggestions" }).check();
  const input = page.getByRole("combobox");
  await input.fill("100 Long Example");
  await expect(page.getByRole("option")).toHaveCount(5);
  const list = page.getByRole("listbox");
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await input.press("ArrowUp");
  await expect(input).toHaveAttribute("aria-activedescendant", "residence-suggestion-4");
  await expect.poll(() => list.evaluate((element) => {
    const selected = element.querySelector('[aria-selected="true"]')!;
    const row = selected.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return row.top >= box.top && row.bottom <= box.bottom;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("address-keyboard-overflow-375.png"), fullPage: true });
  await page.getByRole("heading", { name: "Preview your voting residence" }).click();
  await expect(list).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Enable address suggestions" }).uncheck();
  await expect(page.getByRole("checkbox", { name: "Enable address suggestions" })).not.toBeChecked();
  await expect(page.getByLabel("Voting residence address")).toHaveValue("100 Long Example");
});
