/**
 * OmniBrain Script Status
 * GET /api/omnibrain — List scripts, last modified, sizes
 */
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const OMNIBRAIN_PATH = 'E:\\OmniBrain';
const SCRIPTS_PATH = path.join(OMNIBRAIN_PATH, 'scripts');

export async function GET() {
  try {
    if (!fs.existsSync(OMNIBRAIN_PATH)) {
      return NextResponse.json({ status: 'not_found', error: 'OmniBrain directory not found' }, { status: 404 });
    }

    // List scripts
    const scripts: Array<{ name: string; size: number; modified: string; type: string }> = [];
    if (fs.existsSync(SCRIPTS_PATH)) {
      const entries = fs.readdirSync(SCRIPTS_PATH, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const full = path.join(SCRIPTS_PATH, entry.name);
        const stat = fs.statSync(full);
        const ext = path.extname(entry.name).toLowerCase();
        scripts.push({
          name: entry.name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          type: ext === '.py' ? 'python' : ext === '.sh' ? 'bash' : ext === '.ps1' ? 'powershell' : ext === '.js' ? 'node' : 'other',
        });
      }
    }

    // Count top-level dirs and files
    const topLevel = fs.readdirSync(OMNIBRAIN_PATH, { withFileTypes: true });
    const dirs = topLevel.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
    const files = topLevel.filter((e) => e.isFile()).length;

    return NextResponse.json({
      status: 'up',
      path: OMNIBRAIN_PATH,
      scripts: scripts.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()),
      scriptCount: scripts.length,
      directories: dirs,
      topLevelFiles: files,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('OmniBrain error:', error);
    return NextResponse.json({ status: 'error', error: 'Failed to scan OmniBrain' }, { status: 500 });
  }
}
