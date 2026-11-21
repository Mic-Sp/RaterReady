"use client";

import { useState } from "react";

const habits = [
  { id: "windows", title: "Arrange a comparison workspace", label: "I practiced arranging two responses side by side.",
    steps: ["Use your operating system's window tiling controls, or resize two browser windows so the task and responses remain readable.", "On a narrow screen, use the sequential Response A then Response B layout. Side-by-side windows are an option, never a requirement.", "Keep the pinned rubric within easy reach and check that neither response is hidden or truncated."] },
  { id: "navigation", title: "Navigate tabs and controls", label: "I practiced keyboard and tab navigation.",
    steps: ["Use Tab and Shift+Tab to move between controls; use Space for a checkbox and arrow keys within a radio group. A visible focus ring shows your position.", "Use Ctrl+Tab and Ctrl+Shift+Tab to move between browser tabs where supported. Ctrl+L (Command+L on macOS) focuses the address bar. Browser and system shortcuts can vary; consult their Help menu.", "Give each research tab a clear purpose: task, primary source, or corroborating source. Return to the task before submitting."] },
  { id: "notes", title: "Organize evidence notes", label: "I practiced separating evidence from assumptions.",
    steps: ["Use a short structure: claim, source identifier or URL, supporting detail, uncertainty, and provisional judgment. Separate quoted evidence from your own inference.", "Practice with synthetic task information only. Do not enter personal disclosures, passwords or access tokens.", "The practice scratchpad is temporary page memory and is not saved with drafts. Put the evidence needed for review in the written justification, then clear temporary notes when finished."] },
  { id: "time", title: "Plan a flexible allocation of time", label: "I practiced planning time for reading, verification and review.",
    steps: ["Before starting, set a flexible plan for understanding the task, comparing responses, checking uncertain claims, and reviewing your explanation.", "Reserve time for the highest-impact uncertainties instead of repeatedly polishing wording. Revisit your plan as evidence changes.", "This lab and practice are untimed. These planning habits impose no timer, deadline or prerequisite; follow an actual assessment's stated timing and tool rules."] },
  { id: "verification", title: "Verify and triangulate claims", label: "I practiced checking primary evidence and independent corroboration.",
    steps: ["Identify the exact claim first. Prefer the original record, specification or official documentation, and check its date, version and scope.", "Compare an independent source when useful. Two pages repeating the same original claim are not two independent confirmations.", "When sources conflict, document the uncertainty and explain which evidence fits the task. For these synthetic exercises, start with the supplied contract and hand traces rather than assuming confident output is correct."] },
];

/** Native checkboxes are keyboard/screen-reader operable; page-memory self-checks never mutate learning or credential records. */
export function WorkflowChecklist() {
  const [checked, setChecked] = useState<string[]>([]);
  return <section className="learning-section" aria-labelledby="workflow-checklist-heading">
    <h2 id="workflow-checklist-heading">Optional workflow self-check</h2>
    <p id="workflow-memory-notice">Use these checks at your own pace, in any order. Checks stay in page memory and clear on reload; they are not stored as course or credential progress.</p>
    <p role="status" aria-live="polite" aria-atomic="true">{checked.length} of {habits.length} workflow habits checked · unscored self-check</p>
    <fieldset className="workflow-checklist" aria-describedby="workflow-memory-notice"><legend>Explore any workflow habit</legend>
      {habits.map((habit) => <section className="workflow-habit" key={habit.id} aria-labelledby={`${habit.id}-heading`}>
        <h3 id={`${habit.id}-heading`}>{habit.title}</h3><ul id={`${habit.id}-guide`}>{habit.steps.map((step) => <li key={step}>{step}</li>)}</ul>
        <label className="radio-choice"><input type="checkbox" checked={checked.includes(habit.id)} aria-describedby={`${habit.id}-guide`}
          onChange={(event) => setChecked((previous) => event.target.checked ? [...previous, habit.id] : previous.filter((id) => id !== habit.id))} /><span>{habit.label}</span></label>
      </section>)}
    </fieldset>
    <button className="secondary-button" type="button" disabled={!checked.length} onClick={() => setChecked([])}>Reset self-check</button>
  </section>;
}
