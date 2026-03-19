/**
 * PostgreSQL Stats
 * GET /api/knowledge/postgres — Table list + row counts
 */
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const DOCKER = process.platform === 'win32' ? 'wsl docker' : 'docker';

export async function GET() {
  try {
    // Query table sizes via docker exec
    const { stdout } = await execAsync(
      `${DOCKER} exec omni-postgres psql -U omni -d omni_brain -t -A -c "SELECT tablename, pg_total_relation_size(quote_ident(tablename))::bigint as size FROM pg_tables WHERE schemaname = 'public' ORDER BY size DESC" 2>&1`,
      { timeout: 8000 }
    );

    const tables = stdout.trim().split('\n').filter(l => l.includes('|')).map((line) => {
      const [name, sizeBytes] = line.split('|');
      const size = parseInt(sizeBytes) || 0;
      return {
        name: name.trim(),
        sizeBytes: size,
        sizeHuman: size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)}MB` : `${(size / 1024).toFixed(1)}KB`,
      };
    });

    // Get row counts for top tables
    const withCounts = await Promise.all(
      tables.slice(0, 20).map(async (t) => {
        try {
          const { stdout: countOut } = await execAsync(
            `${DOCKER} exec omni-postgres psql -U omni -d omni_brain -t -A -c "SELECT count(*) FROM \\"${t.name}\\"" 2>&1`,
            { timeout: 5000 }
          );
          return { ...t, rowCount: parseInt(countOut.trim()) || 0 };
        } catch {
          return { ...t, rowCount: -1 };
        }
      })
    );

    return NextResponse.json({
      status: 'up',
      database: 'omni_brain',
      host: '127.0.0.1:5433',
      tables: withCounts,
      tableCount: tables.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('PostgreSQL error:', error);
    return NextResponse.json({
      status: 'down',
      error: 'Failed to query PostgreSQL',
      host: '127.0.0.1:5433',
    }, { status: 500 });
  }
}
