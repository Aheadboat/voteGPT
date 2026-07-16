import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntimeAuth } from "@/lib/auth";
import type { SavedResidenceView } from "@/lib/saved-residence";
import { matchedResidenceResponse } from "../../../tests/fixtures/residence-responses";
import DashboardPage from "./page";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRuntimeAuth: vi.fn() }));

const ownerVisibleAddress = "123 Main Street, Springfield";
const savedResidence = {
  address: ownerVisibleAddress,
  resolution: {
    status: matchedResidenceResponse.status,
    divisions: matchedResidenceResponse.divisions,
    source: matchedResidenceResponse.source,
    coverageNotes: matchedResidenceResponse.coverageNotes,
  },
  consent: {
    version: "saved-residence-v1",
    acceptedAt: "2026-07-16T08:00:00.000Z",
  },
  createdAt: "2026-07-16T08:00:00.000Z",
  updatedAt: "2026-07-16T08:00:00.000Z",
} as const satisfies SavedResidenceView;

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

  it("removes saved-home UI after the account is deleted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (
          url === "/api/v1/residence" &&
          (!init?.method || init.method === "GET")
        ) {
          return Response.json({ status: "saved", residence: savedResidence });
        }

        if (url === "/api/account" && init?.method === "DELETE") {
          return new Response(null, { status: 204 });
        }

        throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
      }),
    );

    const page = await DashboardPage();
    render(page);

    await screen.findByText(ownerVisibleAddress, { exact: false });
    expect(
      screen.getByRole("region", { name: "Saved residence" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Type "DELETE" to confirm'), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(
      await screen.findByRole("heading", { name: "Account deleted" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText(ownerVisibleAddress, { exact: false }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "Saved residence" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Delete saved residence" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: "Return to public information" }),
    ).toHaveAttribute("href", "/");
  });
});
