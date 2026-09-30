import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/components/sign-in-form";
import { AccountControls } from "@/components/account-controls";
import { SiteHeader } from "@/components/site-header";
import { authClient } from "@/lib/auth-client";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn(),
    signIn: {
      magicLink: vi.fn(),
      social: vi.fn(),
    },
  },
}));

describe("public identity shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps public information available without requesting identity data", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "voteGPT home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.queryByLabelText(/address|location/i)).not.toBeInTheDocument();
  });

  it("offers equal email and Google choices with explicit recovery", async () => {
    render(<SignInForm authError="INVALID_TOKEN" />);

    expect(
      screen.getByRole("heading", { name: "Sign in to your dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Public civic information remains available without an account."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByText(
          "That sign-in link is invalid or expired. Request a new one.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("describes provider failure without calling it an expired link", () => {
    render(<SignInForm authError="unable_to_get_user_info" />);

    expect(
      screen.getByText(
        "Sign-in did not complete. Try again or choose another method.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "That sign-in link is invalid or expired. Request a new one.",
      ),
    ).not.toBeInTheDocument();
  });

  it("requests a one-use link and confirms the next safe action", async () => {
    vi.mocked(authClient.signIn.magicLink).mockResolvedValue({
      data: { status: true },
      error: null,
    });
    render(<SignInForm />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "voter@example.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Email me a sign-in link" })
        .closest("form")!,
    );

    await waitFor(() =>
      expect(authClient.signIn.magicLink).toHaveBeenCalledWith({
        callbackURL: "/dashboard",
        email: "voter@example.com",
        errorCallbackURL: "/sign-in",
      }),
    );
    expect(
      screen.getByText(
        "Check your email. The link expires soon and can be used once.",
      ),
    ).toBeInTheDocument();
  });

  it("recovers from an offline email request without losing the address", async () => {
    vi.mocked(authClient.signIn.magicLink).mockRejectedValueOnce(new Error("offline"));
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "voter@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    await waitFor(() => expect(screen.getByText(
      "We could not reach the sign-in service. Check your connection and try again.",
    )).toBeInTheDocument());
    expect(screen.getByLabelText("Email address")).toHaveValue("voter@example.com");
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("recovers from an offline Google request", async () => {
    vi.mocked(authClient.signIn.social).mockRejectedValueOnce(new Error("offline"));
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(screen.getByText(
      "We could not reach the sign-in service. Check your connection and try again.",
    )).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("offers a retry if Google navigation does not leave the page", async () => {
    vi.mocked(authClient.signIn.social).mockResolvedValue({
      data: { redirect: true, url: "https://accounts.google.com/o/oauth2/v2/auth" },
      error: null,
    });
    render(<SignInForm />);
    vi.stubGlobal("window", { document, location: { assign: vi.fn() } });
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(screen.getByRole("button", {
      name: "Continue with Google",
    })).toBeEnabled());
    expect(screen.getByText("Google should open in this tab. If it does not, try again.")).toBeInTheDocument();
  });

  it("shows only available sign-in methods", () => {
    render(<SignInForm methods={{ email: false, google: true }} />);
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(screen.queryByText("or")).not.toBeInTheDocument();
  });

  it("keeps public information reachable when no method is configured", () => {
    render(<SignInForm methods={{ email: false, google: false }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Sign-in is not available right now. You can still browse public information.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse public information" })).toHaveAttribute("href", "/");
  });

  it("shows which request is pending and ignores repeated submissions", async () => {
    let complete!: (value: { data: { status: boolean }; error: null }) => void;
    vi.mocked(authClient.signIn.magicLink).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "voter@example.com" } });
    const form = screen.getByRole("button", { name: "Email me a sign-in link" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(screen.getByText("Sending your sign-in link…")).toBeInTheDocument();
    expect(authClient.signIn.magicLink).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    complete({ data: { status: true }, error: null });
    await waitFor(() => expect(screen.getByText("Check your email. The link expires soon and can be used once.")).toBeInTheDocument());
  });

  it("preserves a safe destination across Google initiation and recovery", async () => {
    vi.mocked(authClient.signIn.social).mockResolvedValue({ data: null, error: { message: "unavailable", status: 503, statusText: "Unavailable" } });
    render(<SignInForm methods={{ email: false, google: true }} callbackURL="/dashboard?level=state&mode=in-office&category=legislature" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(screen.getByText("Google sign-in did not complete. Try again.")).toBeInTheDocument());
    expect(authClient.signIn.social).toHaveBeenCalledWith({
      callbackURL: "/dashboard?level=state&mode=in-office&category=legislature",
      errorCallbackURL: "/sign-in?next=%2Fdashboard%3Flevel%3Dstate%26mode%3Din-office%26category%3Dlegislature",
      disableRedirect: true,
      provider: "google",
    }, { signal: expect.any(AbortSignal) });
  });

  it("requires typed confirmation before account deletion", () => {
    render(<AccountControls />);

    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(
      screen.getByText(/sessions.*linked sign-in methods/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /(?:permanently (?:removes?|deletes?).*saved home|saved home.*permanently (?:removed|deleted))/i,
      ),
    ).toBeInTheDocument();

    const deleteButton = screen.getByRole("button", {
      name: "Delete my account",
    });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Type "DELETE" to confirm'), {
      target: { value: "DELETE" },
    });
    expect(deleteButton).toBeEnabled();
  });

  it("recovers when account deletion cannot reach the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<AccountControls />);

    fireEvent.change(screen.getByLabelText('Type "DELETE" to confirm'), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "We could not reach the server. Your account was not deleted. Try again.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Delete my account" }),
    ).toBeEnabled();
  });

  it("confirms deletion before offering a return to public information", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
    render(<AccountControls />);

    fireEvent.change(screen.getByLabelText('Type "DELETE" to confirm'), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    await waitFor(() =>
      expect(
        screen.getByText("Your account was deleted."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "Account deleted" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("link", { name: "Return to public information" }),
    ).toHaveAttribute("href", "/");
  });
});
