/**
 * Semantic Search across all knowledge stores
 * GET /api/knowledge/search?q=query — Search via OpenClaw memory search
 */
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || searchParams.get('query');
  const limit = parseInt(searchParams.get('limit') || '20');

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter (q)' }, { status: 400 });
  }

  try {
    // Use OpenClaw memory search
    const safeQuery = query.replace(/"/g, '\\"');
    const { stdout } = await execAsync(
      `openclaw memory search --query "${safeQuery}" --json --limit ${limit} 2>nul`,
      { timeout: 15000 }
    );

    const results = JSON.parse(stdout);
    return NextResponse.json({
      query,
      results: results.results || results,
      count: results.count || (results.results || results).length,
      source: 'openclaw-memory',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Fallback: basic file search across memory dirs
    try {
      const { stdout } = await execAsync(
        `grep -ril "${query.replace(/"/g, '\\"')}" E:\\workspaces\\main\\memory\\ 2>nul | head -20`,
        { timeout: 10000 }
      );

      const files = stdout.trim().split('\n').filter(Boolean);
      return NextResponse.json({
        query,
        results: files.map((f) => ({ file: f, source: 'grep-fallback' })),
        count: files.length,
        source: 'grep-fallback',
        note: 'OpenClaw memory search unavailable, using grep fallback',
        timestamp: new Date().toISOString(),
      });
    } catch {
      return NextResponse.json({
        query,
        results: [],
        count: 0,
        error: 'Search failed',
      }, { status: 500 });
    }
  }
}
