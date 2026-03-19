/**
 * Qdrant Explorer
 * GET /api/knowledge/qdrant — List collections + optional search
 * GET /api/knowledge/qdrant?collection=X&query=Y — Search within collection
 */
import { NextRequest, NextResponse } from 'next/server';

const QDRANT_URL = 'http://127.0.0.1:6333';

async function qdrantFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    ...options,
    signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  return res.json();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collection = searchParams.get('collection');
  const query = searchParams.get('query');

  try {
    if (!collection) {
      // List all collections with details
      const data = await qdrantFetch('/collections');
      const collections = data.result?.collections || [];

      const details = await Promise.all(
        collections.map(async (c: { name: string }) => {
          try {
            const info = await qdrantFetch(`/collections/${c.name}`);
            const result = info.result || {};
            return {
              name: c.name,
              vectors: result.points_count || result.vectors_count || 0,
              dimension: result.config?.params?.vectors?.size || null,
              distance: result.config?.params?.vectors?.distance || null,
              indexedVectors: result.indexed_vectors_count || 0,
              status: result.status || 'unknown',
            };
          } catch {
            return { name: c.name, vectors: 0 };
          }
        })
      );

      return NextResponse.json({
        collections: details.sort((a: { vectors: number }, b: { vectors: number }) => b.vectors - a.vectors),
        totalVectors: details.reduce((s: number, c: { vectors: number }) => s + c.vectors, 0),
        count: details.length,
      });
    }

    if (query) {
      // Search within collection (requires embedding — return scroll instead)
      const scroll = await qdrantFetch(`/collections/${collection}/points/scroll`, {
        method: 'POST',
        body: JSON.stringify({ limit: 20, with_payload: true, with_vector: false }),
      });
      return NextResponse.json({
        collection,
        query,
        note: 'Semantic search requires embedding. Showing recent points instead.',
        points: scroll.result?.points || [],
        count: scroll.result?.points?.length || 0,
      });
    }

    // Collection details
    const info = await qdrantFetch(`/collections/${collection}`);
    const scroll = await qdrantFetch(`/collections/${collection}/points/scroll`, {
      method: 'POST',
      body: JSON.stringify({ limit: 10, with_payload: true, with_vector: false }),
    });

    return NextResponse.json({
      collection,
      info: info.result,
      samplePoints: scroll.result?.points || [],
    });
  } catch (error) {
    console.error('Qdrant error:', error);
    return NextResponse.json({ error: 'Failed to query Qdrant' }, { status: 500 });
  }
}
