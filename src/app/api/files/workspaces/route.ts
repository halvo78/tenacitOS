import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || 'E:\\.openclaw';
const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, 'openclaw.json');

interface Workspace {
  id: string;
  name: string;
  emoji: string;
  path: string;
  agentName?: string;
}

function getAgentInfo(workspacePath: string): { name: string; emoji: string } | null {
  const identityPath = path.join(workspacePath, 'IDENTITY.md');

  if (!fs.existsSync(identityPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(identityPath, 'utf-8');

    const nameMatch = content.match(/- \*\*Name:\*\* (.+)/);
    const emojiMatch = content.match(/- \*\*Emoji:\*\* (.+)/);

    let emoji = '📁';
    if (emojiMatch) {
      const emojiText = emojiMatch[1].trim();
      emoji = emojiText.split(' ')[0];
    }

    return {
      name: nameMatch ? nameMatch[1].trim() : '',
      emoji,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const workspaces: Workspace[] = [];

    // Read agent list from openclaw.json config
    let agentList: Array<{ id: string; name?: string; workspace: string }> = [];
    try {
      const configRaw = fs.readFileSync(OPENCLAW_CONFIG, 'utf-8');
      const config = JSON.parse(configRaw);
      agentList = config.agents?.list || [];
    } catch (err) {
      console.error('Failed to read openclaw.json:', err);
    }

    if (agentList.length > 0) {
      // Build workspaces from agent config
      for (const agent of agentList) {
        const wsPath = agent.workspace;
        if (!wsPath || !fs.existsSync(wsPath)) continue;

        const agentInfo = getAgentInfo(wsPath);
        const isMain = agent.id === 'main';

        workspaces.push({
          id: agent.id,
          name: agentInfo?.name || agent.name || (isMain ? 'Main Workspace' : agent.id.charAt(0).toUpperCase() + agent.id.slice(1)),
          emoji: agentInfo?.emoji || (isMain ? '⚡' : '🤖'),
          path: wsPath,
          agentName: agentInfo?.name || agent.name || undefined,
        });
      }
    } else {
      // Fallback: scan E:\workspaces\ directory
      const workspacesRoot = process.env.OPENCLAW_WORKSPACE ? path.dirname(process.env.OPENCLAW_WORKSPACE) : 'E:\\workspaces';

      if (fs.existsSync(workspacesRoot)) {
        const entries = fs.readdirSync(workspacesRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const wsPath = path.join(workspacesRoot, entry.name);
          const agentInfo = getAgentInfo(wsPath);

          workspaces.push({
            id: entry.name,
            name: agentInfo?.name || entry.name.charAt(0).toUpperCase() + entry.name.slice(1),
            emoji: agentInfo?.emoji || '🤖',
            path: wsPath,
            agentName: agentInfo?.name || undefined,
          });
        }
      }
    }

    // Sort: main first, then alphabetically
    workspaces.sort((a, b) => {
      if (a.id === 'main') return -1;
      if (b.id === 'main') return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error('Failed to list workspaces:', error);
    return NextResponse.json({ workspaces: [] }, { status: 500 });
  }
}
