import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddressAutocomplete } from "./address-autocomplete";

const suggestion = "123 Main Street, Springfield, Illinois 62701";
const newerSuggestion = "456 Oak Street, Springfield, Illinois 62701";

function Harness({ available = true, disabled = false, onUnauthenticated = vi.fn() }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="voting-residence">Voting residence address</label>
      <AddressAutocomplete
        available={available}
        disabled={disabled}
        inputRef={inputRef}
        onChange={setValue}
        onUnauthenticated={onUnauthenticated}
        value={value}
      />
      <button type="submit">Check residence</button>
    </form>
  );
}

function response(address = suggestion) {
  return Response.json({ status: "ok", suggestions: [{ id: "one", address }] });
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}

function enable() {
  fireEvent.click(screen.getByRole("checkbox", { name: "Enable address suggestions" }));
}

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Voting residence address"), { target: { value } });
}

describe("address suggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps manual entry available without contacting a provider before opt-in", async () => {
    render(<Harness />);
    type("123 Mian St, Springfield");
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/what you type.*Photon/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check residence" })).toBeEnabled();
  });

  it("does not advertise suggestions when no operator has configured a provider", async () => {
    render(<Harness available={false} />);
    type("123 Main");
    await settle();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/full street address, city, state, and ZIP/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("debounces opted-in typing and sends it only in a same-origin POST body", async () => {
    render(<Harness />);
    enable();
    type("12");
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    type("123 Mi");
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    type("123 Mian St, Springfield");
    expect(fetch).not.toHaveBeenCalled();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/v1/location/suggest", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ query: "123 Mian St, Springfield", consent: true }),
      cache: "no-store",
      signal: expect.any(AbortSignal),
    }));
    expect(screen.getByRole("option", { name: suggestion })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /OpenStreetMap/ })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  });

  it("supports Arrow keys and Enter to fill the address without checking or saving it", async () => {
    render(<Harness />);
    enable();
    type("123 Mian St");
    await settle();
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", screen.getByRole("option").id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue(suggestion);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/selected.*Check residence/i)).toBeInTheDocument();
  });

  it("dismisses the dropdown on Escape without reopening for the same request", async () => {
    render(<Harness />);
    enable();
    type("123 Main");
    await settle();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    await settle();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Voting residence address")).toHaveValue("123 Main");
  });

  it("starts ArrowUp navigation at the final suggestion", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ status: "ok", suggestions: [
      { id: "one", address: suggestion }, { id: "two", address: newerSuggestion },
    ] }));
    render(<Harness />);
    enable();
    type("123 Main");
    await settle();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: newerSuggestion })).toHaveAttribute("aria-selected", "true");
  });

  it("scrolls the keyboard-active option into the nearest visible part of the list", async () => {
    const scroll = vi.fn();
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
    try {
      render(<Harness />);
      enable();
      type("123 Main");
      await settle();
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
      expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
      expect(scroll.mock.instances[0]).toBe(screen.getByRole("option"));
    } finally {
      if (original) Object.defineProperty(Element.prototype, "scrollIntoView", original);
      else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("aborts older work and ignores a late response after newer typing", async () => {
    let resolveOld!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    vi.mocked(fetch).mockResolvedValueOnce(response(newerSuggestion));
    render(<Harness />);
    enable();
    type("123 Main");
    await settle();
    const oldSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    type("456 Oak");
    expect(oldSignal?.aborted).toBe(true);
    await settle();
    await act(async () => { resolveOld(response()); });
    expect(screen.queryByRole("option", { name: suggestion })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: newerSuggestion })).toBeInTheDocument();
  });

  it("aborts and clears pending suggestions when opt-in is removed or checking starts", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const { rerender } = render(<Harness />);
    enable();
    type("123 Main");
    await settle();
    const firstSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    enable();
    expect(firstSignal?.aborted).toBe(true);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    enable();
    await settle();
    const secondSignal = vi.mocked(fetch).mock.calls[1][1]?.signal;
    rerender(<Harness disabled />);
    expect(secondSignal?.aborted).toBe(true);
    expect(screen.getByLabelText("Voting residence address")).toBeDisabled();
  });

  it("recovers from an offline request with editable manual input and safe prose", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("secret-provider-url?address=private"));
    render(<Harness />);
    enable();
    type("123 Main");
    await settle();
    expect(screen.getByText(/Suggestions are unavailable.*enter.*address/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Voting residence address")).toBeEnabled();
    expect(screen.queryByText(/secret-provider/)).not.toBeInTheDocument();
  });

  it("clears suggestions and notifies the residence flow when the session expires", async () => {
    const expired = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ status: "unauthenticated" }, { status: 401 }));
    render(<Harness onUnauthenticated={expired} />);
    enable();
    type("123 Main");
    await settle();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText(/Sign in again.*suggestions/i)).toBeInTheDocument();
  });

  it("does not reopen a list after focus has left or expose a malformed provider response", async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<Harness />);
    enable();
    type("123 Main");
    await settle();
    fireEvent.blur(screen.getByRole("combobox"), { relatedTarget: screen.getByRole("button", { name: "Check residence" }) });
    await act(async () => { finish(response()); });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    type("456 Oak");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ status: "ok", suggestions: [{ id: "bad", address: { nested: true } }] }));
    await settle();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
