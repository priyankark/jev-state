import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import {
  projectSchema,
  evaluationSignature,
  type EvalReport,
} from "../packages/core/src/studio.js";
import {
  diagnoseProject,
  evaluationCoverage,
} from "../packages/core/src/diagnostics.js";
import { evaluateCase, serverConnectors } from "../server/conversation.js";

// stdout is always JSON so CI can consume reports without parsing terminal output.
try {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      mode: { type: "string", default: "mock" },
      out: { type: "string" },
      validate: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "Usage: npm run evaluate -- --project <project.json> [--mode mock|live] [--out report.json] [--validate]\nExit codes: 0 passed; 1 failed cases; 2 invalid input or provider error. Live mode uses your server credentials and incurs provider usage.",
    );
  } else {
    if (!values.project) throw new Error("Provide --project <project.json>.");
    if (values.mode !== "mock" && values.mode !== "live")
      throw new Error("Mode must be mock or live.");
    const text = await readFile(values.project, "utf8");
    if (Buffer.byteLength(text) > 500_000)
      throw new Error("Project files must be smaller than 500 KB.");
    const raw = JSON.parse(text);
    const parsed = projectSchema.safeParse(raw.project ?? raw);
    if (!parsed.success)
      throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
    const project = parsed.data;
    const diagnostics = diagnoseProject(project);
    let output: unknown;
    if (values.validate) {
      output = { valid: true, project: project.name, diagnostics };
    } else {
      if (!project.cases.length)
        throw new Error(
          "Add at least one evaluation case before running a suite.",
        );
      const connectors = serverConnectors();
      const controller = new AbortController();
      const interrupt = () => controller.abort();
      process.once("SIGINT", interrupt);
      const report: EvalReport = {
        id: randomUUID(),
        projectId: project.id,
        projectVersion: project.version,
        createdAt: new Date().toISOString(),
        mode: values.mode,
        configSignature: evaluationSignature(project),
        results: [],
      };
      try {
        for (const test of project.cases) {
          controller.signal.throwIfAborted();
          try {
            report.results.push(
              await evaluateCase(
                project,
                test,
                values.mode,
                connectors,
                AbortSignal.any([
                  controller.signal,
                  AbortSignal.timeout(50_000),
                ]),
              ),
            );
          } catch {
            report.results.push({
              caseId: test.id,
              name: test.name,
              expected: test.expectedState,
              actual: "error",
              passed: false,
              responsePassed: false,
              elapsedMs: 0,
              inputTokens: 0,
              outputTokens: 0,
              turns: [],
              error: controller.signal.aborted
                ? "Evaluation interrupted."
                : "Case could not complete. Check provider configuration and terminal-state timing.",
            });
            if (controller.signal.aborted) break;
          }
        }
      } finally {
        process.removeListener("SIGINT", interrupt);
      }
      const passed = report.results.filter((r) => r.passed).length;
      const errors = report.results.filter((r) => r.error).length;
      output = {
        schemaVersion: 1,
        ...report,
        diagnostics,
        summary: {
          passed,
          failed: report.results.length - passed,
          errors,
          total: project.cases.length,
          inputTokens: report.results.reduce((n, r) => n + r.inputTokens, 0),
          outputTokens: report.results.reduce((n, r) => n + r.outputTokens, 0),
        },
        coverage: evaluationCoverage(project, report.results),
      };
      process.exitCode = errors ? 2 : passed === project.cases.length ? 0 : 1;
    }
    const json = JSON.stringify(output, null, 2) + "\n";
    if (values.out) await writeFile(values.out, json, { mode: 0o600 });
    process.stdout.write(json);
  }
} catch (error) {
  // Never serialize provider errors, which may include request data or credentials.
  const message =
    error instanceof SyntaxError
      ? "Invalid JSON or command-line options."
      : error instanceof Error && !("status" in error)
        ? error.message
        : "Evaluation could not complete.";
  console.error(JSON.stringify({ error: message }));
  process.exitCode = 2;
}
