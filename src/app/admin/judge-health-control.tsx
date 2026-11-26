"use client";

import { useActionState } from "react";
import type { JudgeHealthState } from "../../lib/judge-health";
import { SyntheticText } from "../components/demo-badge";
import { runJudgeHealthCheck } from "./judge-health-action";

const initial: JudgeHealthState = { status: "idle" };

/** Keep a keyboard-operable submit control and announce completion without exposing provider output. */
export function JudgeHealthControl() {
  const [state, action, pending] = useActionState(runJudgeHealthCheck, initial);
  return <>
    <form action={action} aria-describedby="judge-health-limit">
      <p id="judge-health-limit">Three checks per 15 minutes. Each check uses a fixed fictional prompt.</p>
      <button className="secondary-button" type="submit" aria-disabled={pending}
        onClick={(event) => { if (pending) event.preventDefault(); }}>Run judge health check</button>
    </form>
    <p className="field-hint" role="status">
      {pending ? "Checking both judge slots…" : state.status === "complete" ? "Health check complete. Results for both slots follow."
        : state.status === "limited" ? "Health check limit reached. Try again after the 15-minute window."
        : state.status === "unavailable" ? "Health check unavailable. Try again later." : ""}
    </p>
    {state.status === "complete" && !pending && <ul className="judge-health-results">
      {state.slots.map((slot) => <li key={slot.judgeSlot}>
        <strong>Judge {slot.judgeSlot === 1 ? "A" : "B"}</strong> · {slot.status}
        <dl className="grading-detail">
          <div><dt>Model</dt><dd><SyntheticText>{slot.model}</SyntheticText></dd></div>
          <div><dt>Latency</dt><dd>{slot.latencyMs} ms</dd></div>
          <div><dt>Schema validation</dt><dd>{slot.validation}</dd></div>
        </dl>
      </li>)}
    </ul>}
  </>;
}
