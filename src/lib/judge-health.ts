export type JudgeHealthState =
  | { status: "idle" | "limited" | "unavailable" }
  | { status: "complete"; slots: {
    judgeSlot: number; model: string; latencyMs: number;
    status: "Live response received" | "Deterministic fallback" | "Timed out" | "Invalid response" | "Circuit blocked" | "Provider unavailable";
    validation: "Valid" | "Invalid" | "Unavailable";
  }[] };
