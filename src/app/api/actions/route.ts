/**
 * Quick Actions API — Windows Edition
 * POST /api/actions  body: { action }
 * Available actions: git-status, restart-gateway, clear-temp, usage-stats, heartbeat, npm-audit
 */
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { logActivity } from '@/lib/activities-db';

const execAsync = promisify(exec);

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || 'E:\\workspaces\\main';

interface ActionResult {
  action: string;
  status: 'success' | 'error';
  output: string;
  duration_ms: number;
  timestamp: string;
}

async function runAction(action: string): Promise<ActionResult> {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  try {
    let output = '';

    switch (action) {
      case 'git-status': {
        // Check git status for main workspace and repos
        const results: string[] = [];
        const dirs = [WORKSPACE, 'E:\\repos\\tenacitOS'];
        for (const repoPath of dirs) {
          const name = repoPath.split('\\').pop() || repoPath;
          try {
            const { stdout: status } = await execAsync(`cd "${repoPath}" && git status --short && git log --oneline -3 2>&1`);
            results.push(`📁 ${name}:\n${status || '(clean)'}`);
          } catch {
            results.push(`📁 ${name}: (error reading git status)`);
          }
        }
        output = results.length ? results.join('\n\n') : 'No git repos found';
        break;
      }

      case 'restart-gateway': {
        const { stdout, stderr } = await execAsync('pm2 restart openclaw-gateway 2>&1');
        output = stdout || stderr || 'Restart command executed';
        try {
          const { stdout: pm2json } = await execAsync('pm2 jlist 2>nul');
          const list = JSON.parse(pm2json);
          const gw = list.find((p: { name: string }) => p.name === 'openclaw-gateway');
          output += `\nStatus: ${gw?.pm2_env?.status || 'unknown'}`;
        } catch {}
        break;
      }

      case 'clear-temp': {
        const tmpDir = os.tmpdir();
        const results: string[] = [];
        try {
          const { stdout } = await execAsync(`dir "${tmpDir}" /A:-D /B 2>nul | find /c /v ""`);
          results.push(`Temp files in ${tmpDir}: ${stdout.trim()}`);
        } catch {
          results.push(`Temp dir: ${tmpDir}`);
        }
        // Trim large PM2 logs
        const pm2Home = process.env.PM2_HOME || `${process.env.USERPROFILE}\\.pm2`;
        try {
          const { stdout } = await execAsync(`dir "${pm2Home}\\logs" /A:-D /O:-S /B 2>nul`);
          results.push(`PM2 log files:\n${stdout.trim().split('\n').slice(0, 5).join('\n')}`);
        } catch {
          results.push('PM2 logs: could not read');
        }
        output = results.join('\n\n');
        break;
      }

      case 'usage-stats': {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const uptimeSec = os.uptime();
        const days = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);

        let diskInfo = '';
        try {
          const { stdout } = await execAsync('wmic logicaldisk get caption,freespace,size /format:csv 2>nul');
          const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('Node'));
          for (const line of lines) {
            const parts = line.trim().split(',');
            if (parts.length >= 4 && parseInt(parts[3]) > 0) {
              const cap = parts[1];
              const free = Math.round(parseInt(parts[2]) / 1024 / 1024 / 1024);
              const total = Math.round(parseInt(parts[3]) / 1024 / 1024 / 1024);
              diskInfo += `${cap} ${total - free}GB / ${total}GB (${Math.round(((total - free) / total) * 100)}%)\n`;
            }
          }
        } catch {
          diskInfo = 'Could not read disk info';
        }

        output = [
          `Memory: ${(usedMem / 1024 / 1024 / 1024).toFixed(1)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(1)}GB`,
          `CPU Cores: ${os.cpus().length}`,
          `Uptime: ${days}d ${hours}h`,
          `\nDisk:\n${diskInfo}`,
        ].join('\n');
        break;
      }

      case 'heartbeat': {
        const results: string[] = [];

        // Check PM2 services
        try {
          const { stdout: pm2json } = await execAsync('pm2 jlist 2>nul');
          const pm2list = JSON.parse(pm2json);
          const keyServices = ['openclaw-gateway', 'mission-control', 'openclaw-watchdog', 'tenacitOS', 'pulse-watcher'];
          for (const svc of keyServices) {
            const proc = pm2list.find((p: { name: string }) => p.name === svc);
            const status = proc?.pm2_env?.status || 'not found';
            results.push(`${status === 'online' ? '✅' : '❌'} ${svc}: ${status}`);
          }
          const onlineCount = pm2list.filter((p: { pm2_env: { status: string } }) => p.pm2_env?.status === 'online').length;
          results.push(`\n📊 PM2 Total: ${onlineCount}/${pm2list.length} online`);
        } catch {
          results.push('⚠️ PM2: could not connect');
        }

        // Check gateway HTTP
        try {
          const gwRes = await fetch('http://127.0.0.1:19000/health', { signal: AbortSignal.timeout(3000) });
          results.push(`\n🌐 Gateway: HTTP ${gwRes.status}`);
        } catch {
          results.push('\n🌐 Gateway: unreachable');
        }

        output = results.join('\n');
        break;
      }

      case 'npm-audit': {
        try {
          const { stdout } = await execAsync('cd "E:\\repos\\tenacitOS" && npm audit --json 2>nul');
          const audit = JSON.parse(stdout);
          output = `Vulnerabilities: ${JSON.stringify(audit.metadata?.vulnerabilities || {})}`;
        } catch (e) {
          output = `Audit: ${e instanceof Error ? e.message : 'completed'}`;
        }
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const duration_ms = Date.now() - start;
    logActivity('command', `Quick action: ${action}`, 'success', { duration_ms, metadata: { action } });

    return { action, status: 'success', output, duration_ms, timestamp };
  } catch (err) {
    const duration_ms = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    logActivity('command', `Quick action failed: ${action}`, 'error', { duration_ms, metadata: { action, error: errMsg } });
    return { action, status: 'error', output: errMsg, duration_ms, timestamp };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    const validActions = ['git-status', 'restart-gateway', 'clear-temp', 'usage-stats', 'heartbeat', 'npm-audit'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Unknown action. Valid: ${validActions.join(', ')}` }, { status: 400 });
    }

    const result = await runAction(action);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[actions] Error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
