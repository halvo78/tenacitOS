import { NextResponse } from "next/server";
import { readFileSync, statSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || "E:\\.openclaw";
const OPENCLAW_CONFIG = join(OPENCLAW_DIR, "openclaw.json");

// Load agent display config from data/agent-display.json
function loadAgentDisplay(): Record<string, { emoji: string; color: string; name: string }> {
  try {
    const displayPath = join(process.cwd(), "data", "agent-display.json");
    if (existsSync(displayPath)) {
      return JSON.parse(readFileSync(displayPath, "utf-8"));
    }
  } catch {
    // Fall through to default
  }
  return {
    main: { emoji: "⚡", color: "#FFD700", name: "Pulse" },
  };
}

interface AgentSession {
  agentId: string;
  sessionId: string;
  label?: string;
  lastActivity?: string;
  createdAt?: string;
}

async function getAgentStatusFromGateway(): Promise<
  Record<string, { isActive: boolean; currentTask: string; lastSeen: number }>
> {
  try {
    const config = JSON.parse(readFileSync(OPENCLAW_CONFIG, "utf-8"));
    const gatewayToken = config.gateway?.auth?.token;
    const gatewayPort = config.gateway?.port || 19000;

    if (!gatewayToken) {
      console.warn("No gateway token found");
      return {};
    }

    const response = await fetch(`http://127.0.0.1:${gatewayPort}/api/sessions`, {
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
      },
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      console.warn("Gateway returned non-OK status:", response.status);
      return {};
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.warn("Gateway returned non-JSON response:", contentType);
      return {};
    }

    const sessions = (await response.json()) as AgentSession[];
    const agentStatus: Record<
      string,
      { isActive: boolean; currentTask: string; lastSeen: number }
    > = {};

    for (const session of sessions) {
      if (!session.agentId) continue;

      const lastActivity = session.lastActivity
        ? new Date(session.lastActivity).getTime()
        : 0;
      const now = Date.now();
      const minutesAgo = (now - lastActivity) / 1000 / 60;

      let status = "SLEEPING";
      let currentTask = "zzZ...";

      if (minutesAgo < 5) {
        status = "ACTIVE";
        currentTask = session.label || "Working on task...";
      } else if (minutesAgo < 30) {
        status = "IDLE";
        currentTask = session.label || "Idle...";
      }

      if (
        !agentStatus[session.agentId] ||
        lastActivity > agentStatus[session.agentId].lastSeen
      ) {
        agentStatus[session.agentId] = {
          isActive: status === "ACTIVE",
          currentTask: `${status}: ${currentTask}`,
          lastSeen: lastActivity,
        };
      }
    }

    return agentStatus;
  } catch (error) {
    console.warn("Failed to fetch from gateway:", error);
    return {};
  }
}

function getAgentStatusFromFiles(
  agentId: string,
  workspace: string
): { isActive: boolean; currentTask: string; lastSeen: number } {
  try {
    const today = new Date().toISOString().split("T")[0];
    const memoryFile = join(workspace, "memory", `${today}.md`);

    const stat = statSync(memoryFile);
    const lastSeen = stat.mtime.getTime();
    const minutesSinceUpdate = (Date.now() - lastSeen) / 1000 / 60;

    const content = readFileSync(memoryFile, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim());

    let currentTask = "Idle...";
    if (lines.length > 0) {
      const lastLine = lines
        .slice(-10)
        .reverse()
        .find((l) => l.length > 20 && !l.match(/^#+\s/));

      if (lastLine) {
        currentTask = lastLine.replace(/^[-*]\s*/, "").slice(0, 100);
        if (lastLine.length > 100) currentTask += "...";
      }
    }

    if (minutesSinceUpdate < 5) {
      return { isActive: true, currentTask: `ACTIVE: ${currentTask}`, lastSeen };
    } else if (minutesSinceUpdate < 30) {
      return { isActive: false, currentTask: `IDLE: ${currentTask}`, lastSeen };
    } else {
      return { isActive: false, currentTask: "SLEEPING: zzZ...", lastSeen };
    }
  } catch {
    return { isActive: false, currentTask: "SLEEPING: zzZ...", lastSeen: 0 };
  }
}

export async function GET() {
  try {
    const config = JSON.parse(readFileSync(OPENCLAW_CONFIG, "utf-8"));
    const agentDisplay = loadAgentDisplay();

    // Try gateway first, fallback to file-based
    const gatewayStatus = await getAgentStatusFromGateway();

    const agents = config.agents.list.map((agent: { id: string; name?: string; workspace: string }) => {
      const display = agentDisplay[agent.id] || {
        emoji: "🤖",
        color: "#666",
        name: agent.name || agent.id,
      };

      // Get status from gateway, or fallback to files
      let status = gatewayStatus[agent.id];
      if (!status) {
        status = getAgentStatusFromFiles(agent.id, agent.workspace);
      }

      return {
        id: agent.id,
        name: display.name,
        emoji: display.emoji,
        color: display.color,
        role: agent.name || "Agent",
        currentTask: status.currentTask,
        isActive: status.isActive,
      };
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Error getting office data:", error);
    return NextResponse.json(
      { error: "Failed to load office data" },
      { status: 500 }
    );
  }
}
