"use client";

import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, RefreshCw, ChevronDown, ChevronRight, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

interface Check {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  latency?: number;
}

interface Section {
  name: string;
  score: number;
  checks: Check[];
}

interface CommissioningData {
  timestamp: string;
  grade: string;
  score: number;
  sections: Section[];
}

function gradeColor(grade: string): string {
  if (grade.startsWith("S")) return "#4ade80";
  if (grade === "A") return "#60a5fa";
  if (grade === "B") return "#fbbf24";
  if (grade === "C") return "#f97316";
  return "#f87171";
}

function statusIcon(status: "pass" | "fail" | "warn") {
  if (status === "pass") return <CheckCircle2 size={16} style={{ color: "#4ade80" }} />;
  if (status === "fail") return <XCircle size={16} style={{ color: "#f87171" }} />;
  return <AlertTriangle size={16} style={{ color: "#fbbf24" }} />;
}

export default function CommissioningPage() {
  const [data, setData] = useState<CommissioningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/commissioning");
      const json = await res.json();
      setData(json);
      // Auto-expand all sections on first load
      const exp: Record<string, boolean> = {};
      for (const s of json.sections) {
        exp[s.name] = true;
      }
      setExpanded(exp);
    } catch (err) {
      console.error("Failed to fetch commissioning data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000); // 5 min auto-refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleSection = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 700, letterSpacing: "-1px", color: "var(--text-primary)", marginBottom: "4px" }}>
            System Commissioning Report
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>
            Full system audit with live checks
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
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Run Again
        </button>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>Running system audit...</div>
      ) : data ? (
        <>
          {/* Grade Hero */}
          <div style={{
            display: "flex", alignItems: "center", gap: "32px", padding: "32px",
            backgroundColor: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "16px", marginBottom: "24px",
          }}>
            {/* Grade Badge */}
            <div style={{
              width: "120px", height: "120px", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: `${gradeColor(data.grade)}15`,
              border: `3px solid ${gradeColor(data.grade)}`,
              boxShadow: `0 0 30px ${gradeColor(data.grade)}30`,
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: "var(--font-heading)", fontSize: "42px", fontWeight: 900,
                color: gradeColor(data.grade), letterSpacing: "-2px",
              }}>
                {data.grade}
              </span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Score bar */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "32px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {data.score}
                </span>
                <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>/ 100</span>
              </div>
              <div style={{ height: "8px", borderRadius: "4px", backgroundColor: "var(--card-elevated)", overflow: "hidden", marginBottom: "12px" }}>
                <div style={{
                  height: "100%", width: `${data.score}%`,
                  backgroundColor: gradeColor(data.grade),
                  borderRadius: "4px",
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-muted)" }}>
                  <Clock size={12} />
                  <span>{new Date(data.timestamp).toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-muted)" }}>
                  <ShieldCheck size={12} />
                  <span>{data.sections.length} sections, {data.sections.reduce((s, sec) => s + sec.checks.length, 0)} checks</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section scores overview */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
            {data.sections.map((section) => (
              <div key={section.name} style={{
                padding: "12px 16px", backgroundColor: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: "10px",
                flex: "1 1 180px", minWidth: "160px",
              }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                  {section.name}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 700, color: gradeColor(section.score >= 85 ? "S" : section.score >= 60 ? "B" : "F") }}>
                    {section.score}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>/ 100</span>
                </div>
                <div style={{ height: "3px", borderRadius: "2px", backgroundColor: "var(--card-elevated)", marginTop: "6px" }}>
                  <div style={{
                    height: "100%", width: `${section.score}%`,
                    backgroundColor: gradeColor(section.score >= 85 ? "S" : section.score >= 60 ? "B" : "F"),
                    borderRadius: "2px",
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Expandable sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.sections.map((section) => (
              <div key={section.name} style={{
                backgroundColor: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "12px", overflow: "hidden",
              }}>
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.name)}
                  style={{
                    width: "100%", padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: "8px",
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-primary)", textAlign: "left",
                  }}
                >
                  {expanded[section.name] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", fontWeight: 600, flex: 1 }}>
                    {section.name}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {section.checks.filter(c => c.status === "pass").length}/{section.checks.length} passed
                  </span>
                  <span style={{
                    padding: "2px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 600,
                    backgroundColor: `${gradeColor(section.score >= 85 ? "S" : section.score >= 60 ? "B" : "F")}15`,
                    color: gradeColor(section.score >= 85 ? "S" : section.score >= 60 ? "B" : "F"),
                  }}>
                    {section.score}%
                  </span>
                </button>

                {/* Checks list */}
                {expanded[section.name] && (
                  <div style={{ padding: "0 16px 12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>Check</th>
                          <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>Status</th>
                          <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>Detail</th>
                          <th style={{ textAlign: "right", padding: "6px 8px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>Latency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.checks.map((check, i) => (
                          <tr key={i} style={{ borderBottom: i < section.checks.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <td style={{ padding: "8px", fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                              {check.name}
                            </td>
                            <td style={{ padding: "8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {statusIcon(check.status)}
                                <span style={{
                                  fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                                  color: check.status === "pass" ? "#4ade80" : check.status === "fail" ? "#f87171" : "#fbbf24",
                                }}>
                                  {check.status}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: "8px", fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                              {check.detail}
                            </td>
                            <td style={{ padding: "8px", fontSize: "12px", color: "var(--text-muted)", textAlign: "right", fontFamily: "monospace" }}>
                              {check.latency != null ? `${check.latency}ms` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>Failed to load commissioning data</div>
      )}
    </div>
  );
}
