import { expect, test } from "@playwright/test";

test("keeps the public landing page anonymous and exposes sign-in choices", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your dashboard" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`sign-in-${viewport.width}.png`), fullPage: true });
  }
});

test("redirects an anonymous dashboard request to a recoverable sign-in", async ({
  page,
}) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your dashboard" }),
  ).toBeVisible();
});

test("explains an invalid or expired link without hiding alternatives", async ({
  page,
}) => {
  await page.goto("/sign-in?error=INVALID_TOKEN");

  await expect(
    page.getByText("That sign-in link is invalid or expired. Request a new one."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
});

test("distinguishes a provider failure from an expired email link", async ({
  page,
}) => {
  await page.goto("/sign-in?error=unable_to_get_user_info");

  await expect(
    page.getByText("Sign-in did not complete. Try again or choose another method."),
  ).toBeVisible();
  await expect(
    page.getByText("That sign-in link is invalid or expired. Request a new one."),
  ).toHaveCount(0);
});

test("keeps the primary sign-in flow in a visible keyboard order", async ({
  page,
}) => {
  await page.goto("/sign-in");

  for (const target of [
    page.getByRole("link", { name: "Skip to main content" }),
    page.getByRole("link", { name: "voteGPT home" }),
    page.getByRole("link", { name: "Sign in" }),
    page.getByLabel("Email address"),
    page.getByRole("button", { name: "Email me a sign-in link" }),
    page.getByRole("button", { name: "Continue with Google" }),
  ]) {
    await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
  }
});

test("recovers both sign-in methods from a network interruption", async ({ page }) => {
  await page.route("**/api/auth/sign-in/**", (route) => route.abort("internetdisconnected"));
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByText("We could not reach the sign-in service. Check your connection and try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();

  await page.getByLabel("Email address").fill("voter@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("We could not reach the sign-in service. Check your connection and try again.")).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue("voter@example.com");
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Browse public information" })).toHaveAttribute("href", "/");
});

test("does not initiate another Google request while one is pending", async ({ page }) => {
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/auth/sign-in/social", async (route) => {
    requests += 1;
    await pending;
    await route.fulfill({ status: 503, json: { message: "Temporarily unavailable" } });
  });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).dblclick();
  await expect(page.getByText("Connecting to Google…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();
  expect(requests).toBe(1);
  release();
  await expect(page.getByText("Google sign-in did not complete. Try again or use email.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
});

test("keeps sign-in return navigation on the application dashboard", async ({ page }) => {
  let submitted: Record<string, string> | undefined;
  await page.route("**/api/auth/sign-in/magic-link", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { status: true } });
  });
  await page.goto("/sign-in?next=https%3A%2F%2Fattacker.example");
  await page.getByLabel("Email address").fill("voter@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email. The link expires soon and can be used once.")).toBeVisible();
  expect(submitted).toMatchObject({ callbackURL: "/dashboard", errorCallbackURL: "/sign-in" });
});

test("leaving sign-in cancels a delayed Google response", async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  const requested = new Promise<void>((resolve) => { started = resolve; });
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let googleRequests = 0;
  await page.route("https://accounts.google.com/**", async (route) => {
    googleRequests += 1;
    await route.abort();
  });
  await page.route("**/api/auth/sign-in/social", async (route) => {
    started();
    await pending;
    // An aborted route can no longer accept a response. If it is still live,
    // this deliberately delayed response must not navigate away from home.
    await route.fulfill({ json: {
      redirect: true,
      url: "https://accounts.google.com/o/oauth2/v2/auth?state=fixture",
    } }).catch(() => undefined);
  });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await requested;
  await page.getByRole("link", { name: "Browse public information" }).click();
  await expect(page).toHaveURL("/");
  release();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL("/");
  expect(googleRequests).toBe(0);
});
