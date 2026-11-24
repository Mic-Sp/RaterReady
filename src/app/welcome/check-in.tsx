"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LearningLevel } from "@prisma/client";
import { recommendWelcomeStartingLevel, welcomeQuestions, type WelcomeAnswers } from "../../lib/welcome-check-in";
import { learningLevels } from "../../lib/learning-content";
import { LevelChoices } from "../components/level-choices";
import { beginSkillsCheck, chooseLevel } from "../learning/actions";

/** Optional local self-report: named fieldsets, a focused result heading and unchanged DOM order support keyboard/mobile use. Only an explicit level choice invokes persistence. */
export function WelcomeCheckIn({ selected }: { selected?: LearningLevel }) {
  const [answers, setAnswers] = useState<WelcomeAnswers>({});
  const [recommendation, setRecommendation] = useState<ReturnType<typeof recommendWelcomeStartingLevel> | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (recommendation) resultHeading.current?.focus(); }, [recommendation]);
  const level = learningLevels.find((item) => item.code === recommendation?.suggestedLevel);
  const skipHref = selected ? "/dashboard" : "/onboarding#direct-path-heading";

  return <>
    {/* Skipping and choosing directly never submit answers or change a previously chosen level. */}
    <nav className="welcome-actions" aria-label="Choose your starting route">
      <Link href={skipHref} className="inline-link">Skip the check-in{selected ? " and return to dashboard" : " and choose any level"}</Link>
      <a href="#welcome-levels-heading" className="inline-link">Choose a level directly</a>
    </nav>
    <section className="learning-section" aria-labelledby="welcome-questions-heading">
      <h2 id="welcome-questions-heading">A little about your starting point</h2>
      <p>Answer any of these three questions, or leave them open. There are no wrong answers and no time limit.</p>
      {/* No answer-submission form: even without JavaScript these local selections cannot become a GET query or a server mutation. */}
      <div className="diagnostic-form welcome-check-in">
        {welcomeQuestions.map((question) => <fieldset key={question.topic} aria-describedby={`welcome-${question.topic}-hint`}>
          <legend>{question.title}</legend><p id={`welcome-${question.topic}-hint`}>{question.description}</p>
          {question.options.map((option) => <label key={option.value} className="radio-choice">
            <input type="radio" name={question.topic} value={option.value} checked={answers[question.topic] === option.value}
              onChange={() => { setAnswers((previous) => ({ ...previous, [question.topic]: option.value })); setRecommendation(null); }} />
            <span>{option.label}</span>
          </label>)}
        </fieldset>)}
        <button type="button" className="primary-button" onClick={() => setRecommendation(recommendWelcomeStartingLevel(answers))}>Show my starting suggestion</button>
      </div>
    </section>
    {recommendation && <section className="welcome-recommendation learning-section" aria-labelledby="welcome-result-heading">
      <h2 id="welcome-result-heading" ref={resultHeading} tabIndex={-1}>A starting point for you</h2>
      <p role="status">Your starting suggestion is ready. Your learning level changes only when you choose one.</p>
      <h3>{level?.title ?? "Choose any starting level"}</h3>
      <p>{recommendation.explanation}</p>
      {recommendation.answeredCount > 0 && recommendation.answeredCount < 3 && <p>You left some questions open. This is a gentle starting suggestion, not a judgment of your ability.</p>}
      <p>You can accept this suggestion or choose any other level below. Switch anytime; completed lessons stay saved.</p>
      {recommendation.showWorkflowLab && <aside className="welcome-workflow-note" aria-label="Optional computer practice">
        <p>Want a little practice with windows, tabs or shortcuts? The optional Workflow Skills Lab lets you try them at your own pace. It is never required.</p>
        <Link href="/workflow-lab" className="inline-link">Try the Workflow Skills Lab</Link>
      </aside>}
      {level && <form action={chooseLevel}><input type="hidden" name="level" value={level.code} />
        <button type="submit" className="primary-button">Start with {level.title}</button>
      </form>}
      <Link href={skipHref} className="inline-link">Skip this suggestion{selected ? " and return to dashboard" : " and choose any level"}</Link>
    </section>}
    <section className="learning-section" aria-labelledby="welcome-levels-heading">
      <h2 id="welcome-levels-heading" tabIndex={-1}>Choose any learning level</h2>
      <p>Every level is open, with or without this check-in. A suggestion is your choice to make.</p>
      <LevelChoices selected={selected} suggested={recommendation?.suggestedLevel} />
    </section>
    <section className="learning-section" aria-labelledby="welcome-skills-heading">
      <h2 id="welcome-skills-heading">Want to try a few evaluation tasks instead?</h2>
      <p>The Optional Skills Check is a separate, more involved set of practice questions. It is also untimed, skippable and non-certifying.</p>
      <form action={beginSkillsCheck}><button type="submit" className="secondary-button">Go to the Optional Skills Check</button></form>
      <Link href="/workflow-lab" className="inline-link">Explore the optional Workflow Skills Lab</Link>
    </section>
  </>;
}
