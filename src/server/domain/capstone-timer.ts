/** Whole-second ceiling never shortens an accommodation. Inputs and clock must come from trusted server/database state. */
export function calculateCapstoneDeadline(startedAt: Date, baseDurationSeconds: number, timeMultiplier: number): Date {
  const seconds = Math.ceil(baseDurationSeconds * timeMultiplier);
  const milliseconds = startedAt.getTime() + seconds * 1000;
  if (!Number.isInteger(baseDurationSeconds) || baseDurationSeconds <= 0 || !Number.isFinite(timeMultiplier) || timeMultiplier < 1
    || !Number.isSafeInteger(seconds) || !Number.isSafeInteger(milliseconds) || !Number.isFinite(new Date(milliseconds).getTime())) {
    throw new Error("Invalid capstone timing configuration.");
  }
  return new Date(milliseconds);
}

/** Equality is expired. Client clock changes and delayed UI refreshes cannot create a grace period. */
export function isCapstoneExpired(expiresAt: Date, serverNow: Date): boolean {
  return serverNow.getTime() >= expiresAt.getTime();
}

/** Cooldown anchors to logical expiry or finalized failure, never the time a learner next opens the page. */
export function capstoneCooldownUntil(attempts: { status: string; passed: boolean | null; expiresAt: Date | null; finalizedAt: Date | null; cooldownHours: number }[], serverNow: Date): Date | null {
  let latest = 0;
  for (const attempt of attempts) {
    const anchor = attempt.status === "FINALIZED" && attempt.passed === false ? attempt.finalizedAt
      : ["EXPIRED", "ABANDONED"].includes(attempt.status) ? attempt.expiresAt : null;
    if (anchor) latest = Math.max(latest, anchor.getTime() + attempt.cooldownHours * 3600000);
  }
  return latest > serverNow.getTime() ? new Date(latest) : null;
}

export type CapstoneReadinessKind = "READY" | "ACTIVE" | "MISSING_PRACTICE" | "COOLDOWN" | "AWAITING_REVIEW" | "ALREADY_PASSED" | "CAPACITY" | "UNAVAILABLE";

/** Explicit readiness precedence preserves active attempts; practice is participation, never a substitute passing score. */
export function decideCapstoneReadiness(input: { active: boolean; pendingReview: boolean; passed: boolean; cooldown: boolean; missingPractice: boolean; remainingForms: number }): CapstoneReadinessKind {
  if (input.active) return "ACTIVE";
  if (input.pendingReview) return "AWAITING_REVIEW";
  if (input.passed) return "ALREADY_PASSED";
  if (input.cooldown) return "COOLDOWN";
  if (input.missingPractice) return "MISSING_PRACTICE";
  return input.remainingForms > 0 ? "READY" : "CAPACITY";
}
