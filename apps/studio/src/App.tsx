import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
  type Node,
  type Edge,
} from "@xyflow/react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleHelp,
  Code2,
  Download,
  FileJson,
  GitBranch,
  History,
  Layers3,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Upload,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import {
  traceSchema,
  type MachineManifest,
  type RunTrace,
  type RunInput,
  type TraceStep,
  type Answer,
} from "@jev-state/core";

type Config = { manifest: MachineManifest; liveAvailable: boolean };
const samples = [
  {
    name: "Billing issue",
    text: "I was charged twice for my subscription this month. Could you refund the extra charge?",
  },
  {
    name: "Technical issue",
    text: "The app crashes every time I try to log in. I need to finish my work today.",
  },
  {
    name: "Needs review",
    text: "Can you help me with something? I am not sure who to ask.",
  },
];
const labels: Record<string, string> = {
  idle: "Ready",
  evaluating: "Evaluating",
  billing: "Billing",
  technical: "Technical",
  review: "Human review",
  failed: "Failed",
  cancelled: "Cancelled",
};
const terminal = (t: RunTrace) =>
  !["idle", "evaluating"].includes(t.steps.at(-1)!.state);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const shortTime = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
function MachineNode({
  data,
  selected,
}: NodeProps<
  Node<{
    label: string;
    description: string;
    kind: string;
    active: boolean;
    visited: boolean;
  }>
>) {
  return (
    <div
      className={`machine-node ${data.kind} ${data.active ? "active" : ""} ${data.visited ? "visited" : ""} ${selected ? "selected" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-top">
        <span className="node-icon">
          {data.kind === "decision" ? (
            <Zap size={17} />
          ) : data.kind === "initial" ? (
            <Circle size={16} />
          ) : data.kind === "error" ? (
            <Square size={14} />
          ) : (
            <GitBranch size={16} />
          )}
        </span>
        <span className="node-kind">
          {data.kind === "decision"
            ? "JEV DECISION"
            : data.kind === "initial"
              ? "INITIAL STATE"
              : data.kind === "error"
                ? "INTERRUPT"
                : "OUTCOME"}
        </span>
        {data.active && <span className="active-dot" />}
      </div>
      <strong>{data.label}</strong>
      <span className="node-description">{data.description}</span>
      {data.active && (
        <div className="node-status">
          {data.kind === "decision" ? (
            <>
              <Loader2 size={12} className="spin" /> Evaluating
            </>
          ) : (
            <>
              <span /> Current state
            </>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { machine: MachineNode };
function JsonView({ value }: { value: unknown }) {
  return <pre className="json-view">{JSON.stringify(value, null, 2)}</pre>;
}
function QuestionAnswer({ id, answer }: { id: string; answer: Answer }) {
  return (
    <div className="answer-card">
      <div className="answer-title">
        <strong>{id}</strong>
        <span className={`primitive ${answer.type}`}>{answer.type}</span>
      </div>
      {answer.type === "choice" && (
        <>
          <div className="answer-value">
            {answer.choice}
            <span>{pct(answer.confidence)} confidence</span>
          </div>
          {Object.entries(answer.probabilities)
            .sort((a, b) => b[1] - a[1])
            .map(([name, value]) => (
              <div className="distribution" key={name}>
                <div>
                  <span>{name}</span>
                  <span>{pct(value)}</span>
                </div>
                <div className="bar-track">
                  <span style={{ width: pct(value) }} />
                </div>
              </div>
            ))}
        </>
      )}
      {answer.type === "noul" && (
        <>
          <div className="answer-value">
            {pct(answer.noul)}
            <span>probability of yes</span>
          </div>
          <div className="bar-track noul">
            <span style={{ width: pct(answer.noul) }} />
          </div>
          <p className="answer-note">
            A yes/no judgment, not a confidence score.
          </p>
        </>
      )}
      {answer.type === "score" && (
        <>
          <div className="answer-value">
            {answer.score.toFixed(2)}{" "}
            <span>
              of {Object.keys(answer.legend).length - 1} ·{" "}
              {pct(answer.confidence)} confidence
            </span>
          </div>
          <div className="score-labels">
            <span>Calm</span>
            <span>Very angry</span>
          </div>
          <div className="bar-track score">
            <span
              style={{
                width: pct(
                  answer.score / (Object.keys(answer.legend).length - 1),
                ),
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
export function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [error, setError] = useState("");
  const [mode, setMode] = useState<"mock" | "live">("mock"),
    [scenario, setScenario] = useState<RunInput["scenario"]>("auto");
  const [message, setMessage] = useState(samples[0]!.text),
    [threshold, setThreshold] = useState(0.8);
  const [trace, setTrace] = useState<RunTrace | null>(null),
    [history, setHistory] = useState<RunTrace[]>([]);
  const [replay, setReplay] = useState<{
    trace: RunTrace;
    index: number;
  } | null>(null);
  const [selection, setSelection] = useState("evaluating"),
    [inspector, setInspector] = useState<"decision" | "context" | "definition">(
      "decision",
    );
  const [view, setView] = useState<"graph" | "definition">("graph"),
    [submitting, setSubmitting] = useState(false),
    [tab, setTab] = useState<"event" | "history">("event");
  const [help, setHelp] = useState(false),
    [streamError, setStreamError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null),
    epoch = useRef(0),
    inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load the machine");
        return r.json();
      })
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  function receive(t: RunTrace) {
    setTrace(t);
    setHistory((prev) =>
      [t, ...prev.filter((p) => p.runId !== t.runId)].slice(0, 30),
    );
  }
  useEffect(() => {
    if (!trace || terminal(trace)) return;
    const runId = trace.runId;
    const es = new EventSource(`/api/runs/${runId}/events`);
    es.onopen = () => setStreamError(false);
    es.onerror = () => setStreamError(true);
    es.addEventListener("snapshot", (event) => {
      const parsed = traceSchema.safeParse(
        JSON.parse((event as MessageEvent).data),
      );
      if (!parsed.success || parsed.data.runId !== runId) {
        setError("An invalid run update was received.");
        es.close();
        return;
      }
      receive(parsed.data);
      setStreamError(false);
      if (terminal(parsed.data)) es.close();
    });
    return () => {
      es.close();
    };
  }, [trace?.runId]);
  const shown = replay?.trace ?? trace;
  const step = shown?.steps[replay?.index ?? shown.steps.length - 1];
  const state = step?.state ?? "idle";
  const busy = submitting || !!(trace && !terminal(trace));
  const manifest = config?.manifest;
  const selectedNode = manifest?.nodes.find((n) => n.id === selection);
  const graph = useMemo(() => {
    const steps =
      shown?.steps.slice(
        0,
        (replay?.index ?? (shown?.steps.length ?? 1) - 1) + 1,
      ) ?? [];
    const visited = new Set(steps.map((s) => s.state));
    const traversed = new Set(
      steps.slice(1).map((s, i) => `${steps[i]!.state}-${s.state}`),
    );
    const nodes: Node[] =
      manifest?.nodes.map((n) => ({
        id: n.id,
        type: "machine",
        position: { x: n.x, y: n.y },
        selected: selection === n.id,
        data: { ...n, active: n.id === state, visited: visited.has(n.id) },
      })) ?? [];
    const edges: Edge[] =
      manifest?.edges.map((e) => ({
        id: `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: e.label,
        type: "smoothstep",
        animated: state === "evaluating" && e.target === "evaluating",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: traversed.has(`${e.source}-${e.target}`)
            ? "#537948"
            : "#c3cac3",
        },
        style: {
          stroke: traversed.has(`${e.source}-${e.target}`)
            ? "#537948"
            : "#c3cac3",
          strokeWidth: traversed.has(`${e.source}-${e.target}`) ? 2.5 : 1.3,
          strokeDasharray: ["failed", "cancelled"].includes(e.target)
            ? "5 5"
            : undefined,
        },
        labelStyle: { fill: "#7a847a", fontSize: 10 },
        labelBgStyle: { fill: "#f8faf6" },
        labelBgPadding: [6, 4],
      })) ?? [];
    return { nodes, edges };
  }, [manifest, state, shown, replay?.index, selection]);
  async function run() {
    if (busy || !message.trim()) return;
    const current = ++epoch.current;
    setSubmitting(true);
    setError("");
    setReplay(null);
    setSelection("evaluating");
    try {
      const result = traceSchema.parse(
        await api("/api/runs", { message, threshold, mode, scenario }),
      );
      if (current !== epoch.current) {
        await api(`/api/runs/${result.runId}/cancel`, {});
        return;
      }
      receive(result);
    } catch (e) {
      if (current === epoch.current)
        setError(e instanceof Error ? e.message : "Could not start run");
    } finally {
      if (current === epoch.current) setSubmitting(false);
    }
  }
  async function cancel() {
    if (!trace) return;
    try {
      receive(
        traceSchema.parse(await api(`/api/runs/${trace.runId}/cancel`, {})),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reset() {
    ++epoch.current;
    setSubmitting(false);
    setReplay(null);
    setTrace(null);
    setStreamError(false);
    setError("");
    if (trace && !terminal(trace))
      try {
        const ended = traceSchema.parse(
          await api(`/api/runs/${trace.runId}/cancel`, {}),
        );
        setHistory((p) => [ended, ...p.filter((t) => t.runId !== ended.runId)]);
      } catch (e) {
        setError((e as Error).message);
      }
  }
  function download() {
    if (!shown) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(shown, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `jev-state-${shown.runId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importTrace(file: File) {
    try {
      if (file.size > 1_000_000)
        throw new Error("Trace files must be smaller than 1 MB.");
      const t = traceSchema.parse(JSON.parse(await file.text()));
      if (
        t.machineId !== manifest?.id ||
        t.machineVersion !== manifest.version ||
        t.policyVersion !== manifest.policyVersion
      )
        throw new Error(
          "This trace belongs to an incompatible machine or policy version.",
        );
      if (
        t.steps[0]?.state !== "idle" ||
        t.steps.some(
          (s, i) =>
            !manifest.nodes.some((n) => n.id === s.state) ||
            (i > 0 &&
              !manifest.edges.some(
                (e) =>
                  e.source === t.steps[i - 1]!.state && e.target === s.state,
              )),
        )
      )
        throw new Error("This trace contains invalid state transitions.");
      setReplay({ trace: t, index: 0 });
      setHistory((p) =>
        [t, ...p.filter((r) => r.runId !== t.runId)].slice(0, 30),
      );
      setError("");
    } catch (e) {
      setError(
        e instanceof Error && !("issues" in e)
          ? e.message
          : "This is not a valid Jev State trace.",
      );
    }
  }
  if (!config)
    return (
      <div className="loading">
        <Workflow size={34} />
        <h2>Opening your workspace</h2>
        <p>{error || "Loading the machine definition…"}</p>
        {error && <button onClick={() => location.reload()}>Try again</button>}
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Workflow size={22} />
          </span>
          <span>
            jev<span className="brand-state">state</span>
            <small>STUDIO</small>
          </span>
        </a>
        <div className="workspace-label">
          WORKSPACE <span>LOCAL</span>
        </div>
        <button className="workspace-button" onClick={() => setHelp(true)}>
          <span className="workspace-avatar">P</span>
          <span>
            Personal workspace<small>Development</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="sidebar-heading">BUILD</div>
        <button
          className="nav-item active"
          onClick={() => {
            setView("graph");
            setTab("event");
          }}
        >
          <Workflow size={17} /> Machines <span className="nav-count">1</span>
        </button>
        <button
          className={`nav-item ${tab === "history" ? "soft-active" : ""}`}
          onClick={() => {
            setTab("history");
            document
              .getElementById("runner")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <History size={17} /> Run history{" "}
          <span className="nav-count">{history.length}</span>
        </button>
        <div className="sidebar-heading machine-heading">
          YOUR MACHINES <span className="tiny-tag">01</span>
        </div>
        <button className="machine-link" onClick={() => setView("graph")}>
          <span className="tree-line" />
          <span className="small-dot" />
          Support routing
        </button>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="online-dot" />
            <strong>Local environment</strong>
            <p>
              {config.liveAvailable
                ? "Jev is configured for live runs."
                : "Mock mode is ready to explore."}
            </p>
            <div>
              v0.1 <span>Development build</span>
            </div>
          </div>
          <a
            className="nav-item"
            href="https://docs.typesafe.ai"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={17} /> Documentation <ArrowUpRight size={14} />
          </a>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={17} /> Quick guide
          </button>
          <div className="profile">
            <span className="workspace-avatar">P</span>
            <div>
              Personal workspace<small>Local session</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <span>Machines</span>
            <ChevronRight size={14} />
            <strong>Support routing</strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <span className="online-dot" />
              {config.liveAvailable ? "Jev configured" : "Mock available"}
            </span>
            <button
              className="icon-button"
              aria-label="Open quick guide"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={18} />
            </button>
            <span className="avatar">P</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> MACHINE WORKSPACE
              </div>
              <h1>
                Support routing <span className="version">v1.0</span>
              </h1>
              <p>One message. Three judgments. A clear next step.</p>
            </div>
            <div className="heading-actions">
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importTrace(f);
                  e.target.value = "";
                }}
              />
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={15} />
                Import trace
              </button>
              <button
                className="button primary"
                onClick={() => {
                  inputRef.current?.focus();
                  document
                    .getElementById("runner")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                <Play size={14} fill="currentColor" /> Test machine
              </button>
            </div>
          </div>
          {(error || streamError) && (
            <div role="alert" className="error-banner">
              <span>
                {error ||
                  "Connection interrupted. Reconnecting to the latest run snapshot…"}
              </span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => {
                  setError("");
                  setStreamError(false);
                }}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="machine-toolbar">
            <div className="view-tabs">
              <button
                className={view === "graph" ? "selected" : ""}
                onClick={() => setView("graph")}
              >
                <Workflow size={15} /> State graph
              </button>
              <button
                className={view === "definition" ? "selected" : ""}
                onClick={() => setView("definition")}
              >
                <Braces size={15} /> Definition
              </button>
            </div>
            <div className="graph-meta">
              <span>{manifest!.nodes.length} states</span>
              <i /> <span>3 judgments</span>
              <i />
              <span className="saved">
                <Check size={13} /> Code-defined
              </span>
            </div>
          </div>
          <div className="studio-grid">
            <section className="graph-panel" aria-label="State machine graph">
              <div className="canvas-top">
                <span className={`state-pill ${state}`}>
                  <span className={state === "evaluating" ? "pulse" : ""} />
                  {replay ? "REPLAY · " : ""}
                  {labels[state] ?? state}
                </span>
                <span className="canvas-model">
                  {step?.context.result?.model ??
                    (mode === "live" ? "jev-latest" : "mock-fixture-v1")}
                </span>
              </div>
              {view === "graph" ? (
                <ReactFlow
                  nodes={graph.nodes}
                  edges={graph.edges}
                  nodeTypes={nodeTypes}
                  onNodeClick={(_, node) => setSelection(node.id)}
                  onEdgeClick={(_, edge) => {
                    setSelection(edge.target);
                    setInspector("decision");
                  }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  minZoom={0.45}
                  maxZoom={1.5}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={20} size={1} color="#dfe5dc" />
                  <Controls showInteractive={false} />
                </ReactFlow>
              ) : (
                <div className="definition-panel">
                  <div>
                    <FileJson size={18} />
                    <strong>support-routing.manifest.json</strong>
                    <span>Read only</span>
                  </div>
                  <JsonView value={manifest} />
                </div>
              )}
              <div className="canvas-bottom">
                <span>
                  <i className="legend-current" /> Current state
                </span>
                <span>
                  <i className="legend-visited" /> Visited
                </span>
                <span>
                  <i className="legend-pending" /> Pending
                </span>
                <span className="canvas-hint">
                  Scroll to zoom · drag to pan
                </span>
              </div>
            </section>
            <aside className="inspector">
              <div className="inspector-title">
                <span>
                  <Settings2 size={16} /> Inspector
                </span>
                <span className="tiny-tag">NODE</span>
              </div>
              <div className="selected-summary">
                <div className="selected-icon">
                  {selection === "evaluating" ? (
                    <Zap size={20} />
                  ) : (
                    <GitBranch size={20} />
                  )}
                </div>
                <div>
                  <h2>{selectedNode?.label}</h2>
                  <code>{selection}</code>
                </div>
              </div>
              <div className="inspector-tabs">
                {(["decision", "context", "definition"] as const).map((t) => (
                  <button
                    className={inspector === t ? "active" : ""}
                    onClick={() => setInspector(t)}
                    key={t}
                  >
                    {t === "decision"
                      ? "Overview"
                      : t === "context"
                        ? "Context"
                        : "Questions"}
                  </button>
                ))}
              </div>
              <div className="inspector-body">
                {inspector === "decision" ? (
                  <>
                    <div className="section-label">
                      {selectedNode?.kind === "decision"
                        ? "DECISION NODE"
                        : "STATE"}
                    </div>
                    <p className="inspector-description">
                      {selection === "evaluating"
                        ? "Jev evaluates the message. Your policy decides where it goes next."
                        : selectedNode?.description}
                    </p>
                    {step?.context.policy && (
                      <div
                        className={`policy-result ${state === "review" ? "review" : ""}`}
                      >
                        <ShieldCheck size={17} />
                        <div>
                          <strong>
                            {labels[step.context.policy.outcome]} selected
                          </strong>
                          <p>{step.context.policy.reason}</p>
                        </div>
                      </div>
                    )}
                    {step?.context.error && (
                      <div className="policy-result failure">
                        <X size={17} />
                        <p>{step.context.error}</p>
                      </div>
                    )}
                    <div className="property-row">
                      <span>Provider</span>
                      <span className="provider-label">
                        <Zap size={12} />
                        {shown?.mode === "live"
                          ? "Jev"
                          : shown
                            ? "Mock fixtures"
                            : mode === "live"
                              ? "Jev"
                              : "Mock fixtures"}
                      </span>
                    </div>
                    <div className="property-row">
                      <span>Confidence threshold</span>
                      <strong>
                        {pct(step?.context.threshold ?? threshold)}
                      </strong>
                    </div>
                    <div className="property-row">
                      <span>Fallback</span>
                      <code>review</code>
                    </div>
                    <div className="inspector-divider" />
                    <div className="section-label">
                      JUDGMENTS <span>3</span>
                    </div>
                    {step?.context.result ? (
                      Object.entries(step.context.result.answers).map(
                        ([id, answer]) => (
                          <QuestionAnswer key={id} id={id} answer={answer} />
                        ),
                      )
                    ) : (
                      <>
                        <div className="question-preview">
                          <div>
                            <span className="primitive choice">choice</span>
                            <strong>department</strong>
                          </div>
                          <p>Billing, technical, or other?</p>
                        </div>
                        <div className="question-preview">
                          <div>
                            <span className="primitive noul">noul</span>
                            <strong>urgent</strong>
                          </div>
                          <p>Does this need immediate attention?</p>
                        </div>
                        <div className="question-preview">
                          <div>
                            <span className="primitive score">score</span>
                            <strong>frustration</strong>
                          </div>
                          <p>How frustrated is the customer?</p>
                        </div>
                        <div className="empty-inspector">
                          <Activity size={20} />
                          <p>
                            {state === "evaluating"
                              ? "Waiting for the decision…"
                              : "Run the machine to inspect answers and probabilities."}
                          </p>
                        </div>
                      </>
                    )}
                    <p className="small-note">
                      Only department controls routing. Urgency and frustration
                      are additional signals. Thresholds are illustrative.
                    </p>
                  </>
                ) : inspector === "context" ? (
                  <>
                    <div className="section-label">INPUT SNAPSHOT</div>
                    <JsonView
                      value={step?.context.input ?? { ticket: { message } }}
                    />
                    <div className="section-label">CONTEXT CHANGE</div>
                    <JsonView
                      value={{
                        before:
                          shown && step && step.sequence > 0
                            ? shown.steps[step.sequence - 1]?.context
                            : null,
                        after: step?.context ?? null,
                      }}
                    />
                  </>
                ) : (
                  <>
                    <div className="section-label">
                      EXACT QUESTIONS SENT TO JEV
                    </div>
                    <JsonView value={shown?.questions ?? manifest!.questions} />
                  </>
                )}
              </div>
              <div className="inspector-footer">
                <span className="online-dot" />{" "}
                {replay
                  ? "Recorded snapshot · no API calls"
                  : "State managed by XState"}
              </div>
            </aside>
          </div>
          <section id="runner" className="runner">
            <div className="runner-header">
              <div className="runner-tabs">
                <button
                  className={tab === "event" ? "active" : ""}
                  onClick={() => setTab("event")}
                >
                  <Play size={14} /> Event playground
                </button>
                <button
                  className={tab === "history" ? "active" : ""}
                  onClick={() => setTab("history")}
                >
                  <History size={14} /> Run history{" "}
                  <span>{history.length}</span>
                </button>
              </div>
              <button
                className="text-button"
                disabled={!shown}
                onClick={download}
              >
                <Download size={14} /> Export trace
              </button>
            </div>
            {tab === "event" ? (
              <div className="runner-grid">
                <div className="event-editor">
                  <div className="editor-heading">
                    <label htmlFor="message">CUSTOMER MESSAGE</label>
                    <div className="mode-switch">
                      <button
                        disabled={busy}
                        className={mode === "mock" ? "active" : ""}
                        onClick={() => setMode("mock")}
                      >
                        Mock
                      </button>
                      <button
                        disabled={busy || !config.liveAvailable}
                        className={mode === "live" ? "active live" : ""}
                        onClick={() => setMode("live")}
                      >
                        <span /> Live Jev
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="message"
                    ref={inputRef}
                    value={message}
                    maxLength={8000}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe the customer's request…"
                  />
                  <div className="samples">
                    <span>Try an example</span>
                    {samples.map((s) => (
                      <button key={s.name} onClick={() => setMessage(s.text)}>
                        {s.name}
                        <ArrowUpRight size={11} />
                      </button>
                    ))}
                  </div>
                  <div className="event-options">
                    <label>
                      Threshold{" "}
                      <input
                        aria-label="Confidence threshold"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value))}
                      />
                      <strong>{pct(threshold)}</strong>
                    </label>
                    {mode === "mock" && (
                      <select
                        aria-label="Mock scenario"
                        value={scenario}
                        onChange={(e) =>
                          setScenario(e.target.value as RunInput["scenario"])
                        }
                      >
                        <option value="auto">Normal response</option>
                        <option value="uncertain">Low confidence</option>
                        <option value="error">Provider error</option>
                      </select>
                    )}
                  </div>
                  <div className="event-actions">
                    <span>
                      {mode === "mock"
                        ? "Synthetic fixtures · no API usage"
                        : "Sends this message to TypeSafe"}
                    </span>
                    <div>
                      <button
                        className="icon-button reset"
                        title="Reset run"
                        aria-label="Reset run"
                        onClick={() => void reset()}
                      >
                        <RotateCcw size={16} />
                      </button>
                      {busy ? (
                        <button
                          className="button cancel"
                          disabled={submitting}
                          onClick={() => void cancel()}
                        >
                          <Square size={13} /> Cancel
                        </button>
                      ) : (
                        <button
                          className="button primary"
                          disabled={!message.trim()}
                          onClick={() => void run()}
                        >
                          <Play size={13} fill="currentColor" /> Run event{" "}
                          <span className="shortcut">↵</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="trace-panel">
                  <div className="trace-heading">
                    <span>EXECUTION TRACE</span>
                    {shown ? (
                      <code>{shown.runId.slice(0, 8)}</code>
                    ) : (
                      <span className="tiny-tag">WAITING</span>
                    )}
                  </div>
                  {shown ? (
                    <>
                      <div className="trace-steps">
                        {shown.steps.map((s, i) => (
                          <button
                            key={s.sequence}
                            className={`trace-step ${(replay?.index ?? shown.steps.length - 1) === i ? "current" : ""}`}
                            onClick={() =>
                              setReplay({ trace: shown, index: i })
                            }
                          >
                            <span className={`trace-dot ${s.state}`}>
                              {i === shown.steps.length - 1 &&
                              s.state !== "evaluating" ? (
                                <Check size={10} />
                              ) : (
                                <span />
                              )}
                            </span>
                            <span>
                              <strong>{labels[s.state]}</strong>
                              <small>
                                {i === 0
                                  ? "Machine initialized"
                                  : s.state === "evaluating"
                                    ? "RUN → invoke Jev"
                                    : (s.context.policy?.reason ??
                                      s.context.error ??
                                      "Request cancelled")}
                              </small>
                            </span>
                            <code>+{shortTime(s.elapsedMs)}</code>
                          </button>
                        ))}
                      </div>
                      <div className="trace-metrics">
                        <span>
                          <Activity size={13} />
                          {shortTime(step?.elapsedMs ?? 0)}
                        </span>
                        <span>
                          <Layers3 size={13} />
                          {step?.context.result?.usage.input_tokens ?? "—"}{" "}
                          input tokens
                        </span>
                        <span>{shown.mode === "live" ? "LIVE" : "MOCK"}</span>
                      </div>
                      {replay ? (
                        <div className="replay-controls">
                          <button
                            className="icon-button"
                            aria-label="Previous trace step"
                            disabled={replay.index === 0}
                            onClick={() =>
                              setReplay({ ...replay, index: replay.index - 1 })
                            }
                          >
                            <ArrowLeft size={15} />
                          </button>
                          <span>
                            Replay · {replay.index + 1} / {shown.steps.length}
                          </span>
                          <button
                            className="icon-button"
                            aria-label="Next trace step"
                            disabled={replay.index === shown.steps.length - 1}
                            onClick={() =>
                              setReplay({ ...replay, index: replay.index + 1 })
                            }
                          >
                            <ArrowRight size={15} />
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setReplay(null)}
                          >
                            Exit replay
                          </button>
                        </div>
                      ) : (
                        <button
                          className="replay-start"
                          disabled={!terminal(shown)}
                          onClick={() => setReplay({ trace: shown, index: 0 })}
                        >
                          <History size={14} /> Replay this run{" "}
                          <span>No new API calls</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="trace-empty">
                      <div>
                        <GitBranch size={26} />
                      </div>
                      <strong>Your next step starts here</strong>
                      <p>
                        Send an event to follow the machine’s journey,
                        <br />
                        from first judgment to final state.
                      </p>
                      <span>
                        Ready when you are <ArrowLeft size={13} />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="history-list">
                {history.length ? (
                  history.map((t) => (
                    <button
                      key={t.runId}
                      onClick={() => {
                        setReplay({ trace: t, index: t.steps.length - 1 });
                        setTab("event");
                      }}
                    >
                      <span className="history-icon">
                        <History size={17} />
                      </span>
                      <span>
                        <strong>{labels[t.steps.at(-1)!.state]}</strong>
                        <small>
                          {t.runId.slice(0, 8)} ·{" "}
                          {new Date(t.createdAt).toLocaleTimeString()}
                        </small>
                      </span>
                      <span className="tiny-tag">{t.mode}</span>
                      <code>{shortTime(t.steps.at(-1)!.elapsedMs)}</code>
                      <ChevronRight size={16} />
                    </button>
                  ))
                ) : (
                  <div className="history-empty">
                    No runs yet. Send your first event in the playground.
                  </div>
                )}
              </div>
            )}
          </section>
          <footer className="page-footer">
            <span>
              <Workflow size={13} /> Built for decisions you can see.
            </span>
            <span>
              Jev State Studio <i /> Local development
            </span>
          </footer>
        </main>
      </div>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Close guide"
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </button>
            <div className="brand-mark">
              <Workflow size={24} />
            </div>
            <h2 id="guide-title">Meet your machine.</h2>
            <p>Jev makes the judgments. Your state machine stays in control.</p>
            <ol>
              <li>
                <strong>Send an event.</strong> Choose a sample or write a
                message. Mock mode uses synthetic fixtures; Live Jev calls your
                connected account.
              </li>
              <li>
                <strong>Follow the graph.</strong> Click a state to inspect its
                input, judgments, and routing policy.
              </li>
              <li>
                <strong>Explore uncertainty.</strong> Raise the threshold or use
                the low-confidence fixture to route to human review.
              </li>
              <li>
                <strong>Replay a run.</strong> Step through the trace without
                another API call. Exported traces contain the input message and
                answers.
              </li>
            </ol>
            <p className="small-note">
              This version supports flat decision machines. Add machine
              definitions in code; visual editing and nested charts are planned.
            </p>
            <button className="button primary" onClick={() => setHelp(false)}>
              Let’s try it <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
