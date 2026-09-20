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
    for (const c of p.cases)
      if (!ids.has(c.expectedState))
        ctx.addIssue({
          code: "custom",
          message: "An evaluation expects a state that no longer exists",
        });
    for (const s of p.states) {
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
const starter = (
  id: string,
  label: string,
  description: string,
  reply: string,
  transitions: string[],
  keywords: string[] = [],
  terminal = false,
): WorkflowState => ({
  id,
  label,
  description,
  reply,
  transitions,
  keywords,
  terminal,
});
const base = {
  version: 1,
  createdAt: "",
  threshold: 0.75,
  agent: {
    enabled: false,
    model: "gpt-4.1-mini",
    instructions:
      "Be concise, helpful, and honest. Never claim to have performed an external action. Ask one useful follow-up question when information is missing.",
  },
};
export const templates: Project[] = [
  {
    ...base,
    id: "example-support",
    name: "Support conversation",
    description:
      "Route an issue, work through it, and confirm resolution across multiple turns.",
    instructions:
      "Help the customer reach the appropriate support state. Use the full conversation to interpret short follow-ups. Only mark resolved when the customer explicitly confirms the issue is resolved. Do not claim to issue refunds or change accounts.",
    initial: "welcome",
    states: [
      starter(
        "welcome",
        "Welcome",
        "Identify what the customer needs.",
        "Hi! What can I help you with today?",
        ["billing", "technical", "review"],
      ),
      starter(
        "billing",
        "Billing help",
        "The conversation is about charges, subscriptions, payments, or refunds.",
        "I can help you work through the billing issue. Which charge or subscription is affected?",
        ["resolved", "review"],
        ["charge", "charged", "refund", "payment", "subscription"],
      ),
      starter(
        "technical",
        "Technical help",
        "The conversation concerns a bug, login failure, crash, or broken feature.",
        "Let’s troubleshoot. What happens when you try, and do you see an error?",
        ["resolved", "review"],
        ["crash", "login", "error", "bug", "broken"],
      ),
      starter(
        "review",
        "Human handoff",
        "The customer asks for a human or the request falls outside billing and technical support.",
        "This needs a human to take a closer look. I can summarize the details for them.",
        [],
        ["human", "person", "agent", "something else"],
        true,
      ),
      starter(
        "resolved",
        "Resolved",
        "The customer explicitly confirms that the problem is fixed or resolved.",
        "Glad that’s resolved. Thanks for checking back in!",
        [],
        ["fixed", "resolved", "working now", "sorted"],
        true,
      ),
    ],
    cases: [
      {
        id: "billing-resolution",
        name: "Billing → resolved",
        turns: [
          "I was charged twice for my subscription.",
          "It is fixed now, thank you.",
        ],
        expectedState: "resolved",
        responseIncludes: "",
      },
      {
        id: "technical",
        name: "Technical issue",
        turns: ["I get an error every time I log in."],
        expectedState: "technical",
        responseIncludes: "",
      },
      {
        id: "handoff",
        name: "Human requested",
        turns: ["I would like to speak with a human."],
        expectedState: "review",
        responseIncludes: "",
      },
    ],
  },
  {
    ...base,
    id: "example-onboarding",
    name: "Product onboarding",
    description:
      "Guide someone from their first question to a completed setup.",
    instructions:
      "Help someone set up a new product. Move forward only after they confirm the prerequisite step. Keep the workflow in order.",
    initial: "welcome",
    states: [
      starter(
        "welcome",
        "Welcome",
        "Ask whether the person is ready to begin.",
        "Welcome! Ready to set up your workspace?",
        ["setup"],
      ),
      starter(
        "setup",
        "Set up workspace",
        "The user says they want to get started or begin setup.",
        "First, create your workspace. Let me know when that’s done.",
        ["invite"],
        ["start", "ready", "begin", "yes"],
      ),
      starter(
        "invite",
        "Invite teammates",
        "The user confirms their workspace is created.",
        "Great. Invite a teammate, then tell me when the invitation is sent.",
        ["done"],
        ["created", "workspace is done", "finished"],
      ),
      starter(
        "done",
        "All set",
        "The user confirms their teammate invitation was sent.",
        "You’re all set. Your workspace is ready to explore.",
        [],
        ["invited", "invitation sent", "sent"],
        true,
      ),
    ],
    cases: [
      {
        id: "onboard",
        name: "Complete onboarding",
        turns: ["I am ready to start", "Workspace created", "Invitation sent"],
        expectedState: "done",
        responseIncludes: "all set",
      },
    ],
  },
  {
    ...base,
    id: "example-intake",
    name: "Lead qualification",
    description:
      "Collect intent and send qualified prospects to the right next step.",
    instructions:
      "Qualify interest without inventing details. A request for a demo goes to booking, a request for pricing goes to pricing, and an explicit decision to stop closes the conversation.",
    initial: "discover",
    states: [
      starter(
        "discover",
        "Discover needs",
        "Learn what the person is looking for.",
        "What are you hoping to build?",
        ["pricing", "booking", "closed"],
      ),
      starter(
        "pricing",
        "Discuss pricing",
        "The user asks about pricing, costs, plans, or budgets.",
        "What team size and usage do you have in mind?",
        ["booking", "closed"],
        ["price", "pricing", "cost", "budget"],
      ),
      starter(
        "booking",
        "Demo requested",
        "The user explicitly wants a demo or meeting.",
        "I can help prepare a demo request. What would you like the demo to focus on?",
        [],
        ["demo", "meeting", "schedule"],
        true,
      ),
      starter(
        "closed",
        "Closed",
        "The user says they are not interested or wants to stop.",
        "No problem. You can pick this up any time.",
        [],
        ["not interested", "stop", "no thanks"],
        true,
      ),
    ],
    cases: [
      {
        id: "demo",
        name: "Pricing → demo",
        turns: ["What does pricing look like?", "I would like a demo"],
        expectedState: "booking",
        responseIncludes: "",
      },
    ],
  },
];
export function blankProject(): Project {
  return {
    ...structuredClone(base),
    id: crypto.randomUUID(),
    name: "Untitled project",
    description: "",
    instructions:
      "Decide when to move to the next state using the conversation and each state’s description. Stay in the current state when more information is needed.",
    initial: "start",
    createdAt: new Date().toISOString(),
    states: [
      starter(
        "start",
        "Start",
        "Understand what the user needs.",
        "How can I help?",
        ["complete"],
      ),
      starter(
        "complete",
        "Complete",
        "The user explicitly says they are finished.",
        "All done. Thanks!",
        [],
        ["done", "finished", "complete"],
        true,
      ),
    ],
    cases: [],
  };
}
export function copyTemplate(template: Project, name?: string): Project {
  return {
    ...structuredClone(template),
    id: crypto.randomUUID(),
    name: name || template.name,
    createdAt: new Date().toISOString(),
  };
}
