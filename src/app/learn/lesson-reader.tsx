import Link from "next/link";
import type { getCurriculumLessons } from "../../server/learning/service";
import { learningLevels } from "../../lib/learning-content";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { DemoBadge, SyntheticText } from "../components/demo-badge";
import { EvaluationReference } from "../components/evaluation-reference";
import { markLessonComplete } from "../learning/actions";

type Lesson = Awaited<ReturnType<typeof getCurriculumLessons>>[number];

/** Plain-text, server-rendered reader. Only fictional excerpts receive a demo marker;
 * optional native self-checks send no answers and never gate self-marked reading progress. */
export function LessonReader({ lesson, lessons, completed, relatedScenarios = [] }: { lesson: Lesson; lessons: Lesson[]; completed: boolean;
  relatedScenarios?: { id: string; title: string; difficulty: string }[] }) {
  const index = lessons.findIndex((item) => item.competency === lesson.competency);
  const previous = lessons[index - 1];
  const next = lessons[index + 1];
  const level = learningLevels.find((item) => item.code === lesson.level)!;
  const example = lesson.example;
  return <article className="page-card learning-page lesson-reader" aria-labelledby="lesson-heading">
    <Link href={`/learn?level=${lesson.level}`} className="inline-link">All {level.title} lessons</Link>
    <p className="eyebrow">{level.title} · Lesson {index + 1} of {lessons.length}</p>
    <h1 id="lesson-heading">{lesson.title}</h1>
    <p className="page-intro">{lesson.summary}</p>
    <p className={completed ? "success-note" : "practice-status"}><strong>{completed ? "Already complete at this level. Reviewing it never resets your progress." : "Not yet marked complete at this level."}</strong></p>
    <p>RaterReady educational instruction is independent and non-certifying. Fictional comparison excerpts below are labeled separately. No employer affiliation or endorsement is implied.</p>
    <section className="learning-section" aria-labelledby="objectives-heading"><h2 id="objectives-heading">Learning objectives</h2>
      <ul>{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></section>
    {lesson.sections.map((section, sectionIndex) => <section className="learning-section" key={section.heading} aria-labelledby={`instruction-${sectionIndex}`}>
      <h2 id={`instruction-${sectionIndex}`}>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </section>)}
    <section className="learning-section lesson-example" aria-labelledby="worked-example-heading" data-worked-example>
      <DemoBadge /><h2 id="worked-example-heading">Worked comparison</h2>
      <p>Fictional illustrative task, source and simulated responses. These are teaching excerpts, not practice submissions or Generalist Qualification Exam questions.</p>
      <h3>Task</h3><p>{example.task}</p><h3>Rubric</h3><p>{example.rubric}</p><h3>Supplied source evidence</h3><p>{example.source}</p>
      <div className="lesson-response-grid"><section aria-labelledby="example-response-a"><h3 id="example-response-a">Response A · simulated</h3><p>{example.responseA}</p></section>
        <section aria-labelledby="example-response-b"><h3 id="example-response-b">Response B · simulated</h3><p>{example.responseB}</p></section></div>
      <h3>Reason through the comparison</h3>{example.reasoning.map((reason) => <p key={reason}>{reason}</p>)}
    </section>
    <section className="learning-section" aria-labelledby="takeaways-heading"><h2 id="takeaways-heading">Key takeaways</h2>
      <ul>{lesson.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul></section>
    <section className="learning-section" aria-labelledby="self-check-heading"><h2 id="self-check-heading">Optional quick self-check</h2>
      <p>Think through this question, then reveal the explanation if useful. No answer is collected, scored or required for completion.</p>
      <p>{lesson.selfCheck.question}</p><details className="reference-panel"><summary>Reveal self-check explanation</summary><p>{lesson.selfCheck.answer}</p></details>
    </section>
    <section className="learning-section" aria-labelledby="completion-heading"><h2 id="completion-heading">Your reading progress</h2>
      <p>Marking this lesson complete records reading only, including when you skip the self-check. It never counts as mandatory G1–G6 Generalist practice coverage, grants exam eligibility, or issues a credential.</p>
      <p>The passing standard remains at least 85% on a FINALIZED Generalist Qualification Exam after owner review. Switching levels keeps completed lessons saved at their original level. Earlier reading marks remain saved when instruction is expanded; they are not mastery claims.</p>
      {!completed && <form action={markLessonComplete}><input type="hidden" name="level" value={lesson.level} /><input type="hidden" name="competency" value={lesson.competency} /><button type="submit" className="primary-button">Mark lesson complete</button></form>}
    </section>
    <section className="learning-section" aria-labelledby="related-practice-heading"><h2 id="related-practice-heading">Related Generalist practice</h2>
      <p>G1–G6 here identify RaterReady’s internal Generalist practice competencies, not an external industry standard. Practice is separate from reading and allows unlimited retries.</p>
      <ul>{lesson.relatedPractice.map((code) => <li key={code}><Link href={`/practice?competency=${code}`} className="inline-link">Practice {code} · {generalistPracticeCompetencies[code]}</Link></li>)}</ul>
      {relatedScenarios.length > 0 && <><h3>Try an existing practice scenario</h3><p>Exercises are labeled with their own difficulty; you may practice at any level.</p>
        <ul>{relatedScenarios.map((scenario) => <li key={scenario.id}><Link href={`/practice/${scenario.id}`} className="inline-link">Open practice: <SyntheticText rebrand>{scenario.title}</SyntheticText> · {learningLevels.find((item) => item.code === scenario.difficulty)?.title}</Link></li>)}</ul></>}
    </section>
    <nav className="learning-section lesson-pagination" aria-label="Previous and next lesson">
      {previous && <Link href={`/learn/${previous.competency}?level=${lesson.level}`} className="inline-link">Previous lesson: {previous.title}</Link>}
      {next ? <Link href={`/learn/${next.competency}?level=${lesson.level}`} className="inline-link">Next lesson: {next.title}</Link> : <Link href={`/learn?level=${lesson.level}`} className="inline-link">Return to all {level.title} lessons</Link>}
    </nav>
    <nav className="learning-section" aria-label="Lessons in this level"><h2>Lessons in {level.title}</h2><ol>{lessons.map((item) => <li key={item.competency}>
      <Link href={`/learn/${item.competency}?level=${lesson.level}`} aria-current={item.competency === lesson.competency ? "page" : undefined}>{item.title}</Link>
    </li>)}</ol></nav>
    <nav className="learning-section" aria-label="View this lesson at any level"><h2>View this lesson at any level</h2>
      <p>Browsing another level does not change your selected learning level.</p><ul>{learningLevels.map((item) => <li key={item.code}><Link href={`/learn/${lesson.competency}?level=${item.code}`}>{item.title}</Link></li>)}</ul>
    </nav><EvaluationReference /><Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </article>;
}
