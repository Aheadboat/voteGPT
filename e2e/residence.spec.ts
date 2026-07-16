import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
  type TestInfo,
} from "@playwright/test";
import { Pool } from "pg";
import {
  createResolutionToken,
  type ResolutionErrorResponse,
  type ResolutionResponse,
  type ResolvedResidence,
} from "../src/lib/residence";
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
const primaryUserId = "e2e-user";
const secondarySessionToken = "e2e-secondary-session-token";
const secondaryUserId = "e2e-secondary-user";
const manualAddress = "123 Main St, Example, CA 90000";
const addressA = "101 Primary Residence Ave, Example, CA 90001";
const addressB = "202 Replacement Residence Blvd, Example, CA 90002";
const addressC = "303 Secondary Residence Ct, Example, CA 90003";
const deviceCoordinates = { latitude: 38.8977, longitude: -77.0365 };
const legacyKeyVersion = "e2e-legacy";
const currentKeyVersion = "e2e-current";
const legacyKey = Buffer.alloc(32, 17).toString("base64url");
const currentKey = Buffer.alloc(32, 29).toString("base64url");
const encryptionKeys = JSON.stringify([
  { version: legacyKeyVersion, key: legacyKey },
  { version: currentKeyVersion, key: currentKey },
]);

const residenceA = {
  status: "matched",
  divisions: [
    {
      type: "state",
      name: "Example State",
      id: "ocd-division/country:us/state:ex",
      idScheme: "ocd",
    },
    {
      type: "congressional_district",
      name: "Example Congressional District 1",
      id: "ocd-division/country:us/state:ex/cd:1",
      idScheme: "ocd",
    },
  ],
  source: {
    name: "Google Civic Information API",
    url: "https://developers.google.com/civic-information",
    checkedAt: "2026-07-16T12:00:00.000Z",
    effectiveAt: null,
  },
  coverageNotes: ["Local divisions may be unavailable."],
} as const satisfies ResolvedResidence;

const residenceB = {
  status: "partial",
  divisions: [
    {
      type: "county",
      name: "Replacement County",
      id: "99002",
      idScheme: "census",
    },
  ],
  source: {
    name: "U.S. Census Geocoder",
    url: "https://geocoding.geo.census.gov/geocoder/",
    checkedAt: "2026-07-16T12:05:00.000Z",
    effectiveAt: null,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
  },
  coverageNotes: [
    "Census coverage is partial and may omit local political divisions.",
  ],
} as const satisfies ResolvedResidence;

const residenceC = {
  status: "matched",
  divisions: [
    {
      type: "state_lower",
      name: "Secondary State House District 3",
      id: "ocd-division/country:us/state:ex/sldl:3",
      idScheme: "ocd",
    },
  ],
  source: {
    name: "Google Civic Information API",
    url: "https://developers.google.com/civic-information",
    checkedAt: "2026-07-16T12:10:00.000Z",
    effectiveAt: null,
  },
  coverageNotes: ["Local divisions may be unavailable."],
} as const satisfies ResolvedResidence;

test.beforeEach(async ({ context, page }) => {
  await installSessionCookie(context, sessionToken);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("resolves a manual residence with equal provenance and coverage", async ({
  page,
}, testInfo) => {
  const requests = await queueResidenceResponses(page, [
    {
      body: signedResidenceResponse(matchedResidenceResponse, primaryUserId),
      status: 200,
    },
  ]);

  await page.goto("/dashboard");

  await expect(page.getByText("Signed in as voter@example.invalid")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Preview your voting residence" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Your address is not saved unless you explicitly choose and consent to save it.",
    ),
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

  await expect(page.locator(".residence-status")).toHaveText(
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

  await expect(
    page.getByRole("region", {
      name: "Residence preview source and freshness",
    }),
  ).toBeVisible();
  const aria = await page
    .getByRole("region", { name: "Residence preview match" })
    .ariaSnapshot();
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
    {
      body: signedResidenceResponse(partialResidenceResponse, primaryUserId),
      status: 200,
    },
  ]);
  await context.grantPermissions(["geolocation"], { origin: baseURL });
  await context.setGeolocation(deviceCoordinates);
  const privacy = await installPrivacyAudit(page);

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

  await expect(page.locator(".residence-status")).toHaveText(
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
    { kind: "coordinates", ...deviceCoordinates },
  ]);

  await expect(
    page.getByRole("region", {
      name: "Residence preview source and freshness",
    }),
  ).toBeVisible();
  const aria = await page
    .getByRole("region", { name: "Residence preview match" })
    .ariaSnapshot();
  expect(aria).toContain("Partial political divisions");
  expect(aria).toContain("U.S. Census Geocoder");
  await testInfo.attach("partial-residence-accessibility-tree", {
    body: aria,
    contentType: "text/yaml",
  });
  await assertNoBrowserPersistence(context, page, privacy, [
    String(deviceCoordinates.latitude),
    String(deviceCoordinates.longitude),
  ], [], true);
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
    await expect(page.locator(".residence-status")).toHaveText(message);
    await expect(address).toHaveValue(manualAddress);
    await expect(address).toBeEnabled();
    await expect(address).toBeFocused();
    await expect(
      page.getByRole("region", { name: "Residence preview match" }),
    ).toHaveCount(0);
  }

  expect(requests).toEqual([
    { kind: "address", address: manualAddress },
    { kind: "address", address: manualAddress },
    { kind: "address", address: manualAddress },
  ]);
});

test("saves, reloads, rotates, replaces, and deletes one consented residence", async ({
  context,
  page,
}, testInfo) => {
  const responseA = signedResidenceResponse(residenceA, primaryUserId);
  const responseB = signedResidenceResponse(residenceB, primaryUserId);
  const resolutionRequests = await queueResidenceResponses(page, [
    { body: responseA, status: 200 },
    { body: responseB, status: 200 },
  ]);
  const privacy = await installPrivacyAudit(page);
  const postgres = await openPostgresInspection();

  try {
    await page.goto("/dashboard");
    const saved = page.getByRole("region", { name: "Saved residence" });
    const address = page.getByLabel("Voting residence address");

    await expect(page.getByText("Signed in as voter@example.invalid")).toBeVisible();
    await expect(saved.getByText("No residence is saved.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Save this residence" })).toHaveCount(0);
    expect(resolutionRequests).toHaveLength(0);

    await address.fill(addressA);
    await page.getByRole("button", { name: "Check residence" }).click();
    await expect(page.locator(".residence-status")).toHaveText(
      "Residence matched. Review the divisions and source below.",
    );

    const consent = page.getByRole("checkbox", {
      name:
        "Save this residence to my account. voteGPT will encrypt the address and use these matched political divisions for personalization until I delete or replace it.",
    });
    const save = page.getByRole("button", { name: "Save residence" });
    await expect(consent).toBeVisible();
    await expect(consent).not.toBeChecked();
    await expect(consent).toHaveJSProperty("tagName", "INPUT");
    await expect(consent).toHaveAttribute("type", "checkbox");
    await expect(save).toBeDisabled();
    await consent.check();
    await expect(save).toBeEnabled();
    await save.dblclick();

    await expect(page.locator(".residence-status")).toHaveText(
      "Saved residence was saved.",
    );
    await expect(saved.getByText(addressA)).toBeVisible();
    await expect(saved.getByText("Example State")).toBeVisible();
    await expect(
      saved.getByText("Example Congressional District 1"),
    ).toBeVisible();
    await expect(
      saved.getByRole("region", { name: "Saved residence source and freshness" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", {
        name: "Residence preview source and freshness",
      }),
    ).toBeVisible();
    expect(resolutionRequests).toHaveLength(1);
    expect(savedResidenceRequests(privacy, "POST")).toHaveLength(1);
    expect(JSON.parse(savedResidenceRequests(privacy, "POST")[0].postData ?? ""))
      .toEqual({
        address: addressA,
        consent: { accepted: true, version: "saved-residence-v1" },
        resolutionToken: responseA.resolutionToken,
      });

    const savedAria = await saved.ariaSnapshot();
    const previewAria = await page
      .getByRole("region", { name: "Residence preview match" })
      .ariaSnapshot();
    expect(savedAria).toContain("Saved residence source and freshness");
    expect(savedAria).toContain("Example State");
    expect(previewAria).toContain("Residence preview source and freshness");
    await testInfo.attach("saved-residence-accessibility-tree", {
      body: savedAria,
      contentType: "text/yaml",
    });

    await page.reload();
    await expect(saved.getByText(addressA)).toBeVisible();
    await expect(saved.getByText("Example State")).toBeVisible();
    await expect(saved.getByText("Example Congressional District 1")).toBeVisible();
    expect(resolutionRequests).toHaveLength(1);
    expect(savedResidenceRequests(privacy, "GET")).toHaveLength(2);

    await assertSavedResponsiveAndAccessible(page, testInfo);
    await assertSavedContrast(page, testInfo);

    let rawA: RawResidence | null = null;
    if (postgres) {
      rawA = await readRawResidence(postgres, primaryUserId);
      expect(rawA.parents).toHaveLength(1);
      expect(rawA.parents[0]).toMatchObject({
        envelope_version: "v1",
        key_version: legacyKeyVersion,
        resolution_status: "matched",
      });
      expect(rawA.parents[0].ciphertext).toBeTruthy();
      expect(rawA.parents[0].iv).toBeTruthy();
      expect(rawA.parents[0].tag).toBeTruthy();
      expect(rawA.divisions).toEqual(expectedRawDivisions(residenceA));
      assertRawPrivacy(rawA, [
        addressA,
        responseA.resolutionToken,
        String(deviceCoordinates.latitude),
        String(deviceCoordinates.longitude),
      ]);

      const rotation = await runRotation(postgres.connectionString);
      expect(rotation).toEqual({
        code: 0,
        stderr: "",
        stdout: '{"rotated":1,"skipped":0,"remaining":0}\n',
      });
      const rotated = await readRawResidence(postgres, primaryUserId);
      expect(rotated.parents).toHaveLength(1);
      expect(rotated.parents[0].key_version).toBe(currentKeyVersion);
      expect(rotated.parents[0].ciphertext).not.toBe(rawA.parents[0].ciphertext);
      expect(rotated.parents[0].iv).not.toBe(rawA.parents[0].iv);
      expect(rotated.parents[0].tag).not.toBe(rawA.parents[0].tag);
      expect(rotated.divisions).toEqual(expectedRawDivisions(residenceA));
      assertRawPrivacy(rotated, [addressA, responseA.resolutionToken]);

      await page.reload();
      await expect(saved.getByText(addressA)).toBeVisible();
      await expect(saved.getByText("Example State")).toBeVisible();
      expect(resolutionRequests).toHaveLength(1);
    }

    await address.fill(addressB);
    await page.getByRole("button", { name: "Check residence" }).click();
    await expect(page.locator(".residence-status")).toHaveText(
      "Partial residence match. Review the coverage notes below.",
    );
    await expect(
      page.getByText(
        "Saving this residence replaces your existing saved residence. No prior residence history will be retained.",
      ),
    ).toBeVisible();
    await consent.check();
    await save.dblclick();
    await expect(page.locator(".residence-status")).toHaveText(
      "Saved residence was replaced.",
    );
    await expect(saved.getByText(addressB)).toBeVisible();
    await expect(saved.getByText("Replacement County")).toBeVisible();
    await expect(saved.getByText(addressA)).toHaveCount(0);
    expect(resolutionRequests).toHaveLength(2);
    expect(savedResidenceRequests(privacy, "POST")).toHaveLength(2);
    expect(JSON.parse(savedResidenceRequests(privacy, "POST")[1].postData ?? ""))
      .toEqual({
        address: addressB,
        consent: { accepted: true, version: "saved-residence-v1" },
        resolutionToken: responseB.resolutionToken,
      });

    if (postgres) {
      const rawB = await readRawResidence(postgres, primaryUserId);
      expect(rawB.parents).toHaveLength(1);
      expect(rawB.divisions).toEqual(expectedRawDivisions(residenceB));
      assertRawPrivacy(rawB, [
        addressA,
        addressB,
        responseA.resolutionToken,
        responseB.resolutionToken,
        String(deviceCoordinates.latitude),
        String(deviceCoordinates.longitude),
      ]);
    }

    const deleteSaved = saved.getByRole("button", {
      name: "Delete saved residence",
    });
    await expect(deleteSaved).toHaveJSProperty("tagName", "BUTTON");
    await deleteSaved.click();
    await expect(
      saved.getByText(
        "Delete this saved address and its political divisions? Your account will remain.",
      ),
    ).toBeVisible();
    const confirm = saved.getByRole("button", { name: "Confirm deletion" });
    await expect(confirm).toHaveJSProperty("tagName", "BUTTON");
    await confirm.dblclick();
    await expect(page.locator(".residence-status")).toHaveText(
      "Saved residence was deleted.",
    );
    await expect(saved.getByText("No residence is saved.")).toBeVisible();
    await expect(page.getByText("Signed in as voter@example.invalid")).toBeVisible();
    await expect(address).toBeFocused();
    expect(savedResidenceRequests(privacy, "DELETE")).toHaveLength(1);
    expect(resolutionRequests).toHaveLength(2);

    if (postgres) {
      const deleted = await readRawResidence(postgres, primaryUserId);
      expect(deleted.parents).toHaveLength(0);
      expect(deleted.divisions).toHaveLength(0);
    }

    assertNoProviderOrUnexpectedResolverTraffic(privacy, 2);
    await assertNoBrowserPersistence(
      context,
      page,
      privacy,
      [
        addressA,
        addressB,
        responseA.resolutionToken,
        responseB.resolutionToken,
        String(deviceCoordinates.latitude),
        String(deviceCoordinates.longitude),
      ],
      [addressA, addressB],
    );
  } finally {
    await postgres?.pool.end();
  }
});

test("deleting a second account cascades its private residence and revokes its session", async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await installSessionCookie(context, secondarySessionToken);
  const responseC = signedResidenceResponse(residenceC, secondaryUserId);
  const resolutionRequests = await queueResidenceResponses(page, [
    { body: responseC, status: 200 },
  ]);
  const privacy = await installPrivacyAudit(page);
  const postgres = await openPostgresInspection();

  try {
    await page.goto("/dashboard");
    await expect(
      page.getByText("Signed in as secondary-voter@example.invalid"),
    ).toBeVisible();
    const saved = page.getByRole("region", { name: "Saved residence" });
    await expect(saved.getByText("No residence is saved.")).toBeVisible();

    const address = page.getByLabel("Voting residence address");
    await address.fill(addressC);
    await page.getByRole("button", { name: "Check residence" }).click();
    const consent = page.getByRole("checkbox", {
      name:
        "Save this residence to my account. voteGPT will encrypt the address and use these matched political divisions for personalization until I delete or replace it.",
    });
    await consent.check();
    await page.getByRole("button", { name: "Save residence" }).dblclick();
    await expect(page.locator(".residence-status")).toHaveText(
      "Saved residence was saved.",
    );
    await expect(saved.getByText(addressC)).toBeVisible();
    await expect(saved.getByText("Secondary State House District 3")).toBeVisible();
    expect(savedResidenceRequests(privacy, "POST")).toHaveLength(1);
    expect(resolutionRequests).toHaveLength(1);

    if (postgres) {
      const before = await readPrivateSubtree(postgres, secondaryUserId);
      expect(before).toEqual({
        accounts: 1,
        divisions: 1,
        residences: 1,
        sessions: 1,
        users: 1,
      });
      assertRawPrivacy(await readRawResidence(postgres, secondaryUserId), [
        addressC,
        responseC.resolutionToken,
      ]);
    }

    const confirmation = page.getByLabel('Type "DELETE" to confirm');
    await confirmation.fill("DELETE");
    const deleteAccount = page.getByRole("button", {
      name: "Delete my account",
    });
    await expect(deleteAccount).toHaveJSProperty("tagName", "BUTTON");
    await deleteAccount.dblclick();
    await expect(
      page.getByRole("heading", { name: "Account deleted" }),
    ).toBeVisible();
    await expect(page.getByText("Your account was deleted.")).toBeVisible();
    expect(accountDeleteRequests(privacy)).toHaveLength(1);
    await expect(saved).toHaveCount(0);

    const publicReturn = page.getByRole("link", {
      name: "Return to public information",
    });
    await expect(publicReturn).toHaveAttribute("href", "/");
    await publicReturn.click();
    await expect(page).toHaveURL(`${baseURL}/`);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(`${baseURL}/sign-in?next=%2Fdashboard`);

    if (postgres) {
      expect(await readPrivateSubtree(postgres, secondaryUserId)).toEqual({
        accounts: 0,
        divisions: 0,
        residences: 0,
        sessions: 0,
        users: 0,
      });
    }

    assertNoProviderOrUnexpectedResolverTraffic(privacy, 1);
    await assertNoBrowserPersistence(
      context,
      page,
      privacy,
      [addressC, responseC.resolutionToken],
      [addressC],
    );
  } finally {
    await postgres?.pool.end();
  }
});

type QueuedResponse = {
  body: ResolutionResponse | ResolutionErrorResponse;
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

type CapturedRequest = {
  method: string;
  postData: string | null;
  url: string;
};

type PrivacyAudit = {
  consoleErrors: string[];
  historyWrites: string[];
  navigations: string[];
  pageErrors: string[];
  requests: CapturedRequest[];
};

type RawResidenceParent = {
  ciphertext: string;
  envelope_version: string;
  iv: string;
  key_version: string;
  resolution_status: string;
  tag: string;
  user_id: string;
};

type RawResidenceDivision = {
  display_order: number;
  division_id: string;
  id_scheme: string;
  name: string;
  type: string;
};

type RawResidence = {
  divisions: RawResidenceDivision[];
  parents: RawResidenceParent[];
};

type PostgresInspection = {
  connectionString: string;
  pool: Pool;
};

async function installSessionCookie(
  context: BrowserContext,
  token: string,
) {
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

function signedResidenceResponse(
  source: ResolvedResidence | Extract<ResolutionResponse, { status: "matched" | "partial" }>,
  userId: string,
): Extract<ResolutionResponse, { status: "matched" | "partial" }> {
  const resolution: ResolvedResidence = {
    coverageNotes: [...source.coverageNotes],
    divisions: source.divisions.map((division) => ({ ...division })),
    source: { ...source.source },
    status: source.status,
  };

  return {
    ...resolution,
    ...createResolutionToken(resolution, userId, authSecret, new Date()),
  };
}

async function installPrivacyAudit(page: Page): Promise<PrivacyAudit> {
  const audit: PrivacyAudit = {
    consoleErrors: [],
    historyWrites: [],
    navigations: [],
    pageErrors: [],
    requests: [],
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      audit.consoleErrors.push(message.text());
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      audit.navigations.push(frame.url());
    }
  });
  page.on("pageerror", (error) => audit.pageErrors.push(error.message));
  page.on("request", (request) => {
    audit.requests.push({
      method: request.method(),
      postData: request.postData(),
      url: request.url(),
    });
  });
  await page.exposeFunction("__recordVoteGptHistory", (value: unknown) => {
    audit.historyWrites.push(String(value));
  });
  await page.addInitScript(() => {
    const record = (state: unknown, url?: string | URL | null) => {
      const boundWindow = window as typeof window & {
        __recordVoteGptHistory: (value: string) => Promise<void>;
      };
      void boundWindow
        .__recordVoteGptHistory(`${JSON.stringify(state)}\n${String(url ?? "")}`)
        .catch(() => undefined);
    };
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);
    history.pushState = (state, unused, url) => {
      record(state, url);
      originalPushState(state, unused, url);
    };
    history.replaceState = (state, unused, url) => {
      record(state, url);
      originalReplaceState(state, unused, url);
    };
  });

  return audit;
}

function savedResidenceRequests(audit: PrivacyAudit, method: string) {
  return audit.requests.filter(
    (request) =>
      request.method === method &&
      new URL(request.url).pathname === "/api/v1/residence",
  );
}

function accountDeleteRequests(audit: PrivacyAudit) {
  return audit.requests.filter(
    (request) =>
      request.method === "DELETE" &&
      new URL(request.url).pathname === "/api/account",
  );
}

function assertNoProviderOrUnexpectedResolverTraffic(
  audit: PrivacyAudit,
  expectedResolverRequests: number,
) {
  expect(
    audit.requests.filter(
      ({ url }) =>
        /googleapis\.com|census\.gov\/geocoder/i.test(url) &&
        !url.startsWith(baseURL),
    ),
  ).toEqual([]);
  expect(
    audit.requests.filter(
      ({ url }) => new URL(url).pathname === "/api/v1/location/resolve",
    ),
  ).toHaveLength(expectedResolverRequests);
}

async function assertNoBrowserPersistence(
  context: BrowserContext,
  page: Page,
  audit: PrivacyAudit,
  secrets: readonly string[],
  addressAllowedInOwnerDom: readonly string[] = [],
  allowSavedResidenceUnavailable = false,
) {
  const browserState = await page.evaluate(() => ({
    currentHistoryState: history.state,
    localStorage: Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index) ?? "";
        return [key, localStorage.getItem(key)];
      }),
    ),
    navigationEntries: performance
      .getEntriesByType("navigation")
      .map((entry) => entry.name),
    sessionStorage: Object.fromEntries(
      Array.from({ length: sessionStorage.length }, (_, index) => {
        const key = sessionStorage.key(index) ?? "";
        return [key, sessionStorage.getItem(key)];
      }),
    ),
  }));
  const persistentState = JSON.stringify({
    browserState,
    cookies: await context.cookies(),
    historyWrites: audit.historyWrites,
    navigations: audit.navigations,
    url: page.url(),
  });
  const diagnostics = JSON.stringify({
    consoleErrors: audit.consoleErrors,
    pageErrors: audit.pageErrors,
  });
  const documentText = (await page.locator("body").textContent()) ?? "";

  expect(
    allowSavedResidenceUnavailable
      ? audit.consoleErrors.filter(
          (message) =>
            message !==
            "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
        )
      : audit.consoleErrors,
  ).toEqual([]);
  expect(audit.pageErrors).toEqual([]);
  for (const secret of secrets) {
    for (const representation of [secret, encodeURIComponent(secret)]) {
      expect(persistentState).not.toContain(representation);
      expect(diagnostics).not.toContain(representation);
    }
    if (!addressAllowedInOwnerDom.includes(secret)) {
      expect(documentText).not.toContain(secret);
    }
  }
}

async function assertSavedResponsiveAndAccessible(
  page: Page,
  testInfo: TestInfo,
) {
  const deleteSaved = page.getByRole("region", { name: "Saved residence" }).getByRole(
    "button",
    { name: "Delete saved residence" },
  );
  await deleteSaved.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(deleteSaved).toBeFocused();
  const focus = await deleteSaved.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(focus.style).not.toBe("none");
  expect(Number.parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  for (const viewport of [
    { height: 812, name: "saved-mobile-375x812", width: 375 },
    { height: 720, name: "saved-desktop-1280x720", width: 1280 },
  ]) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    const saved = page.getByRole("region", { name: "Saved residence" });
    await saved.scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const savedRegion = document.querySelector(".saved-residence");
      const preview = document.querySelector(".residence-preview");
      if (!savedRegion || !preview) {
        throw new Error("Saved residence layout targets are missing.");
      }
      const savedBox = savedRegion.getBoundingClientRect();
      const previewBox = preview.getBoundingClientRect();
      const clippedControls = Array.from(
        document.querySelectorAll(".saved-residence a, .saved-residence button"),
      ).filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.left < 0 || box.right > innerWidth);
      }).length;
      return {
        clippedControls,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        sectionsOverlap: savedBox.bottom > previewBox.top + 1,
      };
    });
    expect(layout).toEqual({
      clippedControls: 0,
      horizontalOverflow: false,
      sectionsOverlap: false,
    });
    const path = testInfo.outputPath(`${viewport.name}.png`);
    await page.screenshot({ path });
    await testInfo.attach(viewport.name, { contentType: "image/png", path });
  }
}

async function assertSavedContrast(page: Page, testInfo: TestInfo) {
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
          (total, value, index) =>
            total + value * [0.2126, 0.7152, 0.0722][index],
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
      ".saved-residence-details > p",
      ".saved-residence .residence-result h3",
      ".saved-residence .residence-provenance a",
      ".saved-residence-details > button",
    ].map((selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing saved contrast target: ${selector}`);
      }
      const foreground = getComputedStyle(element).color;
      const backdrop = background(element);
      const lighter = Math.max(luminance(foreground), luminance(backdrop));
      const darker = Math.min(luminance(foreground), luminance(backdrop));
      return {
        ratio: (lighter + 0.05) / (darker + 0.05),
        selector,
      };
    });
  });
  for (const sample of contrast) {
    expect(sample.ratio, sample.selector).toBeGreaterThanOrEqual(4.5);
  }
  await testInfo.attach("saved-residence-computed-contrast", {
    body: JSON.stringify(contrast, null, 2),
    contentType: "application/json",
  });
}

async function openPostgresInspection(): Promise<PostgresInspection | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    return null;
  }
  return { connectionString, pool: new Pool({ connectionString }) };
}

async function readRawResidence(
  inspection: PostgresInspection,
  userId: string,
): Promise<RawResidence> {
  const [parent, divisions] = await Promise.all([
    inspection.pool.query<RawResidenceParent>(
      `select "user_id", "envelope_version", "key_version", "iv", "ciphertext", "tag", "resolution_status"
       from "saved_residence" where "user_id" = $1`,
      [userId],
    ),
    inspection.pool.query<RawResidenceDivision>(
      `select "type", "id_scheme", "division_id", "name", "display_order"
       from "saved_residence_division" where "user_id" = $1
       order by "display_order" asc`,
      [userId],
    ),
  ]);
  return { divisions: divisions.rows, parents: parent.rows };
}

function expectedRawDivisions(
  residence: ResolvedResidence,
): RawResidenceDivision[] {
  return residence.divisions.map((division, displayOrder) => ({
    display_order: displayOrder,
    division_id: division.id,
    id_scheme: division.idScheme,
    name: division.name,
    type: division.type,
  }));
}

function assertRawPrivacy(raw: RawResidence, secrets: readonly string[]) {
  const serialized = JSON.stringify(raw);
  for (const secret of secrets) {
    expect(serialized).not.toContain(secret);
  }
}

async function readPrivateSubtree(
  inspection: PostgresInspection,
  userId: string,
) {
  const result = await inspection.pool.query<{
    accounts: number;
    divisions: number;
    residences: number;
    sessions: number;
    users: number;
  }>(
    `select
       (select count(*)::int from "user" where "id" = $1) as "users",
       (select count(*)::int from "session" where "user_id" = $1) as "sessions",
       (select count(*)::int from "account" where "user_id" = $1) as "accounts",
       (select count(*)::int from "saved_residence" where "user_id" = $1) as "residences",
       (select count(*)::int from "saved_residence_division" where "user_id" = $1) as "divisions"`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Private subtree inspection returned no row.");
  }
  return row;
}

async function runRotation(connectionString: string): Promise<{
  code: number | null;
  stderr: string;
  stdout: string;
}> {
  return await new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [resolve(process.cwd(), "scripts/rotate-saved-residence-keys.mts")],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: connectionString,
          RESIDENCE_ENCRYPTION_ACTIVE_KEY: currentKeyVersion,
          RESIDENCE_ENCRYPTION_KEYS: encryptionKeys,
        },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let stderr = "";
    let stdout = "";
    child.stderr.setEncoding("utf8");
    child.stdout.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Saved residence rotation timed out."));
    }, 30_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolveResult({ code, stderr, stdout });
    });
  });
}
