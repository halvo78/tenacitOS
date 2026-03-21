"use client";

import { useEffect, useState } from "react";
import { Database, Search, Brain, Server, HardDrive, Globe, BookOpen, RefreshCw } from "lucide-react";

interface KnowledgeData {
  qdrant: {
    status: string;
    collections: number;
    totalVectors: number;
    collectionList: Array<{ name: string; vectors: number }>;
  };
  neo4j: { status: string; details: string };
  postgres: { status: string; details: string };
  redis: { status: string; details: string };
  obsidian: { status: string; noteCount: number };
  agentMemory: { fileCount: number; workspaceCount: number };
  summary: {
    totalVectors: number;
    qdrantCollections: number;
    obsidianNotes: number;
    memoryFiles: number;
    agentWorkspaces: number;
  };
}

function StatusDot({ status }: { status: string }) {
  const color = status === "up" ? "#4ade80" : status === "down" ? "#f87171" : "#fbbf24";
  return (
    <div style={{
      width: 8, height: 8, borderRadius: "50%",
      backgroundColor: color,
      boxShadow: `0 0 6px ${color}`,
    }} />
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div style={{
      padding: "20px",
      backgroundColor: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      flex: "1 1 180px",
      minWidth: "180px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <div style={{ color }}>{icon}</div>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-heading)", fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-1px" }}>
        {typeof value === "number" ? value.toLocaleString("en-AU") : value}
      </div>
    </div>
  );
}

export default function KnowledgePage() {
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<unknown[] | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch knowledge data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/knowledge")
      .then((res) => res.json())
      .then((json) => { if (!cancelled) { setData(json); setLoading(false); } })
      .catch((err) => { console.error("Failed to fetch knowledge data:", err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(searchQuery)}`);
      const json = await res.json();
      setSearchResults(json.results || []);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 700, letterSpacing: "-1px", color: "var(--text-primary)", marginBottom: "4px" }}>
            Knowledge Systems
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>
            All knowledge backends — vectors, graphs, databases, notes
          </p>
        </div>
        <button onClick={fetchData} style={{ padding: "8px 16px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search across all knowledge stores..."
            style={{
              width: "100%", padding: "10px 12px 10px 36px",
              backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px",
              color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)",
            }}
          />
        </div>
        <button onClick={handleSearch} disabled={searching} style={{
          padding: "10px 20px", backgroundColor: "var(--accent)", color: "white",
          border: "none", borderRadius: "8px", fontSize: "13px", cursor: "pointer",
        }}>
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Search results */}
      {searchResults && (
        <div style={{ marginBottom: "24px", padding: "16px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>
            Search Results ({(searchResults as unknown[]).length})
          </h3>
          {(searchResults as Array<{ file?: string; content?: string; score?: number }>).slice(0, 10).map((r, i) => (
            <div key={i} style={{ padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none", fontSize: "12px", fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
              {r.file || r.content || JSON.stringify(r).slice(0, 200)}
            </div>
          ))}
          {(searchResults as unknown[]).length === 0 && <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No results found</p>}
        </div>
      )}

      {loading && !data ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>Loading knowledge systems...</div>
      ) : data ? (
        <>
          {/* Summary stats */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "32px" }}>
            <StatCard label="Total Vectors" value={data.summary.totalVectors} icon={<Database size={16} />} color="#60a5fa" />
            <StatCard label="Qdrant Collections" value={data.summary.qdrantCollections} icon={<Server size={16} />} color="#a78bfa" />
            <StatCard label="Obsidian Notes" value={data.summary.obsidianNotes} icon={<BookOpen size={16} />} color="#4ade80" />
            <StatCard label="Memory Files" value={data.summary.memoryFiles} icon={<Brain size={16} />} color="#fbbf24" />
            <StatCard label="Agent Workspaces" value={data.summary.agentWorkspaces} icon={<Globe size={16} />} color="#f472b6" />
          </div>

          {/* Backend status grid */}
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px" }}>Backend Status</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px", marginBottom: "32px" }}>
            {/* Qdrant */}
            <div style={{ padding: "16px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <StatusDot status={data.qdrant.status} />
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Qdrant</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>:6333</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                {data.qdrant.collections} collections · {data.qdrant.totalVectors.toLocaleString()} vectors
              </div>
              {data.qdrant.collectionList.slice(0, 5).map((c) => (
                <div key={c.name} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", padding: "2px 0" }}>
                  <span>{c.name}</span>
                  <span>{c.vectors.toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* Neo4j */}
            <div style={{ padding: "16px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <StatusDot status={data.neo4j.status} />
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Neo4j</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>:7687</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Graph database · {data.neo4j.details}</div>
            </div>

            {/* PostgreSQL */}
            <div style={{ padding: "16px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <StatusDot status={data.postgres.status} />
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>PostgreSQL</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>:5433</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>omni_brain · {data.postgres.details}</div>
            </div>

            {/* Redis */}
            <div style={{ padding: "16px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <StatusDot status={data.redis.status} />
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Redis</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>:6381</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Cache · {data.redis.details}</div>
            </div>

            {/* Obsidian */}
            <div style={{ padding: "16px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <StatusDot status={data.obsidian.status} />
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Obsidian</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{data.obsidian.noteCount} notes</div>
            </div>

            {/* Agent Memory */}
            <div style={{ padding: "16px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <StatusDot status="up" />
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Agent Memory</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{data.agentMemory.fileCount} files across {data.agentMemory.workspaceCount} workspaces</div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
