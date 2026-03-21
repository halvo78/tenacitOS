/**
 * Commissioning Report endpoint
 * GET /api/commissioning - Full system audit with structured grading
 */
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const dockerCmd = process.platform === 'win32' ? 'wsl docker' : 'docker';

let cache: { data: unknown; ts: number } | null = null;
const CACHE_DURATION = 30 * 1000;

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  latency?: number;
}

interface Section {
  name: string;
  score: number;
  checks: Check[];
}

async function checkUrl(url: string, timeoutMs = 5000): Promise<{ up: boolean; latency: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return { up: res.ok || res.status < 500 || res.status === 401 || res.status === 404, latency: Date.now() - start };
  } catch {
    return { up: false, latency: Date.now() - start };
  }
}

async function safeExec(cmd: string, timeout = 8000): Promise<{ stdout: string; ok: boolean }> {
  try {
    const { stdout } = await execAsync(cmd, { timeout });
    return { stdout: stdout.trim(), ok: true };
  } catch {
    return { stdout: '', ok: false };
  }
}

function calculateGrade(score: number): string {
  if (score >= 95) return 'S++';
  if (score >= 90) return 'S+';
  if (score >= 85) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'F';
}

function sectionScore(checks: Check[]): number {
  if (checks.length === 0) return 100;
  const passed = checks.filter(c => c.status === 'pass').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  return Math.round(((passed + warned * 0.5) / checks.length) * 100);
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_DURATION) {
    return NextResponse.json(cache.data);
  }

  const sections: Section[] = [];

  // --- Section 1: Infrastructure ---
  const infraChecks: Check[] = [];

  // OpenClaw Gateway
  const gw = await checkUrl('http://127.0.0.1:19000/health', 3000);
  infraChecks.push({ name: 'OpenClaw Gateway', status: gw.up ? 'pass' : 'fail', detail: gw.up ? `online, ${gw.latency}ms` : 'unreachable', latency: gw.latency });

  // LiteLLM
  const litellm = await checkUrl('http://127.0.0.1:4000/health', 3000);
  infraChecks.push({ name: 'LiteLLM', status: litellm.up ? 'pass' : 'fail', detail: litellm.up ? `online, ${litellm.latency}ms` : 'unreachable', latency: litellm.latency });

  // Grafana
  const grafana = await checkUrl('http://127.0.0.1:3001', 3000);
  infraChecks.push({ name: 'Grafana', status: grafana.up ? 'pass' : 'warn', detail: grafana.up ? `online, ${grafana.latency}ms` : 'unreachable', latency: grafana.latency });

  // Prometheus
  const prom = await checkUrl('http://127.0.0.1:9090/-/healthy', 3000);
  infraChecks.push({ name: 'Prometheus', status: prom.up ? 'pass' : 'warn', detail: prom.up ? `online, ${prom.latency}ms` : 'unreachable', latency: prom.latency });

  // AlertManager
  const alertmgr = await checkUrl('http://127.0.0.1:9093/-/healthy', 3000);
  infraChecks.push({ name: 'AlertManager', status: alertmgr.up ? 'pass' : 'warn', detail: alertmgr.up ? `online, ${alertmgr.latency}ms` : 'unreachable', latency: alertmgr.latency });

  // Tailscale
  const ts = await safeExec('tailscale status 2>nul');
  infraChecks.push({ name: 'Tailscale VPN', status: ts.ok && ts.stdout.length > 0 ? 'pass' : 'warn', detail: ts.ok ? 'connected' : 'not available' });

  sections.push({ name: 'Infrastructure', score: sectionScore(infraChecks), checks: infraChecks });

  // --- Section 2: Docker Containers ---
  const dockerChecks: Check[] = [];
  const dockerPs = await safeExec(`${dockerCmd} ps --format "{{.Names}}|{{.Status}}" 2>&1`);
  if (dockerPs.ok && dockerPs.stdout) {
    const lines = dockerPs.stdout.split('\n').filter(Boolean);
    for (const line of lines) {
      const [name, status] = line.split('|');
      if (name && status) {
        const isUp = status.toLowerCase().startsWith('up');
        dockerChecks.push({ name, status: isUp ? 'pass' : 'fail', detail: status });
      }
    }
  } else {
    dockerChecks.push({ name: 'Docker Engine', status: 'fail', detail: 'docker not reachable' });
  }
  sections.push({ name: 'Docker Containers', score: sectionScore(dockerChecks), checks: dockerChecks });

  // --- Section 3: PM2 Processes ---
  const pm2Checks: Check[] = [];
  const pm2Result = await safeExec('pm2 jlist 2>nul');
  if (pm2Result.ok && pm2Result.stdout) {
    try {
      const list = JSON.parse(pm2Result.stdout) as Array<{ name: string; pm2_env?: { status?: string; restart_time?: number; pm_uptime?: number } }>;
      for (const proc of list) {
        const status = proc.pm2_env?.status === 'online' ? 'pass' as const : 'fail' as const;
        const restarts = proc.pm2_env?.restart_time || 0;
        const uptime = proc.pm2_env?.pm_uptime ? Math.round((Date.now() - proc.pm2_env.pm_uptime) / 60000) : 0;
        pm2Checks.push({
          name: proc.name,
          status: status === 'pass' && restarts > 50 ? 'warn' : status,
          detail: `${proc.pm2_env?.status} - uptime: ${uptime}m, restarts: ${restarts}`,
        });
      }
    } catch { /* parse error */ }
  } else {
    pm2Checks.push({ name: 'PM2', status: 'fail', detail: 'pm2 not available' });
  }
  sections.push({ name: 'PM2 Processes', score: sectionScore(pm2Checks), checks: pm2Checks });

  // --- Section 4: Knowledge Stores ---
  const knowledgeChecks: Check[] = [];

  // Qdrant
  try {
    const res = await fetch('http://127.0.0.1:6333/collections', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json() as { result?: { collections?: Array<{ name: string }> } };
      const count = data?.result?.collections?.length || 0;
      knowledgeChecks.push({ name: 'Qdrant', status: 'pass', detail: `${count} collections` });
    } else {
      knowledgeChecks.push({ name: 'Qdrant', status: 'fail', detail: 'bad response' });
    }
  } catch {
    knowledgeChecks.push({ name: 'Qdrant', status: 'fail', detail: 'unreachable' });
  }

  // Neo4j
  const neo4j = await safeExec(`${dockerCmd} inspect omni-neo4j --format "{{.State.Status}}" 2>&1`);
  knowledgeChecks.push({ name: 'Neo4j', status: neo4j.stdout === 'running' ? 'pass' : 'fail', detail: `container: ${neo4j.stdout || 'unknown'}` });

  // PostgreSQL
  const pg = await safeExec(`${dockerCmd} exec omni-postgres pg_isready -U omni -d omni_brain 2>&1`);
  knowledgeChecks.push({ name: 'PostgreSQL', status: pg.stdout.includes('accepting') ? 'pass' : 'fail', detail: pg.stdout.split('\n')[0] || 'check failed' });

  // Redis
  const redis = await safeExec(`${dockerCmd} exec omni-redis redis-cli -a omni_secure_redis ping 2>&1`);
  knowledgeChecks.push({ name: 'Redis', status: redis.stdout.includes('PONG') ? 'pass' : 'fail', detail: redis.stdout.includes('PONG') ? 'PONG' : 'unreachable' });

  sections.push({ name: 'Knowledge Stores', score: sectionScore(knowledgeChecks), checks: knowledgeChecks });

  // --- Section 5: Disk Space ---
  const diskChecks: Check[] = [];
  const diskResult = await safeExec('powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json" 2>nul');
  if (diskResult.ok && diskResult.stdout) {
    try {
      const drives = JSON.parse(diskResult.stdout);
      const driveList = Array.isArray(drives) ? drives : [drives];
      for (const d of driveList) {
        if (d.Used != null && d.Free != null) {
          const total = d.Used + d.Free;
          const pct = total > 0 ? Math.round((d.Used / total) * 100) : 0;
          diskChecks.push({
            name: `Drive ${d.Name}:`,
            status: pct < 85 ? 'pass' : pct < 95 ? 'warn' : 'fail',
            detail: `${pct}% used (${Math.round(d.Free / 1073741824)}GB free)`,
          });
        }
      }
    } catch { /* parse error */ }
  }
  if (diskChecks.length === 0) {
    diskChecks.push({ name: 'Disk Space', status: 'warn', detail: 'unable to check' });
  }
  sections.push({ name: 'Disk Space', score: sectionScore(diskChecks), checks: diskChecks });

  // --- Section 6: Ecosystem Counts ---
  const ecoChecks: Check[] = [];

  // Repos count
  try {
    const reposDir = 'E:\\repos';
    if (fs.existsSync(reposDir)) {
      const repos = fs.readdirSync(reposDir, { withFileTypes: true }).filter(d => d.isDirectory());
      ecoChecks.push({ name: 'Repositories', status: 'pass', detail: `${repos.length} repos in E:\\repos` });
    }
  } catch {
    ecoChecks.push({ name: 'Repositories', status: 'warn', detail: 'unable to count' });
  }

  // OpenClaw agents count
  try {
    const configPath = 'E:\\.openclaw\\openclaw.json';
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const agentCount = Array.isArray(config.agents) ? config.agents.length : 0;
      ecoChecks.push({ name: 'OpenClaw Agents', status: 'pass', detail: `${agentCount} agents configured` });
    }
  } catch {
    ecoChecks.push({ name: 'OpenClaw Agents', status: 'warn', detail: 'config not readable' });
  }

  // Cron jobs
  const cronResult = await safeExec('openclaw cron list --json 2>nul');
  if (cronResult.ok && cronResult.stdout) {
    try {
      const crons = JSON.parse(cronResult.stdout);
      const count = Array.isArray(crons) ? crons.length : 0;
      ecoChecks.push({ name: 'Cron Jobs', status: 'pass', detail: `${count} cron jobs` });
    } catch {
      ecoChecks.push({ name: 'Cron Jobs', status: 'warn', detail: 'parse error' });
    }
  } else {
    ecoChecks.push({ name: 'Cron Jobs', status: 'warn', detail: 'openclaw cron not available' });
  }

  // Skills count
  let skillCount = 0;
  const skillDirs = ['E:\\workspaces\\main\\skills', 'E:\\npm-global\\node_modules\\openclaw\\skills'];
  for (const dir of skillDirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
        skillCount += files.length;
      }
    } catch { /* skip */ }
  }
  ecoChecks.push({ name: 'Skills', status: skillCount > 0 ? 'pass' : 'warn', detail: `${skillCount} skills found` });

  // MCP servers count
  try {
    const claudeConfig = 'C:\\Users\\Halvo\\.claude.json';
    if (fs.existsSync(claudeConfig)) {
      const config = JSON.parse(fs.readFileSync(claudeConfig, 'utf-8'));
      const mcpCount = config.mcpServers ? Object.keys(config.mcpServers).length : 0;
      ecoChecks.push({ name: 'MCP Servers', status: mcpCount > 0 ? 'pass' : 'warn', detail: `${mcpCount} servers configured` });
    }
  } catch {
    ecoChecks.push({ name: 'MCP Servers', status: 'warn', detail: 'config not readable' });
  }

  sections.push({ name: 'Ecosystem', score: sectionScore(ecoChecks), checks: ecoChecks });

  // --- Section 7: External APIs ---
  const extChecks: Check[] = [];
  const apis = [
    { name: 'Anthropic API', url: 'https://api.anthropic.com' },
    { name: 'OpenAI API', url: 'https://api.openai.com' },
    { name: 'Gemini API', url: 'https://generativelanguage.googleapis.com' },
  ];
  for (const api of apis) {
    const result = await checkUrl(api.url, 3000);
    extChecks.push({ name: api.name, status: result.up ? 'pass' : 'warn', detail: result.up ? `reachable, ${result.latency}ms` : 'unreachable', latency: result.latency });
  }
  sections.push({ name: 'External APIs', score: sectionScore(extChecks), checks: extChecks });

  // --- Calculate overall score ---
  const totalScore = sections.length > 0
    ? Math.round(sections.reduce((sum, s) => sum + s.score, 0) / sections.length)
    : 0;

  const result = {
    timestamp: new Date().toISOString(),
    grade: calculateGrade(totalScore),
    score: totalScore,
    sections,
  };

  cache = { data: result, ts: Date.now() };
  return NextResponse.json(result);
}
