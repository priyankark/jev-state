import { test } from "node:test";
import assert from "node:assert/strict";
import {
  templates,
  projectSchema,
  evalCaseSchema,
  evaluationSignature,
  type Project,
  type EvalReport,
} from "../packages/core/src/studio.js";
import { evaluateCase } from "../packages/core/src/conversation.js";
import { compareReports } from "../packages/core/src/regressions.js";
import { workspaceSchema } from "../packages/core/src/workspace.js";

test("intermediate mistakes fail even when final state and reply pass; old cases keep their behavior", async () => {
  const project = structuredClone(templates[0]!);
  const original = project.cases[0]!;
  const checked = { ...original, expectedPath: ["technical", "resolved"] };
  const result = await evaluateCase(
    project,
    checked,
    "mock",
    {},
    AbortSignal.timeout(1000),
  );
  assert.equal(result.actual, "resolved");
  assert.equal(result.responsePassed, true);
  assert.equal(result.passed, false);
  assert.equal(result.pathPassed, false);
  assert.match(
    result.failureReasons!.join(" "),
    /Turn 1: expected technical; reached billing/,
  );
  const correct = await evaluateCase(
    project,
    { ...original, expectedPath: ["billing", "resolved"] },
    "mock",
    {},
    AbortSignal.timeout(1000),
  );
  assert.equal(correct.passed, true);
  const partial = await evaluateCase(
    project,
    { ...original, expectedPath: [null, "resolved"] },
    "mock",
    {},
    AbortSignal.timeout(1000),
  );
  assert.equal(partial.passed, true);
  assert.equal(
    (
      await evaluateCase(
        project,
        original,
        "mock",
        {},
        AbortSignal.timeout(1000),
      )
    ).passed,
    true,
  );
  const report: EvalReport = {
    id: "r",
    projectId: project.id,
    projectVersion: 1,
    createdAt: "2026-09-20",
    mode: "mock",
    configSignature: evaluationSignature(project),
    results: [result],
  };
  const restored = workspaceSchema.parse({
    projects: [project],
    conversations: [],
    reports: [report],
  });
  assert.deepEqual(
    restored.reports[0]!.results[0]!.expectedPath,
    checked.expectedPath,
  );
  assert.equal(restored.reports[0]!.results[0]!.pathPassed, false);
});

test("path assertions validate length, final agreement, and existing state references", () => {
  const project = structuredClone(templates[0]!);
  const sample = project.cases[0]!;
  assert.equal(
    evalCaseSchema.safeParse({ ...sample, expectedPath: ["billing"] }).success,
    false,
  );
  assert.equal(
    evalCaseSchema.safeParse({
      ...sample,
      expectedPath: ["billing", "technical"],
    }).success,
    false,
  );
  project.cases[0] = { ...sample, expectedPath: ["unknown", "resolved"] };
  assert.equal(projectSchema.safeParse(project).success, false);
  project.cases[0] = { ...sample, expectedPath: [null, "resolved"] };
  assert.equal(projectSchema.safeParse(project).success, true);
});

test("early terminal states keep the trace and never silently ignore remaining test messages", async () => {
  const project = structuredClone(templates[0]!);
  const test = {
    ...project.cases[0]!,
    turns: ["human please", "more context"],
    expectedState: "review",
    responseIncludes: "human",
  };
  const result = await evaluateCase(
    project,
    test,
    "mock",
    {},
    AbortSignal.timeout(1000),
  );
  assert.equal(result.passed, false);
  assert.equal(result.actual, "review");
  assert.equal(result.turns.length, 1);
  assert.match(result.failureReasons!.join(" "), /before all 2 test messages/);
  const terminalStart = { ...project, initial: "review" };
  const noTurns = await evaluateCase(
    terminalStart,
    test,
    "mock",
    {},
    AbortSignal.timeout(1000),
  );
  assert.equal(noTurns.passed, false);
  assert.equal(noTurns.turns.length, 0);
  assert.equal(noTurns.responsePassed, false);
});

test("run comparisons isolate modes and changed expectations, and detect actual regressions and fixes", async () => {
  const project = structuredClone(templates[0]!);
  async function report(p: Project, minute: number): Promise<EvalReport> {
    return {
      id: `report-${minute}`,
      projectId: p.id,
      projectVersion: p.version,
      createdAt: `2026-09-20T10:0${minute}:00.000Z`,
      mode: "mock",
      configSignature: evaluationSignature(p),
      results: await Promise.all(
        p.cases.map((c) =>
          evaluateCase(p, c, "mock", {}, AbortSignal.timeout(1000)),
        ),
      ),
    };
  }
  const baseline = await report(project, 0);
  project.states.find((s) => s.id === "billing")!.keywords = [
    "special billing phrase",
  ];
  project.version++;
  const broken = await report(project, 1);
  const regression = compareReports(broken, [baseline]);
  assert.equal(regression.regressed, 1);
  assert.equal(regression.comparable, 3);
  assert.equal(regression.changes[project.cases[0]!.id], "regressed");
  const changed = structuredClone(project);
  changed.cases[0]!.expectedState = "welcome";
  changed.cases[0]!.responseIncludes = "";
  const changedReport = await report(changed, 2);
  assert.equal(
    compareReports(changedReport, [broken]).changes[project.cases[0]!.id],
    "changed-test",
  );
  assert.equal(compareReports(changedReport, [broken]).fixed, 0);
  const fixed = await report(templates[0]!, 3);
  assert.equal(compareReports(fixed, [baseline, broken]).fixed, 1);
  assert.equal(
    compareReports({ ...broken, mode: "live" }, [baseline]).previous,
    undefined,
  );
  const providerError = {
    ...broken,
    results: broken.results.map((r) => ({
      ...r,
      passed: false,
      error: "Provider unavailable",
    })),
  };
  assert.equal(compareReports(providerError, [baseline]).regressed, 0);
  assert.equal(compareReports(providerError, [baseline]).comparable, 0);
  assert.equal(compareReports(fixed, [providerError]).fixed, 0);
  const partial = { ...broken, results: broken.results.slice(1) };
  assert.equal(
    compareReports(partial, [baseline]).changes[project.cases[0]!.id],
    "not-run",
  );
  assert.equal(
    compareReports(fixed, [partial]).changes[project.cases[0]!.id],
    "unknown",
  );
  assert.equal(
    compareReports(broken, [{ ...baseline, configSignature: "bad data" }])
      .comparable,
    0,
  );
});
