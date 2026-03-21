# TenacitOS Full Audit Task

You are doing a COMPLETE audit and fix of TenacitOS. Working directory: E:\repos\tenacitOS
This is a Next.js 16 + React 19 + TypeScript + Tailwind 4 dashboard (PM2: mission-control, port 3002).

## PHASE 1: DEPENDENCY UPDATES

Run npm outdated to see what is stale.
Update all packages to latest compatible versions.
Run npm install.
Fix any peer dependency issues.

## PHASE 2: FULL CODE AUDIT

### TypeScript
Run: npx tsc --noEmit
Fix ALL type errors. Minimal use of 'any'.
All API route handlers must have typed request/response shapes.

### ESLint
Run: npm run lint
Fix ALL lint errors and warnings.

### API Routes (src/app/api/)
Every route must have:
- Proper error handling with typed error responses
- No unhandled promise rejections
- Consistent response shape: { data, error, timestamp }
- Timeouts on all external calls
- No hardcoded credentials

### Health Check IMPORTANT - keep existing fixes:
src/app/api/health/route.ts was already fixed:
- Neo4j: uses docker inspect (HTTP disabled on container)
- Node Exporter + cAdvisor: uses docker inspect (no host port bindings)
- dockerCmd = process.platform === 'win32' ? 'wsl docker' : 'docker'
DO NOT revert these fixes.

### Auth routes (src/app/api/auth/)
- Verify login/logout work with ADMIN_PASSWORD env var
- LOCALHOST_MODE=1 means secure cookie flag is off (correct for HTTP localhost)
- No secrets in logs

### Components (src/components/)
- Fix broken imports
- Fix missing/incorrect prop types
- Fix React 19 deprecation warnings

## PHASE 3: BUILD

Run: npm run build
Must succeed with zero TypeScript errors and zero build errors.
Warnings are acceptable but document them.

## PHASE 4: FINAL SUMMARY

Output clearly:
1. Packages updated: name old-version -> new-version
2. Files fixed: path - what was fixed
3. Issues not fixed: path - why not fixed
4. Build result: success/fail + last 20 lines of build output

## HARD CONSTRAINTS

- ASCII only in all .ts/.tsx/.js code (no Unicode arrows, bullets, special chars)
- Do NOT touch start-pm2.js
- Do NOT touch src/lib/paths.ts
- Windows machine: docker calls need 'wsl docker' prefix on win32 (already in health route via dockerCmd)
- Keep ALL health check fixes intact
- Do not add new npm dependencies unless critical for a fix
