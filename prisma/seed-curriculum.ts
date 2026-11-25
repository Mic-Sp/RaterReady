import type { Prisma } from "@prisma/client";
import { curriculumContentSchema } from "../src/lib/curriculum";
import { curriculumLessons } from "./curriculum-lessons";

/**
 * Upsert instruction by stable level/lesson slot; reruns converge to authored content.
 * Never touch users, ModuleProgress, Scenario banks, attempts or credentials. Updating a
 * lesson preserves prior self-marked reading; it does not claim mastery of revised content.
 */
export async function seedCurriculum(tx: Prisma.TransactionClient): Promise<void> {
  for (const { level, competency, content } of curriculumLessons) {
    const contentJson = curriculumContentSchema.parse(content);
    await tx.curriculumLesson.upsert({ where: { level_competency: { level, competency } },
      create: { level, competency, contentJson }, update: { contentJson } });
  }
}
