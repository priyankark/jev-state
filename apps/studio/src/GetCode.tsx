import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Code2,
  Copy,
  Download,
  FileCode2,
} from "lucide-react";
import {
  buildHandoff,
  evaluationEvidence,
  handoffZip,
} from "../../../packages/core/src/handoff.js";
import {
  integrationPrompt,
  integrationSkillPath,
} from "../../../packages/core/src/integration-skill.js";
import type { Project, EvalReport } from "../../../packages/core/src/studio.js";
import conversation from "../../../packages/core/src/conversation.ts?raw";
import connectors from "../../../packages/core/src/connectors.ts?raw";
import schema from "../../../packages/core/src/schema.ts?raw";
import studio from "../../../packages/core/src/studio-schema.ts?raw";
import license from "../../../LICENSE?raw";

export function GetCode({
  project,
  reports,
  onEvaluate,
}: {
  project: Project;
  reports: EvalReport[];
  onEvaluate: () => void;
}) {
  const { files } = useMemo(
    () =>
      buildHandoff(project, reports, {
        conversation,
        connectors,
        schema,
        studio,
        license,
      }),
    [project, reports],
  );
  const [selected, setSelected] = useState("example.ts");
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [error, setError] = useState("");
  const live = evaluationEvidence(project, reports, "live");
  const simulation = evaluationEvidence(project, reports, "mock");
  return (
    <section className="p-handoff" aria-label="Code handoff">
      <div className="p-handoff-intro">
        <div>
          <span className="p-kicker">4 · USE IT IN YOUR APP</span>
          <h2>Your decisions. Runnable code.</h2>
          <p>
            Download your workflow, regression tests, and an integration skill
            for your coding agent. Run the TypeScript project locally, then
            connect it to your app.
          </p>
        </div>
        <button
          className="p-button p-primary"
          onClick={() => {
            try {
              const data = handoffZip(files);
              const url = URL.createObjectURL(
                new Blob([new Uint8Array(data)], { type: "application/zip" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "jev-workflow.zip";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch {
              setError("Could not create the download. Try again.");
            }
          }}
        >
          <Download size={16} /> Download runnable project
        </button>
      </div>
      <div className="p-evidence" aria-label="Validation status">
        <div>
          <strong>What has been checked?</strong>
          <span>
            Workflow v{project.version} · {project.cases.length} regression
            cases
          </span>
        </div>
        <span
          className={`p-badge ${live.status === "passed" ? "p-green" : ""}`}
        >
          {live.label}
        </span>
        <span
          className={`p-badge ${simulation.status === "passed" ? "p-green" : ""}`}
        >
          {simulation.label}
        </span>
        <button className="p-text-button" onClick={onEvaluate}>
          Review tests <ArrowRight size={14} />
        </button>
        <p>
          {live.status === "passed"
            ? "Live checks passed for this dataset. Review coverage and edge cases before using the workflow with real users."
            : "You can export now. Simulation checks the wiring; run Live Jev evaluations to measure your model’s behavior before relying on it."}
        </p>
      </div>
      <div className="p-handoff-steps">
        <article>
          <span>1</span>
          <h3>Run with live Jev</h3>
          <p>
            Unzip it, open a terminal in that folder, and use Node.js 22 or
            newer.
          </p>
          <pre>npm install{"\n"}npm run typecheck</pre>
          <p>
            Copy <code>.env.example</code> to <code>.env</code> and add your Jev
            key on your server. Then run <code>npm run test:live</code>.
          </p>
          <p>
            Choose <code>{'{ mode: "live" }'}</code> in the example to use Jev.{" "}
            {project.agent.enabled
              ? "This workflow also needs OPENAI_API_KEY for generated replies."
              : "This workflow uses the replies you wrote; OpenAI is optional."}
          </p>
          <small>
            Live requests are billed to your provider account. Browser keys are
            never exported.
          </small>
        </article>
        <article>
          <span>2</span>
          <h3>Optional: check the wiring</h3>
          <p>
            Use keyword simulation to check the exported workflow without
            provider keys. It does not measure Jev’s decisions.
          </p>
          <pre>npm test{"\n"}npm start</pre>
          <small>
            The unmodified example and these tests use simulation. Live model
            checks use <code>npm run test:live</code>.
          </small>
        </article>
        <article>
          <span>3</span>
          <h3>Use it in your app</h3>
          <p>
            Keep <code>workflow.ts</code>, <code>workflow.json</code>, and{" "}
            <code>lib/</code> together in your server project. Install the
            dependencies from <code>package.json</code>.
          </p>
          <p>
            Copy the example below. Save the returned session per user and pass
            it into the next turn.
          </p>
          <p>
            Working with a coding agent? The download includes a{" "}
            <code>SKILL.md</code> that guides it through integrating this
            workflow with your app. Open the unzipped project alongside your app
            and give your agent this prompt.
          </p>
          <button
            className="p-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(integrationPrompt);
                setPromptCopied(true);
                setError("");
              } catch {
                setError(
                  "Could not copy the agent prompt. Preview the integration skill and give your agent its path in the downloaded project.",
                );
              }
            }}
          >
            {promptCopied ? <Check size={14} /> : <Copy size={14} />}
            {promptCopied ? "Agent prompt copied" : "Copy agent prompt"}
          </button>
          <button
            className="p-text-button"
            onClick={() => {
              setSelected(integrationSkillPath);
              setCopied(false);
            }}
          >
            Preview integration skill
          </button>
          <small>You own the code. It makes no requests to Jev State.</small>
        </article>
      </div>
      {error && (
        <p role="alert" className="p-inline-error">
          {error}
        </p>
      )}
      <div className="p-code-browser">
        <div className="p-code-toolbar">
          <label>
            <FileCode2 size={16} /> Preview file
            <select
              aria-label="Preview exported file"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setCopied(false);
              }}
            >
              {Object.keys(files).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <button
            className="p-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(files[selected]!);
                setCopied(true);
                setError("");
              } catch {
                setError(
                  "Clipboard access was blocked. Select the code below to copy, or download the project.",
                );
              }
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy file"}
          </button>
        </div>
        {selected === "example.ts" && (
          <p className="p-code-context">
            <Code2 size={15} /> This example imports the workflow.ts file
            included in the download. Run it on your server.
          </p>
        )}
        <pre tabIndex={0} aria-label={`Source of ${selected}`}>
          <code>{files[selected]}</code>
        </pre>
      </div>
      <p className="p-eval-note">
        The download includes your saved test messages and expected outcomes;
        review them before sharing. Credentials and conversation history are
        excluded. The runtime uses the same Jev, XState, and optional OpenAI
        execution code as this studio. Add your app’s authentication,
        persistence, and authorization for real actions.
      </p>
    </section>
  );
}
