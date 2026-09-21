import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { unzipSync, strFromU8 } from "fflate";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  buildHandoff,
  handoffZip,
  evaluationEvidence,
  type RuntimeSources,
} from "../packages/core/src/handoff.js";
import {
  templates,
  evaluationSignature,
  type EvalReport,
} from "../packages/core/src/studio.js";
import {
  executeTurn,
  evaluateCase,
} from "../packages/core/src/conversation.js";

async function sources(): Promise<RuntimeSources> {
  const read = (path: string) =>
    readFile(new URL(path, import.meta.url), "utf8");
  return {
    conversation: await read("../packages/core/src/conversation.ts"),
    connectors: await read("../packages/core/src/connectors.ts"),
    schema: await read("../packages/core/src/schema.ts"),
    studio: await read("../packages/core/src/studio-schema.ts"),
    license: await read("../LICENSE"),
  };
}

test("handoff compiles outside the repo, runs cases, and uses the same decisions as the studio", async () => {
  const project = structuredClone(templates[0]!);
  project.name = "Workflow with `quotes`, ${expressions}, and हिंदी";
  const { files } = buildHandoff(project, [], await sources());
  const extracted = unzipSync(handoffZip(files));
  assert.deepEqual(JSON.parse(strFromU8(extracted["workflow.json"]!)), project);
  assert.ok(!files["lib/studio.ts"]!.includes("example-support"));
  assert.equal(JSON.parse(files["validation.json"]!).live.status, "not-run");
  const manifest = JSON.parse(files["package.json"]!);
  const rootManifest = JSON.parse(await readFile("package.json", "utf8"));
  for (const [name, version] of Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  }))
    assert.equal(
      version,
      rootManifest.dependencies[name] ?? rootManifest.devDependencies[name],
    );
  const dir = await mkdtemp(join(tmpdir(), "jev-handoff-"));
  try {
    for (const [path, bytes] of Object.entries(extracted)) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), bytes);
    }
    // Resolve only installed public dependencies; no repository source imports.
    await symlink(resolve("node_modules"), join(dir, "node_modules"), "dir");
    const run = (args: string[]) =>
      spawnSync(process.execPath, args, {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, TYPESAFE_API_KEY: "", OPENAI_API_KEY: "" },
      });
    const checked = run([
      resolve("node_modules/typescript/bin/tsc"),
      "--noEmit",
    ]);
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    const example = run(["--import", "tsx", "example.ts"]);
    assert.equal(example.status, 0, example.stderr);
    assert.match(example.stdout, /billing/);
    const passed = run(["--import", "tsx", "evaluate.ts"]);
    assert.equal(passed.status, 0, passed.stderr);
    assert.deepEqual(JSON.parse(passed.stdout).summary, {
      passed: 3,
      total: 3,
      errors: 0,
    });
    assert.equal(run(["--import", "tsx", "evaluate.ts", "--live"]).status, 2);

    const generated = await import(
      pathToFileURL(join(dir, "workflow.ts")).href
    );
    let session = generated.startConversation();
    for (const message of ["charged twice", "fixed now"]) {
      const before = structuredClone(session);
      const expected = await executeTurn(
        {
          project,
          currentState: session.state,
          messages: [...session.messages, { role: "user", content: message }],
          mode: "mock",
        },
        {},
        AbortSignal.timeout(1000),
      );
      const result = await generated.sendMessage(session, message);
      for (const field of [
        "from",
        "to",
        "reply",
        "confidence",
        "probabilities",
        "questions",
        "input",
        "model",
        "mode",
      ] as const)
        assert.deepEqual(result.decision[field], expected[field]);
      assert.deepEqual(session, before);
      session = result.session;
    }
    await assert.rejects(
      () => generated.sendMessage(session, "hello"),
      /ended/,
    );
    const jev = new TypeSafeClient({
      apiKey: "test-only",
      fetch: async () =>
        new Response(
          JSON.stringify({
            model: "test-jev",
            answers: {
              next_state: {
                type: "choice",
                choice: "billing",
                confidence: 0.98,
                probabilities: { billing: 1, technical: 0, review: 0, stay: 0 },
              },
            },
            usage: { input_tokens: 2, output_tokens: 1 },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    const live = await generated.sendMessage(
      generated.startConversation({ mode: "live" }),
      "duplicate charge",
      { connectors: { jev } },
    );
    assert.equal(live.decision.to, "billing");
    assert.equal(live.decision.model, "test-jev");
    project.cases[0]!.expectedState = "technical";
    await writeFile(join(dir, "workflow.json"), JSON.stringify(project));
    const failed = run(["--import", "tsx", "evaluate.ts"]);
    assert.equal(failed.status, 1);
    project.cases = [];
    await writeFile(join(dir, "workflow.json"), JSON.stringify(project));
    assert.equal(run(["--import", "tsx", "evaluate.ts"]).status, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("export evidence distinguishes simulation, live checks, stale behavior, and partial runs", async () => {
  const project = structuredClone(templates[0]!);
  const report: EvalReport = {
    id: "report",
    projectId: project.id,
    projectVersion: project.version,
    mode: "mock",
    createdAt: "2026-09-20T10:00:00.000Z",
    configSignature: evaluationSignature(project),
    results: await Promise.all(
      project.cases.map((c) =>
        evaluateCase(project, c, "mock", {}, AbortSignal.timeout(1000)),
      ),
    ),
  };
  assert.equal(evaluationEvidence(project, [report], "mock").status, "passed");
  assert.equal(evaluationEvidence(project, [report], "live").status, "not-run");
  const live = { ...report, mode: "live" as const };
  assert.equal(evaluationEvidence(project, [live], "live").status, "passed");
  const changed = { ...project, instructions: "New routing criteria" };
  assert.equal(evaluationEvidence(changed, [live], "live").status, "stale");
  assert.equal(
    evaluationEvidence(
      project,
      [{ ...live, results: live.results.slice(0, 1) }],
      "live",
    ).status,
    "incomplete",
  );
  const failed = {
    ...live,
    createdAt: "2026-09-20T11:00:00.000Z",
    results: live.results.map((r) => ({ ...r, passed: false })),
  };
  assert.equal(
    evaluationEvidence(project, [live, failed], "live").status,
    "failed",
  );
  assert.equal(
    evaluationEvidence({ ...project, cases: [] }, [live], "live").status,
    "no-cases",
  );
  const bundle = buildHandoff(project, [failed], await sources());
  assert.equal(bundle.evidence.live.status, "failed");
  assert.ok(!bundle.files["validation.json"]!.includes("conversation"));
});
