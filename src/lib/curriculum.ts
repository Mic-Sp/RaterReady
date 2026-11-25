import { z } from "zod";

const text = z.string().min(1);
/** Public educational content only: examples are explicitly fictional and never reference secure assessment rows. */
export const curriculumContentSchema = z.object({
  title: text, summary: text, objectives: z.array(text).min(2),
  sections: z.array(z.object({ heading: text, paragraphs: z.array(text).min(1) }).strict()).min(2),
  example: z.object({ label: z.literal("DEMO - SYNTHETIC"), task: text, rubric: text, source: text,
    responseA: text, responseB: text, reasoning: z.array(text).min(2) }).strict(),
  takeaways: z.array(text).min(2),
  selfCheck: z.object({ question: text, answer: text }).strict(),
  relatedPractice: z.array(z.enum(["G1", "G2", "G3", "G4", "G5", "G6"])).min(1),
}).strict();

export type CurriculumContent = z.infer<typeof curriculumContentSchema>;
