import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import {
  getDatabase,
  getCostSummary,
  getCostByAgent,
  getCostByModel,
  getDailyCost,
  getHourlyCost,
} from "@/lib/usage-queries";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "usage-tracking.db");
const BUDGET_PATH = path.join(process.cwd(), "data", "budget.json");
const DEFAULT_BUDGET = 100.0; // Default budget in USD

interface BudgetConfig {
  budget: number;
  alerts: { threshold: number; email?: string }[];
}

function readBudgetConfig(): BudgetConfig {
  try {
    return JSON.parse(fs.readFileSync(BUDGET_PATH, "utf-8"));
  } catch {
    return { budget: DEFAULT_BUDGET, alerts: [] };
  }
}

function writeBudgetConfig(config: BudgetConfig): void {
  const dataDir = path.dirname(BUDGET_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(BUDGET_PATH, JSON.stringify(config, null, 2));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const timeframe = searchParams.get("timeframe") || "30d";

  // Parse timeframe to days
  const days = parseInt(timeframe.replace(/\D/g, ""), 10) || 30;

  try {
    const db = getDatabase(DB_PATH);

    const budgetConfig = readBudgetConfig();

    if (!db) {
      // Database doesn't exist yet - return zeros
      return NextResponse.json({
        today: 0,
        yesterday: 0,
        thisMonth: 0,
        lastMonth: 0,
        projected: 0,
        budget: budgetConfig.budget,
        alerts: budgetConfig.alerts,
        byAgent: [],
        byModel: [],
        daily: [],
        hourly: [],
        message: "No usage data collected yet. Run collect-usage script first.",
      });
    }

    // Get all the data
    const summary = getCostSummary(db);
    const byAgent = getCostByAgent(db, days);
    const byModel = getCostByModel(db, days);
    const daily = getDailyCost(db, days);
    const hourly = getHourlyCost(db);

    db.close();

    return NextResponse.json({
      ...summary,
      budget: budgetConfig.budget,
      alerts: budgetConfig.alerts,
      byAgent,
      byModel,
      daily,
      hourly,
    });
  } catch (error) {
    console.error("Error fetching cost data:", error);
    return NextResponse.json(
      { error: "Failed to fetch cost data" },
      { status: 500 }
    );
  }
}

// POST endpoint to update budget
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { budget, alerts } = body;

    if (typeof budget !== "number" || budget <= 0) {
      return NextResponse.json(
        { error: "Invalid budget value" },
        { status: 400 }
      );
    }

    const config: BudgetConfig = {
      budget,
      alerts: Array.isArray(alerts) ? alerts : [],
    };
    writeBudgetConfig(config);

    return NextResponse.json({ success: true, budget, alerts: config.alerts });
  } catch (error) {
    console.error("Error updating budget:", error);
    return NextResponse.json(
      { error: "Failed to update budget" },
      { status: 500 }
    );
  }
}
