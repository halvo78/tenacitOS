/**
 * Health check endpoint — Halvo Empire Edition
 * GET /api/health - Check health of ALL services and integrations
 */
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ServiceCheck {
  name: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  latency?: number;
  details?: string;
  url?: string;
  category?: string;
}

// Cache health results for 30s
let healthCache: { data: unknown; ts: number } | null = null;
const CACHE_DURATION = 30 * 1000;

async function checkUrl(url: string, timeoutMs = 5000): Promise<{ status: 'up' | 'down'; latency: number; httpCode?: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    return { status: res.ok || res.status < 500 ? 'up' : 'down', latency, httpCode: res.status };
  } catch {
    return { status: 'down', latency: Date.now() - start };
  }
}

async function checkPm2Service(name: string): Promise<ServiceCheck> {
  try {
    const { stdout } = await execAsync('pm2 jlist 2>nul');
    const list = JSON.parse(stdout);
    const proc = list.find((p: { name: string }) => p.name === name);
    if (!proc) return { name, status: 'unknown', details: 'not found in pm2', category: 'pm2' };
    const status = proc.pm2_env?.status === 'online' ? 'up' : 'down';
    return {
      name,
      status,
      details: `${proc.pm2_env?.status} · restarts: ${proc.pm2_env?.restart_time} · uptime: ${Math.round((Date.now() - proc.pm2_env?.pm_uptime) / 60000)}m`,
      category: 'pm2',
    };
  } catch {
    return { name, status: 'unknown', details: 'pm2 not available', category: 'pm2' };
  }
}

export async function GET() {
  // Return cache if valid
  if (healthCache && Date.now() - healthCache.ts < CACHE_DURATION) {
    return NextResponse.json(healthCache.data);
  }

  const checks: ServiceCheck[] = [];

  // PM2 services
  const pm2Services = [
    'openclaw-gateway', 'openclaw-watchdog', 'mission-control',
    'pulse-watcher', 'pulse-ecosystem', 'tenacitOS',
    'claude-bot', 'gemini-bot', 'codex-bot',
    'alert-bot', 'revenue-bot',
  ];
  const pm2Checks = await Promise.all(pm2Services.map(checkPm2Service));
  checks.push(...pm2Checks);

  // Local infrastructure
  const infraChecks = await Promise.all([
    checkUrl('http://127.0.0.1:19000/health', 3000),   // OpenClaw Gateway
    checkUrl('http://127.0.0.1:3001', 3000),             // Grafana (port 3001)
    checkUrl('http://127.0.0.1:6333/collections', 3000), // Qdrant
    checkUrl('http://127.0.0.1:9090/-/healthy', 3000),   // Prometheus
    checkUrl('http://127.0.0.1:7474', 3000),              // Neo4j Browser
    checkUrl('http://127.0.0.1:9093/-/healthy', 3000),   // AlertManager
    checkUrl('http://127.0.0.1:4000/health', 3000),      // LiteLLM
    checkUrl('http://127.0.0.1:9100/metrics', 3000),     // Node Exporter
    checkUrl('http://127.0.0.1:8080/metrics', 3000),     // cAdvisor
  ]);

  checks.push(
    { name: 'OpenClaw Gateway', status: infraChecks[0].status, latency: infraChecks[0].latency, url: 'http://127.0.0.1:19000', category: 'infrastructure' },
    { name: 'Grafana', status: infraChecks[1].status, latency: infraChecks[1].latency, url: 'http://127.0.0.1:3001', category: 'infrastructure' },
    { name: 'Qdrant', status: infraChecks[2].status, latency: infraChecks[2].latency, url: 'http://127.0.0.1:6333', category: 'infrastructure' },
    { name: 'Prometheus', status: infraChecks[3].status, latency: infraChecks[3].latency, url: 'http://127.0.0.1:9090', category: 'infrastructure' },
    { name: 'Neo4j', status: infraChecks[4].status, latency: infraChecks[4].latency, url: 'http://127.0.0.1:7474', category: 'database' },
    { name: 'AlertManager', status: infraChecks[5].status, latency: infraChecks[5].latency, url: 'http://127.0.0.1:9093', category: 'infrastructure' },
    { name: 'LiteLLM', status: infraChecks[6].status, latency: infraChecks[6].latency, url: 'http://127.0.0.1:4000', category: 'infrastructure' },
    { name: 'Node Exporter', status: infraChecks[7].status, latency: infraChecks[7].latency, url: 'http://127.0.0.1:9100', category: 'monitoring' },
    { name: 'cAdvisor', status: infraChecks[8].status, latency: infraChecks[8].latency, url: 'http://127.0.0.1:8080', category: 'monitoring' },
  );

  // Database connectivity checks via WSL docker on Windows
  const dockerCmd = process.platform === 'win32' ? 'wsl docker' : 'docker';
  const dbChecks = await Promise.all([
    // Redis
    execAsync(`${dockerCmd} exec omni-redis redis-cli -a omni_secure_redis ping 2>&1`, { timeout: 5000 })
      .then(({ stdout }) => ({ name: 'Redis', status: stdout.includes('PONG') ? 'up' as const : 'down' as const, details: 'PONG', category: 'database' }))
      .catch(() => ({ name: 'Redis', status: 'down' as const, details: 'unreachable', category: 'database' })),
    // PostgreSQL
    execAsync(`${dockerCmd} exec omni-postgres pg_isready -U omni -d omni_brain 2>&1`, { timeout: 5000 })
      .then(({ stdout }) => ({ name: 'PostgreSQL', status: stdout.includes('accepting') ? 'up' as const : 'down' as const, details: stdout.trim().split('\n')[0], category: 'database' }))
      .catch(() => ({ name: 'PostgreSQL', status: 'unknown' as const, details: 'check failed', category: 'database' })),
  ]);
  checks.push(...dbChecks);

  // External APIs
  const extChecks = await Promise.all([
    checkUrl('https://api.anthropic.com', 3000),
    checkUrl('https://api.openai.com', 3000),
    checkUrl('https://generativelanguage.googleapis.com', 3000),
  ]);

  checks.push(
    { name: 'Anthropic API', status: extChecks[0].httpCode === 401 ? 'up' : extChecks[0].status, latency: extChecks[0].latency, url: 'https://api.anthropic.com', category: 'external' },
    { name: 'OpenAI API', status: extChecks[1].httpCode === 401 ? 'up' : extChecks[1].status, latency: extChecks[1].latency, url: 'https://api.openai.com', category: 'external' },
    { name: 'Gemini API', status: extChecks[2].httpCode === 404 ? 'up' : extChecks[2].status, latency: extChecks[2].latency, url: 'https://generativelanguage.googleapis.com', category: 'external' },
  );

  // Docker check
  try {
    const { stdout } = await execAsync(`${dockerCmd} ps --format "{{.Names}}" 2>&1`, { timeout: 5000 });
    const containers = stdout.trim().split('\n').filter(Boolean);
    checks.push({ name: 'Docker', status: 'up', details: `${containers.length} containers running`, category: 'infrastructure' });
  } catch {
    checks.push({ name: 'Docker', status: 'down', details: 'docker not reachable', category: 'infrastructure' });
  }

  // Tailscale
  try {
    const { stdout } = await execAsync('tailscale status 2>nul');
    const online = !stdout.includes('stopped') && stdout.trim().length > 0;
    checks.push({ name: 'Tailscale VPN', status: online ? 'up' : 'down', details: online ? 'connected' : 'disconnected', category: 'network' });
  } catch {
    checks.push({ name: 'Tailscale VPN', status: 'unknown', category: 'network' });
  }

  // Summary counts
  const upCount = checks.filter((c) => c.status === 'up').length;
  const downCount = checks.filter((c) => c.status === 'down').length;
  const totalCount = checks.length;
  const overallStatus = downCount === 0 ? 'healthy' : downCount < totalCount / 3 ? 'degraded' : 'critical';

  const result = {
    status: overallStatus,
    summary: { up: upCount, down: downCount, total: totalCount },
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  // Cache the result
  healthCache = { data: result, ts: Date.now() };

  return NextResponse.json(result);
}
