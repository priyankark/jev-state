import { z } from "zod";

const probability = z.number().min(0).max(1);
const distribution = z
  .record(z.string(), probability)
  .refine(
    (v) => Math.abs(Object.values(v).reduce((a, b) => a + b, 0) - 1) < 0.02,
    "Probabilities must sum to one",
  );
export const answerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: probability,
    probabilities: distribution,
  }),
  z.object({ type: z.literal("noul"), noul: probability }),
  z.object({
    type: z.literal("score"),
    score: z.number().finite(),
    confidence: probability,
    probabilities: distribution,
    legend: z.record(z.string(), z.json()),
  }),
]);
export type Answer = z.infer<typeof answerSchema>;
export const evaluationSchema = z.object({
  model: z.string().max(100),
  answers: z.record(z.string(), answerSchema),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});
export type Evaluation = z.infer<typeof evaluationSchema>;
export const runInputSchema = z
  .object({
    message: z.string().trim().min(1).max(8000),
    threshold: probability.default(0.8),
    mode: z.enum(["mock", "live"]).default("mock"),
    scenario: z.enum(["auto", "uncertain", "error"]).default("auto"),
  })
  .strict();
export type RunInput = z.infer<typeof runInputSchema>;
export const stepSchema = z.object({
  sequence: z.number().int().nonnegative(),
  state: z.string().max(100),
  at: z.string().datetime(),
  elapsedMs: z.number().nonnegative(),
  context: z.object({
    input: z.json(),
    threshold: probability,
    result: evaluationSchema.nullable(),
    policy: z.object({ outcome: z.string(), reason: z.string() }).nullable(),
    error: z.string().nullable(),
  }),
});
export type TraceStep = z.infer<typeof stepSchema>;
export const traceSchema = z
  .object({
    schemaVersion: z.literal(1),
    machineId: z.string(),
    machineVersion: z.string(),
    policyVersion: z.string(),
    runId: z.string().uuid(),
    requestId: z.string().uuid(),
    mode: z.enum(["mock", "live"]),
    createdAt: z.string().datetime(),
    questions: z.record(z.string(), z.json()),
    steps: z.array(stepSchema).min(1).max(100),
  })
  .strict()
  .superRefine((trace, ctx) => {
    trace.steps.forEach((step, i) => {
      if (step.sequence !== i)
        ctx.addIssue({ code: "custom", message: "Trace sequence is invalid" });
      if (i && step.elapsedMs < trace.steps[i - 1]!.elapsedMs)
        ctx.addIssue({
          code: "custom",
          message: "Trace timestamps are out of order",
        });
    });
  });
export type RunTrace = z.infer<typeof traceSchema>;
export interface GraphNode {
  id: string;
  label: string;
  description: string;
  kind: "initial" | "decision" | "outcome" | "error";
  x: number;
  y: number;
}
export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}
export interface MachineManifest {
  id: string;
  name: string;
  version: string;
  policyVersion: string;
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  questions: Record<string, unknown>;
}
