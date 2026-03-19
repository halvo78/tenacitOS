/**
 * Obsidian Vault Stats
 * GET /api/knowledge/obsidian — File list, note count, folder structure
 */
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || 'C:\\Users\\Halvo\\Documents\\Obsidian Vault';

interface VaultFolder {
  name: string;
  noteCount: number;
  subfolders: string[];
}

function scanVault(dir: string, maxDepth = 2, depth = 0): VaultFolder[] {
  const folders: VaultFolder[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let noteCount = 0;
    const subfolders: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        subfolders.push(entry.name);
        if (depth < maxDepth) {
          folders.push(...scanVault(path.join(dir, entry.name), maxDepth, depth + 1));
        }
      } else if (entry.name.endsWith('.md')) {
        noteCount++;
      }
    }

    folders.unshift({
      name: depth === 0 ? 'Root' : path.basename(dir),
      noteCount,
      subfolders,
    });
  } catch {}
  return folders;
}

function countAllNotes(dir: string): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) count += countAllNotes(full);
      else if (entry.name.endsWith('.md')) count++;
    }
  } catch {}
  return count;
}

export async function GET() {
  try {
    if (!fs.existsSync(VAULT_PATH)) {
      return NextResponse.json({
        status: 'not_found',
        path: VAULT_PATH,
        error: 'Obsidian vault not found at configured path',
      }, { status: 404 });
    }

    const totalNotes = countAllNotes(VAULT_PATH);
    const folders = scanVault(VAULT_PATH, 1);

    // Get recent files (modified in last 7 days)
    const recentFiles: Array<{ name: string; path: string; modified: string }> = [];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    function findRecent(dir: string) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            findRecent(full);
          } else if (entry.name.endsWith('.md')) {
            const stat = fs.statSync(full);
            if (stat.mtime.getTime() > sevenDaysAgo) {
              recentFiles.push({
                name: entry.name,
                path: full.replace(VAULT_PATH, '').replace(/\\/g, '/'),
                modified: stat.mtime.toISOString(),
              });
            }
          }
        }
      } catch {}
    }
    findRecent(VAULT_PATH);
    recentFiles.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return NextResponse.json({
      status: 'up',
      path: VAULT_PATH,
      totalNotes,
      folders: folders.slice(0, 20),
      recentFiles: recentFiles.slice(0, 20),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Obsidian error:', error);
    return NextResponse.json({ status: 'error', error: 'Failed to scan vault' }, { status: 500 });
  }
}
