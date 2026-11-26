import "server-only";
import type { JudgeJobStatus, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { FIXTURE_MODEL_VERSION } from "./judges";

const receiptLimit = 60;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const modelId = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

type RecentReceipt = {
  judgeSlot: number;
  modelVersion: string;
  isSyntheticFixture: boolean;
  status: JudgeJobStatus;
  latencyMs: number;
  returnedModel: unknown;
  inputTokens: unknown;
  outputTokens: unknown;
  totalTokens: unknown;
};

type TokenSum = { tokens: number; reports: number };
type ModelMetrics = {
  judgeSlot: number; model: string; returnedModel: string | null; receipts: number; errors: number;
  averageLatencyMs: number; usage: Record<"inputTokens" | "outputTokens" | "totalTokens", TokenSum>;
};

/** Allow only known fixture labels and model identifiers. Never render arbitrary historical metadata or key-shaped values. */
export function displayJudgeModel(value: unknown): string | null {
  if (value === FIXTURE_MODEL_VERSION) return value;
  if (typeof value !== "string") return null;
  const model = value.replace(/^(?:gemini|openai):/, "");
  if (!modelId.test(model) || /^(?:AIza|sk-)/.test(model)) return null;
  if ([process.env.GEMINI_API_KEY, process.env.OPENAI_API_KEY].some((key) => key?.trim() === model)) return null;
  return value;
}

/** Aggregate a bounded terminal receipt window. Call from the authorized review console only. */
export async function readGradingTelemetry(db: PrismaClient) {
  // JSON projection reads only allowed telemetry fields. SQL computes agreement solely for reviews
  // with saved independent scores, returning counts without case IDs, votes, rationales or prose.
  const [result] = await db.$queryRaw<{ receipts: RecentReceipt[]; agreements: number; disagreements: number }[]>`
    WITH recent AS (
      SELECT * FROM "AiGradingReceipt" ORDER BY "completedAt" DESC, "id" DESC LIMIT ${receiptLimit}
    ), comparisons AS (
      SELECT (a."rawVoteJson"->'alignment', a."rawVoteJson"->'evidence', a."rawVoteJson"->'clarity') =
        (b."rawVoteJson"->'alignment', b."rawVoteJson"->'evidence', b."rawVoteJson"->'clarity') AS agrees
      FROM recent a
      JOIN recent b ON a."attemptId" = b."attemptId" AND a."responseId" = b."responseId"
        AND a."judgeSlot" = 1 AND b."judgeSlot" = 2
      JOIN "ReviewCase" review ON review."attemptId" = a."attemptId"
        AND review."ownerPreliminarySavedAt" IS NOT NULL AND review."ownerPreliminaryJson" IS NOT NULL
      WHERE a."status" = 'SUCCEEDED' AND b."status" = 'SUCCEEDED'
    )
    SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'judgeSlot', "judgeSlot", 'modelVersion', "modelVersion", 'isSyntheticFixture', "isSyntheticFixture",
      'status', "status", 'latencyMs', "latencyMs",
      'returnedModel', "rawVoteJson"#>'{telemetry,returnedModel}',
      'inputTokens', "rawVoteJson"#>'{telemetry,usage,inputTokens}',
      'outputTokens', "rawVoteJson"#>'{telemetry,usage,outputTokens}',
      'totalTokens', "rawVoteJson"#>'{telemetry,usage,totalTokens}'
    ) ORDER BY "completedAt" DESC, "id" DESC) FROM recent), '[]'::jsonb) AS receipts,
    (SELECT count(*)::int FROM comparisons WHERE agrees) AS agreements,
    (SELECT count(*)::int FROM comparisons WHERE NOT agrees) AS disagreements`;
  const models = new Map<string, ModelMetrics>();
  let fallbacks = 0;
  let errors = 0;
  for (const receipt of result.receipts) {
    const model = displayJudgeModel(receipt.modelVersion) ?? "Unavailable";
    const returnedModel = displayJudgeModel(receipt.returnedModel);
    const key = JSON.stringify([receipt.judgeSlot, model, returnedModel]);
    const metrics = models.get(key) ?? { judgeSlot: receipt.judgeSlot, model, returnedModel, receipts: 0, errors: 0,
      averageLatencyMs: 0, usage: { inputTokens: { tokens: 0, reports: 0 }, outputTokens: { tokens: 0, reports: 0 },
        totalTokens: { tokens: 0, reports: 0 } } };
    metrics.receipts++;
    // Accumulate milliseconds here, then convert to a rounded mean once per group.
    metrics.averageLatencyMs += receipt.latencyMs;
    if (receipt.isSyntheticFixture && receipt.status === "SUCCEEDED") fallbacks++;
    if (receipt.status !== "SUCCEEDED") { errors++; metrics.errors++; }
    for (const field of ["inputTokens", "outputTokens", "totalTokens"] as const) {
      const tokens = count.safeParse(receipt[field]);
      if (tokens.success) { metrics.usage[field].tokens += tokens.data; metrics.usage[field].reports++; }
    }
    models.set(key, metrics);
  }
  return { sampleSize: result.receipts.length, receiptLimit, agreements: result.agreements, disagreements: result.disagreements,
    fallbacks, errors, models: [...models.values()].map((row) => ({ ...row, averageLatencyMs: Math.round(row.averageLatencyMs / row.receipts) })) };
}
