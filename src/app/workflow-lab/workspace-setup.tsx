"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { DemoBadge } from "../components/demo-badge";
import {
  BrowserShortcuts, defaultOperatingSystem, detectOperatingSystem, FindShortcut,
  operatingSystems, type OperatingSystem, WindowShortcuts,
} from "./shortcut-reference";

type SetupHabit = {
  id: string;
  title: string;
  why: string;
  tips: readonly (readonly [lead: string, instruction: ReactNode])[];
  rushed: string;
  ready: string;
  checkLabel: string;
  reference?: ReactNode;
};

function SetupCard({ habit, checked, onCheck }: {
  habit: SetupHabit; checked: boolean; onCheck: (checked: boolean) => void;
}) {
  const headingId = `${habit.id}-heading`;
  const tipsId = `${habit.id}-tips`;

  return (
    <section className="workflow-setup-card" aria-labelledby={headingId}>
      <h3 id={headingId}>{habit.title}</h3>
      <p><strong>Why this matters.</strong> {habit.why}</p>
      <div className="workflow-card-body">
        <ul id={tipsId} className="workflow-tips">
          {habit.tips.map(([lead, instruction]) => <li key={lead}><strong>{lead}</strong> {instruction}</li>)}
        </ul>
        <div className="workflow-example">
          <DemoBadge />
          <dl>
            <div><dt>Rushed setup</dt><dd>{habit.rushed}</dd></div>
            <div><dt>Ready workspace</dt><dd>{habit.ready}</dd></div>
          </dl>
        </div>
      </div>
      {habit.reference}
      <label className="radio-choice workflow-check">
        <input type="checkbox" checked={checked} aria-describedby={tipsId} onChange={(event) => onCheck(event.target.checked)} />
        <span>{habit.checkLabel}</span>
      </label>
    </section>
  );
}

// The platform snapshot is stable for the page lifetime and needs no listeners.
function subscribeToPlatform() {
  return () => undefined;
}

/** Give learners five pre-flight setup habits and an OS reference. Self-checks stay in page memory. */
export function WorkspaceSetup() {
  const [chosenOs, setChosenOs] = useState<OperatingSystem | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  // SSR and the initial hydration pass both read Windows. React reads browser hints only from the client snapshot.
  const detectedOs = useSyncExternalStore(subscribeToPlatform, detectOperatingSystem, () => defaultOperatingSystem);
  const os = chosenOs ?? detectedOs;

  const habits: SetupHabit[] = [
    {
      id: "workflow-windows",
      title: "Arrange your comparison windows",
      why: "A readable layout makes it easier to compare both responses against the same rubric.",
      tips: [
        ["Keep the task and rubric in reach.", "Use your system’s snap controls or resize two windows by hand."],
        ["Use one column on a narrow screen.", "Read Response A, then Response B, and keep the rubric within easy reach."],
      ],
      rushed: "Two windows overlap. Response B is partly hidden and the rubric is behind another window.",
      ready: "One window shows the task and rubric, the other shows the responses. Both are readable without dragging windows around.",
      checkLabel: "I practiced arranging a readable comparison workspace.",
      reference: <WindowShortcuts os={os} />,
    },
    {
      id: "workflow-navigation",
      title: "Set up tabs and zoom",
      why: "A predictable tab order and readable text make it easier to return to the task.",
      tips: [
        ["Keep related tabs together.", "Put the task tab first, followed by the tabs you’ll need. Close unrelated tabs."],
        ["Set a comfortable zoom.", "Check that text and controls still fit. Use Tab and Shift+Tab to move between page controls and follow the focus outline."],
      ],
      rushed: "The task is buried among unrelated tabs, and the rubric text is too small to read comfortably.",
      ready: "The task is the first tab, the source is beside it, and the text is large enough to read without sideways scrolling.",
      checkLabel: "I practiced keyboard and tab navigation at a readable zoom.",
      reference: <BrowserShortcuts os={os} />,
    },
    {
      id: "workflow-notes",
      title: "Prepare a scratchpad",
      why: "A simple note template gives each observation a place as you read.",
      tips: [
        ["Start with four labels.", "Add Claim, Source, Evidence and Open question. Keep copied text separate from your observations."],
        ["Keep practice notes temporary.", "Use only synthetic task details. The practice scratchpad clears on reload and isn’t saved with drafts. Include any evidence needed for review in your written justification."],
      ],
      rushed: "A single paragraph mixes a quoted passage with a guess, and the source is missing.",
      ready: "The scratchpad has a line for the claim, the source location, the exact quotation and a separate open question.",
      checkLabel: "I practiced separating evidence from assumptions in a scratchpad.",
    },
    {
      id: "workflow-time",
      title: "Plan time for each part",
      why: "A flexible plan leaves room to check a claim and reread your explanation.",
      tips: [
        ["Sketch the order before starting.", "Make room for reading the task and rubric, comparing responses, verifying claims and reviewing your explanation."],
        ["Save room for uncertainty.", "Adjust your plan if an important claim needs more checking. Use the stated timing for an actual assessment."],
      ],
      rushed: "Most of the available time goes to polishing the first paragraph, leaving no time to check a key claim.",
      ready: "The plan reserves a separate pass for an uncertain claim and a final pass to review the explanation.",
      checkLabel: "I practiced planning time for reading, verification and review.",
    },
    {
      id: "workflow-verification",
      title: "Set up for claim verification",
      why: "With the task, source and notes open, you can look up a claim without losing your place.",
      tips: [
        ["Open two dedicated tabs.", "Keep the task and rubric in one tab and the primary source in the next."],
        ["Practice finding a phrase.", <>In the source tab, press <FindShortcut os={os} /> and search for a distinctive term from the claim.</>],
        ["Leave your scratchpad open.", "Keep a place ready to record the section heading or page number and the relevant passage."],
      ],
      rushed: "The source replaces the task tab, and the evaluator scrolls through it looking for a date.",
      ready: "The task and rubric stay open. In the source tab, Find jumps to “effective date,” and the scratchpad is ready for the passage and section heading.",
      checkLabel: "I practiced looking up a claim with the task, source and scratchpad open.",
    },
  ];

  return (
    <section aria-labelledby="workflow-setup-heading">
      <h2 id="workflow-setup-heading">Set up your workspace</h2>
      <fieldset className="workflow-os">
        <legend>Operating system</legend>
        <div className="flex flex-wrap gap-2">
          {operatingSystems.map((system) => (
            <label className="workflow-os-option" key={system}>
              <input type="radio" name="workflow-os" value={system} checked={os === system} onChange={() => setChosenOs(system)} />
              <span>{system}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4">
        {habits.map((habit) => (
          <SetupCard key={habit.id} habit={habit} checked={checked.includes(habit.id)} onCheck={(isChecked) => {
            setChecked((previous) => isChecked ? [...previous, habit.id] : previous.filter((id) => id !== habit.id));
          }} />
        ))}
      </div>
      <div className="workflow-check-summary">
        <p role="status" aria-live="polite" aria-atomic="true">{checked.length} of {habits.length} workflow habits checked. Checks clear on reload.</p>
        <button className="secondary-button" type="button" disabled={!checked.length} onClick={() => setChecked([])}>Reset self-check</button>
      </div>
    </section>
  );
}
