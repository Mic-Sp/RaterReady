// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSetup } from "./workspace-setup";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
  return keyLabels(screen.getByRole("region", { name: "Set up for claim verification" }));
}

describe("Workflow Skills Lab shortcut reference", () => {
  it("renders Windows on the server and hydrates without a mismatch before switching to detected macOS", () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
    const container = document.createElement("div");
    container.innerHTML = renderToString(<WorkspaceSetup />);
    document.body.append(container);
    const markup = within(container);
    const windows = markup.getByRole<HTMLInputElement>("radio", { name: "Windows" });
    expect(windows.checked).toBe(true);
    expect(shortcutKeys("Windows window shortcuts", "Snap left")).toEqual(["Windows", "Left Arrow"]);
    expect(findKeys()).toEqual(["Ctrl", "F"]);

    const onRecoverableError = vi.fn();
    render(<WorkspaceSetup />, { container, hydrate: true, onRecoverableError });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(markup.getByRole("radio", { name: "Windows" })).toBe(windows);
    expect(markup.getByRole<HTMLInputElement>("radio", { name: "macOS" }).checked).toBe(true);
    expect(shortcutKeys("macOS window shortcuts", "Snap left")).toEqual(["Fn", "Ctrl", "Left Arrow"]);
    expect(shortcutKeys("macOS browser shortcuts", "Zoom in")).toEqual(["Cmd", "+"]);
    expect(findKeys()).toEqual(["Cmd", "F"]);
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
    expect(shortcutKeys("macOS browser shortcuts", "Next tab")).toEqual(["Cmd", "Option", "Right Arrow"]);
    expect(findKeys()).toEqual(["Cmd", "F"]);

    await user.keyboard("{ArrowLeft}");
    expect(options.getByRole<HTMLInputElement>("radio", { name: "Windows" }).checked).toBe(true);
    expect(shortcutKeys("Windows window shortcuts", "Switch windows")).toEqual(["Alt", "Tab"]);
    expect(findKeys()).toEqual(["Ctrl", "F"]);

    await user.click(options.getByRole("radio", { name: "Linux" }));
    expect(shortcutKeys("Linux window shortcuts", "Snap left")).toEqual(["Super", "Left Arrow"]);
    expect(shortcutKeys("Linux browser shortcuts", "Next tab")).toEqual(["Ctrl", "Tab"]);
    expect(screen.getByText(/defaults are for GNOME/)).toBeDefined();
  });

  it("keeps the Windows fallback when the browser reports a mobile Linux-based platform", () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Linux armv8l");
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 16; Mobile)");
    render(<WorkspaceSetup />);
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Windows" }).checked).toBe(true);
    expect(findKeys()).toEqual(["Ctrl", "F"]);
  });
});
