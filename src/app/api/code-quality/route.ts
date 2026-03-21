/**
 * Code Quality Dashboard endpoint
 * GET /api/code-quality - Scan repos and return quality metrics
 */
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

let cache: { data: unknown; ts: number } | null = null;
const CACHE_DURATION = 120 * 1000; // 2 min (repo scanning is heavier)

interface RepoInfo {
  name: string;
  language: string;
  lastCommit: string;
  lastMessage: string;
  branch: string;
  dirty: boolean;
  hasTests: boolean;
  hasCI: boolean;
  hasReadme: boolean;
  fileCount: number;
  status: 'active' | 'stale' | 'archived';
}

function detectLanguage(repoPath: string): string {
  try {
    const pkgPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.dependencies?.typescript || pkg.devDependencies?.typescript) return 'TypeScript';
      return 'JavaScript';
    }
    if (fs.existsSync(path.join(repoPath, 'requirements.txt')) || fs.existsSync(path.join(repoPath, 'pyproject.toml'))) return 'Python';
    if (fs.existsSync(path.join(repoPath, 'go.mod'))) return 'Go';
    if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) return 'Rust';
    if (fs.existsSync(path.join(repoPath, 'pom.xml'))) return 'Java';
  } catch { /* skip */ }
  return 'Unknown';
}

function countFiles(dir: string, depth = 0): number {
  if (depth > 4) return 0;
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue;
      if (entry.isDirectory()) {
        count += countFiles(path.join(dir, entry.name), depth + 1);
      } else {
        count++;
      }
    }
  } catch { /* skip unreadable dirs */ }
  return count;
}

function hasTestFiles(repoPath: string): boolean {
  try {
    const checks = ['test', 'tests', '__tests__', 'spec', 'specs'];
    for (const dir of checks) {
      if (fs.existsSync(path.join(repoPath, dir))) return true;
    }
    // Check for *.test.* or *.spec.* in src
    const srcDir = path.join(repoPath, 'src');
    if (fs.existsSync(srcDir)) {
      const walk = (d: string): boolean => {
        try {
          const entries = fs.readdirSync(d, { withFileTypes: true });
          for (const e of entries) {
            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
            if (e.isFile() && (e.name.includes('.test.') || e.name.includes('.spec.'))) return true;
            if (e.isDirectory()) {
              if (walk(path.join(d, e.name))) return true;
            }
          }
        } catch { /* skip */ }
        return false;
      };
      return walk(srcDir);
    }
  } catch { /* skip */ }
  return false;
}

async function getRepoInfo(repoPath: string, name: string): Promise<RepoInfo | null> {
  // Must have .git
  if (!fs.existsSync(path.join(repoPath, '.git'))) return null;

  const language = detectLanguage(repoPath);

  let lastCommit = '';
  let lastMessage = '';
  let branch = 'unknown';
  let dirty = false;

  try {
    const { stdout: logOut } = await execAsync(
      `git -C "${repoPath}" log -1 --format="%ai|%s" 2>nul`,
      { timeout: 5000 }
    );
    const parts = logOut.trim().split('|');
    if (parts.length >= 2) {
      lastCommit = parts[0].split(' ')[0]; // date only
      lastMessage = parts.slice(1).join('|').slice(0, 120);
    }
  } catch { /* skip */ }

  try {
    const { stdout: branchOut } = await execAsync(
      `git -C "${repoPath}" branch --show-current 2>nul`,
      { timeout: 3000 }
    );
    branch = branchOut.trim() || 'detached';
  } catch { /* skip */ }

  try {
    const { stdout: statusOut } = await execAsync(
      `git -C "${repoPath}" status --porcelain 2>nul`,
      { timeout: 5000 }
    );
    dirty = statusOut.trim().length > 0;
  } catch { /* skip */ }

  const hasCI = fs.existsSync(path.join(repoPath, '.github', 'workflows'));
  const hasReadme = fs.existsSync(path.join(repoPath, 'README.md')) || fs.existsSync(path.join(repoPath, 'readme.md'));
  const hasTests = hasTestFiles(repoPath);
  const fileCount = countFiles(repoPath);

  // Determine status based on last commit date
  let status: 'active' | 'stale' | 'archived' = 'active';
  if (lastCommit) {
    const commitDate = new Date(lastCommit);
    const daysSince = (Date.now() - commitDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 180) status = 'archived';
    else if (daysSince > 30) status = 'stale';
  }

  return {
    name,
    language,
    lastCommit,
    lastMessage,
    branch,
    dirty,
    hasTests,
    hasCI,
    hasReadme,
    fileCount,
    status,
  };
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_DURATION) {
    return NextResponse.json(cache.data);
  }

  const reposDir = 'E:\\repos';
  const repos: RepoInfo[] = [];

  try {
    const entries = fs.readdirSync(reposDir, { withFileTypes: true }).filter(d => d.isDirectory());

    // Process repos in batches to avoid overwhelming git
    const batchSize = 5;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(d => getRepoInfo(path.join(reposDir, d.name), d.name))
      );
      for (const r of results) {
        if (r) repos.push(r);
      }
    }
  } catch { /* skip */ }

  // Sort by last commit date descending
  repos.sort((a, b) => {
    if (!a.lastCommit) return 1;
    if (!b.lastCommit) return -1;
    return b.lastCommit.localeCompare(a.lastCommit);
  });

  const summary = {
    total: repos.length,
    active: repos.filter(r => r.status === 'active').length,
    withTests: repos.filter(r => r.hasTests).length,
    withCI: repos.filter(r => r.hasCI).length,
    clean: repos.filter(r => !r.dirty).length,
    dirty: repos.filter(r => r.dirty).length,
  };

  const result = {
    repos,
    summary,
    timestamp: new Date().toISOString(),
  };

  cache = { data: result, ts: Date.now() };
  return NextResponse.json(result);
}
