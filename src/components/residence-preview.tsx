"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type {
  ResidenceInput,
  ResolutionErrorResponse,
  ResolutionResponse,
} from "@/lib/residence";

type ResolvedResponse = Extract<
  ResolutionResponse,
  { status: "matched" | "partial" }
>;

const endpoint = "/api/v1/location/resolve";

export function ResidencePreview() {
  const [address, setAddress] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ResolvedResponse | null>(null);
  const [status, setStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const focusManualAfterPendingRef = useRef(false);

  useLayoutEffect(() => {
    if (!pending && focusManualAfterPendingRef.current) {
      focusManualAfterPendingRef.current = false;
      inputRef.current?.focus();
    }
  }, [pending]);

  function begin(message: string) {
    if (pendingRef.current) {
      return false;
    }

    pendingRef.current = true;
    setPending(true);
    setResult(null);
    setStatus(message);
    return true;
  }

  function finish() {
    pendingRef.current = false;
    setPending(false);
  }

  async function resolve(input: ResidenceInput) {
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify(input),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as
        | ResolutionResponse
        | ResolutionErrorResponse;

      if (
        response.ok &&
        (body.status === "matched" || body.status === "partial")
      ) {
        setAddress("");
        setResult(body);
        setStatus(
          body.status === "matched"
            ? "Residence matched. Review the divisions and source below."
            : "Partial residence match. Review the coverage notes below.",
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
      setStatus(
        "We could not reach the server. Your residence was not checked. Try again.",
      );
      focusManualAfterPendingRef.current = true;
    } finally {
      finish();
    }
  }

  function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedAddress = address.trim();

    if (!normalizedAddress) {
      setStatus("Enter your voting residence before checking it.");
      inputRef.current?.focus();
      return;
    }

    if (begin("Checking residence…")) {
      void resolve({ kind: "address", address: normalizedAddress });
    }
  }

  function useDeviceOnce() {
    if (pendingRef.current) {
      return;
    }

    if (!("geolocation" in navigator)) {
      setStatus(
        "Device location is not available. Enter your voting residence instead.",
      );
      inputRef.current?.focus();
      return;
    }

    if (!begin("Getting this device's location…")) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        void resolve({
          kind: "coordinates",
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      },
      (error) => {
        focusManualAfterPendingRef.current = true;
        setStatus(deviceErrorMessage(error.code));
        finish();
      },
      {
        enableHighAccuracy: false,
        maximumAge: 0,
        timeout: 10_000,
      },
    );
  }

  return (
    <section aria-labelledby="residence-preview-heading" className="residence-preview">
      <div>
        <p className="section-label">Residence preview</p>
        <h2 id="residence-preview-heading">Preview your voting residence</h2>
        <p className="residence-intro">
          Enter your voting residence to match it with political divisions.
        </p>
        <p className="residence-privacy">
          Your address is used only for this check and is not saved.
        </p>
      </div>

      <form className="residence-form" onSubmit={submitAddress}>
        <label htmlFor="voting-residence">Voting residence address</label>
        <input
          autoComplete="street-address"
          disabled={pending}
          id="voting-residence"
          maxLength={300}
          onChange={(event) => setAddress(event.target.value)}
          ref={inputRef}
          required
          type="text"
          value={address}
        />
        <button disabled={pending} type="submit">
          Check residence
        </button>
      </form>

      <div className="residence-device">
        <p>Current device location may not be your voting residence.</p>
        <p>Your device coordinates are used only for this check and are not saved.</p>
        <button
          className="secondary-button"
          disabled={pending}
          onClick={useDeviceOnce}
          type="button"
        >
          Use this device once
        </button>
      </div>

      <p className="residence-status" role="status">
        {status}
      </p>

      {result ? <ResidenceResult result={result} /> : null}
    </section>
  );
}

function ResidenceResult({ result }: { result: ResolvedResponse }) {
  return (
    <section aria-label="Residence match" className="residence-result">
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

      <section aria-label="Source and freshness" className="residence-provenance">
        <h4>Source and freshness</h4>
        <p>
          Source: <a href={result.source.url}>{result.source.name}</a>
        </p>
        <p>
          Checked: <time dateTime={result.source.checkedAt}>{result.source.checkedAt}</time>
        </p>
        <p>
          {result.source.effectiveAt ? (
            <>
              Effective: {" "}
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

function deviceErrorMessage(code: number) {
  if (code === 1) {
    return "Location permission was denied. Enter your voting residence instead.";
  }
  if (code === 3) {
    return "Location request timed out. Enter your voting residence instead.";
  }
  return "This device's location is unavailable. Enter your voting residence instead.";
}
