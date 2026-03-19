"use client";

import { useEffect, useState } from "react";
import {
  startOfWeek,
  addDays,
  format,
  isSameDay,
  addWeeks,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar, Clock } from "lucide-react";

interface CronJob {
  id: string;
  agentId: string;
  name: string;
  enabled: boolean;
  scheduleDisplay: string;
  timezone: string;
  nextRun: string | null;
  lastRun: string | null;
  description: string;
}

const AGENT_COLORS: Record<string, string> = {
  main: "#FFD700", kael: "#8B4513", jarvis: "#4169E1", gilfoil: "#DC143C",
  strategist: "#2E8B57", hormozi: "#FF8C00", goggins: "#B22222", buffett: "#006400",
  naval: "#4682B4", aurelius: "#708090", musk: "#1E90FF", default: "#8b5cf6",
};

export function WeeklyCalendar() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);

  useEffect(() => {
    fetch("/api/cron")
      .then((res) => res.json())
      .then((data) => setJobs(Array.isArray(data) ? data : []))
      .catch(() => setJobs([]));
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getJobsForDayAndHour = (day: Date, hour: number) => {
    return jobs.filter((job) => {
      if (!job.enabled) return false;
      // Check nextRun
      if (job.nextRun) {
        const d = new Date(job.nextRun);
        if (isSameDay(d, day) && d.getHours() === hour) return true;
      }
      // Check lastRun
      if (job.lastRun) {
        const d = new Date(job.lastRun);
        if (isSameDay(d, day) && d.getHours() === hour) return true;
      }
      // Recurring jobs — show on every day at a reasonable hour
      const sched = job.scheduleDisplay || "";
      if (sched.includes("Every") || sched.includes("*/")) {
        // Show at hour 9 as a marker for recurring
        if (hour === 9) return true;
      }
      return false;
    });
  };

  const getJobsForDay = (day: Date) => {
    return jobs.filter((job) => {
      if (!job.enabled) return false;
      if (job.nextRun && isSameDay(new Date(job.nextRun), day)) return true;
      if (job.lastRun && isSameDay(new Date(job.lastRun), day)) return true;
      if ((job.scheduleDisplay || "").includes("Every") || (job.scheduleDisplay || "").includes("*/")) return true;
      return false;
    });
  };

  return (
    <div>
      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}
            className="p-2 rounded-lg transition-colors"
            style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            <ChevronLeft size={16} />
          </button>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
            {format(days[0], "MMM d")} – {format(days[6], "MMM d, yyyy")}
          </h2>
          <button
            onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
            className="p-2 rounded-lg transition-colors"
            style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          className="px-4 py-2 rounded-lg text-sm"
          style={{ backgroundColor: "var(--accent)", color: "white", border: "none", cursor: "pointer" }}
        >
          This Week
        </button>
      </div>

      {/* Day summary cards */}
      <div className="grid grid-cols-7 gap-2 mb-6">
        {days.map((day) => {
          const dayJobs = getJobsForDay(day);
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              style={{
                padding: "12px",
                backgroundColor: isToday ? "rgba(139, 92, 246, 0.1)" : "var(--surface)",
                border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "10px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {format(day, "EEE")}
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: isToday ? "var(--accent)" : "var(--text-primary)", fontFamily: "var(--font-heading)" }}>
                {format(day, "d")}
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
                {dayJobs.length} job{dayJobs.length !== 1 ? "s" : ""}
              </div>
              {dayJobs.slice(0, 2).map((job) => (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  style={{
                    fontSize: "8px",
                    padding: "2px 4px",
                    marginTop: "3px",
                    borderRadius: "3px",
                    backgroundColor: `${AGENT_COLORS[job.agentId] || AGENT_COLORS.default}22`,
                    borderLeft: `2px solid ${AGENT_COLORS[job.agentId] || AGENT_COLORS.default}`,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {job.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Hourly grid (compact: 6am-11pm) */}
      <div style={{ border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
        {/* Header */}
        <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ padding: "8px", backgroundColor: "var(--surface)" }} />
          {days.map((day) => (
            <div key={day.toISOString()} style={{
              padding: "8px",
              textAlign: "center",
              backgroundColor: isSameDay(day, new Date()) ? "rgba(139, 92, 246, 0.08)" : "var(--surface)",
              fontFamily: "var(--font-body)",
              fontSize: "11px",
              fontWeight: 600,
              color: isSameDay(day, new Date()) ? "var(--accent)" : "var(--text-muted)",
              borderLeft: "1px solid var(--border)",
            }}>
              {format(day, "EEE d")}
            </div>
          ))}
        </div>

        {/* Hours */}
        {hours.filter(h => h >= 6 && h <= 23).map((hour) => (
          <div key={hour} className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
            <div style={{
              padding: "4px 8px",
              fontSize: "10px",
              color: "var(--text-muted)",
              textAlign: "right",
              backgroundColor: "var(--surface)",
              minHeight: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
            }}>
              {hour.toString().padStart(2, "0")}:00
            </div>
            {days.map((day) => {
              const cellJobs = getJobsForDayAndHour(day, hour);
              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  style={{
                    minHeight: "32px",
                    borderLeft: "1px solid var(--border)",
                    padding: "2px",
                    backgroundColor: isSameDay(day, new Date()) ? "rgba(139, 92, 246, 0.03)" : "transparent",
                  }}
                >
                  {cellJobs.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      style={{
                        fontSize: "8px",
                        padding: "2px 3px",
                        borderRadius: "2px",
                        backgroundColor: `${AGENT_COLORS[job.agentId] || AGENT_COLORS.default}33`,
                        color: AGENT_COLORS[job.agentId] || AGENT_COLORS.default,
                        cursor: "pointer",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: 600,
                      }}
                    >
                      {job.name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Job detail popup */}
      {selectedJob && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setSelectedJob(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "90%", maxWidth: "450px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "24px" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} style={{ color: "var(--accent)" }} />
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                {selectedJob.name}
              </h3>
            </div>
            <div style={{ display: "grid", gap: "6px", fontSize: "13px" }}>
              {[
                ["Agent", selectedJob.agentId],
                ["Schedule", selectedJob.scheduleDisplay],
                ["Timezone", selectedJob.timezone],
                ["Status", selectedJob.enabled ? "Enabled" : "Disabled"],
                selectedJob.nextRun ? ["Next Run", new Date(selectedJob.nextRun).toLocaleString("en-AU")] : null,
                selectedJob.lastRun ? ["Last Run", new Date(selectedJob.lastRun).toLocaleString("en-AU")] : null,
              ].filter((x): x is [string, string] => x !== null).map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ color: "var(--text-primary)" }}>{value}</span>
                </div>
              ))}
            </div>
            {selectedJob.description && (
              <div style={{ marginTop: "12px", padding: "10px", backgroundColor: "var(--surface-elevated)", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                {selectedJob.description}
              </div>
            )}
            <button onClick={() => setSelectedJob(null)} style={{ marginTop: "16px", width: "100%", padding: "10px", backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "13px" }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
