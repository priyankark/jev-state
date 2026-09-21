import { z } from "zod";
const id = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,39}$/)
  .refine(
    (v) => !["__proto__", "constructor", "prototype", "stay"].includes(v),
    "Reserved state ID",
  );
export const stateSchema = z.object({
  id,
  label: z.string().min(1).max(60),
  description: z.string().max(1500),
  reply: z.string().max(2000),
  keywords: z.array(z.string().max(50)).max(20),
  transitions: z.array(id).max(12),
  terminal: z.boolean(),
  position: z
    .object({
      x: z.number().finite().min(-100000).max(100000),
      y: z.number().finite().min(-100000).max(100000),
    })
    .optional(),
});
export const evalCaseSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  turns: z.array(z.string().trim().min(1).max(2000)).min(1).max(5),
  expectedState: id,
  responseIncludes: z.string().max(200),
});
export const projectSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(300),
    instructions: z.string().min(1).max(4000),
    initial: id,
    threshold: z.number().min(0).max(1),
    states: z.array(stateSchema).min(2).max(12),
    agent: z.object({
      enabled: z.boolean(),
      model: z.string().min(1).max(100),
      instructions: z.string().max(4000),
    }),
    version: z.number().int().positive(),
    createdAt: z.string(),
    cases: z.array(evalCaseSchema).max(30),
  })
  .superRefine((p, ctx) => {
    const ids = new Set(p.states.map((s) => s.id));
    if (ids.size !== p.states.length)
      ctx.addIssue({ code: "custom", message: "State IDs must be unique" });
    if (!ids.has(p.initial))
      ctx.addIssue({
        code: "custom",
        message: "Choose an existing initial state",
      });
    if (new Set(p.cases.map((c) => c.id)).size !== p.cases.length)
      ctx.addIssue({
        code: "custom",
        message: "Evaluation case IDs must be unique",
      });
    for (const c of p.cases)
      if (!ids.has(c.expectedState))
        ctx.addIssue({
          code: "custom",
          message: "An evaluation expects a state that no longer exists",
        });
    for (const s of p.states) {
      if (new Set(s.transitions).size !== s.transitions.length)
        ctx.addIssue({
          code: "custom",
          message: `Duplicate transitions in ${s.label}`,
        });
      if (s.transitions.some((t) => !ids.has(t) || t === s.id))
        ctx.addIssue({
          code: "custom",
          message: `Invalid transition in ${s.label}`,
        });
      if (s.terminal && s.transitions.length)
        ctx.addIssue({
          code: "custom",
          message: `End state ${s.label} cannot have outgoing transitions`,
        });
    }
  });
export type Project = z.infer<typeof projectSchema>;
export type WorkflowState = z.infer<typeof stateSchema>;

// Canvas coordinates are presentation, not a new conversation policy.
export function workflowSignature(project: Project): string {
  return JSON.stringify({
    name: project.name,
    initial: project.initial,
    states: project.states.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      reply: s.reply,
      keywords: s.keywords,
      transitions: s.transitions,
      terminal: s.terminal,
    })),
    instructions: project.instructions,
    threshold: project.threshold,
    agent: project.agent,
  });
}
export function evaluationSignature(project: Project): string {
  return JSON.stringify({
    workflow: workflowSignature(project),
    cases: project.cases,
  });
}

export type EvalCase = z.infer<typeof evalCaseSchema>;
export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});
export type ChatMessage = z.infer<typeof messageSchema>;
export const turnRequestSchema = z
  .object({
    project: projectSchema,
    currentState: id,
    messages: z.array(messageSchema).min(1).max(40),
    mode: z.enum(["mock", "live"]),
  })
  .superRefine((r, ctx) => {
    if (!r.project.states.some((s) => s.id === r.currentState))
      ctx.addIssue({ code: "custom", message: "Unknown active state" });
    if (r.messages.at(-1)?.role !== "user")
      ctx.addIssue({
        code: "custom",
        message: "The last message must be from the user",
      });
    r.messages.forEach((m, i) => {
      if (m.role !== (i % 2 === 0 ? "user" : "assistant"))
        ctx.addIssue({
          code: "custom",
          message: "Messages must alternate user and assistant",
        });
    });
  });
export type TurnRequest = z.infer<typeof turnRequestSchema>;
export interface TurnResult {
  id: string;
  from: string;
  to: string;
  reply: string;
  confidence: number;
  probabilities: Record<string, number>;
  reason: string;
  model: string;
  agentModel: string | null;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  questions: unknown;
  input: unknown;
  mode: "mock" | "live";
  at: string;
}
export interface Conversation {
  id: string;
  projectId: string;
  projectVersion: number;
  projectSnapshot: Project;
  createdAt: string;
  mode: "mock" | "live";
  messages: ChatMessage[];
  turns: TurnResult[];
}
export interface CaseResult {
  caseId: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  responsePassed: boolean;
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
  turns: TurnResult[];
  error?: string;
}
export interface EvalReport {
  id: string;
  projectId: string;
  projectVersion: number;
  createdAt: string;
  mode: "mock" | "live";
  configSignature: string;
  results: CaseResult[];
}
