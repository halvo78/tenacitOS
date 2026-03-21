import { NextResponse } from "next/server";
import { readFileSync, statSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

interface Agent {
  id: string;
  name?: string;
  emoji: string;
  color: string;
  model: string;
  workspace: string;
  dmPolicy?: string;
  allowAgents?: string[];
  allowAgentsDetails?: Array<{
    id: string;
    name: string;
    emoji: string;
    color: string;
  }>;
  botToken?: string;
  status: "online" | "offline";
  lastActivity?: string;
  activeSessions: number;
}

// Agent display config loaded from TenacitOS's own data file (NOT openclaw.json — schema doesn't support ui keys)
let AGENT_DISPLAY: Record<string, { emoji: string; color: string; name: string }> = {};
try {
  AGENT_DISPLAY = JSON.parse(readFileSync(join(__dirname, '../../../../data/agent-display.json'), 'utf-8'));
} catch {
  try {
    AGENT_DISPLAY = JSON.parse(readFileSync(join(process.cwd(), 'data/agent-display.json'), 'utf-8'));
  } catch {
    // Fall back to empty — all agents get default emoji
  }
}

/**
 * Count active sessions per agent by querying the gateway or CLI.
 * Returns a map of agentId → session count.
 * Never throws — returns empty map on any failure.
 */
interface OpenClawConfig {
  gateway?: { auth?: { token?: string }; port?: number };
  agents: { list: Array<{ id: string; name?: string; model?: { primary?: string }; workspace: string; subagents?: { allowAgents?: string[] } }>; defaults: { model: { primary: string } } };
  channels?: { telegram?: { accounts?: Record<string, { botToken?: string; dmPolicy?: string }>; dmPolicy?: string } };
}

async function getActiveSessionCounts(config: OpenClawConfig): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    let sessions: Array<{ key: string }> | null = null;

    // Try gateway first
    const token = config.gateway?.auth?.token;
    const port = config.gateway?.port || 19000;
    if (token) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/sessions`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const body = await res.json();
          sessions = Array.isArray(body) ? body : body?.sessions ?? null;
        }
      } catch {
        // Gateway unavailable, fall through
      }
    }

    // Fallback to CLI
    if (!sessions) {
      try {
        const out = execSync("openclaw sessions list --json 2>nul", {
          timeout: 8000,
          encoding: "utf-8",
        });
        const parsed = JSON.parse(out);
        sessions = parsed?.sessions ?? parsed ?? [];
      } catch {
        return counts;
      }
    }

    // Count sessions per agent ID (key format: agent:<agentId>:<type>[...])
    for (const s of sessions ?? []) {
      const parts = (s.key ?? "").split(":");
      // Skip run-entry duplicates and unknown keys
      if (parts.length < 3 || parts.includes("run")) continue;
      const agentId = parts[1];
      counts[agentId] = (counts[agentId] ?? 0) + 1;
    }
  } catch {
    // Never propagate
  }
  return counts;
}

/**
 * Get agent display info from agent-display.json (TenacitOS config, NOT openclaw.json)
 */
function getAgentDisplayInfo(agentId: string, agentConfig: { name?: string } | null): { emoji: string; color: string; name: string } {
  const display = AGENT_DISPLAY[agentId];
  const configName = agentConfig?.name;

  return {
    emoji: display?.emoji || "🤖",
    color: display?.color || "#666666",
    name: configName || display?.name || agentId,
  };
}

export async function GET() {
  try {
    // Read openclaw config (strip BOM if present)
    const configPath = (process.env.OPENCLAW_DIR || "E:\\.openclaw") + "/openclaw.json";
    let raw = readFileSync(configPath, "utf-8");
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const config = JSON.parse(raw) as OpenClawConfig;

    // Get active session counts (best-effort, won't block on failure)
    const sessionCounts = await getActiveSessionCounts(config);

    // Get agents from config
    const agents: Agent[] = config.agents.list.map((agent) => {
      const agentInfo = getAgentDisplayInfo(agent.id, agent);

      // Get telegram account info
      const telegramAccount =
        config.channels?.telegram?.accounts?.[agent.id];
      const botToken = telegramAccount?.botToken;

      // Check if agent has recent activity
      const memoryPath = join(agent.workspace, "memory");
      let lastActivity = undefined;
      let status: "online" | "offline" = "offline";

      try {
        const today = new Date().toISOString().split("T")[0];
        const memoryFile = join(memoryPath, `${today}.md`);
        const stat = statSync(memoryFile);
        lastActivity = stat.mtime.toISOString();
        // Consider online if activity within last 5 minutes
        status =
          Date.now() - stat.mtime.getTime() < 5 * 60 * 1000
            ? "online"
            : "offline";
      } catch (e) {
        // No recent activity
      }

      // Get details of allowed subagents
      const allowAgents = agent.subagents?.allowAgents || [];
      const allowAgentsDetails = allowAgents.map((subagentId: string) => {
        // Find subagent in config
        const subagentConfig = config.agents.list.find(
          (a: { id: string }) => a.id === subagentId
        );
        if (subagentConfig) {
          const subagentInfo = getAgentDisplayInfo(subagentId, subagentConfig);
          return {
            id: subagentId,
            name: subagentConfig.name || subagentInfo.name,
            emoji: subagentInfo.emoji,
            color: subagentInfo.color,
          };
        }
        // Fallback if subagent not found in config
        const fallbackInfo = getAgentDisplayInfo(subagentId, null);
        return {
          id: subagentId,
          name: fallbackInfo.name,
          emoji: fallbackInfo.emoji,
          color: fallbackInfo.color,
        };
      });

      return {
        id: agent.id,
        name: agent.name || agentInfo.name,
        emoji: agentInfo.emoji,
        color: agentInfo.color,
        model:
          agent.model?.primary || config.agents.defaults.model.primary,
        workspace: agent.workspace,
        dmPolicy:
          telegramAccount?.dmPolicy ||
          config.channels?.telegram?.dmPolicy ||
          "pairing",
        allowAgents,
        allowAgentsDetails,
        botToken: botToken ? "configured" : undefined,
        status,
        lastActivity,
        activeSessions: sessionCounts[agent.id] ?? 0,
      };
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Error reading agents:", error);
    return NextResponse.json(
      { error: "Failed to load agents" },
      { status: 500 }
    );
  }
}
