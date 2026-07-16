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
import type {
  ResolutionErrorResponse,
  ResolutionResponse,
} from "@/lib/residence";
import type { SavedResidenceView } from "@/lib/saved-residence";
import { ResidencePreview } from "./residence-preview";

const address = "742 Evergreen Terrace, Springfield";
const savedAddress = "123 Main Street, Springfield";
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
    acceptedAt: "2026-07-14T19:56:00.000Z",
  },
  createdAt: "2026-07-14T19:56:00.000Z",
  updatedAt: "2026-07-14T19:56:00.000Z",
} as const satisfies SavedResidenceView;
const replacementSavedResidence = {
  ...savedResidence,
  address,
  consent: {
    version: "saved-residence-v1",
    acceptedAt: "2026-07-14T20:06:00.000Z",
  },
  updatedAt: "2026-07-14T20:06:00.000Z",
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
  const promise = new Promise<Response>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status: "empty" }));
    const getCurrentPosition = installGeolocation();
    vi.stubGlobal("fetch", fetchMock);

    render(<ResidencePreview />);

    expect(
      screen.getByRole("heading", { name: "Preview your voting residence" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter your voting residence to match it with political divisions.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your address is used only for this check and is not saved.",
      ),
    ).toBeInTheDocument();

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
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === "/api/v1/residence") {
        return jsonResponse({ status: "empty" });
      }

      resolutionCount += 1;
      return jsonResponse(
        resolutionCount === 1
          ? matchedResidenceResponse
          : partialResidenceResponse,
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    installGeolocation((success) => {
      success(
        geolocationPosition(
          coordinateInput.latitude,
          coordinateInput.longitude,
        ),
      );
    });

    render(<ResidencePreview />);
    await act(async () => {});
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
  });

  it("loads saved-home state before the preview and then renders empty", async () => {
    const savedRequest = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValue(savedRequest.promise);
    vi.stubGlobal("fetch", fetchMock);
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

    await act(async () => {
      savedRequest.resolve(jsonResponse({ status: "empty" }));
    });
    expect(await screen.findByText(/No residence (?:is )?saved/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Delete saved residence" }),
    ).toBeNull();
  });

  it("renders the owner saved address with provenance, freshness, coverage, and consent time", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ status: "saved", residence: savedResidence }),
      );
    vi.stubGlobal("fetch", fetchMock);
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
      saved.querySelector('time[datetime="2026-07-14T19:56:00.000Z"]'),
    ).toBeInTheDocument();
    expect(
      saved.compareDocumentPosition(
        screen.getByRole("heading", {
          name: "Preview your voting residence",
        }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("posts the exact consented candidate, warns on replacement, and renders the returned home", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/v1/residence" && method === "GET") {
        return jsonResponse({ status: "saved", residence: savedResidence });
      }
      if (url === "/api/v1/location/resolve" && method === "POST") {
        return jsonResponse(matchedResidenceResponse);
      }
      if (url === "/api/v1/residence" && method === "POST") {
        return jsonResponse({
          status: "saved",
          residence: replacementSavedResidence,
          replaced: true,
        });
      }
      throw new Error(`Unexpected test request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    installGeolocation();

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
    fireEvent.click(screen.getByRole("button", { name: "Save residence" }));

    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
    expect(await within(saved).findByText(address)).toBeVisible();
    expect(within(saved).queryByText(savedAddress)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save residence" }),
    ).toBeNull();

    const saveCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === "/api/v1/residence" && init?.method === "POST",
    );
    expect(saveCall).toBeDefined();
    expect(JSON.parse(String(saveCall?.[1]?.body))).toEqual({
      address,
      resolutionToken: matchedResidenceResponse.resolutionToken,
      consent: {
        accepted: true,
        version: "saved-residence-v1",
      },
    });
    expect(new Headers(saveCall?.[1]?.headers).has("origin")).toBe(false);
  });

  it("clears consent on edits, new checks, device use, expiry, and a rejected token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    let manualResolution = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/v1/residence" && method === "GET") {
        return jsonResponse({ status: "empty" });
      }
      if (url === "/api/v1/location/resolve" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as { kind: string };
        if (body.kind === "coordinates") {
          return jsonResponse(partialResidenceResponse);
        }
        manualResolution += 1;
        return jsonResponse({
          ...matchedResidenceResponse,
          resolutionToken: `fixture-resolution-token-${manualResolution}`,
        });
      }
      if (url === "/api/v1/residence" && method === "POST") {
        return jsonResponse(
          {
            status: "invalid_token",
            message: "Preview your voting residence again before saving.",
          },
          422,
        );
      }
      throw new Error(`Unexpected test request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
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
    fireEvent.change(
      screen.getByRole("textbox", { name: "Voting residence address" }),
      { target: { value: `${address} Apt 2` } },
    );
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();

    consent = await manualCandidate();
    fireEvent.click(consent);
    enterAddress(`${address} Apt 3`);
    expect(screen.queryByRole("checkbox", { name: consentCopy })).toBeNull();
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

  it("preserves the old home and retryable candidate across network and server save failures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T20:05:00.000Z"));
    let saveAttempt = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/v1/residence" && method === "GET") {
        return jsonResponse({ status: "saved", residence: savedResidence });
      }
      if (url === "/api/v1/location/resolve" && method === "POST") {
        return jsonResponse(matchedResidenceResponse);
      }
      if (url === "/api/v1/residence" && method === "POST") {
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
      }
      throw new Error(`Unexpected test request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
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

  it("confirms deletion, preserves failures, and focuses manual entry after success", async () => {
    let deleteAttempt = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/v1/residence" && method === "GET") {
        return jsonResponse({ status: "saved", residence: savedResidence });
      }
      if (url === "/api/v1/residence" && method === "DELETE") {
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
          : jsonResponse({ status: "deleted" });
      }
      throw new Error(`Unexpected test request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    installGeolocation();

    render(<ResidencePreview />);
    const saved = await screen.findByRole("region", {
      name: "Saved residence",
    });
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

    fireEvent.click(confirm);
    expect(await screen.findByText(/No residence (?:is )?saved/i)).toBeVisible();
    expect(screen.queryByText(savedAddress)).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Voting residence address" }),
    ).toHaveFocus();

    const deleteCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input) === "/api/v1/residence" && init?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(2);
    for (const [, init] of deleteCalls) {
      expect(JSON.parse(String(init?.body))).toEqual({
        confirmation: "DELETE_SAVED_RESIDENCE",
      });
      expect(new Headers(init?.headers).has("origin")).toBe(false);
    }
  });

  it("posts an exact address once while pending, clears success, and starts a fresh explicit check", async () => {
    const firstRequest = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(jsonResponse(matchedResidenceResponse));
    vi.stubGlobal("fetch", fetchMock);
    installGeolocation();

    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const localStorageWrite = vi.spyOn(window.localStorage, "setItem");
    const sessionStorageWrite = vi.spyOn(window.sessionStorage, "setItem");

    render(<ResidencePreview />);
    const input = enterAddress();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/location/resolve");
    expect(init).toMatchObject({
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ kind: "address", address });

    expect(screen.getByRole("button", { name: "Check residence" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Use this device once" }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking residence…",
    );
    fireEvent.submit(input.closest("form")!);
    fireEvent.click(
      screen.getByRole("button", { name: "Use this device once" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstRequest.resolve(jsonResponse(matchedResidenceResponse));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.getByRole("region", { name: "Residence match" })).toBeVisible();
    expect(document.body).not.toHaveTextContent(address);

    fireEvent.change(input, { target: { value: address } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
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
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(matchedResidenceResponse)),
    );
    installGeolocation();

    render(<ResidencePreview />);
    enterAddress();

    const result = await screen.findByRole("region", {
      name: "Residence match",
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
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(partialResidenceResponse)),
    );
    installGeolocation();

    render(<ResidencePreview />);
    enterAddress();

    const result = await screen.findByRole("region", {
      name: "Residence match",
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
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(overlappingResponse)),
    );
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
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, status)),
      );
      installGeolocation();

      render(<ResidencePreview />);
      const input = enterAddress();

      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(body.message),
      );
      expect(input).toHaveValue(address);
      expect(input).toBeEnabled();
      expect(input).toHaveFocus();
      expect(screen.queryByRole("region", { name: "Residence match" })).toBeNull();
    },
  );

  it("preserves the address and announces network recovery without provider prose", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("SECRET PROVIDER PROSE")),
    );
    installGeolocation();

    render(<ResidencePreview />);
    const input = enterAddress();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "We could not reach the server. Your residence was not checked. Try again.",
      ),
    );
    expect(input).toHaveValue(address);
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();
    expect(document.body).not.toHaveTextContent("SECRET PROVIDER PROSE");
  });

  it("requests one device position per explicit action and posts only exact coordinates", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(partialResidenceResponse));
    vi.stubGlobal("fetch", fetchMock);
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/location/resolve");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(
      coordinateInput,
    );

    await waitFor(() => expect(deviceButton).toBeEnabled());
    fireEvent.click(deviceButton);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual(
      coordinateInput,
    );
  });

  it.each([
    [1, "Location permission was denied. Enter your voting residence instead."],
    [2, "This device's location is unavailable. Enter your voting residence instead."],
    [3, "Location request timed out. Enter your voting residence instead."],
  ] as const)(
    "keeps device error %i client-side and returns focus to manual entry",
    async (code, message) => {
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);
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

      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(message),
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(input).toBeEnabled();
      expect(input).toHaveFocus();
    },
  );

  it("recovers to focused manual entry when geolocation is unsupported", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    Reflect.deleteProperty(navigator, "geolocation");

    render(<ResidencePreview />);
    const input = screen.getByRole("textbox", {
      name: "Voting residence address",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use this device once" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Device location is not available. Enter your voting residence instead.",
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });
});
