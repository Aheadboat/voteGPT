import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  return { fetch };
});

// Keep the real Better Auth client and its response plugins in this regression.
import { SignInForm } from "@/components/sign-in-form";
import { SiteHeader } from "@/components/site-header";

const browserWindow = window;
const googleURL = "https://accounts.google.com/o/oauth2/v2/auth?state=fixture";

beforeEach(() => {
  network.fetch.mockReset();
  browserWindow.history.replaceState(null, "", "/sign-in");
});
afterEach(() => {
  vi.stubGlobal("window", browserWindow);
  browserWindow.history.replaceState(null, "", "/");
  vi.useRealTimers();
});
afterAll(() => { vi.unstubAllGlobals(); });

function observeNavigation() {
  const location = {
    href: "http://localhost:3000/",
    assign: vi.fn((url: string) => { location.href = url; }),
  };
  vi.stubGlobal("window", { location });
  return location;
}

function delayResponse() {
  let complete!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  network.fetch.mockImplementationOnce((_input: RequestInfo | URL, options?: RequestInit) => {
    signal = options?.signal ?? undefined;
    // Deliberately allow late completion after abort to test the stale guard,
    // not just a cooperative fetch mock's cancellation behavior.
    return new Promise<Response>((resolve) => { complete = resolve; });
  });
  return { complete: (url = googleURL) => complete(Response.json({ redirect: true, url })), signal: () => signal };
}

describe("Google navigation lifetime", () => {
  it("does not override a newer navigation when a response arrives after unmount", async () => {
    const response = delayResponse();
    const view = render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(network.fetch).toHaveBeenCalledTimes(1));
    view.unmount();
    const location = observeNavigation();
    await act(async () => { response.complete(); });

    expect(location.href).toBe("http://localhost:3000/");
    expect(location.assign).not.toHaveBeenCalled();
    expect(response.signal()?.aborted).toBe(true);
  });

  it("cancels as soon as public navigation is chosen, before unmount commits", async () => {
    const response = delayResponse();
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(network.fetch).toHaveBeenCalledTimes(1));
    const publicLink = screen.getByRole("link", { name: "Browse public information" });
    publicLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(publicLink);
    const location = observeNavigation();
    await act(async () => { response.complete(); });

    expect(location.href).toBe("http://localhost:3000/");
    expect(response.signal()?.aborted).toBe(true);
  });

  it("cancels header navigation before a delayed route transition unmounts the form", async () => {
    const response = delayResponse();
    render(<><SiteHeader /><SignInForm /></>);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(network.fetch).toHaveBeenCalledTimes(1));
    const homeLink = screen.getByRole("link", { name: "voteGPT home" });
    homeLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(homeLink);
    const location = observeNavigation();
    await act(async () => { response.complete(); });

    expect(location.href).toBe("http://localhost:3000/");
    expect(response.signal()?.aborted).toBe(true);
  });

  it.each(["pagehide", "popstate"])("cancels on %s before a response can redirect", async (event) => {
    const response = delayResponse();
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(network.fetch).toHaveBeenCalledTimes(1));
    act(() => { browserWindow.dispatchEvent(new Event(event)); });
    const location = observeNavigation();
    await act(async () => { response.complete(); });
    expect(location.href).toBe("http://localhost:3000/");
    expect(response.signal()?.aborted).toBe(true);
  });

  it.each([
    { href: "/", target: "_blank", ctrlKey: false },
    { href: "/", target: "", ctrlKey: true },
    { href: "#main-content", target: "", ctrlKey: false },
  ])("keeps the current attempt for a new-tab or fragment-only link %#", async ({ href, target, ctrlKey }) => {
    const response = delayResponse();
    render(<><a href={href} target={target}>Other destination</a><SignInForm /></>);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(network.fetch).toHaveBeenCalledTimes(1));
    const link = screen.getByRole("link", { name: "Other destination" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link, { ctrlKey });
    expect(response.signal()?.aborted).toBe(false);
    const location = observeNavigation();
    await act(async () => { response.complete(); });
    expect(location.assign).toHaveBeenCalledExactlyOnceWith(googleURL);
  });

  it("ignores the cancelled response while a newer attempt remains pending", async () => {
    const oldResponse = delayResponse();
    const newResponse = delayResponse();
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(network.fetch).toHaveBeenCalledTimes(1));
    const publicLink = screen.getByRole("link", { name: "Browse public information" });
    publicLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(publicLink);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(network.fetch).toHaveBeenCalledTimes(2));
    const location = observeNavigation();
    await act(async () => { oldResponse.complete(); });
    expect(location.href).toBe("http://localhost:3000/");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    await act(async () => { newResponse.complete(); });
    expect(location.assign).toHaveBeenCalledExactlyOnceWith(googleURL);
  });

  it("explicitly redirects only the current request to the Google authorization endpoint", async () => {
    const response = delayResponse();
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(network.fetch).toHaveBeenCalledTimes(1));
    const request = network.fetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ disableRedirect: true });
    const location = observeNavigation();
    await act(async () => { response.complete(); });

    expect(location.assign).toHaveBeenCalledExactlyOnceWith(googleURL);
  });

  it.each(["https://attacker.example", "http://accounts.google.com/o/oauth2/v2/auth", "https://accounts.google.com.evil.example/o/oauth2/v2/auth"])("rejects an unexpected provider destination %s", async (url) => {
    const response = delayResponse();
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(network.fetch).toHaveBeenCalledTimes(1));
    const location = observeNavigation();
    await act(async () => { response.complete(url); });

    expect(location.href).toBe("http://localhost:3000/");
    expect(location.assign).not.toHaveBeenCalled();
    expect(screen.getByText("Google sign-in did not complete. Try again or use email.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("retains a fifteen-second deadline when the request can be cancelled on unmount", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    network.fetch.mockImplementationOnce((_input: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = options?.signal ?? undefined;
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(screen.getByText("We could not reach the sign-in service. Check your connection and try again.")).toBeInTheDocument();
  });
});
