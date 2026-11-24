"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CapstoneDraftResponse } from "../../../lib/capstone-responses";
import type { CapstoneMutationCode, CapstoneSnapshot, CapstoneWorkspace } from "../../../server/capstone/workspace";
import { autosaveCapstoneAction, syncCapstoneClockAction } from "../workspace-actions";

export const capstoneSaveMessages: Record<CapstoneMutationCode, string> = {
  SAVED: "All six slots saved on the server.", SUBMITTED: "Final submission confirmed. Responses are locked.",
  CONFLICT: "The server draft changed in another request. Autosave is paused. Reload the server draft before continuing; reloading replaces unsaved local edits.",
  EXPIRED: "The server deadline has passed. The attempt is locked; earlier server-saved responses are preserved.",
  LOCKED: "Responses are locked and cannot be edited.", INCOMPLETE: "Complete the remaining required fields before final submission.",
  INVALID: "Some response fields could not be saved. Reload the server draft to verify the pinned controls.",
  CONFIRMATION: "Explicit final-submission confirmation is required.", UNAVAILABLE: "Server confirmation is unavailable. Your current entries remain on this page. Retry saving or reload the server draft.",
};

/**
 * One in-flight whole-attempt save at a time. Edits made during a save remain local
 * and queue another snapshot using the acknowledged revision; older acknowledgments
 * never replace newer edits. Conflicts pause, rather than silently overwriting a tab.
 */
export function useCapstoneSession(initial: CapstoneWorkspace) {
  const [drafts, setDrafts] = useState(() => initial.slots.map((s) => s.draft));
  const [current, setCurrent] = useState(initial.snapshot);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState<CapstoneMutationCode | null>(null);
  const [message, setMessage] = useState(initial.snapshot.savedAt ? "Your server-saved responses are loaded." : "No response changes saved yet.");
  const [clockError, setClockError] = useState(false);
  const latest = useRef(drafts);
  const snapshot = useRef(initial.snapshot);
  const revision = useRef(initial.snapshot.revision);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const flight = useRef<Promise<boolean> | null>(null);
  const pause = useRef<CapstoneMutationCode | null>(null);
  const deliberateReload = useRef(false);

  const applySnapshot = useCallback((next: CapstoneSnapshot) => {
    const previous = snapshot.current;
    if (previous.status === "FINALIZED" && next.status === "FINALIZED" && next.serverNow < previous.serverNow) return;
    if (previous.status === "FINALIZED" && next.status !== "FINALIZED") return;
    // Late ACTIVE polls/acknowledgments can never reopen a locally confirmed lock.
    if (previous.status !== "IN_PROGRESS" && next.status === "IN_PROGRESS") return;
    const merged = { ...next, revision: Math.max(previous.revision, next.revision), serverNow: previous.serverNow > next.serverNow ? previous.serverNow : next.serverNow,
      savedAt: previous.savedAt && next.savedAt && previous.savedAt > next.savedAt ? previous.savedAt : next.savedAt };
    snapshot.current = merged; setCurrent(merged); setClockError(false);
    if (merged.status !== "IN_PROGRESS") setDirty(false);
  }, []);

  // Server Action revalidation may return new finalized appeal/consent data without remounting this exam shell.
  useEffect(() => { if (initial.snapshot.status === "FINALIZED") applySnapshot(initial.snapshot); }, [initial.snapshot, applySnapshot]);

  const stop = useCallback((code: CapstoneMutationCode) => { pause.current = code; setBlocked(code); setMessage(capstoneSaveMessages[code]); }, []);

  const sync = useCallback(async () => {
    try {
      const next = await syncCapstoneClockAction(initial.snapshot.id);
      if (!next) { setClockError(true); return; }
      setClockError(false);
      if (next.status === "IN_PROGRESS" && next.revision > revision.current && !flight.current) stop("CONFLICT");
      applySnapshot(next);
    } catch { setClockError(true); }
  }, [initial.snapshot.id, applySnapshot, stop]);

  const edit = useCallback((position: number, patch: Partial<CapstoneDraftResponse>) => {
    if (snapshot.current.status !== "IN_PROGRESS" || pause.current === "CONFLICT") return;
    const next = latest.current.map((r) => r.position === position ? { ...r, ...patch } : r);
    latest.current = next; version.current += 1; setDrafts(next); setDirty(true); setMessage("Unsaved changes. Autosave will confirm when they reach the server.");
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (flight.current && !await flight.current) return false;
    if (pause.current || snapshot.current.status !== "IN_PROGRESS") return false;
    if (savedVersion.current >= version.current) return true;
    setSaving(true);
    const operation = (async () => {
      while (savedVersion.current < version.current) {
        const capturedVersion = version.current;
        const captured = structuredClone(latest.current);
        try {
          const result = await autosaveCapstoneAction({ attemptId: initial.snapshot.id, revision: revision.current, responses: captured });
          if (result.snapshot) applySnapshot(result.snapshot);
          if (!result.ok || !result.snapshot) { stop(result.code); return false; }
          revision.current = result.snapshot.revision;
          if (snapshot.current.status === "IN_PROGRESS" && snapshot.current.revision > revision.current) { stop("CONFLICT"); return false; }
          savedVersion.current = capturedVersion;
          setDirty(savedVersion.current < version.current);
          if (snapshot.current.status !== "IN_PROGRESS") return false;
        } catch { stop("UNAVAILABLE"); return false; }
      }
      setMessage(capstoneSaveMessages.SAVED); return true;
    })();
    flight.current = operation;
    try { return await operation; }
    finally { if (flight.current === operation) flight.current = null; setSaving(false); }
  }, [initial.snapshot.id, applySnapshot, stop]);

  useEffect(() => {
    if (!dirty || blocked || current.status !== "IN_PROGRESS") return;
    const timer = window.setTimeout(() => { void flush(); }, 750);
    return () => window.clearTimeout(timer);
  }, [drafts, dirty, blocked, current.status, flush]);

  useEffect(() => {
    if (current.status !== "IN_PROGRESS" && !["SUBMITTED", "GRADING", "PENDING_REVIEW"].includes(current.status)
      && current.writtenGrading !== "QUEUED" && current.writtenGrading !== "EVALUATING") return;
    const check = () => { if (document.visibilityState === "visible") void sync(); };
    const firstCheck = window.setTimeout(check, 0);
    const timer = window.setInterval(check, 10000);
    window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
    return () => { window.clearTimeout(firstCheck); window.clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [current.status, current.writtenGrading, sync]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => { if (!deliberateReload.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  const retrySave = useCallback(async () => {
    if (pause.current === "CONFLICT") return false;
    pause.current = null; setBlocked(null); return flush();
  }, [flush]);

  /** CAS uses our acknowledged revision, never a newer revision merely observed in another request's status poll. */
  const knownRevision = useCallback(() => revision.current, []);
  const reloadServerDraft = useCallback(() => { deliberateReload.current = true; window.location.reload(); }, []);
  return { drafts, current, dirty, saving, blocked, message, clockError, edit, flush, sync, applySnapshot, retrySave, knownRevision, setMessage, pauseAutosave: stop, reloadServerDraft };
}

/** Server-synced display estimate. Device clock edits do not grant time; zero triggers a fresh server check and conservative UI lock. */
export function useCapstoneCountdown(snapshot: CapstoneSnapshot, sync: () => Promise<void>): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((Date.parse(snapshot.expiresAt) - Date.parse(snapshot.serverNow)) / 1000)));
  useEffect(() => {
    if (snapshot.status !== "IN_PROGRESS") return;
    const base = Math.max(0, Date.parse(snapshot.expiresAt) - Date.parse(snapshot.serverNow));
    const anchor = performance.now(); let checked = false;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((base - (performance.now() - anchor)) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !checked && snapshot.status === "IN_PROGRESS") { checked = true; void sync(); }
    }, 250);
    return () => window.clearInterval(timer);
  }, [snapshot.serverNow, snapshot.expiresAt, snapshot.status, sync]);
  return remaining;
}
