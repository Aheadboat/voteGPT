import { expect, test } from "@playwright/test"

const pageHeading = "Clear civic information, grounded in sources."
const principlesHeading = "Built for trustworthy civic research"

test("serves the exact uncached health response from the production server", async ({
  request,
}) => {
  const response = await request.get("/api/health")

  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toContain("application/json")
  expect(response.headers()["cache-control"]).toBe("no-store")
  expect(await response.text()).toBe('{"status":"ok"}')
})

test("boots the production app and navigates to its trust principles", async ({
  page,
}) => {
  await page.goto("/")

  await expect(page).toHaveTitle("voteGPT | Civic information grounded in sources")
  await expect(
    page.getByRole("heading", { level: 1, name: pageHeading }),
  ).toBeVisible()

  await page.getByRole("link", { name: "How voteGPT works" }).click()

  await expect(page).toHaveURL(/#principles$/)
  await expect(
    page.getByRole("heading", { level: 2, name: principlesHeading }),
  ).toBeVisible()
})

test("keeps its promise and native navigation usable without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()

  try {
    await page.goto("/")
    await expect(
      page.getByRole("heading", { level: 1, name: pageHeading }),
    ).toBeVisible()

    await page.getByRole("link", { name: "How voteGPT works" }).click()

    await expect(page).toHaveURL(/#principles$/)
    await expect(
      page.getByRole("heading", { level: 2, name: principlesHeading }),
    ).toBeVisible()
  } finally {
    await context.close()
  }
})
