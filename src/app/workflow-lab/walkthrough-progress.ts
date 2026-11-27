export const walkthroughStorageKey = "raterready.workflow-lab.v1";

export type WalkthroughProgress = {
  activeStep: number;
  completed: number[];
  finished: boolean;
  collapsed: boolean;
};

export const initialWalkthrough: WalkthroughProgress = { activeStep: 0, completed: [], finished: false, collapsed: false };

/** Decode only valid step indices. Invalid or stale browser data starts a fresh walkthrough. */
export function parseWalkthroughProgress(saved: string | null, stepCount: number): WalkthroughProgress {
  if (!saved) return initialWalkthrough;
  const isStep = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value < stepCount;
  try {
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== "object") return initialWalkthrough;
    const { activeStep, completed, finished, collapsed } = value as Partial<WalkthroughProgress>;
    if (!isStep(activeStep) || !Array.isArray(completed) || completed.length > stepCount || !completed.every(isStep)) {
      return initialWalkthrough;
    }
    const uniqueSteps = [...new Set(completed)];
    const isFinished = finished === true && uniqueSteps.length === stepCount;
    // Older finished saves have no display preference and open on the completion summary.
    return { activeStep, completed: uniqueSteps, finished: isFinished, collapsed: isFinished && collapsed !== false };
  } catch {
    return initialWalkthrough;
  }
}

/** Read only from a client snapshot after the deterministic server/hydration fallback. */
export function readWalkthroughProgress(): string | null {
  try {
    return window.localStorage.getItem(walkthroughStorageKey);
  } catch {
    return null;
  }
}

/** Save progress only. Notes, answers and OS selection stay out of storage; blocked storage leaves the lab usable. */
export function saveWalkthroughProgress(progress: WalkthroughProgress | null): void {
  try {
    if (progress) window.localStorage.setItem(walkthroughStorageKey, JSON.stringify(progress));
    else window.localStorage.removeItem(walkthroughStorageKey);
  } catch {
    // The caller keeps progress in memory for this visit.
  }
}
