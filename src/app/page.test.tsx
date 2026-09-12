import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import Page from "./page"

describe("landing page", () => {
  it("presents an honest product promise with its trust principles", () => {
    render(<Page />)

    const main = screen.getByRole("main")
    expect(
      within(main)
        .getAllByRole("heading")
        .map((heading) => ({ level: heading.tagName, name: heading.textContent })),
    ).toEqual([
      { level: "H1", name: "Clear civic information, grounded in sources." },
      { level: "H2", name: "Built for trustworthy civic research" },
    ])
    expect(
      within(main).getByRole("heading", {
        level: 1,
        name: "Clear civic information, grounded in sources.",
      }),
    ).toBeInTheDocument()
    expect(
      within(main).getByText(
        /Civic coverage is limited.*California elections/i,
      ),
    ).toBeInTheDocument()
    expect(within(main).getByRole("link", { name: "Browse elections" })).toHaveAttribute("href", "/elections")

    const principles = within(main).getByRole("region", {
      name: "Built for trustworthy civic research",
    })
    expect(
      within(principles).getByRole("heading", {
        level: 2,
        name: "Built for trustworthy civic research",
      }),
    ).toBeInTheDocument()
    expect(
      within(principles).getByText("Sources stay visible."),
    ).toBeInTheDocument()
    expect(
      within(principles).getByText("Freshness stays explicit."),
    ).toBeInTheDocument()
    expect(
      within(principles).getByText(
        "AI may explain evidence; it does not determine civic facts.",
      ),
    ).toBeInTheDocument()
  })
})
