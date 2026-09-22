import { strToU8, zipSync } from "fflate";
import {
  integrationPrompt,
  integrationSkill,
  integrationSkillPath,
} from "./integration-skill.js";
import {
  evaluationSignature,
  projectSchema,
  type Project,
  type EvalReport,
} from "./studio.js";

export function evaluationEvidence(
  project: Project,
  reports: EvalReport[],
  mode: "mock" | "live",
) {
  const report = reports
    .filter((r) => r.projectId === project.id && r.mode === mode)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!project.cases.length)
    return {
      status: "no-cases",
      label: "No regression tests yet",
      report,
    } as const;
  if (!report)
    return {
      status: "not-run",
      label:
        mode === "live" ? "Live behavior not tested" : "Simulation not run",
      report,
    } as const;
  if (report.configSignature !== evaluationSignature(project))
    return {
      status: "stale",
      label: "Workflow changed — rerun tests",
      report,
    } as const;
  const complete =
    report.results.length === project.cases.length &&
    project.cases.every(
      (c) => report.results.filter((r) => r.caseId === c.id).length === 1,
    );
  if (!complete)
    return {
      status: "incomplete",
      label: "Test run incomplete",
      report,
    } as const;
  const failed = report.results.filter((r) => !r.passed || r.error).length;
  if (failed)
    return {
      status: "failed",
      label: `${failed} of ${project.cases.length} checks need attention`,
      report,
    } as const;
  return {
    status: "passed",
    label: `${project.cases.length}/${project.cases.length} ${mode === "live" ? "live" : "simulation"} checks passed`,
    report,
  } as const;
}

export interface RuntimeSources {
  conversation: string;
  connectors: string;
  schema: string;
  studio: string;
  license: string;
}
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

export const integrationExample = `import { startConversation, sendMessage } from "./workflow.js";

// Run this on your server. Simulation is the default and needs no keys.
// For live decisions, set TYPESAFE_API_KEY and choose { mode: "live" }.
let session = startConversation({ mode: "mock" });

// Replace this text with a message from your application's user.
const { session: updated, decision } = await sendMessage(session, "I was charged twice");
session = updated;

console.log(decision.to, decision.reply);
console.log(decision.confidence, decision.probabilities);
// Save session in your server's per-user conversation store.
// Call sendMessage(session, nextMessage) for subsequent turns.
// Serialize requests per conversation; do not share one session across users.
`;

const workflowModule = `import { readFileSync } from "node:fs";
import { projectSchema, turnRequestSchema, type ChatMessage } from "./lib/studio.js";
import { executeTurn, type Connectors } from "./lib/conversation.js";
import { createConnectorClients } from "./lib/connectors.js";

export const project = projectSchema.parse(JSON.parse(readFileSync(new URL("./workflow.json", import.meta.url), "utf8")));
export interface Session { state: string; messages: ChatMessage[]; mode: "mock" | "live"; }

export function startConversation(options: { mode?: "mock" | "live" } = {}): Session {
  return { state: project.initial, messages: [], mode: options.mode ?? "mock" };
}

export function connectorsFor(mode: "mock" | "live"): Connectors {
  if (mode === "mock") return {};
  if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error("Set TYPESAFE_API_KEY on your server for live decisions.");
  if (project.agent.enabled && !process.env.OPENAI_API_KEY?.trim()) throw new Error("Set OPENAI_API_KEY or disable generated replies in workflow.json.");
  return createConnectorClients({ jev: process.env.TYPESAFE_API_KEY, openai: process.env.OPENAI_API_KEY });
}

export async function sendMessage(session: Session, message: string, options: { signal?: AbortSignal; connectors?: Connectors } = {}) {
  // Validate the same input contract used by the studio. Caller owns persistence.
  const request = turnRequestSchema.parse({ project, currentState: session.state, messages: [...session.messages, { role: "user", content: message }], mode: session.mode });
  const signal = AbortSignal.any([AbortSignal.timeout(50_000), ...(options.signal ? [options.signal] : [])]);
  const decision = await executeTurn(request, options.connectors ?? connectorsFor(request.mode), signal);
  const updated: Session = { state: decision.to, mode: request.mode, messages: [...request.messages, { role: "assistant", content: decision.reply }] };
  return { session: updated, decision };
}
`;

const evaluationRunner = `import { parseArgs } from "node:util";
import { project, connectorsFor } from "./workflow.js";
import { evaluateCase } from "./lib/conversation.js";

try {
  const { values } = parseArgs({ options: { live: { type: "boolean", default: false } } });
  const mode = values.live ? "live" : "mock";
  if (!project.cases.length) throw new Error("Add at least one regression test in the studio, then download again.");
  const connectors = connectorsFor(mode);
  const results = [];
  for (const test of project.cases) {
    try { results.push(await evaluateCase(project, test, mode, connectors, AbortSignal.timeout(50_000))); }
    catch { results.push({ caseId: test.id, name: test.name, passed: false, error: "Case could not complete. Check credentials, model access, and terminal-state timing." }); }
  }
  const passed = results.filter(r => r.passed).length;
  const errors = results.filter(r => "error" in r).length;
  console.log(JSON.stringify({ mode, projectVersion: project.version, summary: { passed, total: project.cases.length, errors }, results }, null, 2));
  process.exitCode = errors ? 2 : passed === project.cases.length ? 0 : 1;
} catch {
  // Never print raw provider errors or keys.
  console.error("Cannot run tests. Check workflow.json, server keys, and command options. Live tests incur provider usage.");
  process.exitCode = 2;
}
`;

/** No keys or conversation history are accepted by this export API. */
export function buildHandoff(
  input: Project,
  reports: EvalReport[],
  sources: RuntimeSources,
) {
  const project = projectSchema.parse(input);
  const live = evaluationEvidence(project, reports, "live");
  const simulation = evaluationEvidence(project, reports, "mock");
  const evidence = {
    workflowVersion: project.version,
    live: {
      status: live.status,
      label: live.label,
      testedAt: live.report?.createdAt ?? null,
    },
    simulation: {
      status: simulation.status,
      label: simulation.label,
      testedAt: simulation.report?.createdAt ?? null,
    },
    note: "Passing cases are evidence for this dataset, not a guarantee of model correctness. Simulation uses keyword fixtures, not Jev.",
  };
  const files: Record<string, string> = {
    "workflow.json": json(project),
    "workflow.ts": workflowModule,
    [integrationSkillPath]: integrationSkill,
    "example.ts": integrationExample.replace(
      '"I was charged twice"',
      JSON.stringify(project.cases[0]?.turns[0] ?? "Hello"),
    ),
    "evaluate.ts": evaluationRunner,
    "lib/conversation.ts": sources.conversation,
    "lib/connectors.ts": sources.connectors,
    "lib/schema.ts": sources.schema,
    "lib/studio.ts": sources.studio,
    "validation.json": json(evidence),
    LICENSE: sources.license,
    ".gitignore": "node_modules/\n.env\n.env.local\nreport.json\n",
    ".github/workflows/check.yml": `name: Workflow regression checks
on: [push, pull_request]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npm run typecheck
      - run: npm test
# Simulation only. Live checks require your deliberate setup and provider usage.
`,
    ".env.example":
      "# Server environment only. Never commit real keys.\nTYPESAFE_API_KEY=\nOPENAI_API_KEY=\n",
    "package.json": json({
      name: "my-jev-workflow",
      version: "1.0.0",
      private: true,
      type: "module",
      engines: { node: ">=22" },
      scripts: {
        start: "node --env-file-if-exists=.env --import tsx example.ts",
        test: "node --env-file-if-exists=.env --import tsx evaluate.ts",
        "test:live":
          "node --env-file-if-exists=.env --import tsx evaluate.ts --live",
        typecheck: "tsc --noEmit",
      },
      dependencies: {
        "@typesafe-ai/sdk": "0.6.0",
        openai: "7.20.0",
        xstate: "5.33.2",
        zod: "4.6.5",
        tsx: "4.23.13",
      },
      devDependencies: { "@types/node": "22.20.4", typescript: "7.0.2" },
    }),
    "tsconfig.json": json({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["*.ts", "lib/*.ts"],
    }),
    "README.md": `# Your Jev workflow\n\nExported from Jev State, workflow version ${project.version}. Requires Node.js 22+.\n\n## Run it\n\nUnzip, open a terminal in this directory, then:\n\n\`\`\`sh\nnpm install\nnpm run typecheck\nnpm test\nnpm start\n\`\`\`\n\nThese commands use simulation and make no provider calls. Simulation matches keywords to test wiring; it does not measure Jev's decisions. Tests exit 0 when all pass, 1 for failed expectations, and 2 for configuration or execution errors. Empty suites return 2.\n\n## Use live Jev\n\nCopy .env.example to .env and set your own TYPESAFE_API_KEY. Add OPENAI_API_KEY only when generated replies are enabled in workflow.json. Run \`npm run test:live\` deliberately: it incurs provider usage. Change example.ts to \`startConversation({ mode: "live" })\` for live conversations. Never expose these server keys in browser bundles. No Jev State hosting or account is required by this code.\n\n## Integrate with a coding agent\n\nThis project includes [an integration skill](${integrationSkillPath}) for wiring the workflow into your app. Open this export alongside the target application, then give your coding agent this prompt (include the export folder path if it is outside the app):\n\n> ${integrationPrompt}\n\nThe skill guides the agent through the bundled runtime, server credentials, conversation storage, and verification. It reads workflow.json and validation.json so it uses this export rather than a generic example. You can also point an agent directly at the SKILL.md file without installing it globally. Keep the skill with the export so its relative file links resolve.\n\n## Integrate into your app\n\nKeep workflow.ts, workflow.json, and lib/ together in your server project and install the dependencies in package.json. Copy the example.ts call into your server handler. \`sendMessage\` returns an updated session and a decision containing the next state, reply, confidence, probabilities, and input/questions. Store the session per user on your server and serialize requests for each conversation. It does not mutate the input session. Do not trust state or history submitted by an unauthenticated client; add your own authentication, persistence, limits, and action authorization. Terminal states reject further messages. Histories are limited to 40 alternating messages.\n\nThe exported lib/ contains the same execution engine used by the studio: allowed XState transitions, confidence threshold, full history, response validation, and optional OpenAI replies. No tools or business actions are executed. Wire those into your app with explicit authorization. Credentials and studio conversation history are excluded. Your saved test messages and expected outcomes ARE included in workflow.json; review them before sharing.\n\n## Validation at export\n\n- ${simulation.label}\n- ${live.label}\n\nSee validation.json for timestamps and status. Passing tests only describe this dataset. Tests can assert intermediate states with expectedPath as well as the final state. Edit criteria, add representative cases, rerun live tests, and inspect failures before relying on a change. Open workflow.json with Import in the studio to edit the workflow again. CLI reports can contain private transcripts.\n\n## Files\n\n- workflow.json: your states, criteria, replies, model settings, and regression cases\n- workflow.ts: the small server-side integration API\n- ${integrationSkillPath}: coding-agent instructions for integrating this export\n- example.ts: copyable conversation example\n- evaluate.ts: regression runner for local use and CI\n- .github/workflows/check.yml: simulation regression checks on push and pull request\n- lib/: portable runtime and schemas; no unpublished packages\n- validation.json: summary of studio checks for this export\n\nGenerated by [Jev State](https://github.com/priyankark/jev-state), MIT licensed. Provider usage is billed by TypeSafe/OpenAI.\n`,
  };
  return { files, evidence };
}

export function handoffZip(files: Record<string, string>) {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
    ),
    { level: 6 },
  );
}
