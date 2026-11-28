import "server-only";
import { type PrismaClient, type Competency } from "@prisma/client";
import { capstoneDatabaseNow } from "../capstone/clock";
import { scorePinnedStructuredResponse, PracticeEvaluationError } from "../domain/practice-scoring";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { examWhere, learningAttemptSelect, practiceWhere, summarizeLearning } from "./learning-projection";
import { requireControlPanelOwner } from "./owner";

const competencies = Object.keys(generalistPracticeCompetencies) as Competency[];
const day = 24 * 60 * 60 * 1000;
const completedExam = { ...examWhere, status: "FINALIZED", submittedAt: { not: null }, reviewCase: { status: "FINALIZED" } } as const;

function skillMetrics() {
  return competencies.map((code) => ({ code, practiceSubmissions: 0, practiceScored: 0, practicePoints: 0, examScored: 0, examPoints: 0 }));
}

function cohort() {
  return { registered: 0, verified: 0, lessonStarted: 0, practiceComplete: 0, examStarted: 0, passed: 0,
    active24h: 0, active7d: 0, examCompletions: 0, judgeReceipts: 0, backupVotes: 0, timeouts: 0, skills: skillMetrics() };
}

function percentage(total: number, count: number) {
  return count ? Math.round(total / count / 95 * 1000) / 10 : null;
}

/** Owner-only cohort aggregates. Use learner identity for cohorts and expose neither account rows nor secure item data. */
export async function getSiteTelemetry(db: PrismaClient) {
  await requireControlPanelOwner();
  const now = await capstoneDatabaseNow(db);
  const since = new Date(now.getTime() - 7 * day);
  const [learners, items, receiptCounts] = await Promise.all([
    db.user.findMany({ where: { role: "CANDIDATE" }, select: {
      isSyntheticFixture: true, emailVerifiedAt: true, candidateProfile: { select: {
        firstLessonOpenedAt: true, lastActiveAt: true,
        moduleProgress: { orderBy: { completedAt: "desc" }, take: 1, select: { completedAt: true } },
        practiceDrafts: { orderBy: { savedAt: "desc" }, take: 1, select: { savedAt: true } },
        attempts: { where: { OR: [practiceWhere, examWhere] }, select: learningAttemptSelect },
      } },
    } }),
    db.submissionResponse.findMany({ where: {
      attempt: { ...completedExam, candidate: { user: { role: "CANDIDATE" } } },
      scenario: { bank: "CAPSTONE", track: "GENERALIST", status: "PUBLISHED", isSyntheticFixture: true },
    }, select: {
      position: true, selectionsJson: true,
      attempt: { select: {
        capstoneBlueprint: { select: { slots: { select: { position: true, competency: true } } } },
        candidate: { select: { user: { select: { isSyntheticFixture: true } } } },
      } },
      scenario: { select: { id: true, version: true, competencies: true, answerKeyJson: true, allowedAlternativesJson: true, evidenceJson: true,
        rubric: { select: { id: true, version: true, criteriaJson: true } } } },
    } }),
    // Receipt identity is retained independently of jobs. Count only matching owned exam receipts
    // and return aggregates, without reading provider outputs, tokens or votes.
    db.$queryRaw<{ demo: boolean; total: number; backup: number; timeouts: number }[]>`
      SELECT u."isSyntheticFixture" AS demo, count(*)::int AS total,
        count(*) FILTER (WHERE r."isSyntheticFixture" AND r."status" = 'SUCCEEDED')::int AS backup,
        count(*) FILTER (WHERE r."status" = 'TIMED_OUT')::int AS timeouts
      FROM "AiGradingReceipt" r
      JOIN "AssessmentAttempt" a ON a."id" = r."attemptId"
      JOIN "User" u ON u."id" = a."candidateId"
      WHERE u."role" = 'CANDIDATE' AND a."mode" = 'CAPSTONE' AND a."track" = 'GENERALIST'
        AND r."completedAt" >= ${since} AND r."completedAt" <= ${now}
      GROUP BY u."isSyntheticFixture"`,
  ]);

  const live = cohort();
  const demo = cohort();
  for (const learner of learners) {
    const data = learner.isSyntheticFixture ? demo : live;
    const profile = learner.candidateProfile;
    const learning = summarizeLearning(profile?.attempts ?? []);
    data.registered++;
    if (learner.emailVerifiedAt) data.verified++;
    if (profile?.firstLessonOpenedAt || profile?.moduleProgress.length) data.lessonStarted++;
    if (learning.practiced.size === competencies.length) data.practiceComplete++;
    if (learning.exams.length) data.examStarted++;
    if (learning.passed) data.passed++;
    data.examCompletions += learning.completed.filter(({ finalizedAt }) => finalizedAt && finalizedAt >= since && finalizedAt <= now).length;
    // Completed work remains historical evidence of activity from before visit tracking.
    const recentDates = [profile?.lastActiveAt, profile?.moduleProgress[0]?.completedAt, profile?.practiceDrafts[0]?.savedAt,
      ...(profile?.attempts.flatMap((attempt) => [attempt.startedAt, attempt.submittedAt]) ?? [])];
    if (recentDates.some((date) => date && date >= since && date <= now)) data.active7d++;
    if (recentDates.some((date) => date && date.getTime() >= now.getTime() - day && date <= now)) data.active24h++;

    for (const attempt of learning.practice) {
      const practicedHere = new Set(attempt.responses.flatMap(({ scenario }) => scenario.competencies));
      for (const skill of data.skills) if (practicedHere.has(skill.code)) {
        skill.practiceSubmissions++;
        if (attempt.deterministicScore !== null) {
          skill.practiceScored++;
          skill.practicePoints += attempt.deterministicScore.toNumber();
        }
      }
    }
  }
  for (const item of items) {
    const slot = item.attempt.capstoneBlueprint?.slots.find(({ position }) => position === item.position);
    const selections = item.selectionsJson;
    if (!slot || !item.scenario.competencies.includes(slot.competency) || !selections || typeof selections !== "object" || Array.isArray(selections)) continue;
    const data = item.attempt.candidate.user.isSyntheticFixture ? demo : live;
    const skill = data.skills.find(({ code }) => code === slot.competency)!;
    try {
      // Rescore finalized structured items against their immutable pins. Written or
      // appeal adjustments apply to the overall exam and cannot be assigned to skills.
      const score = scorePinnedStructuredResponse(item.scenario, {
        scenarioId: item.scenario.id, scenarioVersion: item.scenario.version, rubricVersion: item.scenario.rubric.version,
        judgment: selections.judgment, rubricSelections: selections.rubricSelections, verifiedSourceIds: selections.verifiedSourceIds,
      }).best.score;
      skill.examScored++;
      skill.examPoints += score;
    } catch (error) {
      // Legacy or incomplete item snapshots have no usable score, not a zero.
      if (!(error instanceof PracticeEvaluationError)) throw error;
    }
  }
  for (const row of receiptCounts) {
    const data = row.demo ? demo : live;
    data.judgeReceipts = row.total;
    data.backupVotes = row.backup;
    data.timeouts = row.timeouts;
  }
  const project = ({ skills, ...counts }: ReturnType<typeof cohort>) => ({
    ...counts,
    skills: skills.map(({ practicePoints, examPoints, ...skill }) => ({ ...skill,
      practiceAverage: percentage(practicePoints, skill.practiceScored), examAverage: percentage(examPoints, skill.examScored),
    })),
  });
  return { live: project(live), demo: project(demo) };
}
