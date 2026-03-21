# TenacitOS Build Task: Commissioning + Architecture + Code Quality Pages

Build 3 new pages in TenacitOS (Next.js 16, React 19, Tailwind 4, TypeScript).
Working directory: E:\repos\tenacitOS

## IMPORTANT CONSTRAINTS
- ASCII only in all code (no Unicode special chars)
- Do NOT modify start-pm2.js or src/lib/paths.ts
- Windows machine: docker calls use `wsl docker` prefix (process.platform === 'win32')
- Follow existing code patterns in src/app/(dashboard)/ and src/app/api/
- Use existing branding from src/config/branding.ts
- Use lucide-react for icons (already installed)
- Use recharts for charts (already installed)
- All new API routes go in src/app/api/
- All new pages go in src/app/(dashboard)/
- Keep it dark themed matching existing TenacitOS design

## PAGE 1: /commissioning — Live System Commissioning Report

### API Route: GET /api/commissioning
Runs a full system audit and returns structured JSON:

```json
{
  "timestamp": "ISO",
  "grade": "S++|S+|S|A|B|C|F",
  "score": 98,
  "sections": [
    {
      "name": "Infrastructure",
      "score": 100,
      "checks": [
        { "name": "OpenClaw Gateway", "status": "pass|fail|warn", "detail": "online, 2h uptime", "latency": 42 }
      ]
    }
  ]
}
```

Checks to run (from existing /api/health endpoint + new ones):
- Fetch /api/health and include all 26 checks
- Check each Docker container via `wsl docker ps`
- Check PM2 processes
- Check disk space via PowerShell
- Check each knowledge store (Qdrant collections count, Neo4j container, Postgres, Redis)
- Count repos in E:\repos
- Count agents in openclaw config (E:\.openclaw\openclaw.json)
- Count cron jobs via `openclaw cron list --json`
- Count skills in E:\workspaces\main\skills and E:\npm-global\node_modules\openclaw\skills
- Check MCP servers count from C:\Users\Halvo\.claude.json
- Calculate overall grade: 95-100=S++, 90-94=S+, 85-89=S, 75-84=A, etc.

### Page Component
- Hero section with large animated grade badge (S++ glowing green)
- Score bar (0-100)
- Expandable sections for each category
- Each check shows pass/fail/warn with color coding
- Timestamp and "Run Again" button
- Auto-refresh every 5 minutes
- Print-friendly layout (for PDF export)

## PAGE 2: /architecture — Interactive Architecture Map

### API Route: GET /api/architecture
Returns the full system topology:

```json
{
  "nodes": [
    { "id": "gateway", "type": "service", "name": "OpenClaw Gateway", "port": 19000, "status": "up" },
    { "id": "qdrant", "type": "database", "name": "Qdrant", "port": 6333, "status": "up" },
    { "id": "agent-main", "type": "agent", "name": "Pulse (Main)", "model": "opus-4.6" }
  ],
  "edges": [
    { "from": "gateway", "to": "agent-main", "label": "WebSocket" },
    { "from": "agent-main", "to": "qdrant", "label": "Vector Search" }
  ],
  "stats": {
    "totalAgents": 100,
    "totalRepos": 36,
    "totalContainers": 26,
    "totalCrons": 34,
    "totalSkills": 58
  }
}
```

### Page Component
Use a canvas-based or SVG node graph (no external graph libraries — use simple positioned divs or SVG):
- Colored nodes by type: services=blue, databases=green, agents=purple, external=orange
- Edges as lines/arrows between related nodes
- Click a node to see details panel
- Stats bar at top showing totals
- Group nodes by category (Infrastructure, Knowledge, Agents, External APIs)
- Responsive layout

## PAGE 3: /code-quality — Code Excellence Dashboard

### API Route: GET /api/code-quality
Scans repos and returns quality metrics:

For each repo in E:\repos (only ones with package.json or .git):
- Name, last commit date, last commit message (via git log)
- Language (detect from package.json or file extensions)
- Line count (quick estimate via file count)
- Has tests (check for test/ or __tests__ or *.test.* files)
- Has CI (check for .github/workflows/)
- Has README
- Git status (clean/dirty via git status --porcelain)
- Branch name

```json
{
  "repos": [
    {
      "name": "tenacitOS",
      "language": "TypeScript",
      "lastCommit": "2026-03-21",
      "lastMessage": "fix: health checks",
      "branch": "main",
      "dirty": false,
      "hasTests": true,
      "hasCI": false,
      "hasReadme": true,
      "fileCount": 160,
      "status": "active"
    }
  ],
  "summary": {
    "total": 36,
    "active": 12,
    "withTests": 5,
    "withCI": 3,
    "clean": 20,
    "dirty": 16
  }
}
```

### Page Component
- Summary cards at top (total repos, active, test coverage %, clean %)
- Sortable table of all repos with color-coded status
- Filter by: active/archived, language, clean/dirty
- Click repo row to expand details
- "Excellence Score" per repo (has tests + CI + README + clean = 100%)

## BUILD STEPS
1. Create all 3 API routes first
2. Create all 3 page components
3. Run: npm run build
4. Verify build succeeds with zero errors
5. Output summary of what was created

## EXISTING PATTERNS TO FOLLOW
- Look at src/app/(dashboard)/system/page.tsx for page layout pattern
- Look at src/app/api/health/route.ts for API route pattern with caching
- Look at src/app/api/knowledge/route.ts for docker/exec patterns
- Use the same dark theme variables (var(--surface), var(--border), var(--text-primary), etc.)
