import type { useCapstoneSession } from "./use-capstone-session";

type SaveState = Pick<ReturnType<typeof useCapstoneSession>, "current" | "dirty" | "saving" | "blocked" | "message" | "clockError">;

/** One polite live region announces save state; the compact copy beside Save now stays readable without duplicate live announcements. */
export function CapstoneSaveStatus({ session, compact = false }: { session: SaveState; compact?: boolean }) {
  const { current, dirty, saving, blocked, message, clockError } = session;
  const confirmed = Boolean(current.savedAt && !dirty && !saving && !blocked && !clockError);
  const state = blocked || clockError ? "error" : saving ? "saving" : dirty ? "unsaved" : confirmed ? "saved" : "idle";
  const utcTime = current.savedAt ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC", hourCycle: "h23" }).format(new Date(current.savedAt)) : null;
  return <div className={`capstone-save-status save-${state}`} role={compact ? undefined : "status"} aria-label={compact ? undefined : "Capstone save status"} aria-live={compact ? undefined : "polite"} aria-atomic={compact ? undefined : true} data-save-state={state}>
    {confirmed ? <p className="save-confirmation"><strong>Saved to server at <time dateTime={current.savedAt!}>{utcTime} UTC</time></strong></p>
      : <p className="save-confirmation"><strong>{blocked ? "Save needs attention" : clockError ? "Server status unavailable" : saving ? "Saving to server…" : dirty ? "Unsaved changes — waiting for server confirmation" : "No response changes saved yet"}</strong></p>}
    {!compact && <p>{saving ? "Keep this page open while the server confirms your responses." : message}</p>}
    {/* An older timestamp remains historical evidence only; new edits/errors never retain the green all-saved state. */}
    {!compact && current.savedAt && <p>Last server-confirmed save: <time dateTime={current.savedAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" }).format(new Date(current.savedAt))}</time> · revision {current.revision}{dirty ? " · newer changes are not confirmed yet" : ""}</p>}
  </div>;
}
