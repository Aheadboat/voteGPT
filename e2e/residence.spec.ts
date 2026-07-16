import { createHmac } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  ambiguousResidenceResponse,
  matchedResidenceResponse,
  noMatchResidenceResponse,
  partialResidenceResponse,
  unavailableResidenceResponse,
} from "../tests/fixtures/residence-responses";

const baseURL = "http://127.0.0.1:3000";
const authSecret = "e2e-secret-at-least-thirty-two-characters";
const sessionToken = "e2e-session-token";
const manualAddress = "123 Main St, Example, CA 90000";

test.beforeEach(async ({ context, page }) => {
  const signature = createHmac("sha256", authSecret)
    .update(sessionToken)
    .digest("base64");

  await context.addCookies([
    {
      httpOnly: true,
      name: "better-auth.session_token",
      sameSite: "Lax",
      secure: false,
      url: baseURL,
      value: encodeURIComponent(`${sessionToken}.${signature}`),
    },
  ]);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("resolves a manual residence with equal provenance and coverage", async ({
  page,
}, testInfo) => {
  const requests = await queueResidenceResponses(page, [
    { body: matchedResidenceResponse, status: 200 },
  ]);

  await page.goto("/dashboard");

  await expect(page.getByText("Signed in as voter@example.invalid")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Preview your voting residence" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your address is used only for this check and is not saved."),
  ).toBeVisible();
  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
  ).toBe(true);

  const address = page.getByLabel("Voting residence address");
  for (const target of [
    page.getByRole("link", { name: "Skip to main content" }),
    page.getByRole("link", { name: "voteGPT home" }),
    page.getByRole("link", { name: "Sign in" }),
    address,
    page.getByRole("button", { name: "Check residence" }),
    page.getByRole("button", { name: "Use this device once" }),
  ]) {
    await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
  }

  await address.fill(manualAddress);
  await page.getByRole("button", { name: "Check residence" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "Residence matched. Review the divisions and source below.",
  );
  await expect(address).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "Matched political divisions" }),
  ).toBeVisible();
  await expect(page.getByText("Example Congressional District 1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Google Civic Information API" }),
  ).toHaveAttribute("href", "https://developers.google.com/civic-information");
  await expect(page.getByText("Checked: 2026-07-14T20:00:00.000Z")).toBeVisible();
  await expect(page.getByText("Effective date unavailable.")).toBeVisible();
  await expect(page.getByText("Local divisions may be unavailable.")).toBeVisible();
  expect(requests).toEqual([{ kind: "address", address: manualAddress }]);

  const aria = await page.getByRole("region", { name: "Residence match" }).ariaSnapshot();
  expect(aria).toContain("Matched political divisions");
  expect(aria).toContain("Source and freshness");
  expect(aria).toContain("Coverage notes");
  await testInfo.attach("matched-residence-accessibility-tree", {
    body: aria,
    contentType: "text/yaml",
  });

  const contrast = await page.evaluate(() => {
    function channels(color: string) {
      const values = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!values || values.length !== 3) {
        throw new Error(`Unsupported computed color: ${color}`);
      }
      return values.map((value) => value / 255);
    }

    function luminance(color: string) {
      return channels(color)
        .map((value) =>
          value <= 0.04045
            ? value / 12.92
            : Math.pow((value + 0.055) / 1.055, 2.4),
        )
        .reduce(
          (total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    }

    function background(element: Element) {
      let current: Element | null = element;
      while (current) {
        const color = getComputedStyle(current).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)") {
          return color;
        }
        current = current.parentElement;
      }
      return "rgb(255, 255, 255)";
    }

    return [
      ".residence-intro",
      ".residence-privacy",
      ".residence-status",
      ".residence-result h3",
      ".residence-form button",
      ".secondary-button",
    ].map((selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing contrast target: ${selector}`);
      }
      const foreground = getComputedStyle(element).color;
      const backdrop = background(element);
      const lighter = Math.max(luminance(foreground), luminance(backdrop));
      const darker = Math.min(luminance(foreground), luminance(backdrop));
      return {
        background: backdrop,
        foreground,
        ratio: (lighter + 0.05) / (darker + 0.05),
        selector,
      };
    });
  });
  for (const sample of contrast) {
    expect(sample.ratio, sample.selector).toBeGreaterThanOrEqual(4.5);
  }
  await testInfo.attach("residence-computed-contrast", {
    body: JSON.stringify(contrast, null, 2),
    contentType: "application/json",
  });

  for (const viewport of [
    { height: 812, name: "matched-mobile-375x812", width: 375 },
    { height: 720, name: "matched-desktop-1280x720", width: 1280 },
  ]) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.getByRole("heading", { name: "Matched political divisions" }).scrollIntoViewIfNeeded();
    const path = testInfo.outputPath(`${viewport.name}.png`);
    await page.screenshot({ path });
    await testInfo.attach(viewport.name, { contentType: "image/png", path });
  }
});

test("uses device location once and labels Census coverage as partial", async ({
  context,
  page,
}, testInfo) => {
  const requests = await queueResidenceResponses(page, [
    { body: partialResidenceResponse, status: 200 },
  ]);
  await context.grantPermissions(["geolocation"], { origin: baseURL });
  await context.setGeolocation({ latitude: 38.8977, longitude: -77.0365 });

  await page.goto("/dashboard");
  await expect(
    page.getByText("Current device location may not be your voting residence."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Your device coordinates are used only for this check and are not saved.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use this device once" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "Partial residence match. Review the coverage notes below.",
  );
  await expect(
    page.getByRole("heading", { name: "Partial political divisions" }),
  ).toBeVisible();
  await expect(page.getByText("Example County")).toBeVisible();
  await expect(page.getByText("Benchmark: Public_AR_Current")).toBeVisible();
  await expect(page.getByText("Vintage: Current_Current")).toBeVisible();
  await expect(
    page.getByText(
      "Census coverage is partial and may omit local political divisions.",
    ),
  ).toBeVisible();
  expect(requests).toEqual([
    { kind: "coordinates", latitude: 38.8977, longitude: -77.0365 },
  ]);

  const aria = await page.getByRole("region", { name: "Residence match" }).ariaSnapshot();
  expect(aria).toContain("Partial political divisions");
  expect(aria).toContain("U.S. Census Geocoder");
  await testInfo.attach("partial-residence-accessibility-tree", {
    body: aria,
    contentType: "text/yaml",
  });
});

test("preserves and refocuses manual input across every recoverable failure", async ({
  page,
}) => {
  const requests = await queueResidenceResponses(page, [
    { body: noMatchResidenceResponse, status: 200 },
    { body: ambiguousResidenceResponse, status: 200 },
    { body: unavailableResidenceResponse, status: 503 },
  ]);

  await page.goto("/dashboard");
  const address = page.getByLabel("Voting residence address");
  const submit = page.getByRole("button", { name: "Check residence" });
  await address.fill(manualAddress);

  for (const message of [
    "We could not match that residence. Check it and try again.",
    "That residence matched more than one place. Add more detail.",
    "Residence matching is temporarily unavailable. Try again later.",
  ]) {
    await submit.click();
    await expect(page.getByRole("status")).toHaveText(message);
    await expect(address).toHaveValue(manualAddress);
    await expect(address).toBeEnabled();
    await expect(address).toBeFocused();
    await expect(page.getByRole("region", { name: "Residence match" })).toHaveCount(0);
  }

  expect(requests).toEqual([
    { kind: "address", address: manualAddress },
    { kind: "address", address: manualAddress },
    { kind: "address", address: manualAddress },
  ]);
});

type QueuedResponse = {
  body:
    | typeof matchedResidenceResponse
    | typeof partialResidenceResponse
    | typeof noMatchResidenceResponse
    | typeof ambiguousResidenceResponse
    | typeof unavailableResidenceResponse;
  status: number;
};

async function queueResidenceResponses(page: Page, queue: QueuedResponse[]) {
  const requests: unknown[] = [];

  await page.route("**/api/v1/location/resolve", async (route: Route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["content-type"]).toContain("application/json");
    requests.push(route.request().postDataJSON());
    const response = queue.shift();
    expect(response).toBeDefined();
    await route.fulfill({
      body: JSON.stringify(response?.body),
      contentType: "application/json",
      headers: { "Cache-Control": "private, no-store" },
      status: response?.status,
    });
  });

  return requests;
}
