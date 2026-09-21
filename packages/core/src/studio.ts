import type { Project, WorkflowState } from "./studio-schema.js";
export * from "./studio-schema.js";

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
