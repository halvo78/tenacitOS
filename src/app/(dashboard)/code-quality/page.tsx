"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, GitBranch, CheckCircle2, XCircle, ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";

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
  status: "active" | "stale" | "archived";
}

interface CodeQualityData {
  repos: RepoInfo[];
  summary: {
    total: number;
    active: number;
    withTests: number;
    withCI: number;
    clean: number;
    dirty: number;
  };
  timestamp: string;
}

type SortKey = "name" | "lastCommit" | "language" | "fileCount" | "status";
type FilterStatus = "all" | "active" | "stale" | "archived";
type FilterClean = "all" | "clean" | "dirty";

function excellenceScore(repo: RepoInfo): number {
  let score = 0;
  if (repo.hasTests) score += 25;
  if (repo.hasCI) score += 25;
  if (repo.hasReadme) score += 25;
  if (!repo.dirty) score += 25;
  return score;
}

function scoreColor(score: number): string {
  if (score >= 75) return "#4ade80";
  if (score >= 50) return "#fbbf24";
  if (score >= 25) return "#f97316";
  return "#f87171";
}

function statusColor(status: string): string {
  if (status === "active") return "#4ade80";
  if (status === "stale") return "#fbbf24";
  return "#888";
}

function BoolBadge({ value, label }: { value: boolean; label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "3px",
      padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 500,
      backgroundColor: value ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
      color: value ? "#4ade80" : "#f87171",
    }}>
      {value ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      {label}
    </span>
  );
}

export default function CodeQualityPage() {
  const [data, setData] = useState<CodeQualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("lastCommit");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterClean, setFilterClean] = useState<FilterClean>("all");
  const [filterLang, setFilterLang] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/code-quality");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch code quality data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const languages = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.repos.map(r => r.language));
    return Array.from(set).sort();
  }, [data]);

  const filteredRepos = useMemo(() => {
    if (!data) return [];
    let repos = [...data.repos];

    if (filterStatus !== "all") repos = repos.filter(r => r.status === filterStatus);
    if (filterClean === "clean") repos = repos.filter(r => !r.dirty);
    if (filterClean === "dirty") repos = repos.filter(r => r.dirty);
    if (filterLang !== "all") repos = repos.filter(r => r.language === filterLang);

    repos.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "lastCommit": cmp = (a.lastCommit || "").localeCompare(b.lastCommit || ""); break;
        case "language": cmp = a.language.localeCompare(b.language); break;
        case "fileCount": cmp = a.fileCount - b.fileCount; break;
        case "status": cmp = a.status.localeCompare(b.status); break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return repos;
  }, [data, filterStatus, filterClean, filterLang, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 700, letterSpacing: "-1px", color: "var(--text-primary)", marginBottom: "4px" }}>
            Code Quality Dashboard
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>
            Repository health and excellence metrics
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
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>Scanning repositories...</div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
            {[
              { label: "Total Repos", value: data.summary.total, color: "#60a5fa" },
              { label: "Active", value: data.summary.active, color: "#4ade80" },
              { label: "With Tests", value: data.summary.withTests, color: "#a78bfa" },
              { label: "With CI", value: data.summary.withCI, color: "#fbbf24" },
              { label: "Clean", value: data.summary.clean, color: "#4ade80" },
              { label: "Dirty", value: data.summary.dirty, color: "#f87171" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
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
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              style={{
                padding: "6px 10px", backgroundColor: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "6px", color: "var(--text-secondary)", fontSize: "12px",
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="stale">Stale</option>
              <option value="archived">Archived</option>
            </select>
            <select
              value={filterClean}
              onChange={(e) => setFilterClean(e.target.value as FilterClean)}
              style={{
                padding: "6px 10px", backgroundColor: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "6px", color: "var(--text-secondary)", fontSize: "12px",
              }}
            >
              <option value="all">All (Clean/Dirty)</option>
              <option value="clean">Clean Only</option>
              <option value="dirty">Dirty Only</option>
            </select>
            <select
              value={filterLang}
              onChange={(e) => setFilterLang(e.target.value)}
              style={{
                padding: "6px 10px", backgroundColor: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "6px", color: "var(--text-secondary)", fontSize: "12px",
              }}
            >
              <option value="all">All Languages</option>
              {languages.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
              {filteredRepos.length} repos shown
            </span>
          </div>

          {/* Repo table */}
          <div style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {([
                    { key: "name" as SortKey, label: "Repository" },
                    { key: "language" as SortKey, label: "Language" },
                    { key: "lastCommit" as SortKey, label: "Last Commit" },
                    { key: "status" as SortKey, label: "Status" },
                    { key: "fileCount" as SortKey, label: "Files" },
                  ]).map(({ key, label }) => (
                    <th key={key}
                      onClick={() => handleSort(key)}
                      style={{
                        textAlign: "left", padding: "10px 12px", fontSize: "11px",
                        color: sortKey === key ? "var(--text-primary)" : "var(--text-muted)",
                        fontWeight: 600, cursor: "pointer", userSelect: "none",
                        textTransform: "uppercase", letterSpacing: "0.5px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {label}
                        <ArrowUpDown size={10} style={{ opacity: sortKey === key ? 1 : 0.3 }} />
                      </div>
                    </th>
                  ))}
                  <th style={{ textAlign: "center", padding: "10px 12px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Score
                  </th>
                  <th style={{ width: "28px" }} />
                </tr>
              </thead>
              <tbody>
                {filteredRepos.map((repo) => {
                  const isExpanded = expanded === repo.name;
                  const score = excellenceScore(repo);

                  return (
                    <React.Fragment key={repo.name}>
                      <tr
                        onClick={() => setExpanded(isExpanded ? null : repo.name)}
                        style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                      >
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <GitBranch size={14} style={{ color: "var(--text-muted)" }} />
                            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{repo.name}</span>
                            {repo.dirty && (
                              <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", backgroundColor: "rgba(248,113,113,0.15)", color: "#f87171" }}>
                                dirty
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--text-secondary)" }}>
                          {repo.language}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                          {repo.lastCommit || "-"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{
                            fontSize: "10px", fontWeight: 600, padding: "2px 6px", borderRadius: "4px",
                            backgroundColor: `${statusColor(repo.status)}15`,
                            color: statusColor(repo.status),
                            textTransform: "uppercase",
                          }}>
                            {repo.status}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                          {repo.fileCount}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <div style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: "32px", height: "32px", borderRadius: "50%",
                            backgroundColor: `${scoreColor(score)}15`,
                            border: `2px solid ${scoreColor(score)}`,
                            fontSize: "11px", fontWeight: 700, color: scoreColor(score),
                          }}>
                            {score}
                          </div>
                        </td>
                        <td style={{ padding: "10px 4px" }}>
                          {isExpanded ? <ChevronDown size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />}
                        </td>
                      </tr>

                      {/* Expanded row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: "12px 16px", backgroundColor: "var(--card-elevated)" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "12px" }}>
                              <div style={{ flex: "1 1 200px" }}>
                                <div style={{ color: "var(--text-muted)", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                  Branch
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--text-primary)", fontFamily: "monospace" }}>
                                  <GitBranch size={12} />
                                  {repo.branch}
                                </div>
                              </div>
                              <div style={{ flex: "1 1 300px" }}>
                                <div style={{ color: "var(--text-muted)", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                  Last Message
                                </div>
                                <div style={{ color: "var(--text-secondary)" }}>
                                  {repo.lastMessage || "-"}
                                </div>
                              </div>
                              <div style={{ flex: "1 1 200px" }}>
                                <div style={{ color: "var(--text-muted)", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                  Quality Checks
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                  <BoolBadge value={repo.hasTests} label="Tests" />
                                  <BoolBadge value={repo.hasCI} label="CI" />
                                  <BoolBadge value={repo.hasReadme} label="README" />
                                  <BoolBadge value={!repo.dirty} label="Clean" />
                                </div>
                              </div>
                              <div style={{ flex: "0 0 auto" }}>
                                <div style={{ color: "var(--text-muted)", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                  Excellence
                                </div>
                                <div style={{
                                  display: "flex", alignItems: "center", gap: "8px",
                                }}>
                                  <div style={{ width: "80px", height: "6px", borderRadius: "3px", backgroundColor: "var(--surface)", overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${score}%`, backgroundColor: scoreColor(score), borderRadius: "3px" }} />
                                  </div>
                                  <span style={{ fontWeight: 700, color: scoreColor(score) }}>{score}%</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>Failed to load code quality data</div>
      )}
    </div>
  );
}
