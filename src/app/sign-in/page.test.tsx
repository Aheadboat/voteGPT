import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SignInPage from "./page";

vi.mock("@/lib/auth", () => ({
  getSignInMethods: () => ({ email: false, google: true }),
}));
vi.mock("@/components/sign-in-form", () => ({
  SignInForm: (props: Record<string, unknown>) => <output>{JSON.stringify(props)}</output>,
}));

async function propsFor(next?: string | string[]) {
  render(await SignInPage({ searchParams: Promise.resolve({ next, error: "access_denied" }) }));
  return JSON.parse(screen.getByRole("status").textContent!);
}

describe("sign-in page", () => {
  it("offers only server-configured sign-in methods", async () => {
    expect(await propsFor()).toMatchObject({ methods: { email: false, google: true }, authError: "access_denied" });
  });

  it("preserves a known dashboard destination without arbitrary query data", async () => {
    expect(await propsFor("/dashboard?level=state&mode=in-office&address=private"))
      .toMatchObject({ callbackURL: "/dashboard?level=state&mode=in-office&category=legislature" });
  });

  it.each([
    "https://attacker.example", "//attacker.example", "/\\attacker.example", "/sign-in", "/api/auth/sign-out",
    "/dashboard/../sign-in", "/dashboard%3flevel=state", ["/dashboard", "https://attacker.example"],
  ])("uses the dashboard for an unsafe return target %#", async (next) => {
    expect(await propsFor(next)).toMatchObject({ callbackURL: "/dashboard" });
  });
});
