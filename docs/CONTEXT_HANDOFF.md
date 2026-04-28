# CrisisLens Context Handoff

## Current Architecture
- Monorepo root with two application workspaces:
  - `apps/web` (Next.js frontend)
  - `apps/ml` (Python ML code + artifacts)
- Package management for JS/TS via `pnpm` workspace.

## Documentation Map
- `README.md`: onboarding and setup.
- `AGENTS.md`: agent execution guardrails.
- `docs/LLM_GUIDE.md`: concise LLM execution workflow.
- `apps/web/FRONTEND_STATUS.md`: frontend implementation status.

## Web Surface (`apps/web`)
- `/`: landing page (hero + decorative globe + feature highlights)
- `/dashboard`: operations command center
- API seam routes live in `apps/web/app/api/**` and support mock-backed demo workflows.

Key UI entry points:
- `apps/web/app/page.tsx`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/components/GlobeDashboard.tsx`
- `apps/web/components/Globe3D.tsx`

## Data Flow
- CSV source inputs: `apps/web/data`
- Generation script: `apps/web/scripts/generate-country-metrics.mjs`
- Output JSON:
  - `apps/web/public/data/country-metrics.json`
  - `apps/web/public/data/project-profiles.json`
  - `apps/web/public/data/snapshot.json`
- ML enrichment source consumed by web generation:
  - `apps/ml/models/artifacts/gold_country_scores.json`

## Integration Seams
- Databricks adapter: `apps/web/lib/databricks/client.ts`
- Genie adapter: `apps/web/lib/databricks/genie.ts`
- CV adapter: `apps/web/lib/cv/provider.ts`
- Frontend API contract types/client: `apps/web/lib/api/crisiswatch.ts`
- Databricks-backed API protection: `apps/web/lib/api/rate-limit.ts`
  - Expensive Genie/AI routes share a per-client in-memory bucket (`DATABRICKS_EXPENSIVE_RATE_LIMIT`, default `12` per 15 minutes).
  - Databricks SQL read routes use a separate per-client bucket (`DATABRICKS_READ_RATE_LIMIT`, default `60` per 15 minutes).

## Test + Build Status
Validated from repository root:
- `pnpm run test`
- `pnpm run test:unit`
- `pnpm run test:e2e:ui`
- `pnpm run build`

## Known Constraints
- API endpoints in `apps/web/app/api/**` are spec-aligned seams but still mock/local-backed.
- External globe textures are currently URL-based and may need localization for restricted environments.
- Python ML training flow is not part of default web dev/test loop.

## Next Recommended Work
1. Replace mock provider internals with production Databricks/Genie/CV service clients.
2. Expand e2e coverage for full analyst flows (search, selection, simulation, integrations).
3. Harden runtime asset strategy by moving external globe textures to local static assets.
4. Formalize Python-side test/lint workflow for `apps/ml`.
