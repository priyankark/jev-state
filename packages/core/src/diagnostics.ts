import type { Project, CaseResult } from "./studio.js";

export interface WorkflowDiagnostic {
  code: "unreachable" | "dead-end" | "no-exit" | "no-criteria" | "no-cases";
  stateId?: string;
  message: string;
}

/** Advisory checks: loops and deliberately long-lived workflows remain valid. */
export function diagnoseProject(project: Project): WorkflowDiagnostic[] {
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    project.states.find((s) => s.id === id)?.transitions.forEach(visit);
  };
  visit(project.initial);
  const canEnd = new Set(
    project.states.filter((s) => s.terminal).map((s) => s.id),
  );
  for (let i = 0; i < project.states.length; i++) {
    for (const state of project.states)
      if (state.transitions.some((id) => canEnd.has(id))) canEnd.add(state.id);
  }
  const diagnostics: WorkflowDiagnostic[] = [];
  for (const state of project.states) {
    const add = (code: WorkflowDiagnostic["code"], message: string) =>
      diagnostics.push({
        code,
        stateId: state.id,
        message: `${state.label}: ${message}`,
      });
    if (!reachable.has(state.id))
      add("unreachable", "cannot be reached from the initial state.");
    else if (!state.terminal && !state.transitions.length)
      add(
        "dead-end",
        "has no outgoing transitions. Add a transition or mark it as an end state.",
      );
    else if (!state.terminal && !canEnd.has(state.id))
      add(
        "no-exit",
        "has no path to an end state. This is fine for an ongoing conversation.",
      );
    if (state.id !== project.initial && !state.description.trim())
      add(
        "no-criteria",
        "needs transition criteria so Jev knows when to enter this state.",
      );
  }
  if (!project.cases.length)
    diagnostics.push({
      code: "no-cases",
      message: "Add evaluation cases to check expected conversation outcomes.",
    });
  return diagnostics;
}

export function evaluationCoverage(project: Project, results: CaseResult[]) {
  const visited = new Set([project.initial]);
  const taken = new Set<string>();
  for (const result of results)
    for (const turn of result.turns) {
      visited.add(turn.from);
      visited.add(turn.to);
      if (turn.from !== turn.to) taken.add(`${turn.from}->${turn.to}`);
    }
  const edges = project.states.flatMap((s) =>
    s.transitions.map((id) => `${s.id}->${id}`),
  );
  return {
    states: {
      covered: project.states.filter((s) => visited.has(s.id)).length,
      total: project.states.length,
    },
    transitions: {
      covered: edges.filter((e) => taken.has(e)).length,
      total: edges.length,
    },
    unvisitedStates: project.states
      .filter((s) => !visited.has(s.id))
      .map((s) => s.id),
    untestedTransitions: edges.filter((e) => !taken.has(e)),
  };
}
