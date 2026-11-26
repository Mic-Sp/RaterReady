import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { loadPracticeScenario, persistPracticeEvaluation, type PracticeTrack } from "./service";
import { evaluatePracticeScenario, practiceSubmissionSchema, PracticeEvaluationError } from "../domain/practice-scoring";

/** Partial draft inputs deliberately allow unanswered controls; research scratchpad is not an accepted field. */
export const practiceDraftSchema = z.object({
  scenarioId: z.string().min(1).max(100), scenarioVersion: z.number().int().positive(), rubricVersion: z.number().int().positive(),
  revision: z.number().int().nonnegative(), judgment: z.enum(["A_BETTER", "B_BETTER", "TIE", "BOTH_UNACCEPTABLE"]).optional(),
  rubricSelections: z.record(z.string().max(64), z.enum(["A_ONLY", "B_ONLY", "BOTH_MEET", "NEITHER_MEETS"])),
  verifiedSourceIds: z.array(z.string().min(1).max(100)).max(30), writtenJustification: z.string().max(12000),
}).strict();
export type PracticeDraftInput = z.infer<typeof practiceDraftSchema>;
export type PracticeScenarioDTO = Awaited<ReturnType<typeof loadPracticeScenario>>;

/** A stale draft is never overwritten, even when another tab has already submitted it. */
export class PracticeDraftConflict extends Error {
  constructor() { super("This draft changed in another request. Reload the saved draft before trying again."); this.name = "PracticeDraftConflict"; }
}

/** Read public catalog metadata for the server-selected track; no draft/unpublished/capstone scenarios are browsable. */
export async function listPracticeScenarios(db: PrismaClient, filters: { competency?: string; level?: string } = {}, track: PracticeTrack = "GENERALIST") {
  const parsed = z.object({ competency: z.enum(["G1", "G2", "G3", "G4", "G5", "G6"]).optional(), level: z.enum(["FOUNDATIONS", "INTERMEDIATE", "ADVANCED"]).optional() }).parse(filters);
  // Choose the newest published version BEFORE filtering: a superseded version may have other tags.
  // Historical links, saved drafts and grading continue to resolve their own immutable scenario IDs.
  const current = await db.scenario.findMany({ where: { bank: "PRACTICE", status: "PUBLISHED", track, isSyntheticFixture: true },
    distinct: ["familyId"], orderBy: { version: "desc" },
    select: { id: true, title: true, version: true, competencies: true, difficulty: true } });
  return current.filter((item) => (!parsed.competency || item.competencies.includes(parsed.competency))
    && (!parsed.level || item.difficulty === parsed.level)).sort((a, b) => a.title.localeCompare(b.title));
}

/** Load owned draft/result state within the fixed practice track; only submitted drafts may receive safe feedback. */
export async function loadPracticeWorkspace(db: PrismaClient, candidateId: string, scenarioId: string, track: PracticeTrack = "GENERALIST") {
  const scenario = await loadPracticeScenario(db, candidateId, scenarioId, track);
  if (!scenario.rubric.practice) throw new PracticeEvaluationError("INVALID_CONFIGURATION");
  const draft = await db.practiceDraft.findUnique({ where: { candidateId_scenarioId: { candidateId, scenarioId } } });
  const ownDraft = draft ? { savedAt: draft.savedAt.toISOString(), submittedAt: draft.submittedAt?.toISOString() ?? null,
    ...practiceDraftSchema.parse({ scenarioId, scenarioVersion: draft.scenarioVersion, rubricVersion: draft.rubricVersion, revision: draft.revision,
      ...z.object({ judgment: practiceDraftSchema.shape.judgment, rubricSelections: practiceDraftSchema.shape.rubricSelections, verifiedSourceIds: practiceDraftSchema.shape.verifiedSourceIds }).parse(draft.selectionsJson), writtenJustification: draft.writtenJustification }) } : null;
  let result: ReturnType<typeof evaluatePracticeScenario> | undefined;
  if (ownDraft?.submittedAt) {
    // This trusted owned submission marker is checked before selecting keys. Reloading feedback never creates another attempt.
    const grading = await db.scenario.findFirst({ where: { id: scenarioId, bank: "PRACTICE", status: "PUBLISHED", track, isSyntheticFixture: true },
      select: { id: true, version: true, bank: true, status: true, track: true, isSyntheticFixture: true,
        answerKeyJson: true, allowedAlternativesJson: true, expertExplanation: true, evidenceJson: true,
        rubric: { select: { id: true, version: true, criteriaJson: true } } } });
    if (!grading) throw new PracticeEvaluationError("UNAVAILABLE");
    result = evaluatePracticeScenario(grading, { scenarioId: ownDraft.scenarioId, scenarioVersion: ownDraft.scenarioVersion,
      rubricVersion: ownDraft.rubricVersion, judgment: ownDraft.judgment, rubricSelections: ownDraft.rubricSelections,
      verifiedSourceIds: ownDraft.verifiedSourceIds, writtenJustification: ownDraft.writtenJustification });
  }
  return { scenario, draft: ownDraft, result };
}

/** Validate public control membership before writing; no answer keys are read during draft saves. */
function validateDraft(scenario: PracticeScenarioDTO, data: PracticeDraftInput): void {
  if (scenario.version !== data.scenarioVersion || scenario.rubric.version !== data.rubricVersion) throw new PracticeEvaluationError("STALE_VERSION");
  const ids = scenario.rubric.practice?.criteria.map((item) => item.id) ?? [];
  if (Object.keys(data.rubricSelections).some((id) => !ids.includes(id)) || data.verifiedSourceIds.some((id) => !scenario.evidence.some((source) => source.id === id))) throw new PracticeEvaluationError("INVALID_SUBMISSION");
}

/**
 * Save or submit in one transaction using a revision compare-and-increment. Draft saves
 * write no score/attempt/progress. Submission reserves that same revision before grading,
 * so double clicks/stale tabs cannot create duplicate submissions or lose saved work.
 */
export async function saveOrSubmitPractice(db: PrismaClient, candidateId: string, input: unknown, submit: boolean, track: PracticeTrack = "GENERALIST") {
  const data = practiceDraftSchema.parse(input);
  const scenario = await loadPracticeScenario(db, candidateId, data.scenarioId, track);
  validateDraft(scenario, data);
  const { revision, ...submission } = data;
  const fullSubmission = submit ? practiceSubmissionSchema.parse(submission) : null;
  try {
    return await db.$transaction(async (tx) => {
      const savedAt = new Date();
      const draftData = { scenarioVersion: data.scenarioVersion, rubricVersion: data.rubricVersion,
        selectionsJson: { ...(data.judgment ? { judgment: data.judgment } : {}), rubricSelections: data.rubricSelections, verifiedSourceIds: data.verifiedSourceIds },
        writtenJustification: data.writtenJustification, savedAt, submittedAt: submit ? savedAt : null };
      if (revision === 0) {
        await tx.practiceDraft.create({ data: { candidateId, scenarioId: data.scenarioId, ...draftData, revision: 1 } });
      } else {
        const changed = await tx.practiceDraft.updateMany({ where: { candidateId, scenarioId: data.scenarioId, revision }, data: { ...draftData, revision: { increment: 1 } } });
        if (changed.count !== 1) throw new PracticeDraftConflict();
      }
      const result = fullSubmission ? await persistPracticeEvaluation(tx, candidateId, fullSubmission, track) : null;
      return { revision: revision + 1, savedAt: savedAt.toISOString(), submittedAt: submit ? savedAt.toISOString() : null, result };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new PracticeDraftConflict();
    throw error;
  }
}
