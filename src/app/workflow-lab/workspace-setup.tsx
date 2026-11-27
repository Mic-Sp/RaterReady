"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { DemoBadge } from "../components/demo-badge";
import { SetupMicroCheck } from "./setup-micro-check";
import {
  BrowserShortcuts, defaultOperatingSystem, detectOperatingSystem, FindShortcut,
  operatingSystems, type OperatingSystem, WindowShortcuts,
} from "./shortcut-reference";
import {
  initialWalkthrough, parseWalkthroughProgress, readWalkthroughProgress, saveWalkthroughProgress, type WalkthroughProgress,
} from "./walkthrough-progress";

type SetupHabit = {
  shortTitle: string;
  title: string;
  why: string;
  tips: readonly (readonly [lead: string, instruction: ReactNode])[];
  rushed: string;
  ready: string;
  reference?: ReactNode;
};

type WalkthroughNavigation = { target: "step" | "finish"; announcement: string; sequence: number };

function SetupGuide({ habit }: { habit: SetupHabit }) {
  return (
    <>
      <p><strong>Why this matters.</strong> {habit.why}</p>
      <div className="workflow-card-body">
        <ul className="workflow-tips">
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
    </>
  );
}

// OS detection is static and this visit's progress changes are managed in React state.
function subscribeToBrowserSnapshot() {
  return () => undefined;
}

function WalkthroughLinks({ finished = false, children }: { finished?: boolean; children?: ReactNode }) {
  return (
    <div className="workflow-actions">
      <Link href="/practice" className={finished ? "primary-button button-link" : "inline-link"}>Try these habits in Generalist practice</Link>
      <Link href="/dashboard" className="inline-link">Return to dashboard</Link>
      {children}
    </div>
  );
}

function setupHabits(os: OperatingSystem): SetupHabit[] {
  return [
    {
      shortTitle: "Windows",
      title: "Arrange your comparison windows",
      why: "A readable layout makes it easier to compare both responses against the same rubric.",
      tips: [
        ["Keep the task and rubric in reach.", "Use your system’s snap controls or resize two windows by hand."],
        ["Use one column on a narrow screen.", "Read Response A, then Response B, and keep the rubric within easy reach."],
      ],
      rushed: "Two windows overlap. Response B is partly hidden and the rubric is behind another window.",
      ready: "One window shows the task and rubric, the other shows the responses. Both are readable without dragging windows around.",
      reference: <WindowShortcuts os={os} />,
    },
    {
      shortTitle: "Tabs and zoom",
      title: "Set up tabs and zoom",
      why: "A predictable tab order and readable text make it easier to return to the task.",
      tips: [
        ["Keep related tabs together.", "Put the task tab first, followed by the tabs you’ll need. Close unrelated tabs."],
        ["Set a comfortable zoom.", "Check that text and controls still fit. Use Tab and Shift+Tab to move between page controls and follow the focus outline."],
      ],
      rushed: "The task is buried among unrelated tabs, and the rubric text is too small to read comfortably.",
      ready: "The task is the first tab, the source is beside it, and the text is large enough to read without sideways scrolling.",
      reference: <BrowserShortcuts os={os} />,
    },
    {
      shortTitle: "Scratchpad",
      title: "Prepare a scratchpad",
      why: "A simple note template gives each observation a place as you read.",
      tips: [
        ["Start with four labels.", "Add Claim, Source, Uncertainty and Judgment. Keep copied text separate from your observations."],
        ["Keep practice notes temporary.", "Use only synthetic task details. The practice scratchpad clears on reload and isn’t saved with drafts. Include any evidence needed for review in your written justification."],
      ],
      rushed: "A single paragraph mixes a quoted passage with a guess, and the source is missing.",
      ready: "The scratchpad records the claim, the source location, an open question and a judgment based on the passage.",
    },
    {
      shortTitle: "Time split",
      title: "Plan your time split",
      why: "A flexible plan leaves room to check a claim and reread your explanation.",
      tips: [
        ["Sketch the order before starting.", "Make room for reading the task and rubric, comparing responses, verifying claims and reviewing your explanation."],
        ["Save room for uncertainty.", "Adjust your plan if an important claim needs more checking. Use the stated timing for an actual assessment."],
      ],
      rushed: "Most of the available time goes to polishing the first paragraph, leaving no time to check a key claim.",
      ready: "The plan reserves a separate pass for an uncertain claim and a final pass to review the explanation.",
    },
    {
      shortTitle: "Verification",
      title: "Set up claim verification",
      why: "With the task, source and notes open, you can look up a claim without losing your place.",
      tips: [
        ["Open two dedicated tabs.", "Keep the task and rubric in one tab and the primary source in the next."],
        ["Practice finding a phrase.", <>In the source tab, press <FindShortcut os={os} /> and search for a distinctive term from the claim.</>],
        ["Leave your scratchpad open.", "Keep a place ready to record the section heading or page number and the relevant passage."],
      ],
      rushed: "The source replaces the task tab, and the evaluator scrolls through it looking for a date.",
      ready: "The task and rubric stay open. In the source tab, Find jumps to “effective date,” and the scratchpad is ready for the passage and section heading.",
    },
  ];
}

/** Guide learners through unscored pre-flight setup. Completion is browser-only and carries no assessment credit. */
export function WorkspaceSetup() {
  const [chosenOs, setChosenOs] = useState<OperatingSystem | null>(null);
  const [localProgress, setLocalProgress] = useState<WalkthroughProgress | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const [navigation, setNavigation] = useState<WalkthroughNavigation | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const finishHeading = useRef<HTMLHeadingElement>(null);

  // SSR and initial hydration use Windows and Step 1. The client snapshot reads browser data afterward.
  const detectedOs = useSyncExternalStore(subscribeToBrowserSnapshot, detectOperatingSystem, () => defaultOperatingSystem);
  const savedProgress = useSyncExternalStore(subscribeToBrowserSnapshot, readWalkthroughProgress, () => null);
  const os = chosenOs ?? detectedOs;
  const habits = setupHabits(os);
  const stepCount = habits.length;
  const progress = localProgress ?? parseWalkthroughProgress(savedProgress, stepCount);
  const { activeStep, completed, finished, collapsed } = progress;
  const habit = habits[activeStep];
  const isLast = activeStep === stepCount - 1;
  const isComplete = completed.includes(activeStep);
  const allComplete = completed.length === stepCount;
  const position = (step: number) => `Step ${step + 1} of ${stepCount}`;

  // Move focus after an explicit action and let the persistent live region announce the new position.
  // Restoring progress after hydration leaves focus where the learner put it.
  useEffect(() => {
    if (navigation?.target === "step") stepHeading.current?.focus();
    if (navigation?.target === "finish" && finishHeading.current) {
      const heading = finishHeading.current;
      // Prevent the focus jump so scrolling to the summary can honor the learner's motion preference.
      heading.focus({ preventScroll: true });
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      heading.scrollIntoView?.({ block: "center", behavior: reduceMotion ? "instant" : "smooth" });
    }
  }, [navigation]);

  function announceNavigation(target: WalkthroughNavigation["target"], announcement: string) {
    // A new message node lets the same completion text be announced on repeat activation.
    setNavigation((previous) => ({ target, announcement, sequence: (previous?.sequence ?? 0) + 1 }));
  }

  function updateProgress(next: WalkthroughProgress) {
    setLocalProgress(next);
    saveWalkthroughProgress(next);
  }

  function goTo(step: number) {
    if (step === activeStep) return;
    updateProgress({ ...progress, activeStep: step });
    announceNavigation("step", position(step));
  }

  function markComplete() {
    if (!isComplete) updateProgress({ ...progress, completed: [...completed, activeStep] });
  }

  function finish() {
    if (!allComplete) return;
    updateProgress({ ...progress, finished: true, collapsed: true });
    announceNavigation("finish", `Walkthrough complete. All ${stepCount} setup steps are complete.`);
  }

  function reset() {
    saveWalkthroughProgress(null);
    setLocalProgress(initialWalkthrough);
    setResetCount((count) => count + 1);
    announceNavigation("step", `Walkthrough reset. ${position(0)}.`);
  }

  return (
    <section aria-labelledby="workflow-setup-heading">
      <h2 id="workflow-setup-heading">Set up your workspace</h2>
      <div className="workflow-progress">
        <div>
          <p><strong>{completed.length} of {stepCount} complete</strong></p>
          <p className="workflow-storage-note">Your progress stays in this browser.</p>
        </div>
        <button className="text-button" type="button" onClick={reset}>Reset walkthrough</button>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true" aria-label="Walkthrough updates">
        {navigation && <span key={navigation.sequence}>{navigation.announcement}</span>}
      </p>
      {finished && (
        <section className="workflow-finish-panel" aria-labelledby="workflow-finish-heading">
          <h3 id="workflow-finish-heading" ref={finishHeading} tabIndex={-1}>Walkthrough complete</h3>
          <p>All five setup checks are complete. Try the same setup in a Generalist practice task.</p>
          <WalkthroughLinks finished>
            <button className="text-button" type="button" aria-expanded={!collapsed} aria-controls="workflow-steps"
              onClick={() => updateProgress({ ...progress, collapsed: !collapsed })}>
              {collapsed ? "Reopen walkthrough steps" : "Hide walkthrough steps"}
            </button>
          </WalkthroughLinks>
        </section>
      )}
      <div id="workflow-steps" hidden={collapsed}>
        <nav className="workflow-step-nav" aria-label="Setup steps">
          <ol className="workflow-step-list">
            {habits.map((item, index) => {
              const done = completed.includes(index);
              return (
                <li key={item.shortTitle}>
                  <button type="button" aria-current={activeStep === index ? "step" : undefined} aria-controls="workflow-active-step"
                    onClick={() => goTo(index)}>
                    <span>Step {index + 1}: {item.shortTitle}{done && <span className="sr-only">, complete</span>}</span>
                    {done && <span className="workflow-done" aria-hidden="true">✓</span>}
                    {activeStep === index && <span className="workflow-current" aria-hidden="true">Current step</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
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
        <section id="workflow-active-step" className="workflow-setup-card" aria-labelledby="workflow-step-heading">
          <p className="workflow-step-position">{position(activeStep)}</p>
          <h3 id="workflow-step-heading" ref={stepHeading} tabIndex={-1}>{habit.title}</h3>
          <SetupGuide habit={habit} />
          <SetupMicroCheck key={`${activeStep}-${resetCount}`} step={activeStep} os={os} completed={isComplete} onComplete={markComplete} />
          {!isComplete && <p className="workflow-nav-hint">Try the setup check to mark this step complete, or choose any step above.</p>}
          {isComplete && isLast && !allComplete && <p className="workflow-nav-hint">Complete all five setup checks to finish. You can return to any step above.</p>}
          <div className="workflow-step-actions">
            <button className="secondary-button workflow-fit-button" type="button" disabled={activeStep === 0}
              onClick={() => goTo(activeStep - 1)}>Previous step</button>
            {isLast ? (
              <button className="primary-button workflow-fit-button" type="button" disabled={!allComplete} onClick={finish}>Finish walkthrough</button>
            ) : (
              <button className="primary-button workflow-fit-button" type="button" disabled={!isComplete} onClick={() => goTo(activeStep + 1)}>
                Complete &amp; continue to Step {activeStep + 2} <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </section>
      </div>
      {!finished && <WalkthroughLinks />}
    </section>
  );
}
