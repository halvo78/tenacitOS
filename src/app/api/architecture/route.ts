/**
 * Architecture Map endpoint
 * GET /api/architecture - Returns full system topology
 */
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);
const dockerCmd = process.platform === 'win32' ? 'wsl docker' : 'docker';

let cache: { data: unknown; ts: number } | null = null;
const CACHE_DURATION = 60 * 1000;

interface ArchNode {
  id: string;
  type: 'service' | 'database' | 'agent' | 'external' | 'monitoring';
  name: string;
  port?: number;
  status: 'up' | 'down' | 'unknown';
  detail?: string;
}

interface ArchEdge {
  from: string;
  to: string;
  label: string;
}

async function checkUrl(url: string, timeout = 3000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return res.ok || res.status < 500 || res.status === 401 || res.status === 404;
  } catch {
    return false;
  }
}

async function safeExec(cmd: string, timeout = 8000): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { timeout });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_DURATION) {
    return NextResponse.json(cache.data);
  }

  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];

  // --- Services ---
  const gwUp = await checkUrl('http://127.0.0.1:19000/health');
  nodes.push({ id: 'gateway', type: 'service', name: 'OpenClaw Gateway', port: 19000, status: gwUp ? 'up' : 'down' });

  const litellmUp = await checkUrl('http://127.0.0.1:4000/health');
  nodes.push({ id: 'litellm', type: 'service', name: 'LiteLLM', port: 4000, status: litellmUp ? 'up' : 'down' });

  const grafanaUp = await checkUrl('http://127.0.0.1:3001');
  nodes.push({ id: 'grafana', type: 'monitoring', name: 'Grafana', port: 3001, status: grafanaUp ? 'up' : 'down' });

  const promUp = await checkUrl('http://127.0.0.1:9090/-/healthy');
  nodes.push({ id: 'prometheus', type: 'monitoring', name: 'Prometheus', port: 9090, status: promUp ? 'up' : 'down' });

  const alertUp = await checkUrl('http://127.0.0.1:9093/-/healthy');
  nodes.push({ id: 'alertmanager', type: 'monitoring', name: 'AlertManager', port: 9093, status: alertUp ? 'up' : 'down' });

  nodes.push({ id: 'tenacitos', type: 'service', name: 'TenacitOS', port: 3000, status: 'up' });

  // --- Databases ---
  const qdrantUp = await checkUrl('http://127.0.0.1:6333/collections');
  nodes.push({ id: 'qdrant', type: 'database', name: 'Qdrant', port: 6333, status: qdrantUp ? 'up' : 'down' });

  const neo4jOut = await safeExec(`${dockerCmd} inspect omni-neo4j --format "{{.State.Status}}" 2>&1`);
  nodes.push({ id: 'neo4j', type: 'database', name: 'Neo4j', port: 7687, status: neo4jOut === 'running' ? 'up' : 'down' });

  const pgOut = await safeExec(`${dockerCmd} exec omni-postgres pg_isready -U omni -d omni_brain 2>&1`);
  nodes.push({ id: 'postgres', type: 'database', name: 'PostgreSQL', port: 5433, status: pgOut.includes('accepting') ? 'up' : 'down' });

  const redisOut = await safeExec(`${dockerCmd} exec omni-redis redis-cli -a omni_secure_redis ping 2>&1`);
  nodes.push({ id: 'redis', type: 'database', name: 'Redis', port: 6381, status: redisOut.includes('PONG') ? 'up' : 'down' });

  // --- Agents (from PM2) ---
  const pm2Out = await safeExec('pm2 jlist 2>nul');
  let pm2Agents: string[] = [];
  if (pm2Out) {
    try {
      const list = JSON.parse(pm2Out) as Array<{ name: string; pm2_env?: { status?: string } }>;
      for (const proc of list) {
        const id = `pm2-${proc.name}`;
        nodes.push({
          id,
          type: 'agent',
          name: proc.name,
          status: proc.pm2_env?.status === 'online' ? 'up' : 'down',
        });
        pm2Agents.push(id);
      }
    } catch { /* skip */ }
  }

  // --- External APIs ---
  nodes.push({ id: 'anthropic', type: 'external', name: 'Anthropic API', status: 'up' });
  nodes.push({ id: 'openai', type: 'external', name: 'OpenAI API', status: 'up' });
  nodes.push({ id: 'gemini', type: 'external', name: 'Gemini API', status: 'up' });

  // --- Edges ---
  // Gateway connections
  edges.push({ from: 'gateway', to: 'litellm', label: 'LLM Routing' });
  edges.push({ from: 'gateway', to: 'qdrant', label: 'Vector Search' });
  edges.push({ from: 'gateway', to: 'neo4j', label: 'Graph Queries' });
  edges.push({ from: 'gateway', to: 'postgres', label: 'SQL' });
  edges.push({ from: 'gateway', to: 'redis', label: 'Cache' });

  // LiteLLM to external
  edges.push({ from: 'litellm', to: 'anthropic', label: 'Claude API' });
  edges.push({ from: 'litellm', to: 'openai', label: 'GPT API' });
  edges.push({ from: 'litellm', to: 'gemini', label: 'Gemini API' });

  // PM2 agents to gateway
  for (const agentId of pm2Agents) {
    edges.push({ from: agentId, to: 'gateway', label: 'API' });
  }

  // TenacitOS connections
  edges.push({ from: 'tenacitos', to: 'gateway', label: 'API Calls' });

  // Monitoring
  edges.push({ from: 'prometheus', to: 'grafana', label: 'Metrics' });
  edges.push({ from: 'alertmanager', to: 'prometheus', label: 'Alerts' });

  // --- Stats ---
  let totalContainers = 0;
  const dockerPsOut = await safeExec(`${dockerCmd} ps -q 2>&1`);
  if (dockerPsOut) {
    totalContainers = dockerPsOut.split('\n').filter(Boolean).length;
  }

  let totalRepos = 0;
  try {
    const reposDir = 'E:\\repos';
    if (fs.existsSync(reposDir)) {
      totalRepos = fs.readdirSync(reposDir, { withFileTypes: true }).filter(d => d.isDirectory()).length;
    }
  } catch { /* skip */ }

  let totalCrons = 0;
  const cronOut = await safeExec('openclaw cron list --json 2>nul');
  if (cronOut) {
    try {
      const crons = JSON.parse(cronOut);
      totalCrons = Array.isArray(crons) ? crons.length : 0;
    } catch { /* skip */ }
  }

  let totalSkills = 0;
  for (const dir of ['E:\\workspaces\\main\\skills', 'E:\\npm-global\\node_modules\\openclaw\\skills']) {
    try {
      if (fs.existsSync(dir)) {
        totalSkills += fs.readdirSync(dir).filter(f => !f.startsWith('.')).length;
      }
    } catch { /* skip */ }
  }

  const result = {
    nodes,
    edges,
    stats: {
      totalAgents: pm2Agents.length,
      totalRepos,
      totalContainers,
      totalCrons,
      totalSkills,
    },
    timestamp: new Date().toISOString(),
  };

  cache = { data: result, ts: Date.now() };
  return NextResponse.json(result);
}
