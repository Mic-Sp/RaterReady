import Link from "next/link";
import type { getCurriculumLessons } from "../../server/learning/service";
import { learningLevels } from "../../lib/learning-content";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { catalogHeading } from "../../lib/catalog-presentation";
import { DemoBadge, SyntheticText } from "../components/demo-badge";
import { EvaluationReference } from "../components/evaluation-reference";
import { learningIndependenceNote } from "../components/reading-status";
import { markLessonComplete } from "../learning/actions";

type Lesson = Awaited<ReturnType<typeof getCurriculumLessons>>[number];

/** Render public instruction and saved reading progress. The optional self-check sends no answer and never gates completion. */
export function LessonReader({ lesson, lessons, completed, completedCount, relatedScenarios = [] }: {
  lesson: Lesson; lessons: Lesson[]; completed: boolean; completedCount: number;
  relatedScenarios?: { id: string; title: string; difficulty: string }[];
}) {
  const index = lessons.findIndex((item) => item.competency === lesson.competency);
  const previous = lessons[index - 1];
  const next = lessons[index + 1];
  const level = learningLevels.find((item) => item.code === lesson.level)!;
  const example = lesson.example;
  const [primarySkill, ...otherSkills] = lesson.relatedPractice;
  const catalog = `/learn?level=${lesson.level}`;

  return <article className="page-card learning-page lesson-reader" aria-labelledby="lesson-heading">
    <header className="lesson-mini-header">
      <p><strong>Lesson {index + 1} of {lessons.length}</strong> · {level.title}</p>
      <div className="lesson-mini-progress">
        <p>{completedCount} of {lessons.length} complete</p>
        <progress max={lessons.length} value={completedCount} aria-label="Lessons completed at this level" />
      </div>
    </header>
    <h1 id="lesson-heading">{lesson.title}</h1>
    <p className="page-intro">{lesson.summary}</p>
    <section className="learning-section" aria-labelledby="objectives-heading">
      <h2 id="objectives-heading">Learning objectives</h2>
      <ul>{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
    </section>

    <section className="learning-section lesson-example" aria-labelledby="worked-example-heading" data-worked-example>
      <div className="learning-section-title"><h2 id="worked-example-heading">Worked comparison</h2><DemoBadge /></div>
      <p>A fictional task with example responses. Follow how the rubric and evidence support the comparison.</p>
      <h3>Task</h3><p>{example.task}</p><h3>Rubric</h3><p>{example.rubric}</p><h3>Supplied source evidence</h3><p>{example.source}</p>
      <div className="lesson-response-grid">
        <section aria-labelledby="example-response-a"><h3 id="example-response-a">Response A · simulated</h3><p>{example.responseA}</p></section>
        <section aria-labelledby="example-response-b"><h3 id="example-response-b">Response B · simulated</h3><p>{example.responseB}</p></section>
      </div>
      <h3>Reason through the comparison</h3>{example.reasoning.map((reason) => <p key={reason}>{reason}</p>)}
    </section>
    <section className="learning-section" aria-labelledby="takeaways-heading">
      <h2 id="takeaways-heading">Key takeaways</h2>
      <ul>{lesson.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul>
    </section>
    <details className="reference-panel lesson-background">
      <summary>Background</summary>
      {lesson.sections.map((section, sectionIndex) => <section className="learning-section" key={section.heading} aria-labelledby={`instruction-${sectionIndex}`}>
        <h2 id={`instruction-${sectionIndex}`}>{section.heading}</h2>
        {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </section>)}
    </details>
    <section className="learning-section" aria-labelledby="self-check-heading">
      <h2 id="self-check-heading">Optional quick self-check</h2>
      <p>Think it through, then reveal the explanation whenever you’re ready.</p>
      <p>{lesson.selfCheck.question}</p>
      <details className="reference-panel"><summary>Reveal self-check explanation</summary><p>{lesson.selfCheck.answer}</p></details>
    </section>

    <section className="learning-section" aria-labelledby="completion-heading">
      <h2 id="completion-heading">Your reading progress</h2>
      <p>Marking a lesson complete tracks your reading progress. It doesn’t affect your exam score.</p>
      {completed && <p className="lesson-marked"><span aria-hidden="true">✓ </span>Reading complete at this level</p>}
      <div className="lesson-action-bar">
        {!completed && <form action={markLessonComplete}>
          <input type="hidden" name="level" value={lesson.level} /><input type="hidden" name="competency" value={lesson.competency} />
          <button type="submit" className="primary-button">Mark lesson complete</button>
        </form>}
        {next
          ? <Link href={`/learn/${next.competency}?level=${lesson.level}`} className="secondary-button button-link">Next lesson <span aria-hidden="true">→</span></Link>
          : <Link href={catalog} className="secondary-button button-link">Return to all {level.title} lessons</Link>}
      </div>
      {previous && <Link href={`/learn/${previous.competency}?level=${lesson.level}`} className="inline-link">Previous lesson: {previous.title}</Link>}
    </section>
    <section className="learning-section lesson-practice-card" aria-labelledby="related-practice-heading">
      <div className="learning-section-title"><h2 id="related-practice-heading">Related Generalist practice</h2><DemoBadge /></div>
      <p>Try {generalistPracticeCompetencies[primarySkill].toLowerCase()} in an exercise you can repeat at your own pace.</p>
      <Link href={`/practice?competency=${primarySkill}`} className="secondary-button button-link">Practice this skill</Link>
      {otherSkills.length > 0 && <ul>{otherSkills.map((code) => <li key={code}><Link href={`/practice?competency=${code}`} className="inline-link">Practice {code} · {generalistPracticeCompetencies[code]}</Link></li>)}</ul>}
      {relatedScenarios.length > 0 && <ul>{relatedScenarios.map((scenario) => <li key={scenario.id}>
        <Link href={`/practice/${scenario.id}`} className="inline-link">Open practice: <SyntheticText rebrand>{catalogHeading(scenario.title)}</SyntheticText> · {learningLevels.find((item) => item.code === scenario.difficulty)?.title}</Link>
      </li>)}</ul>}
    </section>

    <footer className="lesson-footer">
      <details className="reference-panel">
        <summary>Lesson navigation and reference</summary>
        <nav className="learning-section" aria-label="Lessons in this level">
          <h2>Lessons in {level.title}</h2>
          <ol>{lessons.map((item) => <li key={item.competency}>
            <Link href={`/learn/${item.competency}?level=${lesson.level}`} aria-current={item.competency === lesson.competency ? "page" : undefined}>{item.title}</Link>
          </li>)}</ol>
          <Link href={catalog} className="inline-link">All {level.title} lessons</Link>
        </nav>
        <nav className="learning-section" aria-label="View this lesson at any level">
          <h2>View this lesson at any level</h2>
          <p>Browsing keeps your selected level unchanged.</p>
          <ul>{learningLevels.map((item) => <li key={item.code}><Link href={`/learn/${lesson.competency}?level=${item.code}`}>{item.title}</Link></li>)}</ul>
        </nav>
        <EvaluationReference />
      </details>
      <p className="learning-independence-note">{learningIndependenceNote}</p>
      <Link href="/dashboard" className="inline-link">Return to dashboard</Link>
    </footer>
  </article>;
}
