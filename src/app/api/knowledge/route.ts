/**
 * Knowledge Systems Overview
 * GET /api/knowledge — Summary of all knowledge backends
 */
import { NextResponse } from 'next/server';

let cache: { data: unknown; ts: number } | null = null;
const CACHE_DURATION = 60 * 1000; // 1 min

async function safeJson(url: string, timeout = 3000): Promise<unknown> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_DURATION) {
    return NextResponse.json(cache.data);
  }

  // Qdrant collections
  let qdrant = { status: 'down' as string, collections: 0, totalVectors: 0, collectionList: [] as Array<{ name: string; vectors: number }> };
  try {
    const data = await safeJson('http://127.0.0.1:6333/collections') as { result?: { collections?: Array<{ name: string }> } } | null;
    if (data?.result?.collections) {
      const collections = data.result.collections;
      qdrant.status = 'up';
      qdrant.collections = collections.length;

      // Get vector counts per collection
      const details = await Promise.all(
        collections.map(async (c) => {
          const info = await safeJson(`http://127.0.0.1:6333/collections/${c.name}`) as { result?: { vectors_count?: number; points_count?: number } } | null;
          const vectors = info?.result?.points_count || info?.result?.vectors_count || 0;
          return { name: c.name, vectors };
        })
      );
      qdrant.collectionList = details.sort((a, b) => b.vectors - a.vectors);
      qdrant.totalVectors = details.reduce((sum, c) => sum + c.vectors, 0);
    }
  } catch {}

  // Neo4j
  let neo4j = { status: 'down' as string, details: '' };
  try {
    const res = await fetch('http://127.0.0.1:7474', { signal: AbortSignal.timeout(3000) });
    neo4j.status = res.ok || res.status < 500 ? 'up' : 'down';
    neo4j.details = `HTTP ${res.status}`;
  } catch {}

  // PostgreSQL (via Docker)
  let postgres = { status: 'unknown' as string, details: '' };
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const { stdout } = await execAsync('docker exec postgres-omni pg_isready -U omni -d omni_brain 2>nul');
    postgres.status = stdout.includes('accepting') ? 'up' : 'down';
    postgres.details = stdout.trim();
  } catch {
    postgres.details = 'check failed';
  }

  // Redis
  let redis = { status: 'unknown' as string, details: '' };
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const { stdout } = await execAsync('docker exec redis-stack redis-cli -a omni_secure_redis ping 2>nul');
    redis.status = stdout.includes('PONG') ? 'up' : 'down';
    redis.details = stdout.trim();
  } catch {
    redis.details = 'check failed';
  }

  // Obsidian vault
  let obsidian = { status: 'unknown' as string, noteCount: 0 };
  try {
    const fs = require('fs');
    const path = require('path');
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH || 'C:\\Users\\Halvo\\Documents\\Obsidian Vault';
    if (fs.existsSync(vaultPath)) {
      obsidian.status = 'up';
      // Count .md files
      function countMd(dir: string): number {
        let count = 0;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) count += countMd(full);
            else if (entry.name.endsWith('.md')) count++;
          }
        } catch {}
        return count;
      }
      obsidian.noteCount = countMd(vaultPath);
    }
  } catch {}

  // Agent memory
  let agentMemory = { fileCount: 0, workspaceCount: 0 };
  try {
    const fs = require('fs');
    const path = require('path');
    const wsRoot = 'E:\\workspaces';
    if (fs.existsSync(wsRoot)) {
      const dirs = fs.readdirSync(wsRoot, { withFileTypes: true }).filter((d: { isDirectory: () => boolean }) => d.isDirectory());
      agentMemory.workspaceCount = dirs.length;
      for (const d of dirs) {
        const memDir = path.join(wsRoot, d.name, 'memory');
        try {
          const files = fs.readdirSync(memDir).filter((f: string) => f.endsWith('.md'));
          agentMemory.fileCount += files.length;
        } catch {}
      }
    }
  } catch {}

  const result = {
    qdrant,
    neo4j,
    postgres,
    redis,
    obsidian,
    agentMemory,
    summary: {
      totalVectors: qdrant.totalVectors,
      qdrantCollections: qdrant.collections,
      obsidianNotes: obsidian.noteCount,
      memoryFiles: agentMemory.fileCount,
      agentWorkspaces: agentMemory.workspaceCount,
    },
    timestamp: new Date().toISOString(),
  };

  cache = { data: result, ts: Date.now() };
  return NextResponse.json(result);
}
