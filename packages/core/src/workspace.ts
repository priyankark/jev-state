import { z } from "zod";
import { projectSchema, messageSchema } from "./studio.js";

const number = z.number().finite().nonnegative();
const turnSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  reply: z.string(),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
  reason: z.string(),
  model: z.string(),
  agentModel: z.string().nullable(),
  inputTokens: number,
  outputTokens: number,
  elapsedMs: number,
  questions: z.json(),
  input: z.json(),
  mode: z.enum(["mock", "live"]),
  at: z.string(),
});
const conversationSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    projectVersion: z.number().int().positive(),
    projectSnapshot: projectSchema,
    createdAt: z.string(),
    mode: z.enum(["mock", "live"]),
    messages: z.array(messageSchema).max(40),
    turns: z.array(turnSchema).max(20),
  })
  .superRefine((c, ctx) => {
    const ids = new Set(c.projectSnapshot.states.map((s) => s.id));
    if (
      c.messages.length !== c.turns.length * 2 ||
      c.projectSnapshot.id !== c.projectId ||
      c.turns.some(
        (t, i) =>
          !ids.has(t.from) ||
          !ids.has(t.to) ||
          t.from !== (c.turns[i - 1]?.to ?? c.projectSnapshot.initial),
      ) ||
      c.messages.some((m, i) => m.role !== (i % 2 === 0 ? "user" : "assistant"))
    )
      ctx.addIssue({ code: "custom", message: "Invalid conversation history" });
  });
const resultSchema = z.object({
  caseId: z.string(),
  name: z.string(),
  expected: z.string(),
  actual: z.string(),
  passed: z.boolean(),
  responsePassed: z.boolean(),
  elapsedMs: number,
  inputTokens: number,
  outputTokens: number,
  turns: z.array(turnSchema).max(5),
  error: z.string().optional(),
});
export const workspaceSchema = z
  .object({
    projects: z.array(projectSchema),
    conversations: z.array(conversationSchema),
    reports: z.array(
      z.object({
        id: z.string(),
        projectId: z.string(),
        projectVersion: z.number().int().positive(),
        createdAt: z.string(),
        mode: z.enum(["mock", "live"]),
        configSignature: z.string(),
        results: z.array(resultSchema).min(1).max(30),
      }),
    ),
  })
  .superRefine((workspace, ctx) => {
    for (const collection of [
      workspace.projects,
      workspace.conversations,
      workspace.reports,
    ])
      if (new Set(collection.map((item) => item.id)).size !== collection.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate IDs in workspace backup",
        });
    const ids = new Set(workspace.projects.map((p) => p.id));
    if (
      [...workspace.conversations, ...workspace.reports].some(
        (item) => !ids.has(item.projectId),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Workspace history references a missing project",
      });
  });
