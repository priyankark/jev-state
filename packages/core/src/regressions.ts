import { evalCaseSchema, type EvalCase, type EvalReport } from "./studio.js";

// Compare expectations, not their display names. A changed test is new evidence.
function signature(test: EvalCase) {
  return JSON.stringify({
    turns: test.turns,
    final: test.expectedState,
    reply: test.responseIncludes,
    path: test.expectedPath ?? null,
  });
}
function recordedCases(report: EvalReport): Map<string, EvalCase> {
  try {
    const cases: unknown = JSON.parse(report.configSignature).cases;
    if (!Array.isArray(cases)) return new Map();
    return new Map(
      cases.flatMap((raw) => {
        const parsed = evalCaseSchema.safeParse(raw);
        return parsed.success ? [[parsed.data.id, parsed.data] as const] : [];
      }),
    );
  } catch {
    return new Map();
  }
}

export type CaseChange =
  | "regressed"
  | "fixed"
  | "still-passing"
  | "still-failing"
  | "changed-test"
  | "new"
  | "not-run"
  | "unknown"
  | "error";
export const changeLabels: Record<CaseChange, string> = {
  regressed: "Regressed",
  fixed: "Fixed",
  "still-passing": "Still passing",
  "still-failing": "Still failing",
  "changed-test": "Test changed",
  new: "New case",
  "not-run": "Not rerun",
  unknown: "No comparable result",
  error: "Run error",
};

export function compareReports(current: EvalReport, history: EvalReport[]) {
  const previous = history
    .filter(
      (r) =>
        r.id !== current.id &&
        r.projectId === current.projectId &&
        r.mode === current.mode &&
        r.createdAt < current.createdAt,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const changes: Record<string, CaseChange> = {};
  if (!previous)
    return { previous, changes, regressed: 0, fixed: 0, comparable: 0 };
  const currentCases = recordedCases(current),
    oldCases = recordedCases(previous);
  for (const [id, test] of currentCases) {
    const now = current.results.find((r) => r.caseId === id);
    const before = previous.results.find((r) => r.caseId === id);
    const oldTest = oldCases.get(id);
    if (!now) changes[id] = "not-run";
    else if (now.error) changes[id] = "error";
    else if (!oldTest) changes[id] = oldCases.size ? "new" : "unknown";
    else if (signature(test) !== signature(oldTest))
      changes[id] = "changed-test";
    else if (!before || before.error) changes[id] = "unknown";
    else if (before.passed)
      changes[id] = now.passed ? "still-passing" : "regressed";
    else changes[id] = now.passed ? "fixed" : "still-failing";
  }
  const values = Object.values(changes);
  return {
    previous,
    changes,
    regressed: values.filter((v) => v === "regressed").length,
    fixed: values.filter((v) => v === "fixed").length,
    comparable: values.filter((v) =>
      ["regressed", "fixed", "still-passing", "still-failing"].includes(v),
    ).length,
  };
}
