"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ADDRESS_SUGGESTION_MIN_LENGTH, type AddressSuggestion } from "@/lib/address-suggestions-contract";

type AddressAutocompleteProps = {
  available: boolean;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onUnauthenticated: () => void;
  value: string;
};

const unavailableMessage =
  "Suggestions are unavailable. You can still enter the full address and check it.";

export function AddressAutocomplete({
  available,
  disabled,
  inputRef,
  onChange,
  onUnauthenticated,
  value,
}: AddressAutocompleteProps) {
  const [enabled, setEnabled] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [responseQuery, setResponseQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [message, setMessage] = useState("");
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedValueRef = useRef("");
  const onUnauthenticatedRef = useRef(onUnauthenticated);

  useEffect(() => {
    onUnauthenticatedRef.current = onUnauthenticated;
  }, [onUnauthenticated]);

  useEffect(() => {
    const generation = ++generationRef.current;
    const query = value.trim();
    if (!available || !enabled || disabled || query.length < ADDRESS_SUGGESTION_MIN_LENGTH || query === selectedValueRef.current) {
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      if (generation !== generationRef.current) return;
      setMessage("Looking for address suggestions…");
      requestTimeout = setTimeout(() => controller.abort(), 4_000);
      try {
        const response = await fetch("/api/v1/location/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ query, consent: true }),
          signal: controller.signal,
        });
        if (generation !== generationRef.current) return;
        if (response.status === 401) {
          setSuggestions([]);
          setMessage("Sign in again before using address suggestions.");
          onUnauthenticatedRef.current();
          return;
        }
        if (response.status === 429) {
          setMessage("Suggestions are busy. Pause before typing again, or enter the full address.");
          return;
        }
        if (!response.ok) throw new Error("Suggestions unavailable");
        const body: unknown = await response.json();
        if (generation !== generationRef.current) return;
        const matches = readSuggestions(body);
        if (matches === null) throw new Error("Invalid suggestion response");
        setSuggestions(matches);
        setResponseQuery(query);
        setActiveIndex(-1);
        setOpen(matches.length > 0);
        setMessage(matches.length
          ? `${matches.length} address ${matches.length === 1 ? "suggestion" : "suggestions"} available. Use the arrow keys to review.`
          : "No address suggestions found. Add a city, state, or ZIP code, or check the full address directly.");
      } catch {
        if (generation === generationRef.current) {
          setSuggestions([]);
          setMessage(unavailableMessage);
        }
      } finally {
        clearTimeout(requestTimeout);
      }
    }, 500);
    return () => {
      generationRef.current += 1;
      clearTimeout(timer);
      clearTimeout(requestTimeout);
      controller.abort();
    };
  }, [available, disabled, enabled, value]);

  function dismiss() {
    generationRef.current += 1;
    controllerRef.current?.abort();
    setOpen(false);
    setActiveIndex(-1);
    setMessage("");
  }

  function select(suggestion: AddressSuggestion) {
    dismiss();
    selectedValueRef.current = suggestion.address;
    setSuggestions([]);
    onChange(suggestion.address);
    setMessage("Address selected. Choose Check residence to verify its political divisions.");
    inputRef.current?.focus();
  }

  const showList = available && enabled && !disabled && open &&
    responseQuery === value.trim() && suggestions.length > 0;

  useEffect(() => {
    if (showList && activeIndex >= 0) {
      listRef.current?.children.item(activeIndex)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeIndex, showList]);

  return (
    <div className="address-autocomplete">
      <div className="address-input">
        <input
          aria-autocomplete={available && enabled ? "list" : undefined}
          aria-controls={showList ? "residence-address-suggestions" : undefined}
          aria-describedby="residence-address-help residence-suggestion-status"
          aria-expanded={available && enabled ? showList : undefined}
          aria-activedescendant={showList && activeIndex >= 0 ? `residence-suggestion-${activeIndex}` : undefined}
          autoComplete={enabled ? "off" : "street-address"}
          disabled={disabled}
          id="voting-residence"
          maxLength={300}
          onBlur={dismiss}
          onChange={(event) => {
            dismiss();
            setSuggestions([]);
            selectedValueRef.current = "";
            onChange(event.target.value);
          }}
          onFocus={() => {
            if (suggestions.length && responseQuery === value.trim()) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (showList) event.preventDefault();
              dismiss();
            } else if (showList && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              setActiveIndex((index) => event.key === "ArrowDown"
                ? (index + 1) % suggestions.length
                : index < 0 ? suggestions.length - 1 : (index - 1 + suggestions.length) % suggestions.length);
            } else if (showList && event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              select(suggestions[activeIndex]);
            }
          }}
          ref={inputRef}
          required
          role={available && enabled ? "combobox" : undefined}
          type="text"
          value={value}
        />
        {showList && (
          <ul aria-label="Address suggestions" className="address-suggestions" id="residence-address-suggestions" ref={listRef} role="listbox">
            {suggestions.map((suggestion, index) => (
              <li
                aria-selected={index === activeIndex}
                id={`residence-suggestion-${index}`}
                key={suggestion.id}
                onClick={() => select(suggestion)}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => setActiveIndex(index)}
                role="option"
              >
                {suggestion.address}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="address-help" id="residence-address-help">
        Enter the full street address, city, state, and ZIP code. Suggestions do not verify a voting residence.
      </p>
      {available && (
        <div className="address-suggestion-consent">
          <label>
            <input
              checked={enabled}
              disabled={disabled}
              onChange={(event) => {
                dismiss();
                setSuggestions([]);
                setEnabled(event.target.checked);
              }}
              type="checkbox"
            />
            Enable address suggestions
          </label>
          <p>When enabled, what you type is sent to the app’s configured Photon geocoder. Suggestions are not saved.</p>
          <p>Address data © <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">OpenStreetMap contributors</a>. Coverage may be incomplete.</p>
        </div>
      )}
      <p aria-live="polite" className="address-suggestion-status" id="residence-suggestion-status" role="status">
        {enabled && !disabled ? message : ""}
      </p>
    </div>
  );
}

function readSuggestions(body: unknown): AddressSuggestion[] | null {
  if (!body || typeof body !== "object" || !("status" in body) || body.status !== "ok" ||
    !("suggestions" in body) || !Array.isArray(body.suggestions) || body.suggestions.length > 5) return null;
  const ids = new Set<string>();
  for (const suggestion of body.suggestions) {
    if (!suggestion || typeof suggestion !== "object" || typeof suggestion.id !== "string" ||
      !suggestion.id || suggestion.id.length > 300 || ids.has(suggestion.id) ||
      typeof suggestion.address !== "string" || !suggestion.address.trim() ||
      suggestion.address.length > 300 || /[\u0000-\u001f\u007f]/.test(suggestion.address)) return null;
    ids.add(suggestion.id);
  }
  return body.suggestions;
}
