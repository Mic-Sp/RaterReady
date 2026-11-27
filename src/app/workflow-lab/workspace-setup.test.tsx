// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSetup } from "./workspace-setup";
import { walkthroughStorageKey } from "./walkthrough-progress";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function keyLabels(element: HTMLElement) {
  return Array.from(element.querySelectorAll("kbd > kbd"), (key) => key.textContent);
}

function shortcutKeys(table: string, action: string) {
  const reference = screen.getByRole("table", { name: table });
  const row = within(reference).getByRole("rowheader", { name: action }).closest("tr")!;
  return keyLabels(row);
}

function findKeys() {
  return keyLabels(within(screen.getByRole("region", { name: "Set up claim verification" })).getByText(/Try it now/).parentElement!);
}

function step(number: number) {
  return screen.getByRole("button", { name: new RegExp(`^Step ${number}:`) });
}

function choice(name: string | RegExp) {
  return screen.getByRole("radio", { name });
}

describe("Workflow Skills Lab", () => {
  it("hydrates Windows and Step 1 markup safely before restoring the detected OS and saved step", () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
    window.localStorage.setItem(walkthroughStorageKey, JSON.stringify({ activeStep: 1, completed: [0], finished: false }));
    const container = document.createElement("div");
    container.innerHTML = renderToString(<WorkspaceSetup />);
    document.body.append(container);
    const markup = within(container);
    const windows = markup.getByRole<HTMLInputElement>("radio", { name: "Windows" });
    expect(windows.checked).toBe(true);
    expect(step(1).getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("0 of 5 complete")).toBeDefined();
    expect(shortcutKeys("Windows window shortcuts", "Snap left")).toEqual(["Windows", "Left Arrow"]);

    const onRecoverableError = vi.fn();
    render(<WorkspaceSetup />, { container, hydrate: true, onRecoverableError });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(markup.getByRole("radio", { name: "Windows" })).toBe(windows);
    expect(markup.getByRole<HTMLInputElement>("radio", { name: "macOS" }).checked).toBe(true);
    expect(step(2).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("button", { name: /^Step 1:.*complete$/ })).toBe(step(1));
    expect(shortcutKeys("macOS browser shortcuts", "Zoom in")).toEqual(["Cmd", "+"]);
    expect(document.activeElement).toBe(document.body);
  });

  it("detects ChromeOS from a legacy user agent and updates each shortcut area with click or keyboard selection", async () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Linux x86_64");
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)");
    render(<WorkspaceSetup />);
    const options = within(screen.getByRole("group", { name: "Operating system" }));
    expect(options.getByRole<HTMLInputElement>("radio", { name: "ChromeOS" }).checked).toBe(true);
    expect(shortcutKeys("ChromeOS window shortcuts", "Snap right")).toEqual(["Alt", "]"]);

    const user = userEvent.setup();
    await user.click(options.getByText("macOS", { exact: true }));
    expect(shortcutKeys("macOS window shortcuts", "Switch windows within this app")).toEqual(["Cmd", "`"]);
    await user.click(step(2));
    expect(shortcutKeys("macOS browser shortcuts", "Next tab")).toEqual(["Cmd", "Option", "Right Arrow"]);
    expect(shortcutKeys("macOS browser shortcuts", "Quick zoom")).toEqual(["Trackpad pinch"]);
    await user.click(step(5));
    expect(findKeys()).toEqual(["Cmd", "F"]);
    await user.click(options.getByRole("radio", { name: "macOS" }));
    await user.keyboard("{ArrowLeft}");
    expect(options.getByRole<HTMLInputElement>("radio", { name: "Windows" }).checked).toBe(true);
    expect(findKeys()).toEqual(["Ctrl", "F"]);
    await user.click(step(2));
    expect(shortcutKeys("Windows browser shortcuts", "Quick zoom")).toEqual(["Ctrl", "Scroll wheel"]);

    await user.click(options.getByRole("radio", { name: "Linux" }));
    await user.click(step(1));
    expect(shortcutKeys("Linux window shortcuts", "Snap left")).toEqual(["Super", "Left Arrow"]);
    expect(screen.getByText(/defaults are for GNOME/)).toBeDefined();
  });

  it("keeps the Windows fallback when the browser reports a mobile Linux-based platform", () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Linux armv8l");
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 16; Mobile)");
    render(<WorkspaceSetup />);
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Windows" }).checked).toBe(true);
    expect(shortcutKeys("Windows window shortcuts", "Switch windows")).toEqual(["Alt", "Tab"]);
  });

  it("announces navigation, saves completed checks and the active step, and resets on request", async () => {
    const user = userEvent.setup();
    const firstVisit = render(<WorkspaceSetup />);
    const next = screen.getByRole<HTMLButtonElement>("button", { name: "Complete & continue to Step 2" });
    expect(next.disabled).toBe(true);
    await user.click(choice("A response is cut off"));
    expect(screen.getByRole("status", { name: "Setup check feedback" }).textContent).toContain("Widen the windows");
    expect(next.disabled).toBe(true);
    await user.click(choice("One window is easier to read"));
    expect(next.disabled).toBe(false);
    await user.click(next);
    const heading = screen.getByRole("heading", { name: "Set up tabs and zoom" });
    expect(document.activeElement).toBe(heading);
    const updates = screen.getByRole("status", { name: "Walkthrough updates" });
    expect(updates.getAttribute("aria-live")).toBe("polite");
    expect(updates.textContent).toBe("Step 2 of 5");
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    expect(step(1).getAttribute("aria-current")).toBe("step");
    await user.click(step(4));
    expect(screen.getByText("1 of 5 complete")).toBeDefined();

    firstVisit.unmount();
    render(<WorkspaceSetup />);
    expect(step(4).getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("1 of 5 complete")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Reset walkthrough" }));
    expect(window.localStorage.getItem(walkthroughStorageKey)).toBeNull();
    expect(step(1).getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("0 of 5 complete")).toBeDefined();
  });

  it("reveals the scratchpad model without storing notes and highlights practice only after finishing", async () => {
    window.localStorage.setItem(walkthroughStorageKey, JSON.stringify({ activeStep: 2, completed: [0, 1, 3, 4], finished: false }));
    const user = userEvent.setup();
    const visit = render(<WorkspaceSetup />);
    const compare = screen.getByRole("button", { name: "Compare with model" });
    await user.click(compare);
    expect(screen.getByRole("status", { name: "Setup check feedback" }).textContent).toContain("Add a short note under Claim");
    for (const label of ["Claim", "Source", "Uncertainty", "Judgment"]) {
      await user.type(screen.getByRole("textbox", { name: label }), "Temporary synthetic note");
    }
    await user.click(compare);
    expect(screen.getByText("Worked model")).toBeDefined();
    expect(screen.getByText("5 of 5 complete")).toBeDefined();
    expect(window.localStorage.getItem(walkthroughStorageKey)).not.toContain("Temporary synthetic note");
    expect(screen.queryByRole("heading", { name: "Walkthrough complete" })).toBeNull();
    await user.click(step(5));
    await user.click(screen.getByRole("button", { name: "Finish walkthrough" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Walkthrough complete" }));
    expect(screen.getByRole("link", { name: "Try these habits in Generalist practice" }).getAttribute("href")).toBe("/practice");
    visit.unmount();
    render(<WorkspaceSetup />);
    expect(screen.getByRole("heading", { name: "Walkthrough complete" })).toBeDefined();
  });

  it("uses a fresh start for invalid data and keeps progress in memory if storage is blocked", async () => {
    window.localStorage.setItem(walkthroughStorageKey, '{"activeStep":9,"completed":[0],"finished":true}');
    render(<WorkspaceSetup />);
    expect(screen.getByText("0 of 5 complete")).toBeDefined();
    expect(step(1).getAttribute("aria-current")).toBe("step");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    await userEvent.setup().click(choice("Both snapped windows are readable"));
    expect(screen.getByText("1 of 5 complete")).toBeDefined();
  });
});
