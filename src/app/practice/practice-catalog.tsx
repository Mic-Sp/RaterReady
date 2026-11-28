"use client";

import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { Competency, LearningLevel } from "@prisma/client";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { LearningCard } from "../components/learning-card";
import { StatusBadge } from "../components/status-badge";
import { practiceDifficulties, type PracticeCard } from "./catalog-guidance";

const statusTones = { New: "neutral", Practiced: "success", Retry: "pending" } as const;

/** Filter only the authorized catalog projection and keep the URL shareable without losing keyboard focus. */
export function PracticeCatalog({ cards }: { cards: PracticeCard[] }) {
  const params = useSearchParams();
  const competency = params.get("competency") ?? "";
  const level = params.get("level") ?? "";
  const firstFilter = useRef<HTMLSelectElement>(null);
  const matches = cards.filter((card) => (!competency || card.competencies.includes(competency as Competency))
    && (!level || card.difficulty === level));

  function changeFilter(name: "competency" | "level", value: string) {
    // Merge changes against the current URL, even if the first selection has not re-rendered yet.
    const query = new URLSearchParams(window.location.search);
    if (value) query.set(name, value);
    else query.delete(name);
    window.history.replaceState(null, "", query.size ? `/practice?${query}` : "/practice");
  }

  return <>
    <fieldset className="practice-filters" aria-describedby="practice-filter-hint">
      <legend className="sr-only">Filter scenarios</legend>
      <div className="form-field">
        <label htmlFor="competency-filter">Competency</label>
        <select ref={firstFilter} id="competency-filter" name="competency" value={competency} onChange={(event) => changeFilter("competency", event.target.value)}>
          <option value="">All competencies</option>
          {Object.entries(generalistPracticeCompetencies).map(([code, title]) => <option key={code} value={code}>{code} · {title}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="level-filter">Scenario difficulty</label>
        <select id="level-filter" name="level" value={level} onChange={(event) => changeFilter("level", event.target.value)}>
          <option value="">All levels</option>
          {(Object.keys(practiceDifficulties) as LearningLevel[]).map((difficulty) => (
            <option key={difficulty} value={difficulty}>{practiceDifficulties[difficulty]}</option>
          ))}
        </select>
      </div>
      {(competency || level) && <button type="button" className="text-button practice-clear" onClick={() => {
        firstFilter.current?.focus();
        window.history.replaceState(null, "", "/practice");
      }}>Clear filters</button>}
    </fieldset>
    <p id="practice-filter-hint" className="field-hint">Changing a filter updates the list below.</p>
    <p className="field-hint" role="status">{matches.length
      ? `${matches.length} matching ${matches.length === 1 ? "scenario" : "scenarios"}`
      : "No scenarios match. Clear the filters or try a different combination."}</p>
    <ul className="practice-catalog learning-card-grid" role="list">{matches.map((card) => <li key={card.id}>
      <LearningCard headingId={`scenario-${card.id}`} title={card.title} href={`/practice/${card.id}`}
        metadata={<>
          <span className="competency-tag">{card.competencies.join(", ")} · {practiceDifficulties[card.difficulty]}</span>
          <StatusBadge tone={statusTones[card.status]}>{card.status}</StatusBadge>
        </>}
        summary={<p>{card.summary}</p>} />
    </li>)}</ul>
  </>;
}
