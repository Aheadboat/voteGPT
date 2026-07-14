import { expect, test } from "@playwright/test";

test("keeps the public landing page anonymous and exposes sign-in choices", async ({
  page,
}) => {
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
