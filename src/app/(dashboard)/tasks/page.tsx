"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, Trash2, GripVertical, Filter, X, ChevronDown } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  emoji: string;
  color: string;
  name: string;
}

type Priority = "P0" | "P1" | "P2" | "P3";
type ColumnId = "todo" | "in-progress" | "done" | "blocked";

interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  agentId: string;
  column: ColumnId;
  createdAt: string;
}

const COLUMNS: { id: ColumnId; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "var(--text-secondary)" },
  { id: "in-progress", label: "In Progress", color: "var(--info)" },
  { id: "done", label: "Done", color: "var(--positive)" },
  { id: "blocked", label: "Blocked", color: "var(--negative)" },
];

const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string }> = {
  P0: { label: "P0 Critical", color: "#FF453A", bg: "rgba(255,69,58,0.15)" },
  P1: { label: "P1 High", color: "#FF9F0A", bg: "rgba(255,159,10,0.15)" },
  P2: { label: "P2 Medium", color: "#FFD60A", bg: "rgba(255,214,10,0.15)" },
  P3: { label: "P3 Low", color: "#8A8A8A", bg: "rgba(138,138,138,0.15)" },
};

const STORAGE_KEY = "tenacitos-tasks";

// ── Helpers ────────────────────────────────────────────────────────────

function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Component ──────────────────────────────────────────────────────────

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filterAgent, setFilterAgent] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Drag state
  const dragItem = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColumnId | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPriority, setFormPriority] = useState<Priority>("P2");
  const [formAgent, setFormAgent] = useState("");

  // Load agents from JSON
  useEffect(() => {
    fetch("/data/agent-display.json")
      .then((r) => r.json())
      .then((data: Record<string, Omit<Agent, "id">>) => {
        const list = Object.entries(data).map(([id, a]) => ({ id, ...a }));
        setAgents(list);
        if (list.length > 0) setFormAgent(list[0].id);
      })
      .catch(() => {});
  }, []);

  // Tasks initialized from localStorage via useState initializer above

  // Persist on change
  const persist = useCallback((next: Task[]) => {
    setTasks(next);
    saveTasks(next);
  }, []);

  // ── CRUD ──

  function addTask() {
    if (!formTitle.trim()) return;
    const task: Task = {
      id: uid(),
      title: formTitle.trim(),
      description: formDesc.trim(),
      priority: formPriority,
      agentId: formAgent,
      column: "todo",
      createdAt: new Date().toISOString(),
    };
    persist([...tasks, task]);
    setFormTitle("");
    setFormDesc("");
    setFormPriority("P2");
    setShowForm(false);
  }

  function deleteTask(id: string) {
    persist(tasks.filter((t) => t.id !== id));
    setDeleteConfirm(null);
  }

  // ── Drag & Drop ──

  function onDragStart(e: React.DragEvent, taskId: string) {
    dragItem.current = taskId;
    e.dataTransfer.effectAllowed = "move";
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  }

  function onDragEnd(e: React.DragEvent) {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    dragItem.current = null;
    setDragOverCol(null);
  }

  function onDragOver(e: React.DragEvent, colId: ColumnId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colId);
  }

  function onDragLeave() {
    setDragOverCol(null);
  }

  function onDrop(e: React.DragEvent, colId: ColumnId) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = dragItem.current;
    if (!taskId) return;
    persist(tasks.map((t) => (t.id === taskId ? { ...t, column: colId } : t)));
  }

  // ── Filter ──

  const filtered = tasks.filter((t) => {
    if (filterAgent && t.agentId !== filterAgent) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    return true;
  });

  function getAgent(id: string): Agent | undefined {
    return agents.find((a) => a.id === id);
  }

  const activeFilterCount = (filterAgent ? 1 : 0) + (filterPriority ? 1 : 0);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-8" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div className="mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold mb-1"
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--text-primary)",
                letterSpacing: "-1.5px",
              }}
            >
              Task Board
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
              Kanban task management across agents
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: activeFilterCount > 0 ? "var(--accent-soft)" : "var(--surface)",
                border: `1px solid ${activeFilterCount > 0 ? "var(--accent)" : "var(--border)"}`,
                color: activeFilterCount > 0 ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span
                  className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Add task */}
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: "var(--accent)",
                color: "#fff",
              }}
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div
            className="mt-3 p-3 rounded-xl flex flex-wrap items-center gap-3"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Agent
              </label>
              <div className="relative">
                <select
                  value={filterAgent}
                  onChange={(e) => setFilterAgent(e.target.value)}
                  className="appearance-none pl-3 pr-7 py-1.5 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                >
                  <option value="">All Agents</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.emoji} {a.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Priority
              </label>
              <div className="relative">
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="appearance-none pl-3 pr-7 py-1.5 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                >
                  <option value="">All Priorities</option>
                  {(["P0", "P1", "P2", "P3"] as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
              </div>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setFilterAgent("");
                  setFilterPriority("");
                }}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all"
                style={{ color: "var(--accent)" }}
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        )}

        {/* Add task form */}
        {showForm && (
          <div
            className="mt-3 p-4 rounded-xl"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <input
                type="text"
                placeholder="Task title..."
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                autoFocus
                className="px-3 py-2 rounded-lg text-sm w-full"
                style={{
                  backgroundColor: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm w-full"
                style={{
                  backgroundColor: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value as Priority)}
                  className="appearance-none pl-3 pr-7 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                >
                  {(["P0", "P1", "P2", "P3"] as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
              </div>
              <div className="relative">
                <select
                  value={formAgent}
                  onChange={(e) => setFormAgent(e.target.value)}
                  className="appearance-none pl-3 pr-7 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.emoji} {a.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={addTask}
                  disabled={!formTitle.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: formTitle.trim() ? "var(--accent)" : "var(--surface-elevated)",
                    color: formTitle.trim() ? "#fff" : "var(--text-muted)",
                    cursor: formTitle.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Create Task
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        {COLUMNS.map((col) => {
          const colTasks = filtered.filter((t) => t.column === col.id);
          const isDragOver = dragOverCol === col.id;

          return (
            <div
              key={col.id}
              className="rounded-xl flex flex-col"
              style={{
                backgroundColor: "var(--surface)",
                border: `1px solid ${isDragOver ? col.color : "var(--border)"}`,
                transition: "border-color 0.15s ease",
                minHeight: "400px",
              }}
              onDragOver={(e) => onDragOver(e, col.id)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, col.id)}
            >
              {/* Column header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: col.color }}
                  />
                  <h3
                    className="text-sm font-semibold"
                    style={{
                      fontFamily: "var(--font-heading)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {col.label}
                  </h3>
                </div>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    color: "var(--text-muted)",
                  }}
                >
                  {colTasks.length}
                </span>
              </div>

              {/* Task cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
                {colTasks.length === 0 && (
                  <div
                    className="flex items-center justify-center h-24 rounded-lg text-xs"
                    style={{
                      border: "1px dashed var(--border)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {isDragOver ? "Drop here" : "No tasks"}
                  </div>
                )}

                {colTasks.map((task) => {
                  const agent = getAgent(task.agentId);
                  const pri = PRIORITY_META[task.priority];
                  const isConfirming = deleteConfirm === task.id;

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, task.id)}
                      onDragEnd={onDragEnd}
                      className="rounded-lg p-3 transition-all hover:scale-[1.01]"
                      style={{
                        backgroundColor: "var(--surface-elevated)",
                        border: "1px solid var(--border)",
                        cursor: "grab",
                      }}
                    >
                      {/* Top row: grip + priority + delete */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <GripVertical
                            className="w-3.5 h-3.5 flex-shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          />
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{
                              color: pri.color,
                              backgroundColor: pri.bg,
                            }}
                          >
                            {task.priority}
                          </span>
                        </div>

                        {isConfirming ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{
                                backgroundColor: "var(--negative-soft)",
                                color: "var(--negative)",
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(task.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--surface-hover)]"
                            style={{ color: "var(--text-muted)" }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.opacity = "1";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.opacity = "0.3";
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Title */}
                      <div
                        className="text-sm font-medium mb-1.5 leading-snug"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {task.title}
                      </div>

                      {/* Description */}
                      {task.description && (
                        <div
                          className="text-xs mb-2 leading-relaxed line-clamp-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {task.description}
                        </div>
                      )}

                      {/* Footer: agent + date */}
                      <div className="flex items-center justify-between">
                        {agent ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">{agent.emoji}</span>
                            <span
                              className="text-[11px] font-medium"
                              style={{ color: agent.color }}
                            >
                              {agent.name}
                            </span>
                          </div>
                        ) : (
                          <span
                            className="text-[11px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Unassigned
                          </span>
                        )}
                        <span
                          className="text-[10px] font-mono"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {new Date(task.createdAt).toLocaleDateString("en-NZ", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
