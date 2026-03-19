/**
 * Redis Cache Stats
 * GET /api/knowledge/redis — Key count, memory usage, info
 */
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const { stdout: info } = await execAsync(
      'docker exec redis-stack redis-cli -a omni_secure_redis INFO memory 2>nul'
    );

    const { stdout: dbsize } = await execAsync(
      'docker exec redis-stack redis-cli -a omni_secure_redis DBSIZE 2>nul'
    );

    // Parse memory info
    const usedMemory = info.match(/used_memory_human:(\S+)/)?.[1] || 'unknown';
    const peakMemory = info.match(/used_memory_peak_human:(\S+)/)?.[1] || 'unknown';
    const keyCount = parseInt(dbsize.match(/\d+/)?.[0] || '0');

    return NextResponse.json({
      status: 'up',
      host: '127.0.0.1:6381',
      keyCount,
      usedMemory,
      peakMemory,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Redis error:', error);
    return NextResponse.json({
      status: 'down',
      error: 'Failed to query Redis',
    }, { status: 500 });
  }
}
