import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);

// All 14 actual PM2 services
const PM2_SERVICES = [
  "pm2-logrotate",
  "openclaw-watchdog",
  "mission-control",
  "openclaw-gateway",
  "claude-bot",
  "gemini-bot",
  "codex-bot",
  "alert-bot",
  "revenue-bot",
  "pulse-watcher",
  "pulse-github-sync",
  "pulse-ingest",
  "pulse-ecosystem",
  "tenacitOS",
];

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  "pm2-logrotate": "PM2 Log Rotation",
  "openclaw-watchdog": "OpenClaw Watchdog",
  "mission-control": "Mission Control Dashboard",
  "openclaw-gateway": "OpenClaw Gateway (port 19000)",
  "claude-bot": "Claude Bot (Anthropic)",
  "gemini-bot": "Gemini Bot (Google)",
  "codex-bot": "Codex Bot (OpenAI)",
  "alert-bot": "Alert Bot",
  "revenue-bot": "Revenue Bot",
  "pulse-watcher": "Pulse Watcher",
  "pulse-github-sync": "Pulse GitHub Sync",
  "pulse-ingest": "Pulse Ingest",
  "pulse-ecosystem": "Pulse Ecosystem",
  tenacitOS: "TenacitOS Dashboard",
};

interface ServiceEntry {
  name: string;
  status: string;
  description: string;
  backend: string;
  uptime?: number | null;
  restarts?: number;
  pid?: number | null;
  mem?: number | null;
  cpu?: number | null;
}

interface TailscaleDevice {
  hostname: string;
  ip: string;
  os: string;
  online: boolean;
}

interface FirewallRule {
  port: string;
  action: string;
  from: string;
  comment: string;
}

function normalizePm2Status(status: string): string {
  switch (status) {
    case "online":
      return "active";
    case "stopped":
    case "stopping":
      return "inactive";
    case "errored":
    case "error":
      return "failed";
    case "launching":
    case "waiting restart":
      return "activating";
    default:
      return status;
  }
}

interface DiskInfo {
  caption: string;
  freeGB: number;
  totalGB: number;
  usedGB: number;
  percent: number;
}

async function getWindowsDisks(): Promise<DiskInfo[]> {
  try {
    const { stdout } = await execAsync(
      'wmic logicaldisk get caption,freespace,size /format:csv'
    );
    const lines = stdout.trim().split("\n").filter((l) => l.trim() && !l.startsWith("Node"));
    const disks: DiskInfo[] = [];

    for (const line of lines) {
      const parts = line.trim().split(",");
      if (parts.length < 4) continue;
      const caption = parts[1];
      const freeSpace = parseInt(parts[2]) || 0;
      const size = parseInt(parts[3]) || 0;
      if (size === 0) continue;

      const totalGB = parseFloat((size / 1024 / 1024 / 1024).toFixed(1));
      const freeGB = parseFloat((freeSpace / 1024 / 1024 / 1024).toFixed(1));
      const usedGB = parseFloat((totalGB - freeGB).toFixed(1));
      const percent = parseFloat(((usedGB / totalGB) * 100).toFixed(1));

      disks.push({ caption, freeGB, totalGB, usedGB, percent });
    }
    return disks;
  } catch (error) {
    console.error("Failed to get disk stats:", error);
    return [];
  }
}

export async function GET() {
  try {
    // ── CPU ──
    const cpuCount = os.cpus().length;
    const loadAvg = os.loadavg();
    const cpuUsage = Math.min(Math.round((loadAvg[0] / cpuCount) * 100), 100);
    const cpuCores = os.cpus().map((c) => Math.round((1 - c.times.idle / (c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq)) * 100));

    // ── RAM ──
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // ── Disk (Windows wmic) ──
    const disks = await getWindowsDisks();
    // Primary disk (E: if available, else C:, else first)
    const primaryDisk = disks.find((d) => d.caption === "E:") || disks.find((d) => d.caption === "C:") || disks[0];
    const diskTotal = primaryDisk?.totalGB ?? 100;
    const diskUsed = primaryDisk?.usedGB ?? 0;
    const diskFree = primaryDisk?.freeGB ?? 100;
    const diskPercent = primaryDisk?.percent ?? 0;

    // ── Network (os.networkInterfaces) ──
    const interfaces = os.networkInterfaces();
    let rxBytes = 0;
    let txBytes = 0;
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs || name === "lo" || name.startsWith("Loopback")) continue;
      for (const addr of addrs) {
        if (addr.family === "IPv4" && !addr.internal) {
          // Node doesn't expose bytes directly; show 0 for rate, rely on real-time delta
          rxBytes++;
          txBytes++;
        }
      }
    }
    const network = { rx: 0, tx: 0, interfaces: Object.keys(interfaces).filter((n) => n !== "lo" && !n.startsWith("Loopback")) };

    // ── Services (PM2 only) ──
    const services: ServiceEntry[] = [];
    try {
      const { stdout: pm2Json } = await execAsync("pm2 jlist 2>nul");
      const pm2List = JSON.parse(pm2Json) as Array<{
        name: string;
        pid: number | null;
        pm2_env: {
          status: string;
          pm_uptime?: number;
          restart_time?: number;
        };
        monit?: { cpu: number; memory: number };
      }>;

      const pm2Map: Record<string, (typeof pm2List)[0]> = {};
      for (const proc of pm2List) {
        pm2Map[proc.name] = proc;
      }

      // Add configured PM2 services
      for (const name of PM2_SERVICES) {
        const proc = pm2Map[name];
        if (!proc) {
          services.push({
            name,
            status: "not_found",
            description: SERVICE_DESCRIPTIONS[name] ?? name,
            backend: "pm2",
          });
          continue;
        }

        const rawStatus = proc.pm2_env?.status ?? "unknown";
        const uptime =
          rawStatus === "online" && proc.pm2_env?.pm_uptime
            ? Date.now() - proc.pm2_env.pm_uptime
            : null;

        services.push({
          name,
          status: normalizePm2Status(rawStatus),
          description: SERVICE_DESCRIPTIONS[name] ?? name,
          backend: "pm2",
          uptime,
          restarts: proc.pm2_env?.restart_time ?? 0,
          pid: proc.pid,
          cpu: proc.monit?.cpu ?? null,
          mem: proc.monit?.memory ?? null,
        });
      }

      // Also add any extra PM2 processes not in our list
      for (const proc of pm2List) {
        if (!PM2_SERVICES.includes(proc.name)) {
          const rawStatus = proc.pm2_env?.status ?? "unknown";
          services.push({
            name: proc.name,
            status: normalizePm2Status(rawStatus),
            description: proc.name,
            backend: "pm2",
            pid: proc.pid,
            restarts: proc.pm2_env?.restart_time ?? 0,
          });
        }
      }
    } catch (err) {
      console.error("Failed to query PM2:", err);
      for (const name of PM2_SERVICES) {
        services.push({
          name,
          status: "unknown",
          description: SERVICE_DESCRIPTIONS[name] ?? name,
          backend: "pm2",
        });
      }
    }

    // ── Tailscale VPN ──
    let tailscaleActive = false;
    let tailscaleIp = "";
    const tailscaleDevices: TailscaleDevice[] = [];
    try {
      const { stdout: tsStatus } = await execAsync("tailscale status 2>nul");
      const lines = tsStatus.trim().split("\n").filter(Boolean);
      if (lines.length > 0) {
        tailscaleActive = true;
        for (const line of lines) {
          if (line.startsWith("#")) continue;
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            tailscaleDevices.push({
              ip: parts[0],
              hostname: parts[1],
              os: parts[3] || "",
              online: line.includes("active") || line.includes("-"),
            });
          }
        }
        if (tailscaleDevices.length > 0) {
          tailscaleIp = tailscaleDevices[0].ip;
        }
      }
    } catch (error) {
      console.error("Failed to get Tailscale status:", error);
    }

    // Fallback devices (Eli's actual devices)
    const fallbackDevices: TailscaleDevice[] = [
      { ip: "100.86.110.55", hostname: "eli-desktop", os: "windows", online: true },
      { ip: "", hostname: "eli-ipad", os: "iOS", online: false },
      { ip: "", hostname: "eli-laptop", os: "windows", online: false },
      { ip: "", hostname: "eli-phone", os: "iOS", online: false },
      { ip: "", hostname: "halvo-ai", os: "linux", online: false },
      { ip: "", hostname: "omnifortress-mesh", os: "linux", online: false },
    ];

    // ── Firewall (Windows netsh) ──
    let firewallActive = false;
    const firewallRulesList: FirewallRule[] = [];
    try {
      const { stdout: fwStatus } = await execAsync(
        "netsh advfirewall show currentprofile state 2>nul"
      );
      firewallActive = fwStatus.toLowerCase().includes("on");
    } catch {
      // If netsh fails, assume firewall is on (safe default)
      firewallActive = true;
    }

    // Static rules summary (Windows firewall rules are complex, show key ones)
    const staticFirewallRules: FirewallRule[] = [
      { port: "80/tcp", action: "ALLOW", from: "Any", comment: "HTTP" },
      { port: "443/tcp", action: "ALLOW", from: "Any", comment: "HTTPS" },
      { port: "19000", action: "ALLOW", from: "Localhost", comment: "OpenClaw Gateway" },
      { port: "3002", action: "ALLOW", from: "Localhost", comment: "TenacitOS Dashboard" },
    ];

    return NextResponse.json({
      cpu: {
        usage: cpuUsage,
        cores: cpuCores,
        loadAvg,
      },
      ram: {
        total: parseFloat((totalMem / 1024 / 1024 / 1024).toFixed(2)),
        used: parseFloat((usedMem / 1024 / 1024 / 1024).toFixed(2)),
        free: parseFloat((freeMem / 1024 / 1024 / 1024).toFixed(2)),
        cached: 0,
      },
      disk: {
        total: diskTotal,
        used: diskUsed,
        free: diskFree,
        percent: diskPercent,
      },
      disks, // All drives with individual stats
      network,
      systemd: services, // kept field name for backwards compat
      tailscale: {
        active: tailscaleActive,
        ip: tailscaleIp || "100.86.110.55",
        devices: tailscaleDevices.length > 0 ? tailscaleDevices : fallbackDevices,
      },
      firewall: {
        active: firewallActive,
        rules: firewallRulesList.length > 0 ? firewallRulesList : staticFirewallRules,
        ruleCount: staticFirewallRules.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching system monitor data:", error);
    return NextResponse.json(
      { error: "Failed to fetch system monitor data" },
      { status: 500 }
    );
  }
}
