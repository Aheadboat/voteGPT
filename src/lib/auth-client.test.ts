import { afterEach, expect, it, vi } from "vitest";

// Exercise the real client timeout rather than a mocked signIn method.
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("aborts an unresponsive sign-in request within fifteen seconds", async () => {
  vi.useFakeTimers();
  let aborted = false;
  vi.stubGlobal("fetch", (_input: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("Request aborted", "AbortError"));
    });
  }));
  const { authClient } = await import("./auth-client");
  let settled = false;
  const request = authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })
    .then(() => { settled = true; }, () => { settled = true; });
  await vi.advanceTimersByTimeAsync(15_000);

  expect(aborted).toBe(true);
  expect(settled).toBe(true);
  await request;
});
