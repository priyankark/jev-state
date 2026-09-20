import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  Panel,
  useNodesState,
  useUpdateNodeInternals,
  applyNodeChanges,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Check,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import type {
  Project,
  WorkflowState,
} from "../../../packages/core/src/studio.js";

type Point = { x: number; y: number };
type StateNode = Node<{
  state: WorkflowState;
  active: boolean;
  initial: boolean;
  editable: boolean;
}>;

export function layoutStates(project: Project): Record<string, Point> {
  const levels = new Map([[project.initial, 0]]),
    queue = [project.initial];
  while (queue.length) {
    const id = queue.shift()!;
    for (const to of project.states.find((s) => s.id === id)?.transitions ??
      []) {
      if (!levels.has(to)) {
        levels.set(to, levels.get(id)! + 1);
        queue.push(to);
      }
    }
  }
  const last = Math.max(1, ...levels.values());
  const columns = new Map<number, string[]>();
  for (const s of project.states) {
    const level = !levels.has(s.id)
      ? last + 1
      : s.terminal && s.id !== project.initial
        ? last
        : levels.get(s.id)!;
    columns.set(level, [...(columns.get(level) ?? []), s.id]);
  }
  const positions: Record<string, Point> = {};
  for (const [col, ids] of columns)
    ids.forEach((id, row) => {
      positions[id] = { x: col * 340, y: (row - (ids.length - 1) / 2) * 190 };
    });
  return positions;
}

function FlowState({ id, data, selected }: NodeProps<StateNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, data.state.terminal, updateNodeInternals]);
  return (
    <div
      className={`p-flow-state ${data.active ? "is-active" : ""} ${selected ? "is-selected" : ""} ${data.state.terminal ? "is-terminal" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        title={`Connect to ${data.state.label}`}
        aria-label={`Connect to ${data.state.label}`}
      />
      <div className="p-node-heading">
        <span className="p-node-symbol">
          {data.state.terminal ? <Check size={16} /> : <Zap size={16} />}
        </span>
        <small>
          {data.initial ? "START" : data.state.terminal ? "END STATE" : "STATE"}
        </small>
        {data.active && <span className="p-node-current">CURRENT</span>}
      </div>
      <strong>{data.state.label || "Untitled state"}</strong>
      <p>{data.state.description || "Describe when to enter this state"}</p>
      {!data.state.terminal && (
        <Handle
          type="source"
          position={Position.Right}
          title={`Connect from ${data.state.label}`}
          aria-label={`Connect from ${data.state.label}`}
        />
      )}
    </div>
  );
}
const nodeTypes = { state: FlowState };

export function ProjectGraph({
  project,
  current,
  selected,
  transition,
  onSelect,
  onPositions,
  onConnect,
  onRemoveTransition,
}: {
  project: Project;
  current?: string | undefined;
  selected?: string | undefined;
  transition?: { from: string; to: string } | undefined;
  onSelect: (id: string) => void;
  onPositions?: (positions: Record<string, Point>) => void;
  onConnect?: (from: string, to: string) => void;
  onRemoveTransition?: (from: string, to: string) => void;
}) {
  const editable = !!onPositions;
  const [expanded, setExpanded] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [instance, setInstance] = useState<ReactFlowInstance<StateNode> | null>(
    null,
  );
  // Editing conditions or checkboxes must not silently rearrange the canvas.
  // Explicit Auto layout recomputes positions using the latest transitions.
  const layout = useMemo(() => layoutStates(project), [project.id]);
  const derived = useMemo<StateNode[]>(
    () =>
      project.states.map((s) => ({
        id: s.id,
        type: "state",
        position: s.position ?? layout[s.id]!,
        selected: s.id === selected,
        ariaLabel: `${s.label}${s.id === project.initial ? ", start state" : s.terminal ? ", end state" : ""}`,
        data: {
          state: s,
          initial: s.id === project.initial,
          active: s.id === current,
          editable,
        },
      })),
    [project, selected, current, editable, layout],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<StateNode>(derived);
  useEffect(() => {
    setNodes(derived);
  }, [derived, setNodes]);
  const edges = project.states.flatMap((s) =>
    s.transitions.map((to) => {
      const id = `${s.id}->${to}`;
      const active = transition?.from === s.id && transition.to === to;
      const emphasized = active || selectedEdge === id || hoveredEdge === id;
      const label = `${s.label} → ${project.states.find((t) => t.id === to)?.label ?? to}`;
      return {
        id,
        source: s.id,
        target: to,
        type: "smoothstep",
        selected: selectedEdge === id,
        ariaLabel: `${s.label} to ${project.states.find((t) => t.id === to)?.label ?? to}`,
        animated: active,
        interactionWidth: 24,
        label: selectedEdge === id || hoveredEdge === id ? label : undefined,
        labelStyle: { fontSize: 11, fill: "#25432f", fontWeight: 600 },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.96 },
        zIndex: emphasized ? 10 : 0,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: emphasized ? "#315640" : "#8c9e8c",
        },
        style: {
          stroke: emphasized ? "#315640" : "#8c9e8c",
          strokeWidth: emphasized ? 2.5 : 1.6,
        },
      };
    }),
  );
  const edge = edges.find((e) => e.id === selectedEdge);
  const from = project.states.find((s) => s.id === edge?.source),
    to = project.states.find((s) => s.id === edge?.target);
  const structure = project.states.map((s) => s.id).join("|");
  const previousStructure = useRef(structure);
  const previousExpanded = useRef(expanded);
  const dragging = useRef(false);
  useEffect(() => {
    if (structure === previousStructure.current) return;
    previousStructure.current = structure;
    const timer = setTimeout(
      () =>
        void instance?.fitView({ padding: 0.15, duration: 250, maxZoom: 1 }),
      80,
    );
    return () => clearTimeout(timer);
  }, [structure, instance]);
  useEffect(() => {
    if (previousExpanded.current === expanded) return;
    previousExpanded.current = expanded;
    const timer = setTimeout(
      () =>
        void instance?.fitView({ padding: 0.15, duration: 200, maxZoom: 1 }),
      80,
    );
    return () => clearTimeout(timer);
  }, [expanded, instance]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [expanded]);
  return (
    <div
      className={`p-graph ${expanded ? "p-graph-expanded" : ""}`}
      aria-label={editable ? "Workflow canvas" : "Conversation graph"}
    >
      <ReactFlow<StateNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setInstance}
        onNodesChange={(changes) => {
          onNodesChange(changes);
          const selection = changes.find(
            (c) => c.type === "select" && c.selected,
          );
          if (selection && "id" in selection && selection.id !== selected)
            onSelect(selection.id);
          if (
            !dragging.current &&
            changes.some((c) => c.type === "position" && c.position)
          ) {
            const updated = applyNodeChanges(changes, nodes);
            onPositions?.(
              Object.fromEntries(updated.map((n) => [n.id, n.position])),
            );
          }
        }}
        onEdgesChange={(changes) => {
          for (const c of changes)
            if (c.type === "select" && c.selected) setSelectedEdge(c.id);
        }}
        onNodeClick={(_, node) => {
          setSelectedEdge(null);
          onSelect(node.id);
          if (expanded) setExpanded(false);
        }}
        onNodeDragStart={(_, node) => {
          dragging.current = true;
          setSelectedEdge(null);
          onSelect(node.id);
        }}
        onNodeDragStop={(_, node) => {
          dragging.current = false;
          // Persist all fallback positions too, so editing connections cannot reshuffle the other nodes.
          onPositions?.(
            Object.fromEntries(
              nodes.map((n) => [
                n.id,
                n.id === node.id ? node.position : n.position,
              ]),
            ),
          );
        }}
        onEdgeClick={(_, edge) => setSelectedEdge(edge.id)}
        onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.id)}
        onEdgeMouseLeave={() => setHoveredEdge(null)}
        onPaneClick={() => setSelectedEdge(null)}
        onConnect={(c) => {
          if (c.source && c.target) onConnect?.(c.source, c.target);
        }}
        isValidConnection={(c) =>
          !!c.source &&
          !!c.target &&
          c.source !== c.target &&
          !project.states.find((s) => s.id === c.source)?.terminal &&
          !project.states
            .find((s) => s.id === c.source)
            ?.transitions.includes(c.target)
        }
        nodesDraggable={editable}
        nodesConnectable={editable}
        edgesReconnectable={false}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        zoomOnDoubleClick={false}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#d5dfd2" gap={22} />
        <Controls showInteractive={false} position="bottom-left" />
        <Panel position="top-right" className="p-graph-tools">
          {editable && (
            <button
              className="p-button"
              onClick={() => {
                const positions = layoutStates(project);
                setNodes((ns) =>
                  ns.map((n) => ({ ...n, position: positions[n.id]! })),
                );
                onPositions?.(positions);
                setTimeout(
                  () =>
                    void instance?.fitView({
                      padding: 0.15,
                      duration: 250,
                      maxZoom: 1,
                    }),
                  80,
                );
              }}
            >
              <LayoutGrid size={14} />
              Auto layout
            </button>
          )}
          <button
            className="p-button"
            aria-label={expanded ? "Collapse graph" : "Expand graph"}
            title={expanded ? "Collapse graph (Esc)" : "Expand graph"}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </Panel>
        {edge && from && to && (
          <Panel position="bottom-center" className="p-edge-editor">
            <button
              className="p-edge-close"
              aria-label="Close transition"
              onClick={() => setSelectedEdge(null)}
            >
              <X size={14} />
            </button>
            <strong>
              {from.label} → {to.label}
            </strong>
            <p>
              {to.description ||
                "Add an entry condition to the destination state."}
            </p>
            <div>
              <button
                className="p-button"
                onClick={() => {
                  onSelect(to.id);
                  setExpanded(false);
                  setSelectedEdge(null);
                }}
              >
                {editable ? "Edit destination" : "Inspect destination"}
              </button>
              {editable && (
                <button
                  className="p-button"
                  onClick={() => {
                    onRemoveTransition?.(from.id, to.id);
                    setSelectedEdge(null);
                  }}
                >
                  <Trash2 size={13} />
                  Remove transition
                </button>
              )}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
