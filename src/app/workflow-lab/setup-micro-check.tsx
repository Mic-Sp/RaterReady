import { useState, type ReactNode } from "react";
import { DemoBadge } from "../components/demo-badge";
import { FindShortcut, type OperatingSystem } from "./shortcut-reference";

type Choice = { label: string; feedback: string };

const windowChoices: Choice[] = [
  { label: "Both snapped windows are readable", feedback: "You can keep the task and rubric visible while comparing the responses." },
  { label: "One window is easier to read", feedback: "A single window works too. Read Response A, then Response B, and keep the rubric close." },
  { label: "A response is cut off", feedback: "Try widening the windows or switching to one readable window." },
];

const tabChoices: Choice[] = [
  { label: "Task and rubric first, source next, both readable", feedback: "That setup keeps the rubric easy to return to and lets you read both tabs comfortably." },
  { label: "Source first, task tab hard to find", feedback: "Move the task and rubric to the first tab, then put the source next to it." },
  { label: "Tabs are in order, text is still too small", feedback: "Increase the browser zoom until you can read the text, and check that the controls still fit." },
];

const timeChoices: Choice[] = [
  { label: "4 minutes Understand, 4 Verify, 2 Review", feedback: "This gives every part time. Adjust the split if a claim needs a longer check." },
  { label: "3 minutes Understand, 5 Verify, 2 Review", feedback: "This makes extra room for verification and keeps a final review pass." },
  { label: "8 minutes Understand, 2 Verify, 0 Review", feedback: "Leave time to reread your explanation before submitting. Move some reading time to Review." },
];

const findChoices: Choice[] = [
  { label: "June 3", feedback: "June 3 is when the notice was drafted. Search for “effective date” to find when the hours change." },
  { label: "June 18", feedback: "June 18 is the effective date. Keep the source open and note the date and its context in your scratchpad." },
  { label: "June 30", feedback: "June 30 is the follow-up date. Use the words around the match to confirm which date answers the claim." },
];

function ChoiceCheck({ prompt, choices, onComplete }: {
  prompt: ReactNode; choices: Choice[]; onComplete: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <>
      <fieldset className="workflow-check-choices">
        <legend>{prompt}</legend>
        {choices.map((choice, index) => (
          <label className="radio-choice" key={choice.label}>
            <input type="radio" name="workflow-setup-answer" checked={selected === index} onChange={() => {
              setSelected(index);
              onComplete();
            }} />
            <span>{choice.label}</span>
          </label>
        ))}
      </fieldset>
      <p className="workflow-check-feedback" role="status" aria-label="Setup check feedback">
        {selected !== null && choices[selected].feedback}
      </p>
    </>
  );
}

const scratchpadFields = [
  ["Claim", "The sample library’s Saturday hours change June 18."],
  ["Source", "The library notice, under “Effective date”."],
  ["Uncertainty", "The notice does not say whether holiday hours also change."],
  ["Judgment", "The notice supports the claim about regular Saturday hours."],
] as const;

function ScratchpadCheck({ onComplete }: { onComplete: () => void }) {
  const [notes, setNotes] = useState<Partial<Record<(typeof scratchpadFields)[number][0], string>>>({});
  const [feedback, setFeedback] = useState("");
  const [showModel, setShowModel] = useState(false);

  function compareWithModel() {
    const missing = scratchpadFields.find(([label]) => !notes[label]?.trim());
    // Comparing with the model is the activity. Blank fields get a prompt, never a score.
    setFeedback(missing
      ? `Try adding a short note under ${missing[0]}. The model shows one way to fill it in.`
      : "Your scratchpad has all four parts. Compare how the model connects the claim, source and uncertainty to a judgment.");
    setShowModel(true);
    onComplete();
  }

  return (
    <>
      <div className="workflow-source">
        <DemoBadge />
        <p>A library notice says new Saturday hours take effect June 18. The notice does not mention holiday hours.</p>
      </div>
      <p id="workflow-scratchpad-help">Write a short note in each field using the sample. Entries clear when you leave the step.</p>
      <div className="workflow-scratchpad-fields">
        {scratchpadFields.map(([label]) => (
          <label key={label}>
            <span>{label}</span>
            <textarea name={label.toLowerCase()} rows={2} maxLength={240} aria-describedby="workflow-scratchpad-help"
              value={notes[label] ?? ""} onChange={(event) => setNotes({ ...notes, [label]: event.target.value })} />
          </label>
        ))}
      </div>
      <button className="secondary-button workflow-fit-button" type="button" onClick={compareWithModel}>Compare with model</button>
      <p className="workflow-check-feedback" role="status" aria-label="Setup check feedback">{feedback}</p>
      {showModel && (
        <div className="workflow-source">
          <DemoBadge />
          <p><strong>Worked model</strong></p>
          <dl>{scratchpadFields.map(([label, model]) => <div key={label}><dt>{label}</dt><dd>{model}</dd></div>)}</dl>
        </div>
      )}
    </>
  );
}

/** Render a practice-only setup check and report that the learner completed it, without grading or saving answers. */
export function SetupMicroCheck({ step, os, completed, onComplete }: {
  step: number; os: OperatingSystem; completed: boolean; onComplete: () => void;
}) {
  let activity: ReactNode;
  switch (step) {
    case 0:
      activity = <ChoiceCheck prompt="After trying the window layout, what can you read comfortably?" choices={windowChoices} onComplete={onComplete} />;
      break;
    case 1:
      activity = <ChoiceCheck prompt="After arranging your tabs and testing zoom, which setup is ready?" choices={tabChoices} onComplete={onComplete} />;
      break;
    case 2:
      activity = <ScratchpadCheck onComplete={onComplete} />;
      break;
    case 3:
      activity = <ChoiceCheck prompt="Try a 10-minute practice plan. Which split gives you time to understand, verify and review?" choices={timeChoices} onComplete={onComplete} />;
      break;
    case 4:
      activity = (
        <>
          <p><strong>Try it now.</strong> Press <FindShortcut os={os} /> and search this page for “effective date”. Go to the match in the library notice, close Find, then choose the date below.</p>
          <div className="workflow-source">
            <DemoBadge />
            <p><strong>Library notice.</strong> Drafted June 3. Effective date for new Saturday hours: June 18. Staff follow-up: June 30.</p>
          </div>
          <ChoiceCheck prompt="When do the new Saturday hours take effect?" choices={findChoices} onComplete={onComplete} />
        </>
      );
      break;
  }

  return (
    <section className="workflow-micro-check" aria-labelledby="workflow-check-heading">
      <h4 id="workflow-check-heading">Setup check{completed && <span className="workflow-done">✓ Complete</span>}</h4>
      <p className="workflow-check-guidance">{step === 2
        ? "Unscored self-practice. Compare with the model whenever you’re ready."
        : "Unscored self-practice. Choose any option to see a tip and continue."}</p>
      {activity}
    </section>
  );
}
