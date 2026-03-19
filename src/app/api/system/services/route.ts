/**
 * Service action API
 * POST /api/system/services
 * Body: { name, backend, action }  action: restart | stop | start | logs
 */
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// All 14 actual PM2 services
const ALLOWED_SERVICES_PM2 = [
  'pm2-logrotate',
  'openclaw-watchdog',
  'mission-control',
  'openclaw-gateway',
  'claude-bot',
  'gemini-bot',
  'codex-bot',
  'alert-bot',
  'revenue-bot',
  'pulse-watcher',
  'pulse-github-sync',
  'pulse-ingest',
  'pulse-ecosystem',
  'tenacitOS',
];

const ALLOWED_DOCKER_IDS_PATTERN = /^[a-f0-9]{6,64}$|^[a-zA-Z0-9_.-]+$/;

function getPm2Home(): string {
  return process.env.PM2_HOME || (os.platform() === 'win32'
    ? `${process.env.USERPROFILE}\\.pm2`
    : `${process.env.HOME}/.pm2`);
}

async function pm2Action(name: string, action: string): Promise<string> {
  if (!ALLOWED_SERVICES_PM2.includes(name)) {
    throw new Error(`Service "${name}" not in allowlist`);
  }
  if (!['restart', 'stop', 'start', 'logs'].includes(action)) {
    throw new Error(`Invalid action "${action}"`);
  }

  if (action === 'logs') {
    try {
      const { stdout } = await execAsync(`pm2 logs "${name}" --lines 100 --nostream 2>nul`);
      return stdout || 'No logs available';
    } catch {
      // Fallback: read log files directly
      try {
        const pm2Home = getPm2Home();
        const logFile = `${pm2Home}/logs/${name}-out.log`;
        const { stdout } = await execAsync(`tail -100 "${logFile}" 2>nul`);
        return stdout || 'No logs available';
      } catch {
        return 'Could not retrieve logs';
      }
    }
  }

  const { stdout, stderr } = await execAsync(`pm2 ${action} "${name}" 2>&1`);
  return stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
}

async function dockerAction(id: string, action: string): Promise<string> {
  if (!ALLOWED_DOCKER_IDS_PATTERN.test(id)) {
    throw new Error(`Invalid container ID "${id}"`);
  }
  if (!['start', 'stop', 'restart', 'logs'].includes(action)) {
    throw new Error(`Invalid action "${action}"`);
  }

  if (action === 'logs') {
    const { stdout } = await execAsync(`docker logs --tail 100 "${id}" 2>&1`);
    return stdout;
  }

  const { stdout } = await execAsync(`docker ${action} "${id}" 2>&1`);
  return stdout || `${action} executed successfully`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, backend, action } = body;

    if (!name || !backend || !action) {
      return NextResponse.json({ error: 'Missing name, backend or action' }, { status: 400 });
    }

    let output = '';

    switch (backend) {
      case 'pm2':
        output = await pm2Action(name, action);
        break;
      case 'docker':
        output = await dockerAction(name, action);
        break;
      default:
        return NextResponse.json({ error: `Unknown backend "${backend}". Supported: pm2, docker` }, { status: 400 });
    }

    return NextResponse.json({ success: true, output, action, name, backend });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[services API] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
