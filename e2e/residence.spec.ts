import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
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
  type ResidenceInput,
  type ResolutionErrorResponse,
  type ResolutionOutcome,
  type ResolutionResponse,
} from "../src/lib/residence";
import {
  ambiguousResidenceResponse,
  matchedResidenceResponse,
  noMatchResidenceResponse,
  partialResidenceResponse,
  unavailableResidenceResponse,
} from "../tests/fixtures/residence-responses";

type ResolvedResidence = Extract<
  ResolutionOutcome,
  { status: "matched" | "partial" }
>;

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
      body: signedResidenceResponse(
        { kind: "address", address: manualAddress },
        matchedResidenceResponse,
        primaryUserId,
      ),
      status: 200,
    },
  ]);
  const formEncodedPrivateUrl = new URL("/dashboard", baseURL);
  formEncodedPrivateUrl.search = new URLSearchParams({
    residence: manualAddress,
  }).toString();
  expect(formEncodedPrivateUrl.search).toContain("+");
  expect(decodedUrlPrivacySurface(formEncodedPrivateUrl.toString())).toContain(
    manualAddress,
  );

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

  await expect(residenceStatus(page)).toHaveText(
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

  const contrast = await measureContrast(page, {
    selectors: [
      ".residence-intro",
      ".residence-privacy",
      ".residence-status",
      ".residence-result h3",
      ".residence-form button",
      ".secondary-button",
    ],
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
    await page.screenshot({ fullPage: true, path });
    await testInfo.attach(viewport.name, { contentType: "image/png", path });
  }
});

test("uses device location once and labels Census coverage as partial", async ({
  context,
  page,
}, testInfo) => {
  const requests = await queueResidenceResponses(page, [
    {
      body: signedResidenceResponse(
        { kind: "coordinates", ...deviceCoordinates },
        partialResidenceResponse,
        primaryUserId,
      ),
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

  await expect(residenceStatus(page)).toHaveText(
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
  expect(savedResidenceRequests(privacy, "POST")).toHaveLength(0);
  expect(savedResidenceRequests(privacy, "DELETE")).toHaveLength(0);
  const postgres = await openPostgresInspection();
  try {
    if (postgres) {
      const raw = await readRawResidence(postgres, primaryUserId);
      expect(raw.parents).toHaveLength(0);
      expect(raw.divisions).toHaveLength(0);
    }
  } finally {
    await postgres?.pool.end();
  }
  await assertNoBrowserPersistence(
    context,
    page,
    privacy,
    [String(deviceCoordinates.latitude), String(deviceCoordinates.longitude)],
    {
      allowSavedResidenceUnavailable: true,
      authorizedRequests: [
        {
          body: { kind: "coordinates", ...deviceCoordinates },
          method: "POST",
          path: "/api/v1/location/resolve",
        },
      ],
    },
  );
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
    await expect(residenceStatus(page)).toHaveText(message);
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
  test.setTimeout(60_000);
  const responseA = signedResidenceResponse(
    { kind: "address", address: addressA },
    residenceA,
    primaryUserId,
  );
  const responseB = signedResidenceResponse(
    { kind: "address", address: addressB },
    residenceB,
    primaryUserId,
  );
  const saveRequestA = {
    address: addressA,
    consent: { accepted: true, version: "saved-residence-v1" },
    resolutionToken: responseA.resolutionToken,
  };
  const saveRequestB = {
    address: addressB,
    consent: { accepted: true, version: "saved-residence-v1" },
    resolutionToken: responseB.resolutionToken,
  };
  const resolutionRequests = await queueResidenceResponses(page, [
    { body: responseA, status: 200 },
    { body: responseB, status: 200 },
  ]);
  const privacy = await installPrivacyAudit(page);
  const postgres = await openPostgresInspection();

  try {
    await page.goto("/dashboard");
    const savedSection = page.locator("section.saved-residence");
    const saved = page.getByRole("region", {
      exact: true,
      name: "Saved residence",
    });
    const address = page.getByLabel("Voting residence address");

    await expect(page.getByText("Signed in as voter@example.invalid")).toBeVisible();
    await expect(
      savedSection.getByRole("heading", { name: "Saved residence" }),
    ).toBeVisible();
    await expect(savedSection.getByText("No residence is saved.")).toBeVisible();
    await expect(saved).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Save this residence" })).toHaveCount(0);
    expect(resolutionRequests).toHaveLength(0);

    await address.fill(addressA);
    await page.getByRole("button", { name: "Check residence" }).click();
    await expect(residenceStatus(page)).toHaveText(
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

    await expect(residenceStatus(page)).toHaveText(
      "Saved residence was saved.",
    );
    await expect(saved).toBeVisible();
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
    expect(
      JSON.parse(savedResidenceRequests(privacy, "POST")[0].postData ?? ""),
    ).toEqual(saveRequestA);

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

    if (postgres) {
      const rawA = await readRawResidence(postgres, primaryUserId);
      expect(rawA.parents).toHaveLength(1);
      expect(rawA.parents[0]).toMatchObject({
        envelope_version: "v1",
        key_version: legacyKeyVersion,
        resolution_status: "matched",
      });
      expect(rawA.parents[0].ciphertext).toBeTruthy();
      expect(rawA.parents[0].iv).toBeTruthy();
      expect(rawA.parents[0].tag).toBeTruthy();
      expect(rawA.divisions).toEqual(
        expectedRawDivisions(residenceA, primaryUserId),
      );
      assertRawPrivacy(rawA, [
        addressA,
        responseA.resolutionToken,
        String(deviceCoordinates.latitude),
        String(deviceCoordinates.longitude),
      ]);

    }

    await address.fill(addressB);
    await page.getByRole("button", { name: "Check residence" }).click();
    await expect(residenceStatus(page)).toHaveText(
      "Partial residence match. Review the coverage notes below.",
    );
    await expect(
      page.getByText(
        "Saving this residence replaces your existing saved residence. No prior residence history will be retained.",
      ),
    ).toBeVisible();
    await consent.check();
    await save.dblclick();
    await expect(residenceStatus(page)).toHaveText(
      "Saved residence was replaced.",
    );
    await expect(saved.getByText(addressB)).toBeVisible();
    await expect(saved.getByText("Replacement County")).toBeVisible();
    await expect(saved.getByText(addressA)).toHaveCount(0);
    expect(resolutionRequests).toHaveLength(2);
    expect(savedResidenceRequests(privacy, "POST")).toHaveLength(2);
    expect(
      JSON.parse(savedResidenceRequests(privacy, "POST")[1].postData ?? ""),
    ).toEqual(saveRequestB);

    if (postgres) {
      const rawB = await readRawResidence(postgres, primaryUserId);
      expect(rawB.parents).toHaveLength(1);
      expect(rawB.parents[0].key_version).toBe(legacyKeyVersion);
      expect(rawB.divisions).toEqual(
        expectedRawDivisions(residenceB, primaryUserId),
      );
      assertRawPrivacy(rawB, [
        addressA,
        addressB,
        responseA.resolutionToken,
        responseB.resolutionToken,
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
      expect(rotated.parents[0].ciphertext).not.toBe(
        rawB.parents[0].ciphertext,
      );
      expect(rotated.parents[0].iv).not.toBe(rawB.parents[0].iv);
      expect(rotated.parents[0].tag).not.toBe(rawB.parents[0].tag);
      expect(rotated.divisions).toEqual(rawB.divisions);
      assertRawPrivacy(rotated, [addressB, responseB.resolutionToken]);

      await page.reload();
      await expect(saved.getByText(addressB)).toBeVisible();
      await expect(saved.getByText("Replacement County")).toBeVisible();
      expect(resolutionRequests).toHaveLength(2);
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
    await expect(residenceStatus(page)).toHaveText(
      "Saved residence was deleted.",
    );
    await expect(savedSection.getByText("No residence is saved.")).toBeVisible();
    await expect(saved).toHaveCount(0);
    await expect(page.getByText("Signed in as voter@example.invalid")).toBeVisible();
    await expect(address).toBeFocused();
    expect(savedResidenceRequests(privacy, "DELETE")).toHaveLength(1);
    expect(resolutionRequests).toHaveLength(2);

    if (postgres) {
      const deleted = await readRawResidence(postgres, primaryUserId);
      expect(deleted.parents).toHaveLength(0);
      expect(deleted.divisions).toHaveLength(0);
    }

    await expectSavedGetCountStable(page, privacy, postgres ? 3 : 2);
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
      {
        authorizedRequests: [
          {
            body: { kind: "address", address: addressA },
            method: "POST",
            path: "/api/v1/location/resolve",
          },
          {
            body: saveRequestA,
            method: "POST",
            path: "/api/v1/residence",
          },
          {
            body: { kind: "address", address: addressB },
            method: "POST",
            path: "/api/v1/location/resolve",
          },
          {
            body: saveRequestB,
            method: "POST",
            path: "/api/v1/residence",
          },
        ],
      },
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
  const responseC = signedResidenceResponse(
    { kind: "address", address: addressC },
    residenceC,
    secondaryUserId,
  );
  const saveRequestC = {
    address: addressC,
    consent: { accepted: true, version: "saved-residence-v1" },
    resolutionToken: responseC.resolutionToken,
  };
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
    const savedSection = page.locator("section.saved-residence");
    const saved = page.getByRole("region", {
      exact: true,
      name: "Saved residence",
    });
    await expect(
      savedSection.getByRole("heading", { name: "Saved residence" }),
    ).toBeVisible();
    await expect(savedSection.getByText("No residence is saved.")).toBeVisible();
    await expect(saved).toHaveCount(0);

    const address = page.getByLabel("Voting residence address");
    await address.fill(addressC);
    await page.getByRole("button", { name: "Check residence" }).click();
    const consent = page.getByRole("checkbox", {
      name:
        "Save this residence to my account. voteGPT will encrypt the address and use these matched political divisions for personalization until I delete or replace it.",
    });
    await consent.check();
    await page.getByRole("button", { name: "Save residence" }).dblclick();
    await expect(residenceStatus(page)).toHaveText(
      "Saved residence was saved.",
    );
    await expect(saved).toBeVisible();
    await expect(saved.getByText(addressC)).toBeVisible();
    await expect(saved.getByText("Secondary State House District 3")).toBeVisible();
    expect(savedResidenceRequests(privacy, "POST")).toHaveLength(1);
    expect(
      JSON.parse(savedResidenceRequests(privacy, "POST")[0].postData ?? ""),
    ).toEqual(saveRequestC);
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

    await expectSavedGetCountStable(page, privacy, 1);
    assertNoProviderOrUnexpectedResolverTraffic(privacy, 1);
    await assertNoBrowserPersistence(
      context,
      page,
      privacy,
      [addressC, responseC.resolutionToken],
      {
        authorizedRequests: [
          {
            body: { kind: "address", address: addressC },
            method: "POST",
            path: "/api/v1/location/resolve",
          },
          {
            body: saveRequestC,
            method: "POST",
            path: "/api/v1/residence",
          },
        ],
      },
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

type AuthorizedPrivateRequest = {
  body: unknown;
  method: "POST";
  path: "/api/v1/location/resolve" | "/api/v1/residence";
};

type PrivacyAudit = {
  consoleMessages: Array<{ text: string; type: string }>;
  historyWrites: string[];
  navigations: string[];
  pageErrors: string[];
  requests: CapturedRequest[];
};

type RawResidenceParent = {
  ciphertext: string;
  consent_version: string;
  consented_at: Date;
  coverage_notes: string[];
  created_at: Date;
  envelope_version: string;
  iv: string;
  key_version: string;
  resolution_status: string;
  source_benchmark: string | null;
  source_checked_at: Date;
  source_effective_at: Date | null;
  source_name: string;
  source_url: string;
  source_vintage: string | null;
  tag: string;
  updated_at: Date;
  user_id: string;
};

type RawResidenceDivision = {
  display_order: number;
  division_id: string;
  id_scheme: string;
  name: string;
  type: string;
  user_id: string;
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
  input: ResidenceInput,
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
    ...createResolutionToken(input, resolution, userId, authSecret, new Date()),
  };
}

async function installPrivacyAudit(page: Page): Promise<PrivacyAudit> {
  const audit: PrivacyAudit = {
    consoleMessages: [],
    historyWrites: [],
    navigations: [],
    pageErrors: [],
    requests: [],
  };

  // Browser console is not Next.js stdout/stderr. Server non-logging is
  // executable in the saved-residence route test, which injects private
  // sentinels into persistence failures and spies console.error/warn/log;
  // provider tests independently spy every console method.
  page.on("console", (message) => {
    audit.consoleMessages.push({ text: message.text(), type: message.type() });
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

async function expectSavedGetCountStable(
  page: Page,
  audit: PrivacyAudit,
  expected: number,
) {
  expect(savedResidenceRequests(audit, "GET")).toHaveLength(expected);
  await page.waitForTimeout(1_250);
  expect(savedResidenceRequests(audit, "GET")).toHaveLength(expected);
}

function residenceStatus(page: Page) {
  return page.locator(".residence-preview").getByRole("status");
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
  options: {
    allowSavedResidenceUnavailable?: boolean;
    authorizedRequests: readonly AuthorizedPrivateRequest[];
  },
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
    consoleMessages: audit.consoleMessages,
    pageErrors: audit.pageErrors,
  });
  const documentText = (await page.locator("body").textContent()) ?? "";

  expect(
    options.allowSavedResidenceUnavailable
      ? audit.consoleMessages.filter(
          (message) =>
            !(
              message.type === "error" &&
              message.text ===
                "Failed to load resource: the server responded with a status of 503 (Service Unavailable)"
            )
        )
      : audit.consoleMessages,
  ).toEqual([]);
  expect(audit.pageErrors).toEqual([]);
  assertPrivateRequestBoundaries(audit, secrets, options.authorizedRequests);
  for (const secret of secrets) {
    for (const representation of [secret, encodeURIComponent(secret)]) {
      expect(persistentState).not.toContain(representation);
      expect(diagnostics).not.toContain(representation);
    }
    expect(documentText).not.toContain(secret);
  }
}

function assertPrivateRequestBoundaries(
  audit: PrivacyAudit,
  secrets: readonly string[],
  authorizedRequests: readonly AuthorizedPrivateRequest[],
) {
  for (const request of audit.requests) {
    const decodedUrl = decodedUrlPrivacySurface(request.url);
    for (const secret of secrets) {
      for (const representation of [secret, encodeURIComponent(secret)]) {
        expect(request.url).not.toContain(representation);
      }
      expect(decodedUrl).not.toContain(secret);
    }
    if (
      request.postData === null ||
      !secrets.some((secret) =>
        [secret, encodeURIComponent(secret)].some((representation) =>
          request.postData?.includes(representation),
        ),
      )
    ) {
      continue;
    }

    const parsedBody = JSON.parse(request.postData) as unknown;
    const path = new URL(request.url).pathname;
    expect(
      authorizedRequests.some(
        (authorized) =>
          authorized.method === request.method &&
          authorized.path === path &&
          isDeepStrictEqual(authorized.body, parsedBody),
      ),
      `${request.method} ${path} carried unapproved private data`,
    ).toBe(true);
  }
}

function decodedUrlPrivacySurface(value: string) {
  const url = new URL(value);
  const decodeComponent = (component: string) =>
    decodeURIComponent(component.replaceAll("+", " "));

  return [
    decodeComponent(url.pathname),
    ...Array.from(url.searchParams.entries()).flatMap(([name, entry]) => [
      name,
      entry,
    ]),
    decodeComponent(url.hash.slice(1)),
  ].join("\n");
}

async function assertSavedResponsiveAndAccessible(
  page: Page,
  testInfo: TestInfo,
) {
  const deleteSaved = page
    .getByRole("region", { exact: true, name: "Saved residence" })
    .getByRole("button", { name: "Delete saved residence" });
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
    const saved = page.getByRole("region", {
      exact: true,
      name: "Saved residence",
    });
    await saved.scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const visibleBoxes = (selector: string) =>
        Array.from(document.querySelectorAll(selector))
          .map((element) => element.getBoundingClientRect())
          .filter((box) => box.width > 0 && box.height > 0);
      const savedBoxes = visibleBoxes(".saved-residence");
      const previewBoxes = visibleBoxes(".residence-preview");
      if (savedBoxes.length === 0 || previewBoxes.length === 0) {
        throw new Error("Saved residence layout targets are missing.");
      }
      const inspectedBoxes = visibleBoxes(
        ".saved-residence, .saved-residence *, .residence-preview, .residence-preview *",
      );
      return {
        clippedNodes: inspectedBoxes.filter(
          (box) => box.left < 0 || box.right > innerWidth,
        ).length,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        inspectedNodes: inspectedBoxes.length,
        sectionsOverlap: savedBoxes.some((savedBox) =>
          previewBoxes.some(
            (previewBox) => savedBox.bottom > previewBox.top + 1,
          ),
        ),
      };
    });
    expect(layout.inspectedNodes).toBeGreaterThan(0);
    expect(layout).toMatchObject({
      clippedNodes: 0,
      horizontalOverflow: false,
      sectionsOverlap: false,
    });
    const path = testInfo.outputPath(`${viewport.name}.png`);
    await page.screenshot({ fullPage: true, path });
    await testInfo.attach(viewport.name, { contentType: "image/png", path });
  }
}

async function assertSavedContrast(page: Page, testInfo: TestInfo) {
  const contrast = await measureContrast(page, {
    textRoot: ".saved-residence",
  });
  for (const sample of contrast) {
    expect(sample.ratio, sample.selector).toBeGreaterThanOrEqual(4.5);
  }
  await testInfo.attach("saved-residence-computed-contrast", {
    body: JSON.stringify(contrast, null, 2),
    contentType: "application/json",
  });
}

async function measureContrast(
  page: Page,
  scope: { selectors?: readonly string[]; textRoot?: string },
) {
  return await page.evaluate((requestedScope) => {
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

    function visible(element: Element) {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    }

    let elements: Element[];
    if (requestedScope.textRoot) {
      const root = document.querySelector(requestedScope.textRoot);
      if (!root) {
        throw new Error(`Missing contrast root: ${requestedScope.textRoot}`);
      }
      elements = [root, ...Array.from(root.querySelectorAll("*"))].filter(
        (element) =>
          visible(element) &&
          (element.matches("a, button, label") ||
            Array.from(element.childNodes).some(
              (node) =>
                node.nodeType === Node.TEXT_NODE &&
                Boolean(node.textContent?.trim()),
            )),
      );
    } else {
      elements = (requestedScope.selectors ?? []).flatMap((selector) => {
        const matches = Array.from(document.querySelectorAll(selector)).filter(
          visible,
        );
        if (matches.length === 0) {
          throw new Error(`Missing contrast target: ${selector}`);
        }
        return matches;
      });
    }

    if (elements.length === 0) {
      throw new Error("Contrast scope contains no visible text targets.");
    }
    return elements.map((element, index) => {
      const foreground = getComputedStyle(element).color;
      const backdrop = background(element);
      const lighter = Math.max(luminance(foreground), luminance(backdrop));
      const darker = Math.min(luminance(foreground), luminance(backdrop));
      return {
        background: backdrop,
        foreground,
        ratio: (lighter + 0.05) / (darker + 0.05),
        selector: `${requestedScope.textRoot ?? "explicit"}:${element.tagName.toLowerCase()}[${index}]`,
      };
    });
  }, scope);
}

async function openPostgresInspection(): Promise<PostgresInspection | null> {
  const connectionString = process.env.DATABASE_URL;
  const hosted =
    process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  if (!connectionString || connectionString.startsWith("pglite://")) {
    if (hosted) {
      throw new Error(
        "Hosted residence E2E requires the authoritative PostgreSQL DATABASE_URL.",
      );
    }
    return null;
  }
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    throw new Error("Residence E2E DATABASE_URL is not PostgreSQL or PGlite.");
  }
  // The Playwright app and seed must inherit this same DATABASE_URL. The raw
  // row checks after browser mutations fail if either side points elsewhere.
  return { connectionString, pool: new Pool({ connectionString }) };
}

async function readRawResidence(
  inspection: PostgresInspection,
  userId: string,
): Promise<RawResidence> {
  const [parent, divisions] = await Promise.all([
    inspection.pool.query<RawResidenceParent>(
      `select * from "saved_residence" where "user_id" = $1`,
      [userId],
    ),
    inspection.pool.query<RawResidenceDivision>(
      `select * from "saved_residence_division" where "user_id" = $1
       order by "display_order" asc`,
      [userId],
    ),
  ]);
  return { divisions: divisions.rows, parents: parent.rows };
}

function expectedRawDivisions(
  residence: ResolvedResidence,
  userId: string,
): RawResidenceDivision[] {
  return residence.divisions.map((division, displayOrder) => ({
    display_order: displayOrder,
    division_id: division.id,
    id_scheme: division.idScheme,
    name: division.name,
    type: division.type,
    user_id: userId,
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
    let spawnError: Error | null = null;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 20_000);
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error("Saved residence rotation timed out and terminated."));
        return;
      }
      if (spawnError) {
        reject(spawnError);
        return;
      }
      resolveResult({ code, stderr, stdout });
    });
  });
}
