"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  ResidenceInput,
  ResolutionErrorResponse,
  ResolutionResponse,
} from "@/lib/residence";
import type {
  DeleteSavedResidenceResponse,
  GetSavedResidenceResponse,
  SaveResidenceRequest,
  SaveResidenceResponse,
  SavedResidenceErrorResponse,
  SavedResidenceResolution,
  SavedResidenceView,
} from "@/lib/saved-residence";

type SaveCandidate = Pick<
  SaveResidenceRequest,
  "address" | "resolutionToken"
> & {
  expiresAt: string;
};

type SavedState =
  | "loading"
  | "empty"
  | "saved"
  | "error"
  | "unauthenticated";

type SavedLoadOutcome =
  | { state: "empty" }
  | { state: "saved"; residence: SavedResidenceView }
  | { state: "error" | "unauthenticated"; message: string };

const resolveEndpoint = "/api/v1/location/resolve";
const savedEndpoint = "/api/v1/residence";
const savedResidenceConsentVersion =
  "saved-residence-v1" satisfies SaveResidenceRequest["consent"]["version"];
const consentCopy =
  "Save this residence to my account. voteGPT will encrypt the address and use these matched political divisions for personalization until I delete or replace it.";

export function ResidencePreview() {
  const [address, setAddress] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SavedResidenceResolution | null>(null);
  const [status, setStatus] = useState("");
  const [savedState, setSavedState] = useState<SavedState>("loading");
  const [savedResidence, setSavedResidence] =
    useState<SavedResidenceView | null>(null);
  const [savedError, setSavedError] = useState("");
  const [candidate, setCandidate] = useState<SaveCandidate | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const savedLoadPendingRef = useRef(false);
  const savedLoadRequestRef = useRef(0);
  const savePendingRef = useRef(false);
  const deletePendingRef = useRef(false);
  const focusManualAfterPendingRef = useRef(false);
  const focusDeleteAfterConfirmationRef = useRef(false);
  const focusSignInAfterPendingRef = useRef(false);
  const candidateControlsRef = useRef<HTMLElement>(null);
  const savedHeadingRef = useRef<HTMLHeadingElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const signInRef = useRef<HTMLAnchorElement>(null);
  const mountedRef = useRef(true);
  const resolutionRequestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      resolutionRequestRef.current += 1;
      pendingRef.current = false;
    };
  }, []);

  useEffect(() => {
    const requestId = savedLoadRequestRef.current + 1;
    savedLoadRequestRef.current = requestId;
    savedLoadPendingRef.current = true;
    void requestSavedResidence().then((outcome) => {
      if (savedLoadRequestRef.current !== requestId) {
        return;
      }
      savedLoadPendingRef.current = false;
      setSavedState(outcome.state);
      setSavedResidence(outcome.state === "saved" ? outcome.residence : null);
      setSavedError("message" in outcome ? outcome.message : "");
    });
    return () => {
      if (savedLoadRequestRef.current === requestId) {
        savedLoadRequestRef.current += 1;
        savedLoadPendingRef.current = false;
      }
    };
  }, []);

  async function retrySavedResidence() {
    if (savedLoadPendingRef.current) {
      return;
    }
    savedHeadingRef.current?.focus();
    const requestId = savedLoadRequestRef.current + 1;
    savedLoadRequestRef.current = requestId;
    savedLoadPendingRef.current = true;
    setSavedState("loading");
    setSavedError("");
    const outcome = await requestSavedResidence();
    if (savedLoadRequestRef.current !== requestId) {
      return;
    }
    savedLoadPendingRef.current = false;
    if (!mountedRef.current) {
      return;
    }
    setSavedState(outcome.state);
    setSavedResidence(outcome.state === "saved" ? outcome.residence : null);
    setSavedError("message" in outcome ? outcome.message : "");
  }

  useLayoutEffect(() => {
    if (
      !pending &&
      !savePending &&
      !deletePending &&
      focusManualAfterPendingRef.current
    ) {
      focusManualAfterPendingRef.current = false;
      inputRef.current?.focus();
    }
    if (
      !deleteConfirmation &&
      !pending &&
      !savePending &&
      !deletePending &&
      focusDeleteAfterConfirmationRef.current
    ) {
      focusDeleteAfterConfirmationRef.current = false;
      deleteButtonRef.current?.focus();
    }
    if (
      savedState === "unauthenticated" &&
      !pending &&
      !savePending &&
      !deletePending &&
      focusSignInAfterPendingRef.current
    ) {
      focusSignInAfterPendingRef.current = false;
      signInRef.current?.focus();
    }
  }, [
    candidate,
    deleteConfirmation,
    deletePending,
    pending,
    savePending,
    savedState,
  ]);

  useLayoutEffect(() => {
    if (deleteConfirmation) {
      confirmDeleteButtonRef.current?.focus();
    }
  }, [deleteConfirmation]);

  useEffect(() => {
    if (!candidate) {
      return;
    }

    const expiresAt = Date.parse(candidate.expiresAt);
    const delay = Number.isFinite(expiresAt)
      ? Math.max(0, expiresAt - Date.now())
      : 0;
    const timeout = window.setTimeout(() => {
      if (!mountedRef.current) {
        return;
      }
      const activeElement = document.activeElement;
      focusManualAfterPendingRef.current =
        activeElement === null ||
        activeElement === document.body ||
        (candidateControlsRef.current?.contains(activeElement) ?? false);
      setCandidate(null);
      setConsentAccepted(false);
      setStatus(
        "The residence preview expired. Preview your voting residence again before saving.",
      );
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [candidate]);

  function clearCandidate() {
    setCandidate(null);
    setConsentAccepted(false);
  }

  function invalidatePrivateResidence(message: string) {
    savedLoadRequestRef.current += 1;
    savedLoadPendingRef.current = false;
    setSavedResidence(null);
    setSavedState("unauthenticated");
    setSavedError(message);
    setDeleteConfirmation(false);
    focusSignInAfterPendingRef.current = true;
    clearCandidate();
    setStatus("");
  }

  function begin(message: string) {
    if (
      pendingRef.current ||
      savePendingRef.current ||
      deletePendingRef.current
    ) {
      return null;
    }

    const requestId = resolutionRequestRef.current + 1;
    resolutionRequestRef.current = requestId;
    pendingRef.current = true;
    setPending(true);
    setResult(null);
    setDeleteConfirmation(false);
    clearCandidate();
    setStatus(message);
    return requestId;
  }

  function finish(requestId: number) {
    if (!mountedRef.current || resolutionRequestRef.current !== requestId) {
      return;
    }
    pendingRef.current = false;
    setPending(false);
  }

  function canApplyResolution(requestId: number) {
    return (
      mountedRef.current &&
      resolutionRequestRef.current === requestId &&
      pendingRef.current &&
      !deletePendingRef.current
    );
  }

  async function resolve(
    input: ResidenceInput,
    requestId: number,
    manualAddress?: string,
  ) {
    try {
      const response = await fetch(resolveEndpoint, {
        body: JSON.stringify(input),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as
        | ResolutionResponse
        | ResolutionErrorResponse;

      if (!canApplyResolution(requestId)) {
        return;
      }

      if (
        response.ok &&
        (body.status === "matched" || body.status === "partial")
      ) {
        setAddress("");
        setResult(body);

        if (manualAddress && isFresh(body.expiresAt)) {
          setCandidate({
            address: manualAddress,
            expiresAt: body.expiresAt,
            resolutionToken: body.resolutionToken,
          });
        }

        setStatus(
          manualAddress && !isFresh(body.expiresAt)
            ? "The residence preview expired. Preview your voting residence again before saving."
            : body.status === "matched"
              ? "Residence matched. Review the divisions and source below."
              : "Partial residence match. Review the coverage notes below.",
        );
        return;
      }

      if (
        (response.status === 401 || body.status === "unauthenticated")
      ) {
        invalidatePrivateResidence(
          "message" in body
            ? body.message
            : "Sign in again before managing a saved residence.",
        );
        return;
      }

      setStatus(
        "message" in body
          ? body.message
          : "Residence check did not complete. Try again.",
      );
      focusManualAfterPendingRef.current = true;
    } catch {
      if (!canApplyResolution(requestId)) {
        return;
      }
      setStatus(
        "We could not reach the server. Your residence was not checked. Try again.",
      );
      focusManualAfterPendingRef.current = true;
    } finally {
      finish(requestId);
    }
  }

  function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteConfirmation(false);
    const normalizedAddress = address.trim();

    if (!normalizedAddress) {
      clearCandidate();
      setStatus("Enter your voting residence before checking it.");
      inputRef.current?.focus();
      return;
    }

    const requestId = begin("Checking residence…");
    if (requestId !== null) {
      void resolve(
        { kind: "address", address: normalizedAddress },
        requestId,
        normalizedAddress,
      );
    }
  }

  function useDeviceOnce() {
    if (pendingRef.current || savePendingRef.current || deletePendingRef.current) {
      return;
    }

    setDeleteConfirmation(false);
    clearCandidate();
    if (!("geolocation" in navigator)) {
      setStatus(
        "Device location is not available. Enter your voting residence instead.",
      );
      inputRef.current?.focus();
      return;
    }

    const requestId = begin("Getting this device's location…");
    if (requestId === null) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!canApplyResolution(requestId)) {
          return;
        }
        void resolve(
          {
            kind: "coordinates",
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
          requestId,
        );
      },
      (error) => {
        if (!canApplyResolution(requestId)) {
          return;
        }
        focusManualAfterPendingRef.current = true;
        setStatus(deviceErrorMessage(error.code));
        finish(requestId);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 0,
        timeout: 10_000,
      },
    );
  }

  async function saveResidence() {
    if (
      !candidate ||
      !consentAccepted ||
      (savedState !== "empty" && savedState !== "saved") ||
      savePendingRef.current ||
      deletePendingRef.current
    ) {
      return;
    }

    if (!isFresh(candidate.expiresAt)) {
      focusManualAfterPendingRef.current = true;
      clearCandidate();
      setStatus(
        "The residence preview expired. Preview your voting residence again before saving.",
      );
      return;
    }

    savePendingRef.current = true;
    setSavePending(true);
    setStatus(
      savedResidence
        ? "Saving residence replacement…"
        : "Saving residence…",
    );

    try {
      const response = await fetch(savedEndpoint, {
        body: JSON.stringify({
          address: candidate.address,
          resolutionToken: candidate.resolutionToken,
          consent: {
            accepted: true,
            version: savedResidenceConsentVersion,
          },
        } satisfies SaveResidenceRequest),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as
        | SaveResidenceResponse
        | SavedResidenceErrorResponse;

      if (!mountedRef.current) {
        return;
      }

      if (response.ok && body.status === "saved") {
        setSavedResidence(body.residence);
        setSavedState("saved");
        setDeleteConfirmation(false);
        focusManualAfterPendingRef.current = true;
        clearCandidate();
        setStatus(
          body.replaced
            ? "Saved residence was replaced."
            : "Saved residence was saved.",
        );
        return;
      }

      if (response.status === 401 || body.status === "unauthenticated") {
        invalidatePrivateResidence(
          "message" in body
            ? body.message
            : "Sign in again before managing a saved residence.",
        );
        return;
      }

      if (response.status === 422 || body.status === "invalid_token") {
        focusManualAfterPendingRef.current = true;
        clearCandidate();
        setStatus(
          "message" in body
            ? body.message
            : "Preview your voting residence again before saving.",
        );
        return;
      }

      setStatus(
        `${
          "message" in body
            ? body.message
            : "We could not save the residence. Try again."
        } ${unchangedResidenceMessage(savedResidence)}`,
      );
    } catch {
      if (!mountedRef.current) {
        return;
      }
      setStatus(
        `We could not save the residence. Try again. ${unchangedResidenceMessage(savedResidence)}`,
      );
    } finally {
      savePendingRef.current = false;
      if (mountedRef.current) {
        setSavePending(false);
      }
    }
  }

  async function deleteResidence() {
    if (
      !savedResidence ||
      deletePendingRef.current ||
      savePendingRef.current ||
      pendingRef.current
    ) {
      return;
    }

    deletePendingRef.current = true;
    setDeletePending(true);
    setStatus("Deleting saved residence…");

    try {
      const response = await fetch(savedEndpoint, {
        body: JSON.stringify({ confirmation: "DELETE_SAVED_RESIDENCE" }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
      const body = (await response.json()) as
        | DeleteSavedResidenceResponse
        | SavedResidenceErrorResponse;

      if (!mountedRef.current) {
        return;
      }

      if (
        response.ok &&
        (body.status === "deleted" || body.status === "empty")
      ) {
        setSavedResidence(null);
        setSavedState("empty");
        setDeleteConfirmation(false);
        clearCandidate();
        focusManualAfterPendingRef.current = true;
        setStatus("Saved residence was deleted.");
        return;
      }

      if (response.status === 401 || body.status === "unauthenticated") {
        invalidatePrivateResidence(
          "message" in body
            ? body.message
            : "Sign in again before managing a saved residence.",
        );
        return;
      }

      setStatus(
        `${
          "message" in body
            ? body.message
            : "We could not delete the saved residence. Try again."
        } Your saved residence is unchanged.`,
      );
    } catch {
      if (!mountedRef.current) {
        return;
      }
      setStatus(
        "We could not delete the saved residence. Try again. Your saved residence is unchanged.",
      );
    } finally {
      deletePendingRef.current = false;
      if (mountedRef.current) {
        setDeletePending(false);
      }
    }
  }

  const mutationPending = savePending || deletePending;
  const showSaveControls =
    candidate !== null && (savedState === "empty" || savedState === "saved");

  return (
    <>
      <section
        aria-labelledby={
          savedState === "saved" ? "saved-residence-heading" : undefined
        }
        className="saved-residence"
      >
        <h2 id="saved-residence-heading" ref={savedHeadingRef} tabIndex={-1}>
          Saved residence
        </h2>

        {savedState === "loading" ? (
          <p role="status">Loading saved residence…</p>
        ) : null}

        {savedState === "empty" ? <p>No residence is saved.</p> : null}

        {savedState === "error" || savedState === "unauthenticated" ? (
          <div>
            <p role="status">{savedError}</p>
            <p>No saved residence data was changed.</p>
            {savedState === "unauthenticated" ? (
              <a href="/sign-in" ref={signInRef}>
                Sign in
              </a>
            ) : (
              <button
                className="secondary-button"
                onClick={() => void retrySavedResidence()}
                type="button"
              >
                Retry saved residence
              </button>
            )}
          </div>
        ) : null}

        {savedState === "saved" && savedResidence ? (
          <div className="saved-residence-details">
            <p>
              <strong>Saved address:</strong> {savedResidence.address}
            </p>
            <ResidenceResult
              label="Saved residence match"
              result={savedResidence.resolution}
            />
            <p>
              Consent recorded:{" "}
              <time dateTime={savedResidence.consent.acceptedAt}>
                {savedResidence.consent.acceptedAt}
              </time>
            </p>
            <button
              aria-controls="saved-residence-delete-confirmation"
              aria-expanded={deleteConfirmation}
              className="secondary-button"
              disabled={pending || mutationPending}
              onClick={() => {
                if (!pendingRef.current) {
                  setDeleteConfirmation(true);
                }
              }}
              ref={deleteButtonRef}
              type="button"
            >
              Delete saved residence
            </button>
            {deleteConfirmation ? (
              <div
                aria-labelledby="saved-residence-delete-confirmation-label"
                className="saved-residence-confirmation"
                id="saved-residence-delete-confirmation"
                role="group"
              >
                <p id="saved-residence-delete-confirmation-label">
                  Delete this saved address and its political divisions? Your
                  account will remain.
                </p>
                <button
                  disabled={pending || mutationPending}
                  onClick={() => void deleteResidence()}
                  ref={confirmDeleteButtonRef}
                  type="button"
                >
                  Confirm deletion
                </button>
                <button
                  className="secondary-button"
                  disabled={pending || mutationPending}
                  onClick={() => {
                    focusDeleteAfterConfirmationRef.current = true;
                    setDeleteConfirmation(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="residence-preview-heading"
        className="residence-preview"
      >
        <div>
          <p className="section-label">Residence preview</p>
          <h2 id="residence-preview-heading">Preview your voting residence</h2>
          <p className="residence-intro">
            Enter your voting residence to match it with political divisions.
          </p>
          <p className="residence-privacy">
            Your address is not saved unless you explicitly choose and consent
            to save it.
          </p>
        </div>

        <form className="residence-form" onSubmit={submitAddress}>
          <label htmlFor="voting-residence">Voting residence address</label>
          <input
            autoComplete="street-address"
            disabled={pending || mutationPending}
            id="voting-residence"
            maxLength={300}
            onChange={(event) => {
              setAddress(event.target.value);
              clearCandidate();
            }}
            ref={inputRef}
            required
            type="text"
            value={address}
          />
          <button disabled={pending || mutationPending} type="submit">
            Check residence
          </button>
        </form>

        <div className="residence-device">
          <p>Current device location may not be your voting residence.</p>
          <p>
            Your device coordinates are used only for this check and are not
            saved.
          </p>
          <button
            className="secondary-button"
            disabled={pending || mutationPending}
            onClick={useDeviceOnce}
            type="button"
          >
            Use this device once
          </button>
        </div>

        <p className="residence-status" role="status">
          {status}
        </p>

        {result ? (
          <ResidenceResult label="Residence preview match" result={result} />
        ) : null}

        {showSaveControls ? (
          <section
            aria-labelledby="save-residence-heading"
            className="save-residence"
            ref={candidateControlsRef}
          >
            <h3 id="save-residence-heading">Save this residence</h3>
            {savedResidence ? (
              <p>
                Saving this residence replaces your existing saved residence.
                No prior residence history will be retained.
              </p>
            ) : null}
            <label>
              <input
                checked={consentAccepted}
                disabled={mutationPending}
                onChange={(event) => setConsentAccepted(event.target.checked)}
                type="checkbox"
              />{" "}
              {consentCopy}
            </label>
            <button
              disabled={!consentAccepted || mutationPending}
              onClick={() => void saveResidence()}
              type="button"
            >
              Save residence
            </button>
          </section>
        ) : null}
      </section>
    </>
  );
}

function ResidenceResult({
  label,
  result,
}: {
  label: "Residence preview match" | "Saved residence match";
  result: SavedResidenceResolution;
}) {
  const provenanceLabel =
    label === "Saved residence match"
      ? "Saved residence source and freshness"
      : "Residence preview source and freshness";

  return (
    <section aria-label={label} className="residence-result">
      <h3>
        {result.status === "matched"
          ? "Matched political divisions"
          : "Partial political divisions"}
      </h3>
      <ul aria-label="Political divisions" className="residence-divisions">
        {result.divisions.map((division) => (
          <li key={`${division.idScheme}:${division.type}:${division.id}`}>
            <strong>{division.name}</strong>
            <span>{division.type.replaceAll("_", " ")}</span>
            <span className="division-id">{division.id}</span>
          </li>
        ))}
      </ul>

      <section aria-label={provenanceLabel} className="residence-provenance">
        <h4>Source and freshness</h4>
        <p>
          Source: <a href={result.source.url}>{result.source.name}</a>
        </p>
        <p>
          Checked:{" "}
          <time dateTime={result.source.checkedAt}>{result.source.checkedAt}</time>
        </p>
        <p>
          {result.source.effectiveAt ? (
            <>
              Effective:{" "}
              <time dateTime={result.source.effectiveAt}>
                {result.source.effectiveAt}
              </time>
            </>
          ) : (
            "Effective date unavailable."
          )}
        </p>
        {result.source.benchmark ? (
          <p>Benchmark: {result.source.benchmark}</p>
        ) : null}
        {result.source.vintage ? <p>Vintage: {result.source.vintage}</p> : null}
      </section>

      <div className="residence-coverage">
        <h4>Coverage notes</h4>
        <ul aria-label="Coverage notes">
          {result.coverageNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

async function requestSavedResidence(): Promise<SavedLoadOutcome> {
  try {
    const response = await fetch(savedEndpoint, { method: "GET" });
    const body = (await response.json()) as
      | GetSavedResidenceResponse
      | SavedResidenceErrorResponse;

    if (response.ok && body.status === "empty") {
      return { state: "empty" };
    }
    if (response.ok && body.status === "saved") {
      return { state: "saved", residence: body.residence };
    }

    return {
      state:
        response.status === 401 || body.status === "unauthenticated"
          ? "unauthenticated"
          : "error",
      message:
        "message" in body
          ? body.message
          : "We could not load your saved residence. Try again.",
    };
  } catch {
    return {
      state: "error",
      message: "We could not load your saved residence. Try again.",
    };
  }
}

function isFresh(expiresAt: string) {
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

function unchangedResidenceMessage(savedResidence: SavedResidenceView | null) {
  return savedResidence
    ? "Your prior saved residence is unchanged."
    : "No saved residence data was changed.";
}

function deviceErrorMessage(code: number) {
  if (code === 1) {
    return "Location permission was denied. Enter your voting residence instead.";
  }
  if (code === 3) {
    return "Location request timed out. Enter your voting residence instead.";
  }
  return "This device's location is unavailable. Enter your voting residence instead.";
}
