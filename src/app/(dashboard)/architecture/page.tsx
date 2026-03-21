"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Server, Database, Bot, Globe, Activity, X } from "lucide-react";

interface ArchNode {
  id: string;
  type: "service" | "database" | "agent" | "external" | "monitoring";
  name: string;
  port?: number;
  status: "up" | "down" | "unknown";
  detail?: string;
}

interface ArchEdge {
  from: string;
  to: string;
  label: string;
}

interface ArchData {
  nodes: ArchNode[];
  edges: ArchEdge[];
  stats: {
    totalAgents: number;
    totalRepos: number;
    totalContainers: number;
    totalCrons: number;
    totalSkills: number;
  };
  timestamp: string;
}

const typeColors: Record<string, string> = {
  service: "#60a5fa",
  database: "#4ade80",
  agent: "#a78bfa",
  external: "#f97316",
  monitoring: "#fbbf24",
};

const typeIcons: Record<string, typeof Server> = {
  service: Server,
  database: Database,
  agent: Bot,
  external: Globe,
  monitoring: Activity,
};

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: "14px 18px", backgroundColor: "var(--surface)",
      border: "1px solid var(--border)", borderRadius: "10px",
      flex: "1 1 140px", minWidth: "120px",
    }}>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-heading)", fontSize: "28px", fontWeight: 700, color, letterSpacing: "-1px" }}>
        {value}
      </div>
    </div>
  );
}

export default function ArchitecturePage() {
  const [data, setData] = useState<ArchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ArchNode | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/architecture");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch architecture data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group nodes by type
  const groups: Record<string, ArchNode[]> = {};
  if (data) {
    for (const node of data.nodes) {
      const g = node.type;
      if (!groups[g]) groups[g] = [];
      groups[g].push(node);
    }
  }

  const groupOrder = ["service", "database", "monitoring", "agent", "external"];
  const groupLabels: Record<string, string> = {
    service: "Services",
    database: "Knowledge Stores",
    agent: "Agents / PM2",
    external: "External APIs",
    monitoring: "Monitoring",
  };

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 700, letterSpacing: "-1px", color: "var(--text-primary)", marginBottom: "4px" }}>
            Architecture Map
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>
            Interactive system topology -- services, databases, agents
          </p>
        </div>
        <button
          onClick={fetchData}
          style={{
            padding: "8px 16px", backgroundColor: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px", fontSize: "12px",
          }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>Loading architecture...</div>
      ) : data ? (
        <>
          {/* Stats bar */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
            <StatCard label="Agents" value={data.stats.totalAgents} color="#a78bfa" />
            <StatCard label="Repos" value={data.stats.totalRepos} color="#60a5fa" />
            <StatCard label="Containers" value={data.stats.totalContainers} color="#4ade80" />
            <StatCard label="Cron Jobs" value={data.stats.totalCrons} color="#fbbf24" />
            <StatCard label="Skills" value={data.stats.totalSkills} color="#f472b6" />
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
            {Object.entries(typeColors).map(([type, color]) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color }} />
                <span style={{ textTransform: "capitalize" }}>{type}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
              <span>Up</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#f87171", boxShadow: "0 0 6px #f87171" }} />
              <span>Down</span>
            </div>
          </div>

          {/* Node groups */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {groupOrder.filter(g => groups[g]).map((groupKey) => {
              const nodes = groups[groupKey];
              const Icon = typeIcons[groupKey] || Server;
              const color = typeColors[groupKey] || "#888";

              return (
                <div key={groupKey} style={{
                  backgroundColor: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "12px", padding: "16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <Icon size={16} style={{ color }} />
                    <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {groupLabels[groupKey] || groupKey}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      ({nodes.length})
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    {nodes.map((node) => {
                      const isSelected = selected?.id === node.id;
                      const statusColor = node.status === "up" ? "#4ade80" : node.status === "down" ? "#f87171" : "#888";
                      // Find edges for this node
                      const nodeEdges = data.edges.filter(e => e.from === node.id || e.to === node.id);

                      return (
                        <button
                          key={node.id}
                          onClick={() => setSelected(isSelected ? null : node)}
                          style={{
                            padding: "10px 14px", borderRadius: "10px",
                            backgroundColor: isSelected ? `${color}20` : "var(--card-elevated)",
                            border: `1px solid ${isSelected ? color : "var(--border)"}`,
                            cursor: "pointer", textAlign: "left",
                            minWidth: "140px", flex: "0 1 auto",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                            <div style={{
                              width: 8, height: 8, borderRadius: "50%",
                              backgroundColor: statusColor,
                              boxShadow: `0 0 6px ${statusColor}`,
                            }} />
                            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                              {node.name}
                            </span>
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {node.port ? `:${node.port}` : ""}
                            {nodeEdges.length > 0 ? ` -- ${nodeEdges.length} connections` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Details panel */}
          {selected && (
            <div style={{
              position: "fixed", bottom: "24px", right: "24px",
              width: "360px", maxHeight: "400px", overflow: "auto",
              backgroundColor: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "12px", padding: "20px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 100,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {selected.name}
                </span>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Type</span>
                  <span style={{ color: typeColors[selected.type], textTransform: "capitalize", fontWeight: 600 }}>{selected.type}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Status</span>
                  <span style={{ color: selected.status === "up" ? "#4ade80" : "#f87171", fontWeight: 600 }}>{selected.status}</span>
                </div>
                {selected.port && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Port</span>
                    <span style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>{selected.port}</span>
                  </div>
                )}

                {/* Connections */}
                <div style={{ marginTop: "8px", borderTop: "1px solid var(--border)", paddingTop: "8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Connections
                  </span>
                  {data.edges
                    .filter(e => e.from === selected.id || e.to === selected.id)
                    .map((edge, i) => {
                      const targetId = edge.from === selected.id ? edge.to : edge.from;
                      const targetNode = data.nodes.find(n => n.id === targetId);
                      const direction = edge.from === selected.id ? "->" : "<-";
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "3px 0" }}>
                          <span style={{ color: "var(--text-secondary)" }}>
                            {direction} {targetNode?.name || targetId}
                          </span>
                          <span style={{ color: "var(--text-muted)" }}>{edge.label}</span>
                        </div>
                      );
                    })}
                  {data.edges.filter(e => e.from === selected.id || e.to === selected.id).length === 0 && (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "3px 0" }}>No connections</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>Failed to load architecture data</div>
      )}
    </div>
  );
}
