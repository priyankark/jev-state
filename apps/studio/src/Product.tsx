import { useEffect, useRef, useState } from "react";
import { ProjectGraph, layoutStates } from "./ProjectGraph.js";
import {
  diagnoseProject,
  evaluationCoverage,
} from "../../../packages/core/src/diagnostics.js";
import { workspaceSchema } from "../../../packages/core/src/workspace.js";
import {
  Activity,
  Undo2,
  Redo2,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Beaker,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileJson,
  GitBranch,
  History,
  LayoutGrid,
  Loader2,
  LockKeyhole,
  MessageSquare,
  MoreHorizontal,
  Play,
  Plug,
  Plus,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import {
  templates,
  blankProject,
  copyTemplate,
  projectSchema,
  workflowSignature,
  evaluationSignature,
  type Project,
  type Conversation,
  type TurnResult,
  type ChatMessage,
  type EvalReport,
  type CaseResult,
  type EvalCase,
  type WorkflowState,
} from "../../../packages/core/src/studio.js";
import "./product.css";
type ConnectionState = {
  jev: boolean;
  openai: boolean;
  model: string;
  liveEnabled?: boolean;
};
type Library = {
  projects: Project[];
  conversations: Conversation[];
  reports: EvalReport[];
};
const KEY = "jev-state-workspace-v2";
const fresh: Library = { projects: [], conversations: [], reports: [] };
function load(): { library: Library; damaged: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw) return { library: fresh, damaged: false };
    return { library: workspaceSchema.parse(raw) as Library, damaged: false };
  } catch {
    return { library: fresh, damaged: true };
  }
}
async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/studio${path}`, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",

          body: JSON.stringify(body),
        }),
    headers: { "Content-Type": "application/json" },
    ...(signal ? { signal } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data;
}
function exportJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
function prettyTime(ms: number) {
  return ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
function percent(n: number) {
  return `${Math.round(n * 100)}%`;
}
export function Product() {
  const [loaded] = useState(load);
  const [damagedStorage, setDamagedStorage] = useState(loaded.damaged);
  const [library, setLibrary] = useState<Library>(loaded.library);
  const [storageBlocked, setStorageBlocked] = useState(loaded.damaged);
  const [storageError, setStorageError] = useState(false);
  const storageStatus =
    storageError || storageBlocked
      ? "Changes are not saved"
      : "Saved on this device";
  const [page, setPage] = useState<"projects" | "connections">("projects");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tab, setTab] = useState<"build" | "conversation" | "evals">(
    "conversation",
  );
  const [session, setSession] = useState<boolean | null>(null),
    [accessCode, setAccessCode] = useState(""),
    [connections, setConnections] = useState<ConnectionState>({
      jev: false,
      openai: false,
      model: "gpt-4.1-mini",
    });
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [create, setCreate] = useState(false),
    [projectName, setProjectName] = useState(""),
    [templateId, setTemplateId] = useState("blank");
  const [editorPanel, setEditorPanel] = useState<"state" | "workflow">("state");
  const [past, setPast] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([]);
  const lastEdit = useRef({ key: "", at: 0 });
  const [inspectedState, setInspectedState] = useState<string | null>(null);
  const [draft, setDraft] = useState<Project | null>(null),
    [selectedState, setSelectedState] = useState(""),
    [mode, setMode] = useState<"mock" | "live">("mock");
  const [conversationId, setConversationId] = useState<string | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [inspectedTurn, setInspectedTurn] = useState<number | null>(null);
  const [evalBusy, setEvalBusy] = useState(false),
    [evalProgress, setEvalProgress] = useState(""),
    [reportId, setReportId] = useState<string | null>(null),
    [caseEditor, setCaseEditor] = useState<EvalCase | null>(null),
    [detail, setDetail] = useState<CaseResult | null>(null);
  const [setupProvider, setSetupProvider] = useState<string | null>(null),
    [connectionTest, setConnectionTest] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null),
    restoreRef = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    revision = useRef(0),
    chatEnd = useRef<HTMLDivElement>(null);
  const project = library.projects.find((p) => p.id === projectId) ?? null;
  const conversation =
    library.conversations.find(
      (c) => c.id === conversationId && c.projectId === projectId,
    ) ?? null;
  const currentState = conversation?.turns.at(-1)?.to ?? project?.initial;
  const conversationProject = conversation?.projectSnapshot ?? project;
  const activeState = conversationProject?.states.find(
    (s) => s.id === currentState,
  );
  const reports = library.reports.filter((r) => r.projectId === projectId);
  const report = reports.find((r) => r.id === reportId) ?? reports[0];
  const reportStale = !!(
    project &&
    report &&
    report.configSignature !== evaluationSignature(project)
  );
  const viewedTurn =
    conversation?.turns[inspectedTurn ?? conversation.turns.length - 1];
  const working = draft ?? project;
  const diagnostics = working ? diagnoseProject(working) : [];
  const dirty = !!(
    draft &&
    project &&
    JSON.stringify(draft) !== JSON.stringify(project)
  );
  const selected =
    working?.states.find((s) => s.id === selectedState) ?? working?.states[0];
  useEffect(() => {
    request<{ authenticated: boolean }>("/session")
      .then((r) => setSession(r.authenticated))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (session) void refreshConnections();
  }, [session]);
  useEffect(() => {
    if (storageBlocked) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(library));
      setStorageError(false);
    } catch {
      setStorageError(true);
      setError(
        "Device storage is full. Export your work and remove older conversations. New changes are not saved.",
      );
    }
  }, [library, storageBlocked]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === KEY || event.key === null) setStorageBlocked(true);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => {
    if (tab !== "conversation") return;
    const messages = chatEnd.current?.parentElement;
    messages?.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages.length, busy, tab]);

  useEffect(() => () => controller.current?.abort(), []);
  async function refreshConnections() {
    try {
      setConnections(await request<ConnectionState>("/connections"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function notify(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 3500);
  }
  function cancelWork() {
    revision.current++;
    controller.current?.abort();
    setBusy(false);
    setEvalBusy(false);
    setEvalProgress("");
  }
  function openProject(p: Project) {
    if (dirty && !window.confirm("Discard unsaved workflow changes?")) return;
    cancelWork();
    setPast([]);
    setFuture([]);
    lastEdit.current = { key: "", at: 0 };
    setText("");
    setInspectedState(null);
    setEditorPanel("state");
    window.scrollTo(0, 0);
    setProjectId(p.id);
    setDraft(structuredClone(p));
    setSelectedState(p.initial);
    setConversationId(null);
    setInspectedTurn(null);
    setTab("conversation");
    setPage("projects");
    setError("");
    setReportId(null);
  }
  function navigate(next: "projects" | "connections") {
    if (dirty && !window.confirm("Discard unsaved workflow changes?")) return;
    cancelWork();
    setPage(next);
    setProjectId(null);
    setDraft(null);
    setError("");
  }
  function makeProject() {
    const template = templates.find((t) => t.id === templateId);
    const p = template
      ? copyTemplate(template, projectName.trim() || template.name)
      : { ...blankProject(), name: projectName.trim() || "My first project" };
    setLibrary((prev) => ({ ...prev, projects: [p, ...prev.projects] }));
    setCreate(false);
    setProjectName("");
    openProject(p);
    setTab("build");
    notify("Project created. Make it yours, then try a conversation.");
  }
  function startTemplate(t: Project) {
    setTemplateId(t.id);
    setProjectName(t.name);
    setCreate(true);
  }
  function saveProject() {
    if (!draft) return false;
    const result = projectSchema.safeParse(draft);
    if (!result.success) {
      setError(result.error.issues[0]?.message || "Check your workflow");
      return false;
    }
    const behaviorChanged =
      !project || workflowSignature(project) !== workflowSignature(result.data);
    const next = {
      ...result.data,
      version: (project?.version ?? 1) + (behaviorChanged ? 1 : 0),
    };
    setLibrary((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === next.id ? next : p)),
    }));
    setDraft(structuredClone(next));
    setPast([]);
    setFuture([]);
    if (behaviorChanged) {
      setConversationId(null);
      setInspectedTurn(null);
      setInspectedState(null);
    }
    setError("");
    lastEdit.current = { key: "", at: 0 };
    notify(
      behaviorChanged
        ? "Workflow saved. New conversations use this version."
        : "Layout and settings saved.",
    );
    return true;
  }
  function updateDraft(change: Partial<Project>, editKey = "") {
    if (!working) return;
    const next = { ...structuredClone(working), ...change };
    if (JSON.stringify(next) === JSON.stringify(working)) return;
    const now = Date.now();
    if (
      !editKey ||
      editKey !== lastEdit.current.key ||
      now - lastEdit.current.at > 700
    )
      setPast((prev) => [...prev.slice(-59), structuredClone(working)]);
    lastEdit.current = { key: editKey, at: now };
    setFuture([]);
    setDraft(next);
    setError("");
  }
  function undo() {
    const previous = past.at(-1);
    if (!previous || !working) return;
    setFuture((prev) => [...prev, structuredClone(working)]);
    setPast((prev) => prev.slice(0, -1));
    setDraft(previous);
    lastEdit.current = { key: "", at: 0 };
  }
  function redo() {
    const next = future.at(-1);
    if (!next || !working) return;
    setPast((prev) => [...prev, structuredClone(working)]);
    setFuture((prev) => prev.slice(0, -1));
    setDraft(next);
    lastEdit.current = { key: "", at: 0 };
  }
  function selectState(id: string) {
    setSelectedState(id);
    setEditorPanel("state");
  }
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty || storageError || storageBlocked) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, storageError, storageBlocked]);
  useEffect(() => {
    const shortcuts = (e: KeyboardEvent) => {
      if (tab !== "build" || !project || (!e.metaKey && !e.ctrlKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) saveProject();
      }
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]"))
        return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  });
  const modalKind = create
    ? "create"
    : caseEditor
      ? "case"
      : detail
        ? "detail"
        : setupProvider
          ? "connection"
          : null;
  useEffect(() => {
    if (!modalKind) return;
    setError("");
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(".p-modal");
    const focusable = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary",
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    const timer = requestAnimationFrame(() => {
      const firstInput = modal?.querySelector<HTMLElement>(
        "input, textarea, select",
      );
      (firstInput ?? focusable()[0])?.focus();
    });
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCreate(false);
        setCaseEditor(null);
        setDetail(null);
        setSetupProvider(null);
        setError("");
      }
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !modal?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !modal?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", keys);
    return () => {
      cancelAnimationFrame(timer);
      window.removeEventListener("keydown", keys);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [modalKind]);
  function updateState(change: Partial<WorkflowState>) {
    if (working && selected)
      updateDraft(
        {
          states: working.states.map((s) =>
            s.id === selected.id ? { ...s, ...change } : s,
          ),
        },
        selected.id + ":" + Object.keys(change).join(","),
      );
  }
  function addState() {
    if (!working || working.states.length >= 12) return;
    let i = working.states.length + 1;
    while (working.states.some((s) => s.id === `state_${i}`)) i++;
    const id = `state_${i}`;
    const from =
      selected && !selected.terminal
        ? selected
        : working.states.find((s) => s.id === working.initial && !s.terminal);
    const layout = layoutStates(working);
    const origin = from ? (from.position ?? layout[from.id]!) : { x: 0, y: 0 };
    const positions = working.states.map((s) => s.position ?? layout[s.id]!);
    const position = { x: origin.x + 340, y: origin.y };
    while (
      positions.some(
        (p) =>
          Math.abs(p.x - position.x) < 260 && Math.abs(p.y - position.y) < 160,
      )
    )
      position.y += 190;
    updateDraft({
      states: [
        ...working.states.map((s) => ({
          ...s,
          position: s.position ?? layout[s.id]!,
          transitions:
            s.id === from?.id ? [...s.transitions, id] : s.transitions,
        })),
        {
          id,
          label: "New state",
          description: "",
          reply: "What would you like to do next?",
          transitions: [],
          keywords: [],
          terminal: false,
          position,
        },
      ],
    });
    selectState(id);
    notify(
      from
        ? `State added and connected from ${from.label}. Set its entry condition.`
        : "State added. Connect it to your workflow.",
    );
  }
  function deleteState() {
    if (!working || !selected || selected.id === working.initial) return;
    updateDraft({
      states: working.states
        .filter((s) => s.id !== selected.id)
        .map((s) => ({
          ...s,
          transitions: s.transitions.filter((t) => t !== selected.id),
        })),
      cases: working.cases.filter((c) => c.expectedState !== selected.id),
    });
    selectState(working.initial);
  }
  async function send() {
    if (!project || !text.trim() || busy) return;
    if (conversation && conversation.projectVersion !== project.version) {
      setError(
        "This workflow changed. Start a new conversation to use the current version.",
      );
      return;
    }
    const current = ++revision.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    const c = conversation ?? {
      id: crypto.randomUUID(),
      projectId: project.id,
      projectVersion: project.version,
      projectSnapshot: structuredClone(project),
      createdAt: new Date().toISOString(),
      mode,
      messages: [],
      turns: [],
    };
    const messages: ChatMessage[] = [
      ...c.messages,
      { role: "user", content: text.trim() },
    ];
    try {
      const result = await request<TurnResult>(
        "/turn",
        {
          project,
          currentState: c.turns.at(-1)?.to ?? project.initial,
          messages,
          mode: c.mode,
        },
        abort.signal,
      );
      if (current !== revision.current) return;
      const updated: Conversation = {
        ...c,
        messages: [...messages, { role: "assistant", content: result.reply }],
        turns: [...c.turns, result],
      };
      setLibrary((prev) => ({
        ...prev,
        conversations: [
          updated,
          ...prev.conversations.filter((s) => s.id !== c.id),
        ].slice(0, 60),
      }));
      setConversationId(c.id);
      setSelectedState(result.to);
      setInspectedState(null);
      setInspectedTurn(null);
      setText("");
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }
  function newConversation() {
    cancelWork();
    setInspectedState(null);
    setConversationId(null);
    setInspectedTurn(null);
    setText("");
    setError("");
  }
  function saveCase() {
    if (!project || !caseEditor) return;
    if (
      caseEditor.turns.length > 5 ||
      caseEditor.turns.some((turn) => !turn.trim())
    ) {
      setError("Add 1–5 messages, one per line, with no empty lines.");
      return;
    }
    const updated = {
      ...project,
      cases: [
        ...project.cases.filter((c) => c.id !== caseEditor.id),
        caseEditor,
      ],
    };
    const parsed = projectSchema.safeParse(updated);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the case");
      return;
    }
    setLibrary((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === updated.id ? updated : p)),
    }));
    setDraft(updated);
    setCaseEditor(null);
    setError("");
  }
  async function runEvals() {
    if (!project || !project.cases.length) return;
    const runProject = structuredClone(project);
    const abort = new AbortController();
    controller.current = abort;
    const current = ++revision.current;
    setEvalBusy(true);
    setError("");
    const result: EvalReport = {
      id: crypto.randomUUID(),
      projectId: project.id,
      projectVersion: project.version,
      createdAt: new Date().toISOString(),
      mode,
      configSignature: evaluationSignature(project),
      results: [],
    };
    for (let i = 0; i < runProject.cases.length; i++) {
      if (abort.signal.aborted) break;
      const test = runProject.cases[i]!;
      setEvalProgress(`${i + 1} of ${runProject.cases.length} · ${test.name}`);
      try {
        result.results.push(
          await request<CaseResult>(
            "/eval-case",
            { project: runProject, test, mode },
            abort.signal,
          ),
        );
      } catch (e) {
        if (abort.signal.aborted) break;
        result.results.push({
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
          error: (e as Error).message,
        });
      }
      if (current === revision.current) {
        const copy = structuredClone(result);
        setLibrary((prev) => ({
          ...prev,
          reports: [
            copy,
            ...prev.reports.filter((r) => r.id !== copy.id),
          ].slice(0, 40),
        }));
        setReportId(result.id);
      }
    }
    if (current === revision.current) {
      setEvalBusy(false);
      setEvalProgress("");
      notify(
        abort.signal.aborted
          ? "Evaluation stopped. Completed cases were saved."
          : "Evaluation complete. Inspect any result to see its conversation.",
      );
    }
  }
  async function importProject(file: File) {
    try {
      if (file.size > 500000)
        throw new Error("Project files must be smaller than 500 KB.");
      const raw = JSON.parse(await file.text());
      const parsed = projectSchema.parse(raw.project ?? raw);
      const p = copyTemplate(parsed, `${parsed.name} (imported)`);
      setLibrary((prev) => ({ ...prev, projects: [p, ...prev.projects] }));
      openProject(p);
      notify("Project imported.");
    } catch {
      setError(
        "This is not a valid Jev State project file. Export a project from its workspace to get the right format.",
      );
    }
  }
  async function restoreWorkspace(file: File) {
    try {
      if (file.size > 10_000_000)
        throw new Error("Backups must be smaller than 10 MB.");
      const raw = JSON.parse(await file.text());
      if (raw.schemaVersion !== 1)
        throw new Error("Choose a Jev State workspace backup (version 1).");
      const restored = workspaceSchema.parse(raw.workspace) as Library;
      if (
        !window.confirm(
          "Replace this device's projects, conversations, and reports with this backup? Export your current workspace first if you need it.",
        )
      )
        return;
      cancelWork();
      setProjectId(null);
      setDraft(null);
      setPage("projects");
      setStorageBlocked(false);
      setDamagedStorage(false);
      setLibrary(restored);
      setError("");
      notify("Workspace restored.");
    } catch (e) {
      setError(
        e instanceof Error && !("issues" in e)
          ? e.message
          : "This backup contains invalid projects or conversation history. Your workspace is unchanged.",
      );
    }
  }
  async function testConnection(provider: string) {
    setConnectionTest(provider);
    try {
      await request("/connections/test", { provider });
      notify(`${provider === "jev" ? "Jev" : "OpenAI"} connection verified.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnectionTest(null);
    }
  }
  if (session === null)
    return (
      <div className="p-loading">
        <div className="p-logo-icon">
          <Workflow />
        </div>
        <h2>Opening your workspace</h2>
        <p>{error || "One moment…"}</p>
      </div>
    );
  if (!session)
    return (
      <div className="p-access">
        <div>
          <div className="p-logo-icon">
            <Workflow />
          </div>
          <span className="p-kicker">JEV STATE · PRIVATE WORKSPACE</span>
          <h1>
            Your agents.
            <br />A little more clarity.
          </h1>
          <p>
            Build conversations, see their decisions, and test what happens
            next.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void request("/login", { accessCode })
                .then(() => {
                  setSession(true);
                  setAccessCode("");
                  setError("");
                })
                .catch((e) => setError(e.message));
            }}
          >
            <label htmlFor="access-code">Workspace access code</label>
            <input
              id="access-code"
              type="password"
              autoComplete="current-password"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              required
            />
            <button className="p-button p-primary">
              <LockKeyhole size={15} /> Unlock workspace
            </button>
            {error && (
              <p role="alert" className="p-inline-error">
                {error}
              </p>
            )}
          </form>
          <small>
            Ask the workspace owner for access. Provider credentials stay on the
            server.
          </small>
        </div>
      </div>
    );
  return (
    <div className="p-app">
      <aside className="p-sidebar">
        <a
          href="/"
          className="p-brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("projects");
          }}
        >
          <span className="p-logo-icon">
            <Workflow size={22} />
          </span>
          <span>
            jev<span>state</span>
            <small>BUILD WITH CERTAINTY</small>
          </span>
        </a>
        <div className="p-workspace-chip">
          <span>P</span>
          <div>
            Personal workspace<small>Your ideas, in motion</small>
          </div>
        </div>
        <div className="p-nav-label">WORKSPACE</div>
        <button
          className={`p-nav ${page === "projects" ? "active" : ""}`}
          onClick={() => navigate("projects")}
        >
          <LayoutGrid size={18} /> Projects{" "}
          <span>{library.projects.length}</span>
        </button>
        <button
          className={`p-nav ${page === "connections" ? "active" : ""}`}
          onClick={() => navigate("connections")}
        >
          <Plug size={18} /> Connections{" "}
          <i className={connections.jev ? "p-dot" : ""} />
        </button>
        {library.projects.length > 0 && (
          <>
            <div className="p-nav-label p-recents">RECENT PROJECTS</div>
            {library.projects.slice(0, 5).map((p) => (
              <button
                className={`p-recent ${project?.id === p.id ? "active" : ""}`}
                key={p.id}
                onClick={() => {
                  openProject(p);
                }}
              >
                <GitBranch size={14} />
                {p.name}
              </button>
            ))}
          </>
        )}
        <div className="p-sidebar-bottom">
          <button
            className="p-nav"
            title="Back up workspace"
            onClick={() => {
              if (dirty) {
                setError(
                  "Save your workflow changes before backing up the workspace.",
                );
                return;
              }
              exportJson(
                { schemaVersion: 1, workspace: library },
                "jev-state-workspace.json",
              );
            }}
          >
            <Download size={16} /> Back up workspace
          </button>
          <button
            className="p-nav"
            title="Restore workspace"
            onClick={() => restoreRef.current?.click()}
          >
            <Upload size={16} /> Restore workspace
          </button>
          <div className="p-tip">
            <Sparkles size={18} />
            <strong>
              Small judgments.
              <br />
              Bigger possibilities.
            </strong>
            <p>
              Let Jev guide the state. Let your agents handle the conversation.
            </p>
          </div>
          <a href="https://docs.typesafe.ai" target="_blank" rel="noreferrer">
            <FileJson size={16} /> TypeSafe docs <ArrowUpRight size={13} />
          </a>
          <a
            href="https://github.com/priyankark/jev-state"
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={16} /> Source & guides <ArrowUpRight size={13} />
          </a>
          <div className="p-device">
            <span className="p-dot" />
            <span>
              <span role="status">{storageStatus}</span>
              <small>Export projects to move or back up.</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="p-main">
        <header className="p-topbar">
          <div>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <button onClick={() => navigate(page)}>
              {page === "connections" ? "Connections" : "Projects"}
            </button>
            {project && (
              <>
                <ChevronRight size={14} />
                <strong>{project.name}</strong>
                <button
                  title="Delete project"
                  aria-label="Delete project"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete ${project.name} and its saved conversations and evaluations? Export it first if you need a copy.`,
                      )
                    )
                      return;
                    cancelWork();
                    setLibrary((prev) => ({
                      ...prev,
                      projects: prev.projects.filter(
                        (p) => p.id !== project.id,
                      ),
                      conversations: prev.conversations.filter(
                        (c) => c.projectId !== project.id,
                      ),
                      reports: prev.reports.filter(
                        (r) => r.projectId !== project.id,
                      ),
                    }));
                    setProjectId(null);
                    setDraft(null);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
          <div>
            <span className="p-status">
              <i className="p-dot" />
              {connections.jev ? "Jev configured" : "Simulation ready"}
            </span>
            <span className="p-avatar">P</span>
          </div>
        </header>
        {storageBlocked && (
          <div className="p-banner p-error" role="alert">
            <span>
              {damagedStorage
                ? "Saved data could not be read. It has been preserved. Download it before resetting or restoring a backup."
                : "This workspace changed in another tab. Saving is paused to prevent overwriting it. Back up your current work, then reload."}
            </span>
            <button
              onClick={() => {
                const raw = localStorage.getItem(KEY) ?? "null";
                const url = URL.createObjectURL(
                  new Blob([raw], { type: "application/json" }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "jev-state-recovery.json";
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download saved data
            </button>
            {damagedStorage ? (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset saved workspace data? Download it first if you need a copy.",
                    )
                  ) {
                    cancelWork();
                    setLibrary({
                      projects: [],
                      conversations: [],
                      reports: [],
                    });
                    setProjectId(null);
                    setDraft(null);
                    setStorageBlocked(false);
                    setDamagedStorage(false);
                  }
                }}
              >
                Reset workspace
              </button>
            ) : (
              <button onClick={() => location.reload()}>
                Reload workspace
              </button>
            )}
          </div>
        )}
        <input
          ref={restoreRef}
          type="file"
          hidden
          accept="application/json,.json"
          aria-label="Restore workspace file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void restoreWorkspace(file);
            e.target.value = "";
          }}
        />
        {error && !modalKind && (
          <div className="p-banner p-error" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="p-toast" role="status">
            <Check size={16} />
            {notice}
          </div>
        )}
        <input
          ref={importRef}
          type="file"
          hidden
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importProject(file);
            e.target.value = "";
          }}
        />
        {page === "connections" ? (
          <div className="p-page">
            {connections.liveEnabled === false && (
              <div className="p-report-stale">
                This is a simulation-only demo. To use live providers, run your
                own copy locally or protect your deployment with an access code.{" "}
                <a href="https://github.com/priyankark/jev-state#quickstart">
                  Setup guide
                </a>
              </div>
            )}
            <div className="p-page-heading">
              <div>
                <span className="p-kicker">THE RIGHT TOOLS, CONNECTED</span>
                <h1>Connections</h1>
                <p>
                  Decisions from Jev. Replies from your agents. One
                  conversation.
                </p>
              </div>
              <button
                className="p-button"
                onClick={() => void refreshConnections()}
              >
                <Activity size={15} />
                Refresh status
              </button>
            </div>
            <div className="p-connection-grid">
              {[
                {
                  id: "jev",
                  name: "TypeSafe · Jev",
                  tag: "DECISION ENGINE",
                  description:
                    "Read the conversation and decide which state comes next. Typed choices and probabilities, visible at every turn.",
                  connected: connections.jev,
                  icon: <Zap size={26} />,
                },
                {
                  id: "openai",
                  name: "OpenAI",
                  tag: "AGENT CONNECTOR",
                  description:
                    "Generate natural replies with the Responses API. Full conversation history and the active state accompany every turn.",
                  connected: connections.openai,
                  icon: <Sparkles size={26} />,
                },
              ].map((c) => (
                <article className="p-connection-card" key={c.id}>
                  <div className={`p-connector-icon ${c.id}`}>{c.icon}</div>
                  <span className="p-kicker">{c.tag}</span>
                  <h2>{c.name}</h2>
                  <p>{c.description}</p>
                  <div className="p-connection-status">
                    <span
                      className={c.connected ? "p-badge p-green" : "p-badge"}
                    >
                      {c.connected ? "Configured" : "Not connected"}
                    </span>
                    <span>Server-side credentials</span>
                  </div>
                  <div className="p-card-actions">
                    <button
                      className="p-button p-primary"
                      disabled={!c.connected || !!connectionTest}
                      onClick={() => void testConnection(c.id)}
                    >
                      {connectionTest === c.id ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <Activity size={14} />
                      )}
                      Test connection
                    </button>
                    <button
                      className="p-button"
                      onClick={() => {
                        setSetupProvider(c.id);
                      }}
                    >
                      Set up <ArrowUpRight size={13} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="p-explainer">
              <ShieldCheck size={23} />
              <div>
                <h3>Your keys stay behind the scenes.</h3>
                <p>
                  Connections use server environment variables. Keys are never
                  included in project files, transcripts, browser storage, or
                  evaluation reports.
                </p>
              </div>
            </div>
            <div className="p-roadmap-note">
              <strong>About this connector</strong>
              <p>
                The OpenAI connector runs an agent instruction set through the
                Responses API. You choose the model and instructions per
                project. Tool execution, remote Agents SDK endpoints, and MCP
                connectors are not enabled in this version.
              </p>
            </div>
          </div>
        ) : !project ? (
          <div className="p-page">
            <div className="p-page-heading">
              <div>
                <span className="p-kicker">FROM AN IDEA TO A CONVERSATION</span>
                <h1>
                  Your projects
                  <span className="p-count">{library.projects.length}</span>
                </h1>
                <p>
                  Build stateful agents you can understand, test, and improve.
                </p>
              </div>
              <div className="p-actions">
                <button
                  className="p-button"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload size={15} /> Import
                </button>
                <button
                  className="p-button p-primary"
                  onClick={() => {
                    setTemplateId("blank");
                    setProjectName("");
                    setCreate(true);
                  }}
                >
                  <Plus size={16} />
                  New project
                </button>
              </div>
            </div>
            {library.projects.length ? (
              <div className="p-project-grid">
                {library.projects.map((p) => (
                  <button
                    className="p-project-card"
                    key={p.id}
                    onClick={() => openProject(p)}
                  >
                    <div>
                      <span className="p-project-icon">
                        <Workflow size={21} />
                      </span>
                      <span className="p-badge">YOUR PROJECT</span>
                    </div>
                    <h2>{p.name}</h2>
                    <p>
                      {p.description || "Your custom conversation workflow."}
                    </p>
                    <footer>
                      <span>
                        {p.states.length} states <i /> {p.cases.length} eval
                        cases
                      </span>
                      <ArrowRight size={17} />
                    </footer>
                  </button>
                ))}
              </div>
            ) : (
              <section className="p-welcome">
                <div>
                  <span className="p-badge p-green">
                    <Sparkles size={12} /> YOUR WORKSPACE STARTS HERE
                  </span>
                  <h2>
                    Give your conversations
                    <br />a sense of direction.
                  </h2>
                  <p>
                    Define the steps, connect an agent, and watch a conversation
                    find its way. Start from scratch or make an example your
                    own.
                  </p>
                  <button
                    className="p-button p-primary"
                    onClick={() => {
                      setTemplateId("blank");
                      setCreate(true);
                    }}
                  >
                    Create your first project <ArrowRight size={16} />
                  </button>
                  <span className="p-welcome-note">
                    No API key needed to explore in simulation.
                  </span>
                </div>
                <div className="p-hero-flow">
                  <div className="p-hero-message">
                    <MessageSquare size={17} /> “I’m ready. What’s next?”
                  </div>
                  <span className="p-flow-line" />
                  <div className="p-hero-decision">
                    <Zap size={18} />
                    <div>
                      <strong>Jev understands the moment</strong>
                      <span>Conversation + state → a typed decision</span>
                    </div>
                    <span className="p-dot" />
                  </div>
                  <div className="p-hero-branches" />
                  <div className="p-hero-outcomes">
                    <span>
                      <MessageSquare size={14} /> Ask a question
                    </span>
                    <span className="active">
                      <Check size={14} /> Take the next step
                    </span>
                  </div>
                  <div className="p-hero-caption">
                    <span />
                    Every transition, explained.
                  </div>
                </div>
              </section>
            )}
            <div className="p-section-heading">
              <div>
                <h2>
                  Start with an example{" "}
                  <span className="p-badge">TEMPLATES</span>
                </h2>
                <p>
                  These are sample workflows—not your projects. Copy one to
                  customize it.
                </p>
              </div>
              <span>
                3 starting points <ArrowDown size={13} />
              </span>
            </div>
            <div className="p-template-grid">
              {templates.map((t, i) => (
                <article className="p-template-card" key={t.id}>
                  <div className={`p-template-art art-${i}`}>
                    <Workflow size={31} />
                    <span>0{i + 1}</span>
                    <div className="p-mini-states">
                      <i />
                      <b />
                      <i />
                      <b />
                      <i />
                    </div>
                  </div>
                  <div className="p-template-body">
                    <span className="p-example-label">
                      EXAMPLE · EDITABLE COPY
                    </span>
                    <h3>{t.name}</h3>
                    <p>{t.description}</p>
                    <button onClick={() => startTemplate(t)}>
                      Use this example <ArrowRight size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="p-home-footer">
              <span>
                <Workflow size={14} /> Design. Converse. Evaluate. Repeat.
              </span>
              <span>Jev State · Product preview</span>
            </div>
          </div>
        ) : (
          <div className="p-project-page">
            <div className="p-project-heading">
              <div>
                <button className="p-back" onClick={() => navigate("projects")}>
                  <ArrowLeft size={13} />
                  All projects
                </button>
                <h1>
                  {project.name}
                  <span className="p-badge">YOUR PROJECT</span>
                </h1>
                <p>
                  {project.description ||
                    "A conversation workflow, built by you."}
                </p>
              </div>
              <div className="p-actions">
                <span className="p-version">v{project.version}</span>
                <button
                  className="p-button"
                  onClick={() =>
                    exportJson(
                      { schemaVersion: 2, project },
                      `${project.name.toLowerCase().replaceAll(" ", "-")}.json`,
                    )
                  }
                >
                  <Download size={14} />
                  Export project
                </button>
              </div>
            </div>
            <div className="p-project-tabs">
              <div>
                {(
                  [
                    {
                      id: "build",
                      label: "Build",
                      icon: <Workflow size={16} />,
                    },
                    {
                      id: "conversation",
                      label: "Converse",
                      icon: <MessageSquare size={16} />,
                    },
                    {
                      id: "evals",
                      label: "Evaluate",
                      icon: <Beaker size={16} />,
                    },
                  ] as const
                ).map((t) => (
                  <button
                    className={tab === t.id ? "active" : ""}
                    key={t.id}
                    onClick={() => {
                      if (dirty && t.id !== "build" && !saveProject()) return;
                      setTab(t.id);
                    }}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
              <span>
                {tab === "build"
                  ? "Shape the path your conversation takes."
                  : tab === "conversation"
                    ? "Try the experience, one message at a time."
                    : "Turn expectations into repeatable checks."}
              </span>
            </div>
            {tab === "build" && working ? (
              <div className="p-builder">
                <div className="p-save-bar">
                  <span>
                    {dirty ? "You have unsaved changes." : storageStatus}
                  </span>
                  <div>
                    <button
                      className="p-button"
                      disabled={!dirty}
                      onClick={() => {
                        setDraft(structuredClone(project));
                        setPast([]);
                        setFuture([]);
                        lastEdit.current = { key: "", at: 0 };
                        setError("");
                      }}
                    >
                      Discard
                    </button>
                    <button
                      className="p-button p-primary"
                      disabled={!dirty}
                      onClick={saveProject}
                    >
                      <Save size={14} />
                      Save workflow
                    </button>
                  </div>
                </div>
                <div className="p-builder-canvas">
                  {diagnostics.length > 0 && (
                    <details className="p-diagnostics">
                      <summary>
                        Workflow checks · {diagnostics.length}{" "}
                        {diagnostics.length === 1
                          ? "suggestion"
                          : "suggestions"}
                      </summary>
                      <ul>
                        {diagnostics.map((item, i) => (
                          <li key={i}>
                            {item.stateId ? (
                              <button
                                onClick={() => selectState(item.stateId!)}
                              >
                                {item.message}
                              </button>
                            ) : (
                              item.message
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="p-builder-bar">
                    <span>
                      <Workflow size={14} />
                      {working.states.length} states ·{" "}
                      {working.states.reduce(
                        (n, s) => n + s.transitions.length,
                        0,
                      )}{" "}
                      transitions
                    </span>
                    <div className="p-actions">
                      <button
                        className="p-button"
                        title="Undo (⌘/Ctrl Z)"
                        aria-label="Undo workflow change"
                        disabled={!past.length}
                        onClick={undo}
                      >
                        <Undo2 size={15} />
                      </button>
                      <button
                        className="p-button"
                        title="Redo (⌘/Ctrl Shift Z)"
                        aria-label="Redo workflow change"
                        disabled={!future.length}
                        onClick={redo}
                      >
                        <Redo2 size={15} />
                      </button>
                      <button
                        className="p-button"
                        disabled={working.states.length >= 12}
                        onClick={addState}
                      >
                        <Plus size={14} />
                        Add state
                      </button>
                    </div>
                  </div>
                  <div className="p-build-graph">
                    <ProjectGraph
                      project={working}
                      selected={selected?.id}
                      onSelect={selectState}
                      onPositions={(positions) =>
                        updateDraft({
                          states: working.states.map((s) => ({
                            ...s,
                            position: positions[s.id] ?? s.position,
                          })),
                        })
                      }
                      onConnect={(from, to) => {
                        const positions = layoutStates(working);
                        updateDraft({
                          states: working.states.map((s) => ({
                            ...s,
                            position: s.position ?? positions[s.id],
                            transitions:
                              s.id === from &&
                              !s.terminal &&
                              !s.transitions.includes(to)
                                ? [...s.transitions, to]
                                : s.transitions,
                          })),
                        });
                        notify(
                          "Transition connected. Jev uses the destination’s entry condition.",
                        );
                      }}
                      onRemoveTransition={(from, to) =>
                        updateDraft({
                          states: working.states.map((s) => ({
                            ...s,
                            transitions:
                              s.id === from
                                ? s.transitions.filter((t) => t !== to)
                                : s.transitions,
                          })),
                        })
                      }
                    />
                  </div>
                  <div className="p-canvas-help">
                    Drag states to arrange · connect the right dot to a left dot
                    · click a line to edit
                  </div>
                  <div className="p-state-list" aria-label="Workflow states">
                    {working.states.map((s) => (
                      <button
                        key={s.id}
                        className={s.id === selected?.id ? "active" : ""}
                        onClick={() => selectState(s.id)}
                      >
                        {s.terminal ? <Check size={13} /> : <Zap size={13} />}
                        {s.label || "Untitled state"}
                      </button>
                    ))}
                  </div>
                </div>
                <aside className="p-state-editor">
                  <div className="p-inspector-tabs">
                    <button
                      className={editorPanel === "state" ? "active" : ""}
                      onClick={() => setEditorPanel("state")}
                    >
                      State settings
                    </button>
                    <button
                      className={editorPanel === "workflow" ? "active" : ""}
                      onClick={() => setEditorPanel("workflow")}
                    >
                      Workflow settings
                    </button>
                  </div>
                  {editorPanel === "workflow" ? (
                    <div className="p-workflow-settings">
                      <div className="p-form-row">
                        <label>
                          Project name
                          <input
                            value={working.name}
                            onChange={(e) =>
                              updateDraft({ name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Initial state
                          <select
                            value={working.initial}
                            onChange={(e) =>
                              updateDraft({ initial: e.target.value })
                            }
                          >
                            {working.states.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label>
                        Short description
                        <input
                          value={working.description}
                          onChange={(e) =>
                            updateDraft({ description: e.target.value })
                          }
                          maxLength={300}
                        />
                      </label>
                      <label>
                        What should this workflow accomplish?
                        <textarea
                          value={working.instructions}
                          onChange={(e) =>
                            updateDraft({ instructions: e.target.value })
                          }
                          rows={3}
                        />
                      </label>
                      <div className="p-threshold">
                        <label>
                          Transition confidence{" "}
                          <strong>{percent(working.threshold)}</strong>
                        </label>
                        <input
                          aria-label="Transition confidence"
                          type="range"
                          min="0"
                          max="1"
                          step=".05"
                          value={working.threshold}
                          onChange={(e) =>
                            updateDraft({ threshold: Number(e.target.value) })
                          }
                        />
                        <small>
                          Below this threshold, stay in the current state and
                          gather more context. Tune this with your evals.
                        </small>
                      </div>
                      <div className="p-agent-setting">
                        <div>
                          <span className="p-connector-icon openai">
                            <Sparkles size={21} />
                          </span>
                          <div>
                            <strong>
                              Let an OpenAI agent write the replies
                            </strong>
                            <p>
                              Use conversation history and the current state to
                              respond naturally.
                            </p>
                          </div>
                          <input
                            aria-label="Enable OpenAI agent"
                            type="checkbox"
                            checked={working.agent.enabled}
                            onChange={(e) =>
                              updateDraft({
                                agent: {
                                  ...working.agent,
                                  enabled: e.target.checked,
                                },
                              })
                            }
                          />
                        </div>
                        {working.agent.enabled && (
                          <>
                            <label>
                              OpenAI model
                              <input
                                value={working.agent.model}
                                onChange={(e) =>
                                  updateDraft({
                                    agent: {
                                      ...working.agent,
                                      model: e.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                            <label>
                              Agent instructions
                              <textarea
                                rows={3}
                                value={working.agent.instructions}
                                onChange={(e) =>
                                  updateDraft({
                                    agent: {
                                      ...working.agent,
                                      instructions: e.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                            {!connections.openai && (
                              <p className="p-setup-note">
                                OpenAI needs a server key before live replies
                                work. Simulation still uses your written
                                replies.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    selected && (
                      <>
                        <div className="p-panel-heading">
                          <Settings2 size={16} />
                          {selected.label || "Untitled state"}
                          <span>{selected.id}</span>
                        </div>
                        {selected.id !== working.initial &&
                          !working.states.some((s) =>
                            s.transitions.includes(selected.id),
                          ) && (
                            <p className="p-state-warning">
                              No incoming transitions. Connect this state from
                              another state so conversations can reach it.
                            </p>
                          )}
                        {!selected.terminal &&
                          selected.transitions.length === 0 && (
                            <p className="p-state-warning">
                              This state has no outgoing transitions. Connect a
                              next step, or mark it as an end state.
                            </p>
                          )}
                        <label>
                          State name
                          <input
                            value={selected.label}
                            onChange={(e) =>
                              updateState({ label: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          When should we enter this state?
                          <textarea
                            rows={4}
                            placeholder="e.g. The customer asks about a charge or refund."
                            value={selected.description}
                            onChange={(e) =>
                              updateState({ description: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Reply in this state
                          <textarea
                            rows={4}
                            value={selected.reply}
                            onChange={(e) =>
                              updateState({ reply: e.target.value })
                            }
                          />
                        </label>
                        <p className="p-field-hint">
                          Used as the reply in simulation and when the OpenAI
                          agent is off. With an agent, this becomes response
                          guidance.
                        </p>
                        <label className="p-checkbox-label">
                          <input
                            type="checkbox"
                            checked={selected.terminal}
                            onChange={(e) =>
                              updateState({
                                terminal: e.target.checked,
                                transitions: e.target.checked
                                  ? []
                                  : selected.transitions,
                              })
                            }
                          />
                          End the conversation here
                        </label>
                        {!selected.terminal && (
                          <fieldset>
                            <legend>Can move to</legend>
                            {working.states
                              .filter((s) => s.id !== selected.id)
                              .map((s) => (
                                <label className="p-checkbox-label" key={s.id}>
                                  <input
                                    type="checkbox"
                                    checked={selected.transitions.includes(
                                      s.id,
                                    )}
                                    onChange={(e) =>
                                      updateState({
                                        transitions: e.target.checked
                                          ? [...selected.transitions, s.id]
                                          : selected.transitions.filter(
                                              (t) => t !== s.id,
                                            ),
                                      })
                                    }
                                  />
                                  {s.label}
                                </label>
                              ))}
                            <p className="p-field-hint">
                              Jev chooses only among these states. Staying put
                              is always allowed.
                            </p>
                          </fieldset>
                        )}
                        <details>
                          <summary>Simulation hints</summary>
                          <label>
                            Match these words (comma separated)
                            <input
                              key={
                                selected.id + ":" + selected.keywords.join(",")
                              }
                              defaultValue={selected.keywords.join(", ")}
                              onBlur={(e) =>
                                updateState({
                                  keywords: e.target.value
                                    .split(",")
                                    .map((v) => v.trim())
                                    .filter(Boolean),
                                })
                              }
                            />
                          </label>
                          <p className="p-field-hint">
                            Simple keyword fixtures for simulation. Live Jev
                            uses the state description and full conversation
                            instead.
                          </p>
                        </details>
                        <button
                          className="p-delete-state"
                          disabled={
                            selected.id === working.initial ||
                            working.states.length <= 2
                          }
                          title={
                            selected.id === working.initial
                              ? "Choose a different initial state in Workflow settings first"
                              : working.states.length <= 2
                                ? "A workflow needs at least two states"
                                : "Remove this state and its transitions. Undo is available."
                          }
                          onClick={deleteState}
                        >
                          <Trash2 size={14} />
                          Remove state
                        </button>
                      </>
                    )
                  )}
                </aside>
              </div>
            ) : tab === "conversation" ? (
              <div className="p-conversation-layout">
                <section className="p-chat">
                  <div className="p-chat-toolbar">
                    <span>
                      <MessageSquare size={16} />
                      Conversation playground
                    </span>
                    <button className="p-text-button" onClick={newConversation}>
                      <Plus size={14} />
                      New
                    </button>
                  </div>
                  {conversation &&
                    conversation.projectVersion !== project.version && (
                      <div className="p-report-stale">
                        Viewing workflow v{conversation.projectVersion}. Start a
                        new conversation to use v{project.version}.
                      </div>
                    )}
                  <div className="p-chat-options">
                    <div className="p-mode">
                      <button
                        disabled={busy || !!conversation}
                        className={mode === "mock" ? "active" : ""}
                        onClick={() => setMode("mock")}
                      >
                        Simulation
                      </button>
                      <button
                        disabled={busy || !!conversation || !connections.jev}
                        className={mode === "live" ? "active" : ""}
                        onClick={() => setMode("live")}
                      >
                        <i />
                        Live Jev
                      </button>
                    </div>
                    <span>
                      {(conversation?.mode ?? mode) === "mock"
                        ? "No API calls · synthetic behavior"
                        : project.agent.enabled
                          ? "Jev decisions + OpenAI replies"
                          : "Jev decisions + written replies"}
                    </span>
                  </div>
                  <div className="p-messages">
                    <div className="p-conversation-start">
                      <span className="p-logo-icon">
                        <Workflow size={18} />
                      </span>
                      <strong>{project.name}</strong>
                      <p>
                        {
                          conversationProject!.states.find(
                            (s) => s.id === project.initial,
                          )?.reply
                        }
                      </p>
                      <small>
                        Starting in{" "}
                        {
                          conversationProject!.states.find(
                            (s) => s.id === project.initial,
                          )?.label
                        }
                      </small>
                    </div>
                    {conversation?.messages.map((m, i) => (
                      <div className={`p-chat-item ${m.role}`} key={i}>
                        <span className="p-chat-avatar">
                          {m.role === "user" ? (
                            "You"
                          ) : project.agent.enabled &&
                            conversation.mode === "live" ? (
                            <Sparkles size={15} />
                          ) : (
                            <Workflow size={15} />
                          )}
                        </span>
                        <div>
                          <p>{m.content}</p>
                          {m.role === "assistant" && (
                            <button
                              className="p-turn-pill"
                              onClick={() => {
                                setInspectedTurn(Math.floor(i / 2));
                                setInspectedState(null);
                              }}
                            >
                              <GitBranch size={11} />
                              {
                                conversationProject!.states.find(
                                  (s) =>
                                    s.id ===
                                    conversation.turns[Math.floor(i / 2)]?.to,
                                )?.label
                              }
                              <span>
                                {percent(
                                  conversation.turns[Math.floor(i / 2)]
                                    ?.confidence ?? 0,
                                )}
                              </span>
                              <ChevronRight size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {busy && (
                      <div className="p-chat-thinking">
                        <Loader2 size={15} className="spin" />
                        Reading the conversation and deciding what’s next…
                      </div>
                    )}
                    <div ref={chatEnd} />
                  </div>
                  <div className="p-chat-compose">
                    {!activeState?.terminal &&
                      (conversation?.mode ?? mode) === "mock" && (
                        <div className="p-simulation-hints">
                          <small>
                            Simulation matches keywords. Try one below, or
                            switch to Live Jev for natural language.
                          </small>
                          <div>
                            {activeState?.transitions
                              .map((id) =>
                                conversationProject!.states.find(
                                  (s) => s.id === id,
                                ),
                              )
                              .filter((s) => !!s?.keywords.length)
                              .map((s) => (
                                <button
                                  type="button"
                                  key={s!.id}
                                  disabled={busy}
                                  onClick={() => {
                                    setText(s!.keywords[0]!);
                                    document
                                      .querySelector<HTMLTextAreaElement>(
                                        '[aria-label="Conversation message"]',
                                      )
                                      ?.focus();
                                  }}
                                >
                                  {s!.keywords[0]} <ArrowRight size={11} />{" "}
                                  {s!.label}
                                </button>
                              ))}
                          </div>
                          {activeState?.transitions.length === 0 && (
                            <small>
                              This state has no next step. Add a transition in
                              Build to continue the workflow.
                            </small>
                          )}
                          {!!activeState?.transitions.length &&
                            activeState.transitions.every(
                              (id) =>
                                !conversationProject!.states.find(
                                  (s) => s.id === id,
                                )?.keywords.length,
                            ) && (
                              <small>
                                Add simulation hints to the next states in Build
                                to test these transitions.
                              </small>
                            )}
                        </div>
                      )}
                    {activeState?.terminal ? (
                      <div className="p-chat-ended">
                        <Check size={18} />
                        <div>
                          <strong>Conversation complete</strong>
                          <span>Ended in {activeState.label}.</span>
                        </div>
                        <button onClick={newConversation}>
                          Start another <ArrowRight size={13} />
                        </button>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void send();
                        }}
                      >
                        <textarea
                          aria-label="Conversation message"
                          placeholder="Write a message to try your workflow…"
                          rows={2}
                          maxLength={4000}
                          value={text}
                          disabled={busy}
                          onChange={(e) => setText(e.target.value)}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !e.shiftKey &&
                              !e.nativeEvent.isComposing
                            ) {
                              e.preventDefault();
                              void send();
                            }
                          }}
                        />
                        {busy ? (
                          <button
                            type="button"
                            className="p-send"
                            aria-label="Cancel turn"
                            onClick={cancelWork}
                          >
                            <Square size={16} />
                          </button>
                        ) : (
                          <button
                            className="p-send"
                            disabled={
                              !text.trim() ||
                              !!(
                                conversation &&
                                conversation.messages.length >= 40
                              )
                            }
                            aria-label="Send message"
                          >
                            <ArrowUpRight size={20} />
                          </button>
                        )}
                      </form>
                    )}
                    <small>
                      {conversation && conversation.messages.length >= 40
                        ? "This conversation has reached 20 turns. Start a new conversation."
                        : "Enter to send · Shift + Enter for a new line. Cancelling leaves the conversation unchanged."}
                    </small>
                  </div>
                </section>
                <aside className="p-live-inspector">
                  <div className="p-panel-heading">
                    <Activity size={16} />
                    Conversation state
                    <span className="p-badge p-green">
                      {viewedTurn
                        ? "TURN " +
                          ((inspectedTurn ?? conversation!.turns.length - 1) +
                            1)
                        : "READY"}
                    </span>
                  </div>
                  <div className="p-live-graph">
                    <ProjectGraph
                      project={conversationProject!}
                      current={viewedTurn?.to ?? currentState}
                      selected={inspectedState ?? undefined}
                      transition={viewedTurn}
                      onSelect={setInspectedState}
                    />
                  </div>
                  {inspectedState && (
                    <div className="p-state-peek">
                      <button
                        aria-label="Close state inspection"
                        onClick={() => setInspectedState(null)}
                      >
                        <X size={14} />
                      </button>
                      <span className="p-kicker">INSPECTING STATE</span>
                      <h3>
                        {
                          conversationProject!.states.find(
                            (s) => s.id === inspectedState,
                          )?.label
                        }
                      </h3>
                      <p>
                        {conversationProject!.states.find(
                          (s) => s.id === inspectedState,
                        )?.description || "No entry condition yet."}
                      </p>
                      <small>
                        Next:{" "}
                        {conversationProject!.states
                          .find((s) => s.id === inspectedState)
                          ?.transitions.map(
                            (id) =>
                              conversationProject!.states.find(
                                (s) => s.id === id,
                              )?.label,
                          )
                          .join(", ") || "No outgoing transitions"}
                      </small>
                      <button
                        className="p-text-button"
                        onClick={() => {
                          selectState(inspectedState);
                          setTab("build");
                        }}
                      >
                        Edit in builder <ArrowRight size={13} />
                      </button>
                    </div>
                  )}
                  <div className="p-current-state">
                    <span className="p-kicker">
                      {inspectedTurn !== null
                        ? "RECORDED STATE"
                        : "CURRENT STATE"}
                    </span>
                    <h3>
                      {
                        conversationProject!.states.find(
                          (s) => s.id === (viewedTurn?.to ?? currentState),
                        )?.label
                      }
                    </h3>
                    <p>
                      {viewedTurn?.reason ??
                        "Send a message to see the first decision. Each turn uses the conversation so far."}
                    </p>
                  </div>
                  {viewedTurn && (
                    <div className="p-judgment">
                      <div>
                        <strong>Transition probabilities</strong>
                        <span>{percent(viewedTurn.confidence)} confidence</span>
                      </div>
                      {Object.entries(viewedTurn.probabilities).map(
                        ([key, value]) => (
                          <div className="p-probability" key={key}>
                            <span>
                              {key === "stay"
                                ? "Stay here"
                                : (conversationProject!.states.find(
                                    (s) => s.id === key,
                                  )?.label ?? key)}
                            </span>
                            <i>
                              <b style={{ width: percent(value) }} />
                            </i>
                            <code>{percent(value)}</code>
                          </div>
                        ),
                      )}
                      <div className="p-run-meta">
                        <span>{viewedTurn.model}</span>
                        <span>{prettyTime(viewedTurn.elapsedMs)}</span>
                        <span>{viewedTurn.inputTokens} input tokens</span>
                      </div>
                      <details>
                        <summary>Input, questions & result</summary>
                        <pre>{JSON.stringify(viewedTurn, null, 2)}</pre>
                      </details>
                      {inspectedTurn !== null && (
                        <button
                          className="p-text-button"
                          onClick={() => setInspectedTurn(null)}
                        >
                          Return to latest turn <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="p-session-history">
                    <div>
                      <strong>Recent conversations</strong>
                      {conversation && (
                        <button
                          title="Export conversation"
                          onClick={() =>
                            exportJson(
                              { project, conversation },
                              "conversation.json",
                            )
                          }
                        >
                          <Download size={14} />
                        </button>
                      )}
                    </div>
                    {library.conversations
                      .filter((c) => c.projectId === project.id)
                      .slice(0, 5)
                      .map((c) => (
                        <button
                          className={c.id === conversationId ? "active" : ""}
                          key={c.id}
                          onClick={() => {
                            cancelWork();
                            setConversationId(c.id);
                            setMode(c.mode);
                            setInspectedTurn(null);
                          }}
                        >
                          <History size={13} />
                          <span>
                            {c.messages[0]?.content.slice(0, 40)}
                            <small>
                              {c.turns.length} turns ·{" "}
                              {c.mode === "mock" ? "simulation" : "live"} · v
                              {c.projectVersion}
                            </small>
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    {!library.conversations.some(
                      (c) => c.projectId === project.id,
                    ) && <p>Your conversations will appear here.</p>}
                  </div>
                </aside>
              </div>
            ) : (
              <div className="p-evals">
                <div className="p-eval-heading">
                  <div>
                    <h2>Know what good looks like.</h2>
                    <p>
                      Test single messages or whole conversations against the
                      states you expect.
                    </p>
                  </div>
                  <div className="p-actions">
                    <div className="p-mode">
                      <button
                        disabled={evalBusy}
                        className={mode === "mock" ? "active" : ""}
                        onClick={() => setMode("mock")}
                      >
                        Simulation
                      </button>
                      <button
                        disabled={evalBusy || !connections.jev}
                        className={mode === "live" ? "active" : ""}
                        onClick={() => setMode("live")}
                      >
                        Live Jev
                      </button>
                    </div>
                    {evalBusy ? (
                      <button className="p-button" onClick={cancelWork}>
                        <Square size={13} />
                        Stop suite
                      </button>
                    ) : (
                      <button
                        className="p-button p-primary"
                        disabled={!project.cases.length}
                        onClick={() => void runEvals()}
                      >
                        <Play size={14} />
                        Run {project.cases.length} cases
                      </button>
                    )}
                  </div>
                </div>
                {evalBusy && (
                  <div className="p-eval-progress">
                    <Loader2 size={15} className="spin" />
                    {evalProgress}
                  </div>
                )}
                {reportStale && (
                  <div className="p-report-stale">
                    This report used an earlier workflow or test dataset. Run
                    the suite again to evaluate your current configuration.
                  </div>
                )}
                {report && !reportStale && (
                  <div className="p-coverage" aria-label="Evaluation coverage">
                    <strong>Path coverage</strong>
                    <span>
                      {
                        evaluationCoverage(project, report.results).states
                          .covered
                      }
                      /{project.states.length} states visited
                    </span>
                    <span>
                      {
                        evaluationCoverage(project, report.results).transitions
                          .covered
                      }
                      /
                      {
                        evaluationCoverage(project, report.results).transitions
                          .total
                      }{" "}
                      transitions taken
                    </span>
                    <small>
                      Coverage records exercised paths; it does not measure
                      model accuracy.
                    </small>
                  </div>
                )}
                <div className="p-eval-stats">
                  <div>
                    <span>PASS RATE</span>
                    <strong>
                      {report
                        ? percent(
                            report.results.filter((r) => r.passed).length /
                              report.results.length,
                          )
                        : "—"}
                    </strong>
                    <small>
                      {report
                        ? `${report.results.filter((r) => r.passed).length} of ${report.results.length} completed cases passed`
                        : "Run a suite to see results"}
                    </small>
                  </div>
                  <div>
                    <span>AVERAGE LATENCY</span>
                    <strong>
                      {report
                        ? prettyTime(
                            report.results.reduce(
                              (s, r) => s + r.elapsedMs,
                              0,
                            ) / report.results.length,
                          )
                        : "—"}
                    </strong>
                    <small>Per conversation test case</small>
                  </div>
                  <div>
                    <span>INPUT TOKENS</span>
                    <strong>
                      {report
                        ? report.results
                            .reduce((s, r) => s + r.inputTokens, 0)
                            .toLocaleString()
                        : "—"}
                    </strong>
                    <small>
                      {report?.mode === "mock"
                        ? "Simulation · no API usage"
                        : "Across the completed cases"}
                    </small>
                  </div>
                  <div>
                    <span>LAST RUN</span>
                    <strong className="p-report-mode">
                      {report
                        ? report.mode === "mock"
                          ? "Simulation"
                          : "Live Jev"
                        : "Not run"}
                    </strong>
                    <small>
                      {report
                        ? `Workflow v${report.projectVersion} · ${new Date(report.createdAt).toLocaleTimeString()}`
                        : "Results include the workflow version"}
                    </small>
                  </div>
                </div>
                <div className="p-case-table">
                  <div className="p-table-heading">
                    <h3>
                      Test cases <span>{project.cases.length}</span>
                    </h3>
                    <div>
                      {report && (
                        <button
                          className="p-text-button"
                          onClick={() =>
                            exportJson(report, "evaluation-report.json")
                          }
                        >
                          <Download size={13} />
                          Export results
                        </button>
                      )}
                      <button
                        className="p-button"
                        disabled={evalBusy || project.cases.length >= 30}
                        onClick={() =>
                          setCaseEditor({
                            id: crypto.randomUUID(),
                            name: "New case",
                            turns: [""],
                            expectedState: project.initial,
                            responseIncludes: "",
                          })
                        }
                      >
                        <Plus size={14} />
                        Add case
                      </button>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>CASE / CONVERSATION</th>
                        <th>EXPECTED STATE</th>
                        <th>LAST RESULT</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {project.cases.map((test) => {
                        const result = report?.results.find(
                          (r) => r.caseId === test.id,
                        );
                        return (
                          <tr key={test.id}>
                            <td>
                              <button
                                className="p-case-name"
                                disabled={evalBusy}
                                onClick={() =>
                                  setCaseEditor(structuredClone(test))
                                }
                              >
                                {test.name}
                              </button>
                              <p>{test.turns[0]}</p>
                              <span>
                                {test.turns.length}{" "}
                                {test.turns.length === 1 ? "turn" : "turns"}
                              </span>
                            </td>
                            <td>
                              <span className="p-state-tag">
                                {project.states.find(
                                  (s) => s.id === test.expectedState,
                                )?.label ?? test.expectedState}
                              </span>
                            </td>
                            <td>
                              {result ? (
                                <button
                                  className={`p-result ${result.passed ? "pass" : "fail"}`}
                                  onClick={() => setDetail(result)}
                                >
                                  {result.passed ? (
                                    <Check size={13} />
                                  ) : (
                                    <X size={13} />
                                  )}{" "}
                                  {result.error
                                    ? "Error"
                                    : result.passed
                                      ? "Passed"
                                      : "Failed"}{" "}
                                  <ChevronRight size={12} />
                                </button>
                              ) : (
                                <span className="p-not-run">Not run</span>
                              )}
                            </td>
                            <td>
                              <button
                                className="p-icon-button"
                                aria-label={`Delete ${test.name}`}
                                disabled={evalBusy}
                                onClick={() => {
                                  const next = {
                                    ...project,
                                    cases: project.cases.filter(
                                      (c) => c.id !== test.id,
                                    ),
                                  };
                                  setLibrary((prev) => ({
                                    ...prev,
                                    projects: prev.projects.map((p) =>
                                      p.id === next.id ? next : p,
                                    ),
                                  }));
                                  setDraft(next);
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!project.cases.length && (
                    <div className="p-empty-cases">
                      <Beaker size={30} />
                      <strong>Start with one expectation.</strong>
                      <p>
                        Add the messages a user might send and the state they
                        should reach.
                      </p>
                      <button
                        className="p-button"
                        onClick={() =>
                          setCaseEditor({
                            id: crypto.randomUUID(),
                            name: "My first test",
                            turns: [""],
                            expectedState: project.initial,
                            responseIncludes: "",
                          })
                        }
                      >
                        <Plus size={14} />
                        Add your first case
                      </button>
                    </div>
                  )}
                </div>
                {reports.length > 0 && (
                  <div className="p-report-history">
                    <h3>Evaluation history</h3>
                    {reports.slice(0, 8).map((r) => (
                      <button
                        className={r.id === report?.id ? "active" : ""}
                        key={r.id}
                        onClick={() => setReportId(r.id)}
                      >
                        <History size={15} />
                        <span>
                          {new Date(r.createdAt).toLocaleString()}
                          <small>
                            {r.mode === "mock" ? "Simulation" : "Live Jev"} ·
                            workflow v{r.projectVersion} · {r.results.length}{" "}
                            cases
                          </small>
                        </span>
                        <strong>
                          {r.results.filter((x) => x.passed).length}/
                          {r.results.length} passed
                        </strong>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  </div>
                )}
                <p className="p-eval-note">
                  Checks use exact final-state matches and optional reply text.
                  These are deterministic evals, not model-graded quality
                  scores. Simulation tests your workflow wiring; use Live Jev to
                  measure model behavior.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      {create && (
        <div
          className="p-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Create a project"
        >
          <form
            className="p-modal p-create-modal"
            onSubmit={(e) => {
              e.preventDefault();
              makeProject();
            }}
          >
            <button
              className="p-modal-close"
              type="button"
              aria-label="Close dialog"
              onClick={() => setCreate(false)}
            >
              <X size={18} />
            </button>
            <span className="p-logo-icon">
              <Plus size={23} />
            </span>
            <span className="p-kicker">MAKE SOMETHING YOURS</span>
            <h2>Create a project</h2>
            <p>
              A project holds your workflow, conversations, and evaluations.
            </p>
            <label>
              Project name
              <input
                autoFocus
                placeholder="e.g. My onboarding assistant"
                value={projectName}
                maxLength={80}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </label>
            <label>
              Start from
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="blank">Blank workflow — your own idea</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    Example: {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="p-modal-note">
              <Copy size={16} />
              <span>
                {templateId === "blank"
                  ? "You’ll get two editable states to start with."
                  : "This creates your own editable copy. The example remains unchanged."}
              </span>
            </div>
            <button className="p-button p-primary p-full">
              Create project <ArrowRight size={15} />
            </button>
          </form>
        </div>
      )}
      {caseEditor && project && (
        <div
          className="p-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Edit test case"
        >
          <form
            className="p-modal"
            onSubmit={(e) => {
              e.preventDefault();
              saveCase();
            }}
          >
            <button
              type="button"
              className="p-modal-close"
              aria-label="Close case editor"
              onClick={() => setCaseEditor(null)}
            >
              <X size={18} />
            </button>
            <span className="p-kicker">A REPEATABLE EXPECTATION</span>
            <h2>Edit test case</h2>
            {error && (
              <p role="alert" className="p-inline-error">
                {error}
              </p>
            )}
            <label>
              Case name
              <input
                value={caseEditor.name}
                onChange={(e) =>
                  setCaseEditor({ ...caseEditor, name: e.target.value })
                }
                required
              />
            </label>
            <label>
              User messages, one turn per line
              <textarea
                rows={5}
                value={caseEditor.turns.join("\n")}
                onChange={(e) =>
                  setCaseEditor({
                    ...caseEditor,
                    turns: e.target.value.split("\n"),
                  })
                }
                placeholder={"I was charged twice.\nThat is fixed now."}
                required
              />
            </label>
            <p className="p-field-hint">
              Up to 5 turns. The agent’s reply is added between each message,
              just like a real conversation.
            </p>
            <label>
              Expected final state
              <select
                value={caseEditor.expectedState}
                onChange={(e) =>
                  setCaseEditor({
                    ...caseEditor,
                    expectedState: e.target.value,
                  })
                }
              >
                {project.states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Final reply should contain <span>(optional)</span>
              <input
                value={caseEditor.responseIncludes}
                onChange={(e) =>
                  setCaseEditor({
                    ...caseEditor,
                    responseIncludes: e.target.value,
                  })
                }
              />
            </label>
            <button className="p-button p-primary p-full">
              Save test case <Check size={15} />
            </button>
          </form>
        </div>
      )}
      {detail && (
        <div
          className="p-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Evaluation result"
        >
          <div className="p-modal p-detail-modal">
            <button
              className="p-modal-close"
              aria-label="Close result"
              onClick={() => setDetail(null)}
            >
              <X size={18} />
            </button>
            <span className="p-kicker">EVALUATION RESULT</span>
            <h2>{detail.name}</h2>
            <span className={`p-result ${detail.passed ? "pass" : "fail"}`}>
              {detail.passed ? "Passed" : detail.error ? "Error" : "Failed"}
            </span>
            <p>
              Expected <strong>{detail.expected}</strong> · reached{" "}
              <strong>{detail.actual}</strong>
            </p>
            {detail.error && <p className="p-inline-error">{detail.error}</p>}
            {detail.turns.map((t, i) => (
              <div className="p-result-turn" key={t.id}>
                <strong>
                  Turn {i + 1} · {t.from} → {t.to}
                </strong>
                <p>{t.reply}</p>
                <small>{t.reason}</small>
              </div>
            ))}
            <details>
              <summary>Full result</summary>
              <pre>{JSON.stringify(detail, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
      {setupProvider && (
        <div
          className="p-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Connection setup"
        >
          <div className="p-modal">
            <button
              className="p-modal-close"
              aria-label="Close connection setup"
              onClick={() => setSetupProvider(null)}
            >
              <X size={18} />
            </button>
            <span className="p-kicker">
              CONNECT {setupProvider === "jev" ? "JEV" : "OPENAI"}
            </span>
            <h2>One key. Kept server-side.</h2>
            {error && (
              <p role="alert" className="p-inline-error">
                {error}
              </p>
            )}
            <>
              <p>
                Add your provider key to the server environment, then redeploy
                or restart the server.
              </p>
              <label>
                Environment variable
                <code className="p-env-name">
                  {setupProvider === "jev"
                    ? "TYPESAFE_API_KEY"
                    : "OPENAI_API_KEY"}
                </code>
              </label>
              <ol className="p-setup-steps">
                <li>Create an API key in your provider account.</li>
                <li>
                  On your own Vercel deployment, open the project’s{" "}
                  <strong>Settings → Environment Variables</strong> and add the
                  variable above and STUDIO_ACCESS_TOKEN to protect access.
                </li>
                <li>
                  Redeploy, then use <strong>Test connection</strong> here.
                </li>
              </ol>
              <p className="p-field-hint">
                For local development, add it to the ignored .env.local file.
                Never put keys in workflow instructions or project JSON.
              </p>
            </>
            <a
              className="p-button p-primary"
              href={
                setupProvider === "jev"
                  ? "https://console.typesafe.ai/keys"
                  : "https://platform.openai.com/api-keys"
              }
              target="_blank"
              rel="noreferrer"
            >
              Open provider dashboard <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
