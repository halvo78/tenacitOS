import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);

export async function GET() {
  try {
    // CPU (load average as percentage)
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpu = Math.min(Math.round((loadAvg / cpuCount) * 100), 100);

    // RAM
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ram = {
      used: parseFloat((usedMem / 1024 / 1024 / 1024).toFixed(2)),
      total: parseFloat((totalMem / 1024 / 1024 / 1024).toFixed(2)),
    };

    // Disk (Windows wmic)
    let diskUsed = 0;
    let diskTotal = 100;
    try {
      const { stdout } = await execAsync(
        "wmic logicaldisk where \"caption='E:'\" get freespace,size /format:csv 2>nul"
      );
      const lines = stdout.trim().split("\n").filter((l) => l.trim() && !l.startsWith("Node"));
      if (lines.length > 0) {
        const parts = lines[0].trim().split(",");
        if (parts.length >= 3) {
          const freeSpace = parseInt(parts[1]) || 0;
          const size = parseInt(parts[2]) || 0;
          diskTotal = Math.round(size / 1024 / 1024 / 1024);
          diskUsed = Math.round((size - freeSpace) / 1024 / 1024 / 1024);
        }
      }
    } catch {
      // Fallback: try C: drive
      try {
        const { stdout } = await execAsync(
          "wmic logicaldisk where \"caption='C:'\" get freespace,size /format:csv 2>nul"
        );
        const lines = stdout.trim().split("\n").filter((l) => l.trim() && !l.startsWith("Node"));
        if (lines.length > 0) {
          const parts = lines[0].trim().split(",");
          if (parts.length >= 3) {
            const freeSpace = parseInt(parts[1]) || 0;
            const size = parseInt(parts[2]) || 0;
            diskTotal = Math.round(size / 1024 / 1024 / 1024);
            diskUsed = Math.round((size - freeSpace) / 1024 / 1024 / 1024);
          }
        }
      } catch (error) {
        console.error("Failed to get disk stats:", error);
      }
    }

    // PM2 Services (count active ones)
    let activeServices = 0;
    let totalServices = 0;
    try {
      const { stdout } = await execAsync("pm2 jlist 2>nul");
      const pm2List = JSON.parse(stdout) as Array<{ pm2_env: { status: string } }>;
      totalServices = pm2List.length;
      activeServices = pm2List.filter((p) => p.pm2_env?.status === "online").length;
    } catch (error) {
      console.error("Failed to get PM2 stats:", error);
    }

    // Tailscale VPN Status
    let vpnActive = false;
    try {
      const { stdout } = await execAsync("tailscale status 2>nul");
      vpnActive = stdout.trim().length > 0 && !stdout.includes("Tailscale is stopped");
    } catch {
      vpnActive = false;
    }

    // Firewall Status (Windows netsh)
    let firewallActive = true;
    try {
      const { stdout } = await execAsync("netsh advfirewall show currentprofile state 2>nul");
      firewallActive = stdout.toLowerCase().includes("on");
    } catch {
      firewallActive = true; // safe default
    }

    // Uptime
    const uptimeSeconds = os.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const uptime = `${days}d ${hours}h`;

    return NextResponse.json({
      cpu,
      ram,
      disk: { used: diskUsed, total: diskTotal },
      vpnActive,
      firewallActive,
      activeServices,
      totalServices,
      uptime,
    });
  } catch (error) {
    console.error("Error fetching system stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch system stats" },
      { status: 500 }
    );
  }
}
