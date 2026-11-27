import { Fragment } from "react";

export const operatingSystems = ["Windows", "macOS", "ChromeOS", "Linux"] as const;
export type OperatingSystem = (typeof operatingSystems)[number];
export const defaultOperatingSystem: OperatingSystem = "Windows";

/** Read desktop OS hints in the client snapshot only. ChromeOS must win over the legacy Linux platform string. */
export function detectOperatingSystem(): OperatingSystem {
  const browser = window.navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = browser.userAgentData?.platform ?? "";
  const legacy = `${browser.userAgent} ${browser.platform}`;

  if (/android|iphone|ipad|ipod/i.test(platform || legacy)) return defaultOperatingSystem;
  if (/\bcros\b|chrome ?os/i.test(`${platform} ${legacy}`)) return "ChromeOS";
  if (/\bmac/i.test(platform || legacy)) return "macOS";
  if (/\blinux/i.test(platform || legacy)) return "Linux";
  return defaultOperatingSystem;
}

type Shortcut = readonly string[];
type ShortcutRow = readonly [action: string, keys: Shortcut];

const windowShortcuts: Record<OperatingSystem, {
  left: Shortcut; right: Shortcut; switchWindow: Shortcut; switchLabel: string; note: string;
}> = {
  Windows: {
    left: ["Windows", "Left Arrow"],
    right: ["Windows", "Right Arrow"],
    switchWindow: ["Alt", "Tab"],
    switchLabel: "Switch windows",
    note: "You can also drag a window to a screen edge to snap it.",
  },
  macOS: {
    left: ["Fn", "Ctrl", "Left Arrow"],
    right: ["Fn", "Ctrl", "Right Arrow"],
    switchWindow: ["Cmd", "`"],
    switchLabel: "Switch windows within this app",
    note: "The tiling shortcuts apply on macOS 15 and later. You can also use the green window button or resize the windows by hand.",
  },
  ChromeOS: {
    left: ["Alt", "["],
    right: ["Alt", "]"],
    switchWindow: ["Alt", "Tab"],
    switchLabel: "Switch windows",
    note: "The left and right snap shortcuts use the square bracket keys.",
  },
  Linux: {
    left: ["Super", "Left Arrow"],
    right: ["Super", "Right Arrow"],
    switchWindow: ["Super", "Tab"],
    switchLabel: "Switch windows",
    note: "These defaults are for GNOME. Check your desktop’s keyboard settings if you use another environment or a custom layout.",
  },
};

function Keycaps({ keys }: { keys: Shortcut }) {
  return (
    <kbd className="workflow-chord">
      {keys.map((key, index) => (
        <Fragment key={key}>
          {index > 0 && " + "}
          <kbd>{key}</kbd>
        </Fragment>
      ))}
    </kbd>
  );
}

function ShortcutTable({ title, rows }: { title: string; rows: readonly ShortcutRow[] }) {
  return (
    <table className="workflow-shortcuts">
      <caption>{title}</caption>
      <thead>
        <tr><th scope="col">Action</th><th scope="col">Keys</th></tr>
      </thead>
      <tbody>
        {rows.map(([action, keys]) => (
          <tr key={action}>
            <th scope="row">{action}</th>
            <td><Keycaps keys={keys} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Show window placement and switching for the selected system, with a hands-on prompt. */
export function WindowShortcuts({ os }: { os: OperatingSystem }) {
  const { left, right, switchWindow, switchLabel, note } = windowShortcuts[os];
  return (
    <div className="workflow-shortcut-reference">
      <ShortcutTable title={`${os} window shortcuts`} rows={[
        ["Snap left", left],
        ["Snap right", right],
        [switchLabel, switchWindow],
      ]} />
      <p className="workflow-shortcut-note">{note}</p>
      <p className="workflow-try"><strong>Try it now.</strong> Snap this browser window to the left, then to the right. Check that this guide stays readable in both positions.</p>
    </div>
  );
}

/** Show browser controls for tab movement and readable zoom on the selected system. */
export function BrowserShortcuts({ os }: { os: OperatingSystem }) {
  const modifier = os === "macOS" ? "Cmd" : "Ctrl";
  return (
    <div className="workflow-shortcut-reference">
      <ShortcutTable title={`${os} browser shortcuts`} rows={[
        ["Next tab", os === "macOS" ? ["Cmd", "Option", "Right Arrow"] : ["Ctrl", "Tab"]],
        ["Zoom in", [modifier, "+"]],
        ["Zoom out", [modifier, "-"]],
        ["Quick zoom", os === "macOS" ? ["Trackpad pinch"] : ["Ctrl", "Scroll wheel"]],
        ["Reset zoom", [modifier, "0"]],
      ]} />
      <p className="workflow-shortcut-note">If a shortcut differs in your browser, use its tab or zoom controls.</p>
      <p className="workflow-try"><strong>Try it now.</strong> Open a second browser tab and use the Next tab shortcut to return here. Adjust the zoom until this guide is easy to read.</p>
    </div>
  );
}

/** Present the selected system’s Find command inline where the learner will use it. */
export function FindShortcut({ os }: { os: OperatingSystem }) {
  return <Keycaps keys={[os === "macOS" ? "Cmd" : "Ctrl", "F"]} />;
}
