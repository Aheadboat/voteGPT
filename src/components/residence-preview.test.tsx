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
import { ResidencePreview } from "./residence-preview";

const address = "742 Evergreen Terrace, Springfield";
const coordinateInput = {
  kind: "coordinates",
  latitude: 38.8977,
  longitude: -77.0365,
};
const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation",
);

function jsonResponse(
  body: ResolutionResponse | ResolutionErrorResponse,
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

  it("keeps manual entry primary, explains privacy, and never checks on mount or a timer", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>();
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

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_000));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
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
