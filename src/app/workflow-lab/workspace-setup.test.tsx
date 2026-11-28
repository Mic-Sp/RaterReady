// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSetup } from "./workspace-setup";
import { detectOperatingSystem } from "./shortcut-reference";
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
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
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

  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", "Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", "macOS"],
    ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)", "Linux x86_64", "ChromeOS"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64", "Linux"],
    ["Generic desktop browser", "X11", "Windows"],
  ])("detects desktop OS from %s on %s", (agent, platform, expected) => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue(platform);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(agent);
    expect(detectOperatingSystem()).toBe(expected);
  });

  it("uses the explicit OS hint before an ambiguous legacy platform", () => {
    const navigator = window.navigator as Navigator & { userAgentData?: { platform: string } };
    Object.defineProperty(navigator, "userAgentData", { configurable: true, value: { platform: "Chrome OS" } });
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    try {
      expect(detectOperatingSystem()).toBe("ChromeOS");
    } finally {
      delete navigator.userAgentData;
    }
  });

  it("announces navigation, saves completed checks and the active step, and resets on request", async () => {
    const user = userEvent.setup();
    const firstVisit = render(<WorkspaceSetup />);
    const next = screen.getByRole<HTMLButtonElement>("button", { name: "Complete & continue to Step 2" });
    expect(next.disabled).toBe(true);
    await user.click(choice("A response is cut off"));
    expect(screen.getByRole("status", { name: "Setup check feedback" }).textContent).toContain("Try widening the windows");
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

  it("reveals the scratchpad model without storing notes and collapses the steps only after finishing", async () => {
    window.localStorage.setItem(walkthroughStorageKey, JSON.stringify({ activeStep: 2, completed: [0, 1, 3, 4], finished: false }));
    const user = userEvent.setup();
    const visit = render(<WorkspaceSetup />);
    const compare = screen.getByRole("button", { name: "Compare with model" });
    await user.click(compare);
    expect(screen.getByRole("status", { name: "Setup check feedback" }).textContent).toContain("Try adding a short note under Claim");
    expect(screen.getByText("Worked model")).toBeDefined();
    expect(screen.getByText("5 of 5 complete")).toBeDefined();
    for (const label of ["Claim", "Source", "Uncertainty", "Judgment"]) {
      await user.type(screen.getByRole("textbox", { name: label }), "Temporary synthetic note");
    }
    await user.click(compare);
    expect(screen.getByText("Worked model")).toBeDefined();
    expect(screen.getByText("5 of 5 complete")).toBeDefined();
    expect(window.localStorage.getItem(walkthroughStorageKey)).not.toContain("Temporary synthetic note");
    await user.click(step(5));
    expect(screen.getByRole("button", { name: /^Step 5:.*complete$/ })).toBe(step(5));
    expect(screen.queryByRole("heading", { name: "Walkthrough complete" })).toBeNull();
    const practice = screen.getByRole("link", { name: "Try these habits in Generalist practice" });
    expect(practice.getAttribute("href")).toBe("/practice");
    expect(practice.classList.contains("inline-link")).toBe(true);
    expect(screen.getByRole("link", { name: "Return to dashboard" }).getAttribute("href")).toBe("/dashboard");

    const finish = screen.getByRole("button", { name: "Finish walkthrough" });
    const updates = screen.getByRole("status", { name: "Walkthrough updates" });
    await user.click(finish);
    const heading = screen.getByRole("heading", { name: "Walkthrough complete" });
    expect(document.activeElement).toBe(heading);
    expect(updates.getAttribute("aria-live")).toBe("polite");
    expect(updates.textContent).toBe("Walkthrough complete. All 5 setup steps are complete.");
    expect(within(screen.getByRole("region", { name: "Walkthrough complete" }))
      .getByRole("link", { name: "Try these habits in Generalist practice" }).classList.contains("primary-button")).toBe(true);
    expect(screen.queryByRole("navigation", { name: "Setup steps" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Operating system" })).toBeNull();

    const reopen = screen.getByRole("button", { name: "Reopen walkthrough steps", expanded: false });
    const walkthrough = document.getElementById(reopen.getAttribute("aria-controls")!);
    expect(walkthrough?.hidden).toBe(true);
    await user.click(reopen);
    expect(screen.getByRole("button", { name: "Hide walkthrough steps", expanded: true })).toBe(reopen);
    expect(walkthrough?.hidden).toBe(false);
    expect(document.activeElement).toBe(reopen);
    expect(step(5).getAttribute("aria-current")).toBe("step");
    const announcement = updates.firstElementChild;
    await user.click(finish);
    expect(walkthrough?.hidden).toBe(true);
    expect(document.activeElement).toBe(heading);
    expect(updates.firstElementChild).not.toBe(announcement);
    expect(updates.textContent).toBe("Walkthrough complete. All 5 setup steps are complete.");

    visit.unmount();
    render(<WorkspaceSetup />);
    expect(screen.getByRole("button", { name: "Reopen walkthrough steps", expanded: false })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Reset walkthrough" }));
    expect(screen.queryByRole("heading", { name: "Walkthrough complete" })).toBeNull();
    expect(screen.queryByRole("button", { name: /walkthrough steps/ })).toBeNull();
    expect(step(1).getAttribute("aria-current")).toBe("step");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Arrange your comparison windows" }));
    expect(window.localStorage.getItem(walkthroughStorageKey)).toBeNull();
    expect(screen.getByRole("link", { name: "Try these habits in Generalist practice" }).classList.contains("inline-link")).toBe(true);
  });

  it("collapses a legacy finished save and remembers when review is reopened", async () => {
    window.localStorage.setItem(walkthroughStorageKey, JSON.stringify({ activeStep: 1, completed: [0, 1, 2, 3, 4], finished: true }));
    const user = userEvent.setup();
    const visit = render(<WorkspaceSetup />);
    await user.click(screen.getByRole("button", { name: "Reopen walkthrough steps", expanded: false }));
    expect(screen.getByRole("table", { name: /browser shortcuts/ })).toBeDefined();
    visit.unmount();
    render(<WorkspaceSetup />);
    await user.click(screen.getByRole("button", { name: "Hide walkthrough steps", expanded: true }));
    expect(screen.queryByRole("table", { name: /browser shortcuts/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Reopen walkthrough steps", expanded: false })).toBeDefined();
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
