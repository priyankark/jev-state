import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { templates, projectSchema } from "../packages/core/src/studio.js";
import {
  diagnoseProject,
  evaluationCoverage,
} from "../packages/core/src/diagnostics.js";
import { workspaceSchema } from "../packages/core/src/workspace.js";
import { evaluateCase } from "../server/conversation.js";

test("diagnostics find disconnected cycles, reachable dead ends, and missing criteria", () => {
  const project = structuredClone(templates[0]!);
  project.states.find((s) => s.id === "welcome")!.transitions = ["billing"];
  project.states.find((s) => s.id === "billing")!.transitions = ["welcome"];
  const diagnostics = diagnoseProject(project);
  assert(
    diagnostics.some(
      (d) => d.code === "unreachable" && d.stateId === "resolved",
    ),
  );
  assert(
    diagnostics.some((d) => d.code === "no-exit" && d.stateId === "welcome"),
  );
  project.states[0]!.transitions = [];
  assert(diagnoseProject(project).some((d) => d.code === "dead-end"));
});

test("rejects duplicate cases and edges; backup validates full history", () => {
  const project = structuredClone(templates[0]!);
  project.states[0]!.transitions.push(project.states[0]!.transitions[0]!);
  assert.equal(projectSchema.safeParse(project).success, false);
  project.states[0]!.transitions.pop();
  project.cases.push(project.cases[0]!);
  assert.equal(projectSchema.safeParse(project).success, false);
  assert.equal(
    workspaceSchema.safeParse({
      projects: [templates[0]],
      conversations: [{ turns: null }],
      reports: [],
    }).success,
    false,
  );
  assert.equal(
    workspaceSchema.safeParse({
      projects: [templates[0]],
      conversations: [],
      reports: [],
    }).success,
    true,
  );
});

test("coverage counts actual edges and distinguishes stays from transitions", async () => {
  const project = templates[0]!;
  const results = await Promise.all(
    project.cases.map((c) =>
      evaluateCase(project, c, "mock", {}, new AbortController().signal),
    ),
  );
  const coverage = evaluationCoverage(project, results);
  assert(coverage.states.covered > 1);
  assert(coverage.transitions.covered > 0);
  assert(coverage.transitions.covered <= coverage.transitions.total);
  assert(!coverage.untestedTransitions.some((e) => e === "welcome->billing"));
});

test("CLI produces reports and meaningful pass, fail, invalid and empty-suite exit codes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jev-evals-"));
  const file = join(dir, "project.json");
  const out = join(dir, "report.json");
  const run = async (...args: string[]) => {
    try {
      const result = await promisify(execFile)(process.execPath, [
        "--import",
        "tsx",
        "scripts/evaluate.ts",
        "--project",
        file,
        ...args,
      ]);
      return { code: 0, ...result };
    } catch (error) {
      return error as { code: number; stdout: string; stderr: string };
    }
  };
  try {
    const project = structuredClone(templates[0]!);
    await writeFile(file, JSON.stringify({ project }));
    const passed = await run("--out", out);
    assert.equal(passed.code, 0);
    assert.equal(JSON.parse(passed.stdout).summary.passed, 3);
    assert.equal(JSON.parse(await readFile(out, "utf8")).mode, "mock");
    project.cases[0]!.expectedState = "technical";
    await writeFile(file, JSON.stringify(project));
    assert.equal((await run()).code, 1);
    assert.equal((await run("--mode", "typo")).code, 2);
    project.cases = [];
    await writeFile(file, JSON.stringify(project));
    assert.equal((await run()).code, 2);
    assert.equal((await run("--validate")).code, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
