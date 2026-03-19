import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

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
 * Get agent display info from agent-display.json (TenacitOS config, NOT openclaw.json)
 */
function getAgentDisplayInfo(agentId: string, agentConfig: any): { emoji: string; color: string; name: string } {
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
    // Read openclaw config
    const configPath = (process.env.OPENCLAW_DIR || "/root/.openclaw") + "/openclaw.json";
    const config = JSON.parse(readFileSync(configPath, "utf-8"));

    // Get agents from config
    const agents: Agent[] = config.agents.list.map((agent: any) => {
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
        const stat = require("fs").statSync(memoryFile);
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
          (a: any) => a.id === subagentId
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
        activeSessions: 0, // TODO: get from sessions API
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
