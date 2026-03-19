"use client";

import { useEffect, useState } from "react";
import { Activity, Zap, Brain, Clock, TrendingUp, AlertCircle } from "lucide-react";

interface DigestData {
  activeSessions: number;
  totalAgents: number;
  activeAgents: number;
  cronJobsToday: number;
  servicesUp: number;
  servicesTotal: number;
  qdrantVectors: number;
  memoryFiles: number;
  uptime: string;
}

export function DailyDigest() {
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDigest() {
      try {
        const [healthRes, knowledgeRes, statsRes, officeRes] = await Promise.all([
          fetch("/api/health").then(r => r.json()).catch(() => null),
          fetch("/api/knowledge").then(r => r.json()).catch(() => null),
          fetch("/api/system/stats").then(r => r.json()).catch(() => null),
          fetch("/api/office").then(r => r.json()).catch(() => null),
        ]);

        const agents = officeRes?.agents || [];
        const activeAgents = agents.filter((a: { isActive: boolean }) => a.isActive).length;

        setData({
          activeSessions: activeAgents,
          totalAgents: agents.length,
          activeAgents,
          cronJobsToday: 0, // Would need cron data
          servicesUp: healthRes?.summary?.up || 0,
          servicesTotal: healthRes?.summary?.total || 0,
          qdrantVectors: knowledgeRes?.summary?.totalVectors || 0,
          memoryFiles: knowledgeRes?.summary?.memoryFiles || 0,
          uptime: statsRes?.uptime || "—",
        });
      } catch {
        // silent
      }
      setLoading(false);
    }
    fetchDigest();
  }, []);

  if (loading || !data) {
    return (
      <div style={{ padding: "16px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading daily digest...</div>
      </div>
    );
  }

  const items = [
    { icon: <Zap size={14} />, label: "Active Agents", value: `${data.activeAgents}/${data.totalAgents}`, color: data.activeAgents > 0 ? "#4ade80" : "#666" },
    { icon: <Activity size={14} />, label: "Services", value: `${data.servicesUp}/${data.servicesTotal} up`, color: data.servicesUp === data.servicesTotal ? "#4ade80" : "#fbbf24" },
    { icon: <Brain size={14} />, label: "Knowledge", value: `${data.qdrantVectors.toLocaleString()} vectors`, color: "#a78bfa" },
    { icon: <TrendingUp size={14} />, label: "Memory", value: `${data.memoryFiles} files`, color: "#60a5fa" },
    { icon: <Clock size={14} />, label: "Uptime", value: data.uptime, color: "var(--text-secondary)" },
  ];

  return (
    <div style={{
      padding: "16px",
      backgroundColor: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
        <AlertCircle size={14} style={{ color: "var(--accent)" }} />
        <span style={{ fontFamily: "var(--font-heading)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
          Daily Digest
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "auto" }}>
          {new Date().toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric" })}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: item.color }}>{item.icon}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{item.label}</span>
            </div>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
