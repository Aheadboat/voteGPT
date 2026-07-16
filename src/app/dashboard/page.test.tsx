import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntimeAuth } from "@/lib/auth";
import DashboardPage from "./page";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRuntimeAuth: vi.fn() }));

describe("signed-in dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(
      new Headers({
        cookie: "better-auth.session_token=synthetic-session",
      }) as never,
    );
    vi.mocked(getRuntimeAuth).mockResolvedValue({
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: { email: "voter@example.test" },
        }),
      },
    } as never);
  });

  it("keeps saved-home account state before one manual-first residence preview", async () => {
    const page = await DashboardPage();
    render(page);

    expect(redirect).not.toHaveBeenCalled();
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { name: "Your dashboard" }),
    ).toBeInTheDocument();
    const savedResidenceHeading = within(main).getByRole("heading", {
      name: "Saved residence",
    });
    const previewHeading = within(main).getByRole("heading", {
      name: "Preview your voting residence",
    });
    expect(
      savedResidenceHeading.compareDocumentPosition(previewHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(main).getByRole("textbox", {
        name: "Voting residence address",
      }),
    ).toBeInTheDocument();
    expect(
      within(main).getByRole("button", { name: "Use this device once" }),
    ).toBeInTheDocument();
  });
});
