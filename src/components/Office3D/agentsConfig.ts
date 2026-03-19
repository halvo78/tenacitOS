/**
 * Office 3D — Agent Configuration
 *
 * This file defines the visual layout of agents in the 3D office.
 * Names, emojis and roles are loaded at runtime from the OpenClaw API
 * (/api/agents → openclaw.json), so you only need to set positions and colors here.
 *
 * Agent IDs correspond to workspace directory suffixes:
 *   id: "main"     → workspace/          (main agent)
 *   id: "studio"   → workspace-studio/
 *   id: "infra"    → workspace-infra/
 *   etc.
 *
 * Add, remove or reposition agents to match your own OpenClaw setup.
 */

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  position: [number, number, number]; // x, y, z
  color: string;
  role: string;
}

export const AGENTS: AgentConfig[] = [
  {
    id: "main",
    name: "Pulse",
    emoji: "⚡",
    position: [0, 0, 0], // Center — main desk
    color: "#FFD700",
    role: "Boss",
  },
  {
    id: "kael",
    name: "Kael",
    emoji: "🦉",
    position: [-4, 0, -3],
    color: "#8B4513",
    role: "Strategist",
  },
  {
    id: "jarvis",
    name: "Jarvis",
    emoji: "🔧",
    position: [4, 0, -3],
    color: "#4169E1",
    role: "DevOps",
  },
  {
    id: "gilfoil",
    name: "Gilfoil",
    emoji: "🛡️",
    position: [-4, 0, 3],
    color: "#DC143C",
    role: "Security",
  },
  {
    id: "strategist",
    name: "Strategist",
    emoji: "♟️",
    position: [4, 0, 3],
    color: "#2E8B57",
    role: "Strategy",
  },
  {
    id: "hormozi",
    name: "Hormozi",
    emoji: "💰",
    position: [0, 0, 6],
    color: "#FF8C00",
    role: "Revenue",
  },
];

export type AgentStatus = "idle" | "working" | "thinking" | "error";

export interface AgentState {
  id: string;
  status: AgentStatus;
  currentTask?: string;
  model?: string; // opus, sonnet, haiku
  tokensPerHour?: number;
  tasksInQueue?: number;
  uptime?: number; // days
}
