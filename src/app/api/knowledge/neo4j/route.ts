/**
 * Neo4j Graph Stats
 * GET /api/knowledge/neo4j — Node counts, relationship counts, labels
 */
import { NextResponse } from 'next/server';

const NEO4J_URL = 'http://127.0.0.1:7474';
const NEO4J_BOLT = 'bolt://127.0.0.1:7687';
const NEO4J_USER = 'neo4j';
const NEO4J_PASS = 'omni_secure_graph';

async function neo4jQuery(cypher: string): Promise<unknown> {
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64'),
    },
    body: JSON.stringify({
      statements: [{ statement: cypher, resultDataContents: ['row'] }],
    }),
    signal: AbortSignal.timeout(5000),
  });
  return res.json();
}

export async function GET() {
  try {
    // Get node count per label
    const labelsResult = await neo4jQuery('CALL db.labels() YIELD label RETURN label') as { results?: Array<{ data?: Array<{ row: string[] }> }> };
    const labels = labelsResult?.results?.[0]?.data?.map((d) => d.row[0]) || [];

    const labelCounts: Array<{ label: string; count: number }> = [];
    for (const label of labels.slice(0, 20)) {
      try {
        const countResult = await neo4jQuery(`MATCH (n:\`${label}\`) RETURN count(n) as c`) as { results?: Array<{ data?: Array<{ row: number[] }> }> };
        const count = countResult?.results?.[0]?.data?.[0]?.row?.[0] || 0;
        labelCounts.push({ label, count });
      } catch {
        labelCounts.push({ label, count: 0 });
      }
    }

    // Total nodes
    const totalResult = await neo4jQuery('MATCH (n) RETURN count(n) as total') as { results?: Array<{ data?: Array<{ row: number[] }> }> };
    const totalNodes = totalResult?.results?.[0]?.data?.[0]?.row?.[0] || 0;

    // Total relationships
    const relResult = await neo4jQuery('MATCH ()-[r]->() RETURN count(r) as total') as { results?: Array<{ data?: Array<{ row: number[] }> }> };
    const totalRelationships = relResult?.results?.[0]?.data?.[0]?.row?.[0] || 0;

    return NextResponse.json({
      status: 'up',
      bolt: NEO4J_BOLT,
      totalNodes,
      totalRelationships,
      labels: labelCounts.sort((a, b) => b.count - a.count),
      labelCount: labels.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Neo4j error:', error);
    return NextResponse.json({
      status: 'down',
      error: 'Failed to query Neo4j',
      bolt: NEO4J_BOLT,
    }, { status: 500 });
  }
}
