import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ambiguousResidenceResponse,
  forbiddenResidenceResponse,
  invalidResidenceResponse,
  matchedResidenceResponse,
  noMatchResidenceResponse,
  partialResidenceResponse,
  unauthenticatedResidenceResponse,
  unavailableResidenceResponse,
} from "../../tests/fixtures/residence-responses";
import type { ResolutionResponse } from "@/lib/residence";
import type { SavedResidenceView } from "@/lib/saved-residence";
import { ResidencePreview } from "./residence-preview";

const address = "742 Evergreen Terrace, Springfield";
const savedAddress = "123 Main Street, Springfield";
const savedEndpoint = "/api/v1/residence";
const resolveEndpoint = "/api/v1/location/resolve";
const consentCopy =
  "Save this residence to my account. voteGPT will encrypt the address and use these matched political divisions for personalization until I delete or replace it.";
const coordinateInput = {
  kind: "coordinates",
  latitude: 38.8977,
  longitude: -77.0365,
};
const savedResidence = {
  address: savedAddress,
  resolution: {
    status: matchedResidenceResponse.status,
    divisions: matchedResidenceResponse.divisions,
    source: matchedResidenceResponse.source,
    coverageNotes: matchedResidenceResponse.coverageNotes,
  },
  consent: {
    version: "saved-residence-v1",
    acceptedAt: "2026-07-14T20:01:00.000Z",
  },
  createdAt: "2026-07-14T20:01:00.000Z",
  updatedAt: "2026-07-14T20:01:00.000Z",
} as const satisfies SavedResidenceView;
const replacementSavedResidence = {
  ...savedResidence,
  address,
  consent: {
    version: "saved-residence-v1",
    acceptedAt: "2026-07-14T20:05:00.000Z",
  },
  updatedAt: "2026-07-14T20:05:00.000Z",
} as const satisfies SavedResidenceView;
const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation",
);

function jsonResponse(
  body: unknown,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function installGeolocation(
  implementation: Geolocation["getCurrentPosition"] = vi.fn(),
) {
  const getCurrentPosition = vi.fn(implementation);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  return getCurrentPosition;
}

function enterAddress(value = address) {
  const input = screen.getByRole("textbox", {
    name: "Voting residence address",
  });
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest("form")!);
  return input;
}

function geolocationPosition(
  latitude: number,
  longitude: number,
): GeolocationPosition {
  return {
    coords: {
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude,
      longitude,
      speed: null,
      toJSON: () => ({ latitude, longitude }),
    },
    timestamp: 0,
    toJSON: () => ({ latitude, longitude }),
  };
}

function geolocationError(code: 1 | 2 | 3): GeolocationPositionError {
  return {
    code,
    message: "Fixture device error",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Response>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, reject, resolve };
}

type FetchRouteHandler = (init: RequestInit | undefined) =>
  | Response
  | Promise<Response>;

function installResidenceFetch(
  routes: {
    savedGet?: FetchRouteHandler;
    resolve?: FetchRouteHandler;
    save?: FetchRouteHandler;
    remove?: FetchRouteHandler;
  } = {},
) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === savedEndpoint && method === "GET") {
      return (routes.savedGet ??
        (() => jsonResponse({ status: "empty" })))(init);
    }
    if (url === resolveEndpoint && method === "POST" && routes.resolve) {
      return routes.resolve(init);
    }
    if (url === savedEndpoint && method === "POST" && routes.save) {
      return routes.save(init);
    }
    if (url === savedEndpoint && method === "DELETE" && routes.remove) {
      return routes.remove(init);
    }
    throw new Error(`Unexpected test request: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("residence preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    if (originalGeolocation) {
      Object.defineProperty(navigator, "geolocation", originalGeolocation);
    } else {
      Reflect.deleteProperty(navigator, "geolocation");
    }
  });

  it("keeps manual entry primary, loads saved home, and never resolves location on mount or a timer", () => {
    vi.useFakeTimers();
    const fetchMock = installResidenceFetch();
    const getCurrentPosition = installGeolocation();

    render(<ResidencePreview />);

    expect(
      screen.getByRole("heading", { name: "Preview your voting residence" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter your voting residence to match it with political divisions.",
      ),
    ).toBeInTheDocument();
    const addressPrivacy = screen.getByText(
      /address.*(?:not saved|saved only)/i,
    );
    expect(addressPrivacy).toHaveTextContent(/consent|choose|opt in/i);

    const input = screen.getByRole("textbox", {
      name: "Voting residence address",
    });
    expect(input).toHaveAttribute("autocomplete", "street-address");
    expect(input).toHaveAttribute("maxlength", "300");

    const deviceButton = screen.getByRole("button", {
      name: "Use this device once",
    });
    expect(
      input.compareDocumentPosition(deviceButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Current device location may not be your voting residence.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your device coordinates are used only for this check and are not saved.",
      ),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/residence");
    expect(fetchMock.mock.calls[0][1]?.method ?? "GET").toBe("GET");
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/v1/location/resolve"),
      ),
    ).toBe(false);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("offers unchecked exact consent only after a manual preview, never a device preview", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    let resolutionCount = 0;
    installResidenceFetch({
      resolve: () => {
        resolutionCount += 1;
        return jsonResponse(
          resolutionCount === 1
            ? matchedResidenceResponse
            : partialResidenceResponse,
        );
      },
    });
    installGeolocation((success) => {
      success(
        geolocationPosition(
          coordinateInput.latitude,
          coordinateInput.longitude,
        ),
      );
    });

    render(<ResidencePreview />);
    await screen.findByText(/No residence (?:is )?saved/i);
    enterAddress();

    const consent = await screen.findByRole("checkbox", {
      name: consentCopy,
    });
    expect(consent).not.toBeChecked();
    const saveButton = screen.getByRole("button", { name: "Save residence" });
    expect(saveButton).toBeDisabled();
    fireEvent.click(consent);
    expect(saveButton).toBeEnabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Use this device once" }),
    );
    await screen.findByRole("heading", {
      name: "Partial political divisions",
    });
    expect(
      screen.queryByRole("checkbox", { name: /Save this residence/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();

    enterAddress();
    const partialConsent = await screen.findByRole("checkbox", {
      name: consentCopy,
    });
    expect(partialConsent).not.toBeChecked();
  });

  it("withholds a completed manual candidate until saved-home loading settles", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    const savedRequest = deferredResponse();
    const fetchMock = installResidenceFetch({
      savedGet: () => savedRequest.promise,
      resolve: () => jsonResponse(matchedResidenceResponse),
    });
    installGeolocation();

    render(<ResidencePreview />);

    const savedHeading = screen.getByRole("heading", {
      name: "Saved residence",
    });
    const previewHeading = screen.getByRole("heading", {
      name: "Preview your voting residence",
    });
    expect(
      savedHeading.compareDocumentPosition(previewHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText(/Loading saved residence/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/residence");
    expect(fetchMock.mock.calls[0][1]?.method ?? "GET").toBe("GET");

    enterAddress();
    await screen.findByRole("region", {
      name: /^(?:Residence match|Residence preview match)$/i,
    });
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();

    await act(async () => {
      savedRequest.resolve(jsonResponse({ status: "empty" }));
    });
    expect(await screen.findByText(/No residence (?:is )?saved/i)).toBeVisible();
    expect(
      await screen.findByRole("checkbox", { name: consentCopy }),
    ).not.toBeChecked();
  });

  it("renders the owner saved address with provenance, freshness, coverage, and consent time", async () => {
    installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
    });
    installGeolocation();

    render(<ResidencePreview />);

    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    expect(within(saved).getByText(savedAddress)).toBeVisible();
    expect(
      within(saved).getByText("Example Congressional District 1"),
    ).toBeVisible();
    expect(
      within(saved).getByRole("link", { name: "Google Civic Information API" }),
    ).toHaveAttribute(
      "href",
      "https://developers.google.com/civic-information",
    );
    expect(
      saved.querySelector('time[datetime="2026-07-14T20:00:00.000Z"]'),
    ).toBeInTheDocument();
    expect(within(saved).getByText("Effective date unavailable.")).toBeVisible();
    expect(
      within(saved).getByText("Local divisions may be unavailable."),
    ).toBeVisible();
    expect(
      saved.querySelector('time[datetime="2026-07-14T20:01:00.000Z"]'),
    ).toBeInTheDocument();
    expect(
      saved.compareDocumentPosition(
        screen.getByRole("heading", {
          name: "Preview your voting residence",
        }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each(["network", "unavailable", "unauthenticated"] as const)(
    "recovers saved-home GET %s without implying data changed",
    async (failure) => {
      const savedRequest = deferredResponse();
      const retryRequest = deferredResponse();
      let getAttempt = 0;
      const fetchMock = installResidenceFetch({
        savedGet: () => {
          getAttempt += 1;
          return getAttempt === 1
            ? savedRequest.promise
            : retryRequest.promise;
        },
      });
      installGeolocation();

      render(<ResidencePreview />);
      expect(screen.getByText(/Loading saved residence/i)).toBeVisible();

      await act(async () => {
        if (failure === "network") {
          savedRequest.reject(new Error("SENTINEL_PRIVATE_GET_DETAIL"));
          return;
        }
        savedRequest.resolve(
          jsonResponse(
            failure === "unauthenticated"
              ? {
                  status: "unauthenticated",
                  message: "Sign in again before managing a saved residence.",
                }
              : {
                  status: "unavailable",
                  message:
                    "Saved residence is temporarily unavailable. Try again later.",
                },
            failure === "unauthenticated" ? 401 : 503,
          ),
        );
      });

      const failureMessage =
        failure === "network"
          ? /could not (?:load|reach).*saved residence/i
          : failure === "unauthenticated"
            ? /Sign in again before managing a saved residence/i
            : /Saved residence is temporarily unavailable/i;
      expect(await screen.findByText(failureMessage)).toBeVisible();
      expect(document.body).toHaveTextContent(
        /No saved residence data (?:was )?(?:changed|modified)/i,
      );
      expect(screen.queryByText(savedAddress)).toBeNull();
      expect(document.body).not.toHaveTextContent("SENTINEL_PRIVATE_GET_DETAIL");

      if (failure === "unauthenticated") {
        expect(
          screen.getByRole("link", { name: /Sign in/i }),
        ).toHaveAttribute("href", "/sign-in");
      } else {
        const retry = screen.getByRole("button", {
          name: /Retry.*saved residence/i,
        });
        expect(retry).toBeEnabled();
        fireEvent.click(retry);

        const savedGetCalls = () =>
          fetchMock.mock.calls.filter(
            ([input, init]) =>
              String(input) === savedEndpoint &&
              (init?.method ?? "GET") === "GET",
          );
        await waitFor(() => expect(savedGetCalls()).toHaveLength(2));
        for (const [requestUrl, init] of savedGetCalls()) {
          expect(requestUrl).toBe(savedEndpoint);
          expect(init?.method ?? "GET").toBe("GET");
        }

        await act(async () => {
          retryRequest.resolve(
            jsonResponse(
              failure === "network"
                ? { status: "empty" }
                : { status: "saved", residence: savedResidence },
            ),
          );
        });

        if (failure === "network") {
          expect(
            await screen.findByText(/No residence (?:is )?saved/i),
          ).toBeVisible();
          expect(screen.queryByText(savedAddress)).toBeNull();
        } else {
          const saved = await screen.findByRole("region", {
            name: "Saved residence",
          });
          expect(within(saved).getByText(savedAddress)).toBeVisible();
        }
        expect(screen.queryByText(failureMessage)).toBeNull();
      }
    },
  );

  it("posts the exact consented candidate, warns on replacement, and renders the returned home", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    const saveRequest = deferredResponse();
    const fetchMock = installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
      resolve: () => jsonResponse(matchedResidenceResponse),
      save: () => saveRequest.promise,
    });
    installGeolocation();
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const localStorageWrite = vi.spyOn(window.localStorage, "setItem");
    const sessionStorageWrite = vi.spyOn(window.sessionStorage, "setItem");

    render(<ResidencePreview />);
    await screen.findByText(savedAddress);
    enterAddress();

    const consent = await screen.findByRole("checkbox", {
      name: consentCopy,
    });
    expect(document.body).toHaveTextContent(
      /replac(?:e|es|ing).*existing.*(?:residence|home)/i,
    );
    expect(document.body).toHaveTextContent(
      /no (?:prior|previous) residence history (?:is|will be) (?:kept|retained)/i,
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input) === "/api/v1/residence" && init?.method === "POST",
      ),
    ).toHaveLength(0);

    fireEvent.click(consent);
    const saveButton = screen.getByRole("button", { name: "Save residence" });
    fireEvent.click(saveButton);

    const saveCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input) === savedEndpoint && init?.method === "POST",
    );
    expect(saveCalls).toHaveLength(1);
    const saveCall = saveCalls[0];
    expect(saveCall[0]).toBe(savedEndpoint);
    expect(saveCall[1]?.method).toBe("POST");
    expect(new Headers(saveCall[1]?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(new Headers(saveCall[1]?.headers).has("origin")).toBe(false);
    expect(JSON.parse(String(saveCall[1]?.body))).toEqual({
      address,
      resolutionToken: matchedResidenceResponse.resolutionToken,
      consent: {
        accepted: true,
        version: "saved-residence-v1",
      },
    });
    expect(saveButton).toBeDisabled();
    expect(consent).toBeDisabled();
    const saving = screen.getByText(/Saving (?:saved )?residence/i);
    expect(saving.closest('[role="status"], [aria-live]')).not.toBeNull();
    fireEvent.click(saveButton);
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input) === savedEndpoint && init?.method === "POST",
      ),
    ).toHaveLength(1);

    await act(async () => {
      saveRequest.resolve(
        jsonResponse({
          status: "saved",
          residence: replacementSavedResidence,
          replaced: true,
        }),
      );
    });

    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    expect(await within(saved).findByText(address)).toBeVisible();
    expect(within(saved).queryByText(savedAddress)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();
    const replaced = await screen.findByText(
      /Saved residence (?:was )?replaced|Replaced saved residence/i,
    );
    expect(replaced.closest('[role="status"], [aria-live]')).not.toBeNull();

    const browserWrites = JSON.stringify([
      ...pushState.mock.calls,
      ...replaceState.mock.calls,
      ...localStorageWrite.mock.calls,
      ...sessionStorageWrite.mock.calls,
    ]);
    for (const secret of [address, matchedResidenceResponse.resolutionToken]) {
      expect(browserWrites).not.toContain(secret);
      expect(decodeURIComponent(window.location.href)).not.toContain(secret);
    }
  });

  it("clears the same candidate as soon as its address is edited", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    installResidenceFetch({
      resolve: () => jsonResponse(matchedResidenceResponse),
    });
    installGeolocation();

    render(<ResidencePreview />);
    await screen.findByText(/No residence (?:is )?saved/i);
    enterAddress();
    const consent = await screen.findByRole("checkbox", { name: consentCopy });
    fireEvent.click(consent);

    fireEvent.change(
      screen.getByRole("textbox", { name: "Voting residence address" }),
      { target: { value: `${address} Apt 2` } },
    );

    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();
  });

  it("clears consent on new checks, device use, expiry, and a rejected token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    const replacementPreview = deferredResponse();
    let manualResolution = 0;
    const fetchMock = installResidenceFetch({
      resolve: (init) => {
        const body = JSON.parse(String(init?.body)) as { kind: string };
        if (body.kind === "coordinates") {
          return jsonResponse(partialResidenceResponse);
        }
        manualResolution += 1;
        if (manualResolution === 2) {
          return replacementPreview.promise;
        }
        return jsonResponse({
          ...matchedResidenceResponse,
          resolutionToken: `fixture-resolution-token-${manualResolution}`,
        });
      },
      save: () =>
        jsonResponse(
          {
            status: "invalid_token",
            message: "Preview your voting residence again before saving.",
          },
          422,
        ),
    });
    installGeolocation((success) => {
      success(
        geolocationPosition(
          coordinateInput.latitude,
          coordinateInput.longitude,
        ),
      );
    });

    render(<ResidencePreview />);
    await screen.findByText(/No residence (?:is )?saved/i);
    const manualCandidate = async (value = address) => {
      enterAddress(value);
      return screen.findByRole("checkbox", { name: consentCopy });
    };

    let consent = await manualCandidate();
    fireEvent.click(consent);
    enterAddress(`${address} Apt 3`);
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    await act(async () => {
      replacementPreview.resolve(
        jsonResponse({
          ...matchedResidenceResponse,
          resolutionToken: "fixture-resolution-token-2",
        }),
      );
    });
    consent = await screen.findByRole("checkbox", { name: consentCopy });
    expect(consent).not.toBeChecked();

    fireEvent.click(consent);
    fireEvent.click(
      screen.getByRole("button", { name: "Use this device once" }),
    );
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    await screen.findByRole("heading", {
      name: "Partial political divisions",
    });
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();

    consent = await manualCandidate();
    fireEvent.click(consent);
    vi.setSystemTime(new Date("2026-07-14T20:11:00.000Z"));
    fireEvent.click(screen.getByRole("button", { name: "Save residence" }));
    expect(await screen.findByText(/preview.*expired|expired.*preview/i)).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input) === "/api/v1/residence" && init?.method === "POST",
      ),
    ).toHaveLength(0);

    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    consent = await manualCandidate();
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Save residence" }));
    expect(
      await screen.findByText(
        "Preview your voting residence again before saving.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();
  });

  it("expires a consented candidate at expiresAt without a save attempt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    const fetchMock = installResidenceFetch({
      resolve: () =>
        jsonResponse({
          ...matchedResidenceResponse,
          expiresAt: "2026-07-14T20:06:00.000Z",
        }),
    });
    installGeolocation();

    render(<ResidencePreview />);
    await act(async () => {});
    expect(screen.getByText(/No residence (?:is )?saved/i)).toBeVisible();
    const input = enterAddress();
    await act(async () => {});
    const consent = screen.getByRole("checkbox", { name: consentCopy });
    fireEvent.click(consent);
    expect(screen.getByRole("button", { name: "Save residence" })).toBeEnabled();

    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();
    const expired = screen.getByText(/preview.*expired|expired.*preview/i);
    expect(expired.closest('[role="status"], [aria-live]')).not.toBeNull();
    expect(input).toHaveFocus();
    expect(
      fetchMock.mock.calls.filter(
        ([requestUrl, requestInit]) =>
          String(requestUrl) === savedEndpoint && requestInit?.method === "POST",
      ),
    ).toHaveLength(0);
  });

  it("returns focus to manual entry after a successful save removes its control", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    installResidenceFetch({
      resolve: () => jsonResponse(matchedResidenceResponse),
      save: () =>
        jsonResponse({
          status: "saved",
          residence: replacementSavedResidence,
          replaced: false,
        }),
    });
    installGeolocation();

    render(<ResidencePreview />);
    await screen.findByText(/No residence (?:is )?saved/i);
    const input = enterAddress();
    const consent = await screen.findByRole("checkbox", { name: consentCopy });
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Save residence" }));

    expect(await screen.findByText(address)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();
    expect(input).toHaveFocus();
  });

  it("returns focus to manual entry when POST 422 invalidates the candidate", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    installResidenceFetch({
      resolve: () => jsonResponse(matchedResidenceResponse),
      save: () =>
        jsonResponse(
          {
            status: "invalid_token",
            message: "Preview your voting residence again before saving.",
          },
          422,
        ),
    });
    installGeolocation();

    render(<ResidencePreview />);
    await screen.findByText(/No residence (?:is )?saved/i);
    const input = enterAddress();
    const consent = await screen.findByRole("checkbox", { name: consentCopy });
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Save residence" }));

    expect(
      await screen.findByText("Preview your voting residence again before saving."),
    ).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(input).toHaveFocus();
  });

  it("returns focus to the stable delete control when confirmation is cancelled", async () => {
    installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
    });
    installGeolocation();

    render(<ResidencePreview />);
    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    const deleteButton = within(saved).getByRole("button", {
      name: "Delete saved residence",
    });
    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("button", { name: "Confirm deletion" }),
    ).toBeNull();
    expect(deleteButton).toHaveFocus();
  });

  it("preserves the old home and retryable candidate across network and server save failures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    let saveAttempt = 0;
    installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
      resolve: () => jsonResponse(matchedResidenceResponse),
      save: () => {
        saveAttempt += 1;
        if (saveAttempt === 1) {
          throw new Error("SENTINEL_PRIVATE_NETWORK_DETAIL");
        }
        return jsonResponse(
          {
            status: "unavailable",
            message: "Saved residence is temporarily unavailable. Try again later.",
          },
          503,
        );
      },
    });
    installGeolocation();

    render(<ResidencePreview />);
    await screen.findByText(savedAddress);
    enterAddress();
    const consent = await screen.findByRole("checkbox", {
      name: consentCopy,
    });
    fireEvent.click(consent);
    const saveButton = screen.getByRole("button", { name: "Save residence" });

    fireEvent.click(saveButton);
    expect(
      await screen.findByText(/could not (?:save|reach)/i),
    ).toBeVisible();
    expect(document.body).toHaveTextContent(
      /(?:prior|previous|saved) residence.*(?:unchanged|not changed)/i,
    );
    expect(screen.getByText(savedAddress)).toBeVisible();
    expect(consent).toBeChecked();
    expect(saveButton).toBeEnabled();
    expect(document.body).not.toHaveTextContent("SENTINEL_PRIVATE_NETWORK_DETAIL");

    fireEvent.click(saveButton);
    expect(
      await screen.findByText(/Saved residence is temporarily unavailable/i),
    ).toBeVisible();
    expect(document.body).toHaveTextContent(
      /(?:prior|previous|saved) residence.*(?:unchanged|not changed)/i,
    );
    expect(screen.getByText(savedAddress)).toBeVisible();
    expect(consent).toBeChecked();
    expect(saveButton).toBeEnabled();
  });

  it("does not start DELETE while a residence resolution is pending", async () => {
    const resolutionRequest = deferredResponse();
    const fetchMock = installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
      resolve: () => resolutionRequest.promise,
      remove: () => jsonResponse({ status: "deleted" }),
    });
    installGeolocation();

    render(<ResidencePreview />);
    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    enterAddress();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([requestUrl, requestInit]) =>
            String(requestUrl) === resolveEndpoint &&
            requestInit?.method === "POST",
        ),
      ).toHaveLength(1),
    );

    fireEvent.click(
      within(saved).getByRole("button", { name: "Delete saved residence" }),
    );
    const confirm = screen.queryByRole("button", {
      name: "Confirm deletion",
    });
    if (confirm) {
      fireEvent.click(confirm);
    }

    expect(
      fetchMock.mock.calls.filter(
        ([requestUrl, requestInit]) =>
          String(requestUrl) === savedEndpoint &&
          requestInit?.method === "DELETE",
      ),
    ).toHaveLength(0);
    expect(screen.getByText(savedAddress)).toBeVisible();
  });

  it("does not start or apply manual or device resolution while DELETE is pending", async () => {
    const deleteRequest = deferredResponse();
    const fetchMock = installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
      resolve: () => jsonResponse(matchedResidenceResponse),
      remove: () => deleteRequest.promise,
    });
    installGeolocation((success) => {
      success(
        geolocationPosition(
          coordinateInput.latitude,
          coordinateInput.longitude,
        ),
      );
    });

    render(<ResidencePreview />);
    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    fireEvent.click(
      within(saved).getByRole("button", { name: "Delete saved residence" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([requestUrl, requestInit]) =>
            String(requestUrl) === savedEndpoint &&
            requestInit?.method === "DELETE",
        ),
      ).toHaveLength(1),
    );

    const checkButton = screen.getByRole("button", { name: "Check residence" });
    const deviceButton = screen.getByRole("button", {
      name: "Use this device once",
    });
    expect(checkButton).toBeDisabled();
    expect(deviceButton).toBeDisabled();
    fireEvent.click(checkButton);
    fireEvent.click(deviceButton);
    expect(
      fetchMock.mock.calls.filter(
        ([requestUrl, requestInit]) =>
          String(requestUrl) === resolveEndpoint &&
          requestInit?.method === "POST",
      ),
    ).toHaveLength(0);
    expect(screen.getByText(savedAddress)).toBeVisible();

    await act(async () => {
      deleteRequest.resolve(jsonResponse({ status: "deleted" }));
    });
    expect(await screen.findByText(/No residence (?:is )?saved/i)).toBeVisible();
    const preview = screen.getByRole("region", {
      name: "Preview your voting residence",
    });
    expect(
      within(preview).queryByRole("region", {
        name: /^(?:Residence match|Residence preview match)$/i,
      }),
    ).toBeNull();
  });

  it("closes an old-home deletion confirmation after saving its replacement", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
      resolve: () => jsonResponse(matchedResidenceResponse),
      save: () =>
        jsonResponse({
          status: "saved",
          residence: replacementSavedResidence,
          replaced: true,
        }),
    });
    installGeolocation();

    render(<ResidencePreview />);
    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    fireEvent.click(
      within(saved).getByRole("button", { name: "Delete saved residence" }),
    );
    expect(
      screen.getByRole("button", { name: "Confirm deletion" }),
    ).toBeVisible();

    enterAddress();
    const consent = await screen.findByRole("checkbox", { name: consentCopy });
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Save residence" }));

    expect(await within(saved).findByText(address)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Confirm deletion" }),
    ).toBeNull();
  });

  it("clears private owner state and offers sign-in recovery after POST 401", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
      resolve: () => jsonResponse(matchedResidenceResponse),
      save: () =>
        jsonResponse(
          {
            status: "unauthenticated",
            message: "Sign in again before managing a saved residence.",
          },
          401,
        ),
    });
    installGeolocation();

    render(<ResidencePreview />);
    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    fireEvent.click(
      within(saved).getByRole("button", { name: "Delete saved residence" }),
    );
    enterAddress();
    const consent = await screen.findByRole("checkbox", { name: consentCopy });
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Save residence" }));

    expect(
      await screen.findByText(/Sign in again before managing a saved residence/i),
    ).toBeVisible();
    expect(screen.queryByText(savedAddress)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Confirm deletion" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: /Sign in/i })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("clears private owner state and offers sign-in recovery after DELETE 401", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
      resolve: () => jsonResponse(matchedResidenceResponse),
      remove: () =>
        jsonResponse(
          {
            status: "unauthenticated",
            message: "Sign in again before managing a saved residence.",
          },
          401,
        ),
    });
    installGeolocation();

    render(<ResidencePreview />);
    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    enterAddress();
    const consent = await screen.findByRole("checkbox", { name: consentCopy });
    fireEvent.click(consent);
    fireEvent.click(
      within(saved).getByRole("button", { name: "Delete saved residence" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));

    expect(
      await screen.findByText(/Sign in again before managing a saved residence/i),
    ).toBeVisible();
    expect(screen.queryByText(savedAddress)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Confirm deletion" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: /Sign in/i })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("confirms deletion, preserves failures, and focuses manual entry after success", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    let deleteAttempt = 0;
    const deleteRequest = deferredResponse();
    const fetchMock = installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
      resolve: () => jsonResponse(matchedResidenceResponse),
      remove: () => {
        deleteAttempt += 1;
        return deleteAttempt === 1
          ? jsonResponse(
              {
                status: "unavailable",
                message:
                  "Saved residence is temporarily unavailable. Try again later.",
              },
              503,
            )
          : deleteRequest.promise;
      },
    });
    installGeolocation();
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const localStorageWrite = vi.spyOn(window.localStorage, "setItem");
    const sessionStorageWrite = vi.spyOn(window.sessionStorage, "setItem");

    render(<ResidencePreview />);
    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    enterAddress();
    const consent = await screen.findByRole("checkbox", { name: consentCopy });
    fireEvent.click(consent);
    fireEvent.click(
      within(saved).getByRole("button", { name: "Delete saved residence" }),
    );
    expect(document.body).toHaveTextContent(
      /delete.*address.*(?:political )?divisions.*account.*remain/i,
    );
    const confirm = screen.getByRole("button", { name: "Confirm deletion" });

    fireEvent.click(confirm);
    expect(
      await screen.findByText(/Saved residence is temporarily unavailable/i),
    ).toBeVisible();
    expect(document.body).toHaveTextContent(
      /(?:prior|previous|saved) residence.*(?:unchanged|not changed)/i,
    );
    expect(screen.getByText(savedAddress)).toBeVisible();
    expect(confirm).toBeEnabled();
    expect(consent).toBeChecked();

    const retryConfirm = screen.getByRole("button", {
      name: "Confirm deletion",
    });
    fireEvent.click(retryConfirm);
    const deleteCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input) === savedEndpoint && init?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(2);
    expect(retryConfirm).toBeDisabled();
    expect(
      within(saved).getByRole("button", { name: "Delete saved residence" }),
    ).toBeDisabled();
    const deleting = screen.getByText(/Deleting saved residence/i);
    expect(deleting.closest('[role="status"], [aria-live]')).not.toBeNull();
    fireEvent.click(retryConfirm);
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input) === savedEndpoint && init?.method === "DELETE",
      ),
    ).toHaveLength(2);

    for (const [requestUrl, init] of deleteCalls) {
      expect(requestUrl).toBe(savedEndpoint);
      expect(init?.method).toBe("DELETE");
      expect(new Headers(init?.headers).get("content-type")).toBe(
        "application/json",
      );
      expect(new Headers(init?.headers).has("origin")).toBe(false);
      expect(JSON.parse(String(init?.body))).toEqual({
        confirmation: "DELETE_SAVED_RESIDENCE",
      });
    }

    await act(async () => {
      deleteRequest.resolve(jsonResponse({ status: "deleted" }));
    });
    expect(await screen.findByText(/No residence (?:is )?saved/i)).toBeVisible();
    expect(screen.queryByText(savedAddress)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Voting residence address" }),
    ).toHaveFocus();
    const deleted = await screen.findByText(
      /Saved residence (?:was )?(?:deleted|removed)/i,
    );
    expect(deleted.closest('[role="status"], [aria-live]')).not.toBeNull();

    const browserWrites = JSON.stringify([
      ...pushState.mock.calls,
      ...replaceState.mock.calls,
      ...localStorageWrite.mock.calls,
      ...sessionStorageWrite.mock.calls,
    ]);
    for (const secret of [
      address,
      savedAddress,
      matchedResidenceResponse.resolutionToken,
    ]) {
      expect(browserWrites).not.toContain(secret);
      expect(decodeURIComponent(window.location.href)).not.toContain(secret);
    }
  });

  it("treats an already-empty DELETE response as safe deletion recovery", async () => {
    installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
      remove: () => jsonResponse({ status: "empty" }),
    });
    installGeolocation();

    render(<ResidencePreview />);
    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    fireEvent.click(
      within(saved).getByRole("button", { name: "Delete saved residence" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));

    expect(await screen.findByText(/No residence (?:is )?saved/i)).toBeVisible();
    expect(screen.queryByRole("region", { name: "Saved residence" })).toBeNull();
    expect(screen.queryByText(savedAddress)).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Voting residence address" }),
    ).toHaveFocus();
  });

  it("gives saved and fresh preview results unique context-specific region names", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    installResidenceFetch({
      savedGet: () =>
        jsonResponse({ status: "saved", residence: savedResidence }),
      resolve: () => jsonResponse(matchedResidenceResponse),
    });
    installGeolocation();

    render(<ResidencePreview />);
    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    const preview = screen.getByRole("region", {
      name: "Preview your voting residence",
    });
    enterAddress();
    await within(preview).findByRole("heading", {
      name: "Matched political divisions",
    });

    const savedMatch = within(saved).getByRole("region", {
      name: /Saved (?:residence|home) match/i,
    });
    const previewMatch = within(preview).getByRole("region", {
      name: /(?:Residence preview|Preview residence) match/i,
    });
    expect(savedMatch).not.toBe(previewMatch);
  });

  it("posts an exact address once while pending, clears success, and starts a fresh explicit check", async () => {
    const firstRequest = deferredResponse();
    let resolutionCount = 0;
    const fetchMock = installResidenceFetch({
      resolve: () => {
        resolutionCount += 1;
        return resolutionCount === 1
          ? firstRequest.promise
          : jsonResponse(matchedResidenceResponse);
      },
    });
    installGeolocation();

    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const localStorageWrite = vi.spyOn(window.localStorage, "setItem");
    const sessionStorageWrite = vi.spyOn(window.sessionStorage, "setItem");

    render(<ResidencePreview />);
    const input = enterAddress();

    const resolverCalls = () =>
      fetchMock.mock.calls.filter(
        ([requestUrl, requestInit]) =>
          String(requestUrl) === resolveEndpoint && requestInit?.method === "POST",
      );
    expect(resolverCalls()).toHaveLength(1);
    const [url, init] = resolverCalls()[0];
    expect(url).toBe(resolveEndpoint);
    expect(init).toMatchObject({
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ kind: "address", address });

    expect(screen.getByRole("button", { name: "Check residence" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Use this device once" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Checking residence/i).closest(
        '[role="status"], [aria-live]',
      ),
    ).not.toBeNull();
    fireEvent.submit(input.closest("form")!);
    fireEvent.click(
      screen.getByRole("button", { name: "Use this device once" }),
    );
    expect(resolverCalls()).toHaveLength(1);

    await act(async () => {
      firstRequest.resolve(jsonResponse(matchedResidenceResponse));
    });
    await waitFor(() => expect(input).toHaveValue(""));
    expect(
      screen.getByRole("region", {
        name: /^(?:Residence match|Residence preview match)$/i,
      }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(address);

    fireEvent.change(input, { target: { value: address } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(resolverCalls()).toHaveLength(2));
    expect(JSON.parse(String(resolverCalls()[1][1]?.body))).toEqual({
      kind: "address",
      address,
    });

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(localStorageWrite).not.toHaveBeenCalled();
    expect(sessionStorageWrite).not.toHaveBeenCalled();
    expect(decodeURIComponent(window.location.href)).not.toContain(address);
  });

  it("renders a matched result with adjacent source, freshness, and coverage limits", async () => {
    installResidenceFetch({
      resolve: () => jsonResponse(matchedResidenceResponse),
    });
    installGeolocation();

    render(<ResidencePreview />);
    enterAddress();

    const result = await screen.findByRole("region", {
      name: /^(?:Residence match|Residence preview match)$/i,
    });
    expect(
      within(result).getByRole("heading", {
        name: "Matched political divisions",
      }),
    ).toBeInTheDocument();
    expect(
      within(result).getByText("Example Congressional District 1"),
    ).toBeInTheDocument();
    expect(
      within(result).getByText("ocd-division/country:us/state:ex/cd:1"),
    ).toBeInTheDocument();

    const provenance = within(result).getByRole("region", {
      name: "Source and freshness",
    });
    expect(
      within(provenance).getByRole("link", {
        name: "Google Civic Information API",
      }),
    ).toHaveAttribute(
      "href",
      "https://developers.google.com/civic-information",
    );
    expect(
      provenance.querySelector(
        'time[datetime="2026-07-14T20:00:00.000Z"]',
      ),
    ).toBeInTheDocument();
    expect(within(provenance).getByText("Effective date unavailable.")).toBeVisible();

    const coverage = within(result).getByRole("list", {
      name: "Coverage notes",
    });
    expect(
      within(coverage).getByText("Local divisions may be unavailable."),
    ).toBeInTheDocument();
    expect(
      within(result).queryByText(/complete coverage|all political divisions/i),
    ).not.toBeInTheDocument();
  });

  it("labels Census output partial and shows benchmark, vintage, and missing coverage", async () => {
    installResidenceFetch({
      resolve: () => jsonResponse(partialResidenceResponse),
    });
    installGeolocation();

    render(<ResidencePreview />);
    enterAddress();

    const result = await screen.findByRole("region", {
      name: /^(?:Residence match|Residence preview match)$/i,
    });
    expect(
      within(result).getByRole("heading", {
        name: "Partial political divisions",
      }),
    ).toBeInTheDocument();
    expect(within(result).getByText("Example County")).toBeInTheDocument();
    expect(within(result).getByText("Benchmark: Public_AR_Current")).toBeVisible();
    expect(within(result).getByText("Vintage: Current_Current")).toBeVisible();
    expect(
      within(result).getByText(
        "Census coverage is partial and may omit local political divisions.",
      ),
    ).toBeVisible();
    expect(
      within(result).queryByText(/complete coverage|all political divisions/i),
    ).not.toBeInTheDocument();
  });

  it("renders overlapping upper and lower district IDs with stable keys", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const overlappingResponse = {
      ...partialResidenceResponse,
      divisions: [
        {
          type: "state_upper",
          name: "Example Senate District 1",
          id: "99001",
          idScheme: "census",
        },
        {
          type: "state_lower",
          name: "Example House District 1",
          id: "99001",
          idScheme: "census",
        },
      ],
    } satisfies ResolutionResponse;
    installResidenceFetch({
      resolve: () => jsonResponse(overlappingResponse),
    });
    installGeolocation();

    render(<ResidencePreview />);
    enterAddress();

    expect(await screen.findByText("Example Senate District 1")).toBeVisible();
    expect(screen.getByText("Example House District 1")).toBeVisible();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each([
    [noMatchResidenceResponse, 200],
    [ambiguousResidenceResponse, 200],
    [invalidResidenceResponse, 400],
    [unauthenticatedResidenceResponse, 401],
    [forbiddenResidenceResponse, 403],
    [unavailableResidenceResponse, 503],
  ] as const)(
    "preserves the editable address and announces the %s recovery state",
    async (body, status) => {
      installResidenceFetch({
        resolve: () => jsonResponse(body, status),
      });
      installGeolocation();

      render(<ResidencePreview />);
      const input = enterAddress();

      const message = await screen.findByText(body.message);
      expect(message.closest('[role="status"], [aria-live]')).not.toBeNull();
      expect(input).toHaveValue(address);
      expect(input).toBeEnabled();
      expect(input).toHaveFocus();
      expect(
        screen.queryByRole("region", {
          name: /^(?:Residence match|Residence preview match)$/i,
        }),
      ).toBeNull();
    },
  );

  it("preserves the address and announces network recovery without provider prose", async () => {
    installResidenceFetch({
      resolve: () => Promise.reject(new Error("SECRET PROVIDER PROSE")),
    });
    installGeolocation();

    render(<ResidencePreview />);
    const input = enterAddress();

    const message = await screen.findByText(
      "We could not reach the server. Your residence was not checked. Try again.",
    );
    expect(message.closest('[role="status"], [aria-live]')).not.toBeNull();
    expect(input).toHaveValue(address);
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();
    expect(document.body).not.toHaveTextContent("SECRET PROVIDER PROSE");
  });

  it("requests one device position per explicit action and posts only exact coordinates", async () => {
    const fetchMock = installResidenceFetch({
      resolve: () => jsonResponse(partialResidenceResponse),
    });
    const getCurrentPosition = installGeolocation((success) => {
      success(
        geolocationPosition(
          coordinateInput.latitude,
          coordinateInput.longitude,
        ),
      );
    });

    render(<ResidencePreview />);
    const deviceButton = screen.getByRole("button", {
      name: "Use this device once",
    });
    fireEvent.click(deviceButton);

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: false,
      maximumAge: 0,
      timeout: 10_000,
    });
    const resolverCalls = () =>
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input) === resolveEndpoint && init?.method === "POST",
      );
    await waitFor(() => expect(resolverCalls()).toHaveLength(1));
    expect(resolverCalls()[0][0]).toBe(resolveEndpoint);
    expect(JSON.parse(String(resolverCalls()[0][1]?.body))).toEqual(
      coordinateInput,
    );

    await waitFor(() => expect(deviceButton).toBeEnabled());
    fireEvent.click(deviceButton);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(resolverCalls()).toHaveLength(2));
    expect(JSON.parse(String(resolverCalls()[1][1]?.body))).toEqual(
      coordinateInput,
    );
  });

  it("ignores a delayed device location delivered after unmount", async () => {
    let deliverPosition:
      | ((position: GeolocationPosition) => void)
      | undefined;
    const fetchMock = installResidenceFetch({
      resolve: () => jsonResponse(partialResidenceResponse),
    });
    const getCurrentPosition = installGeolocation((success) => {
      deliverPosition = success;
    });

    const { unmount } = render(<ResidencePreview />);
    fireEvent.click(
      screen.getByRole("button", { name: "Use this device once" }),
    );
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(deliverPosition).toBeTypeOf("function");

    unmount();
    await act(async () => {
      deliverPosition!(
        geolocationPosition(
          coordinateInput.latitude,
          coordinateInput.longitude,
        ),
      );
    });

    expect(
      fetchMock.mock.calls.filter(
        ([requestUrl, requestInit]) =>
          String(requestUrl) === resolveEndpoint &&
          requestInit?.method === "POST",
      ),
    ).toHaveLength(0);
  });

  it.each([
    [1, "Location permission was denied. Enter your voting residence instead."],
    [2, "This device's location is unavailable. Enter your voting residence instead."],
    [3, "Location request timed out. Enter your voting residence instead."],
  ] as const)(
    "keeps device error %i client-side and returns focus to manual entry",
    async (code, message) => {
      const fetchMock = installResidenceFetch();
      installGeolocation((_success, error) => {
        setTimeout(() => error?.(geolocationError(code)), 0);
      });

      render(<ResidencePreview />);
      const input = screen.getByRole("textbox", {
        name: "Voting residence address",
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Use this device once" }),
      );

      const recovery = await screen.findByText(message);
      expect(recovery.closest('[role="status"], [aria-live]')).not.toBeNull();
      expect(
        fetchMock.mock.calls.filter(
          ([input]) => String(input) === resolveEndpoint,
        ),
      ).toHaveLength(0);
      expect(input).toBeEnabled();
      expect(input).toHaveFocus();
    },
  );

  it("recovers to focused manual entry when geolocation is unsupported", async () => {
    const fetchMock = installResidenceFetch();
    Reflect.deleteProperty(navigator, "geolocation");

    render(<ResidencePreview />);
    const input = screen.getByRole("textbox", {
      name: "Voting residence address",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use this device once" }),
    );

    const recovery = await screen.findByText(
      "Device location is not available. Enter your voting residence instead.",
    );
    expect(recovery.closest('[role="status"], [aria-live]')).not.toBeNull();
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === resolveEndpoint,
      ),
    ).toHaveLength(0);
    expect(input).toHaveFocus();
  });
});
