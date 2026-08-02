import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { GovernmentNavigation } from "./government-navigation";
import { normalizeGovernmentNavigation } from "@/lib/government-navigation";

const panels = {
  local: <p>Local panel</p>,
  state: <p>State legislature panel</p>,
  federal: <p>Federal Congress panel</p>,
};

describe("GovernmentNavigation", () => {
  it("lets server code normalize before invoking only the selected level loader", () => {
    const local = vi.fn();
    const state = vi.fn();
    const federal = vi.fn();
    const navigation = normalizeGovernmentNavigation(
      new URLSearchParams("level=state&mode=in-office&category=legislature"),
    );

    if (navigation.level === "local") {
      local();
    } else if (navigation.level === "state") {
      state();
    } else {
      federal();
    }

    expect(navigation).toEqual({
      level: "state",
      mode: "in-office",
      category: "legislature",
    });
    expect(state).toHaveBeenCalledOnce();
    expect(local).not.toHaveBeenCalled();
    expect(federal).not.toHaveBeenCalled();
  });

  it("normalizes arbitrary, repeated, and unsupported query values to the safe Federal Congress view", () => {
    const { container } = render(
      <GovernmentNavigation
        panels={panels}
        searchParams={{
          level: ["state", "federal"],
          mode: "unknown",
          category: "not-a-category",
          address: "1 Private Road",
        }}
      />,
    );

    expect(screen.getByRole("tab", { name: "Federal" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Federal Congress panel");
    const local = screen.getByRole("tab", { name: "Local" });
    expect(local.tagName).toBe("A");
    expect(local).toHaveAttribute(
      "href",
      "?level=local&mode=in-office",
    );
    expect(screen.getByRole("tab", { name: "State" })).toHaveAttribute(
      "href",
      "?level=state&mode=in-office&category=legislature",
    );
    expect(screen.getByRole("tab", { name: "Federal" })).toHaveAttribute(
      "href",
      "?level=federal&mode=in-office&category=congress",
    );
    expect(container.innerHTML).not.toContain("1 Private Road");
    expect(container.innerHTML).not.toContain("not-a-category");
  });

  it("uses only level, mode, and available category in canonical native-link URLs", () => {
    render(
      <GovernmentNavigation
        panels={panels}
        searchParams={new URLSearchParams(
          "level=state&mode=in-office&category=legislature&userId=secret",
        )}
      />,
    );

    expect(screen.getByRole("tabpanel")).toHaveTextContent("State legislature panel");
    expect(screen.getByRole("link", { name: "In office" })).toHaveAttribute(
      "href",
      "?level=state&mode=in-office&category=legislature",
    );
    expect(screen.getByRole("link", { name: "Elections" })).toHaveAttribute(
      "href",
      "?level=state&mode=elections",
    );
    expect(screen.getByText("Legislature")).toBeInTheDocument();
    expect(screen.queryByText("Congress")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("removes unavailable categories for Local and Elections rather than showing disabled future controls", () => {
    const { rerender } = render(
      <GovernmentNavigation
        panels={panels}
        searchParams={new URLSearchParams(
          "level=local&mode=in-office&category=legislature",
        )}
      />,
    );

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Local panel");
    expect(screen.queryByText("Legislature")).toBeNull();
    expect(screen.queryByText("Congress")).toBeNull();
    expect(screen.queryByText(/unavailable/i)).toBeNull();

    rerender(
      <GovernmentNavigation
        panels={panels}
        searchParams={new URLSearchParams(
          "level=federal&mode=elections&category=congress",
        )}
      />,
    );

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Federal Congress panel");
    expect(screen.queryByText("Legislature")).toBeNull();
    expect(screen.queryByText("Congress")).toBeNull();
  });

  it("uses hydrated manual roving focus independently from URL selection", () => {
    render(<GovernmentNavigation panels={panels} />);

    const local = screen.getByRole("tab", { name: "Local" });
    const state = screen.getByRole("tab", { name: "State" });
    const federal = screen.getByRole("tab", { name: "Federal" });

    expect(screen.getByRole("tablist", { name: "Government level" })).toBeInTheDocument();
    expect(federal).toHaveAttribute("aria-selected", "true");
    expectTabStop(federal, local, state);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "In office" }).tabIndex).toBe(0);

    federal.focus();
    fireEvent.keyDown(federal, { key: "ArrowRight" });
    expect(local).toHaveFocus();
    expectTabStop(local, state, federal);
    fireEvent.keyDown(local, { key: "End" });
    expect(federal).toHaveFocus();
    expectTabStop(federal, local, state);
    fireEvent.keyDown(federal, { key: "Home" });
    expect(local).toHaveFocus();
    expectTabStop(local, state, federal);
    fireEvent.keyDown(local, { key: "ArrowLeft" });
    expect(federal).toHaveFocus();
    expectTabStop(federal, local, state);

    fireEvent.focus(state);
    state.focus();
    expect(state).toHaveFocus();
    expectTabStop(state, local, federal);
    expect(federal).toHaveAttribute("aria-selected", "true");
  });

  it("activates a focused tab through its existing href when Space is pressed", () => {
    render(<GovernmentNavigation panels={panels} />);

    const state = screen.getByRole("tab", { name: "State" });
    let activatedHref: string | null = null;
    state.addEventListener("click", (event) => {
      event.preventDefault();
      activatedHref = (event.currentTarget as HTMLAnchorElement).getAttribute("href");
    });
    state.focus();
    const keyDown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: " ",
    });

    const dispatched = state.dispatchEvent(keyDown);

    expect(activatedHref).toBe("?level=state&mode=in-office&category=legislature");
    expect(dispatched).toBe(false);
    expect(keyDown.defaultPrevented).toBe(true);
  });

  it("resets roving ownership to a new URL-selected level", () => {
    const { rerender } = render(<GovernmentNavigation panels={panels} />);
    const local = screen.getByRole("tab", { name: "Local" });
    const state = screen.getByRole("tab", { name: "State" });
    const federal = screen.getByRole("tab", { name: "Federal" });

    fireEvent.focus(local);
    local.focus();
    expectTabStop(local, state, federal);

    rerender(
      <GovernmentNavigation
        panels={panels}
        searchParams={new URLSearchParams("level=state&mode=in-office")}
      />,
    );

    const nextLocal = screen.getByRole("tab", { name: "Local" });
    const nextState = screen.getByRole("tab", { name: "State" });
    const nextFederal = screen.getByRole("tab", { name: "Federal" });
    expect(nextState).toHaveAttribute("aria-selected", "true");
    expectTabStop(nextState, nextLocal, nextFederal);
  });

  it("keeps deep links usable in server markup without simulating JavaScript navigation", () => {
    const markup = renderToStaticMarkup(
      <GovernmentNavigation panels={panels} />,
    );

    expect(markup).toContain('href="?level=federal&amp;mode=in-office&amp;category=congress"');
    expect(markup).toContain('href="?level=local&amp;mode=in-office"');
    expect(markup).toContain('href="?level=state&amp;mode=in-office&amp;category=legislature"');
    expect(markup).toContain("Federal Congress panel");
    expect(markup).not.toContain('tabindex="-1"');
    expect(markup).not.toContain('tabindex="0"');
    expect(markup).not.toMatch(/<script|onClick=/i);
  });
});

function expectTabStop(
  selected: HTMLElement,
  ...otherTabs: HTMLElement[]
) {
  expect(selected).toHaveAttribute("tabindex", "0");
  for (const tab of otherTabs) {
    expect(tab).toHaveAttribute("tabindex", "-1");
  }
}
