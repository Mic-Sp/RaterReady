import "server-only";

type Circuit = { failures: number; openUntil: number; probing: boolean; epoch: number };

/** Process-local provider/model breaker. Three consecutive failures pause calls for 60 seconds, then admit one probe. */
export class JudgeBreaker {
  private readonly circuits = new Map<string, Circuit>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Return a one-call completion callback, or null while open or another recovery probe is running. */
  admit(key: string): ((success: boolean) => void) | null {
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = { failures: 0, openUntil: 0, probing: false, epoch: 0 };
      this.circuits.set(key, circuit);
    }
    if (circuit.openUntil > this.now() || circuit.probing) return null;
    if (circuit.openUntil !== 0) circuit.probing = true;
    const state = circuit;
    const epoch = state.epoch;
    return (success) => {
      // Late results from calls admitted before a trip cannot close the newer circuit.
      if (state.epoch !== epoch) return;
      if (success) {
        state.failures = 0;
        state.openUntil = 0;
      } else if (++state.failures >= 3 || state.probing) {
        state.openUntil = this.now() + 60_000;
        state.epoch++;
      }
      state.probing = false;
    };
  }
}
