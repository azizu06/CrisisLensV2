# AGENTS.md

## Purpose
This file gives Codex (and other coding agents) a source-of-truth guide for working in this repository quickly and safely.

## LLM Documentation
- Primary LLM workflow doc: `docs/LLM_GUIDE.md`.
- Keep `AGENTS.md`, `README.md`, and `docs/CONTEXT_HANDOFF.md` aligned when commands, paths, or repository layout changes.
- If a workflow detail is uncertain, verify from code/scripts first, then update docs to match implementation.

## Development Approach (TDD First)
- We use TDD by default for feature work and bug fixes.
- Workflow:
  - `Red`: add/update a failing test first (Vitest for logic/helpers, Playwright for user flows/API contracts).
  - `Green`: implement the minimal code change to pass.
  - `Refactor`: clean up while keeping tests green.
- Minimum validation before handoff:
  - `pnpm run test`
  - `pnpm run test:unit`
  - `pnpm run test:e2e` (or targeted `pnpm run test:e2e:ui` / `pnpm run test:e2e:api` while iterating)

## Commit Convention
- Use Conventional Commits for all git commit messages.
- Format: `<type>(<optional scope>): <description>`
- Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`.
- Keep the subject concise and imperative (example: `feat(landing): add hero CTA and footer`).
- If a change is breaking, include `!` after type/scope and note `BREAKING CHANGE:` in the body.

## Branching and Commit Rhythm
- Commit as you go for meaningful checkpoints instead of batching everything into one final commit.
- Use a dedicated branch for applicable feature/fix work before merging.
- Branch names must use `feature/...` or `fix/...`.
- Do not use `codex/...` or `copilot/...` as branch prefixes.

## Repository Snapshot
- Project: `CrisisLens`
- Monorepo layout:
  - `apps/web`: Next.js 14 (App Router), React 18, TypeScript, Three.js via `react-globe.gl`
  - `apps/ml`: Python/ML training code and model artifacts
- Frontend tests: Vitest unit tests + Playwright e2e tests in `apps/web/tests`
- Data pipeline: CSV aggregation script in `apps/web/scripts/generate-country-metrics.mjs`

## Important Reality Checks
- Use pnpm for JS workflow commands.
- `pnpm run test` runs lint + typecheck only. Unit tests are separate (`pnpm run test:unit`).
- There is no formal Python lint/test harness configured in-repo yet.

## Setup

### Frontend setup
```bash
pnpm install
pnpm run generate:data
pnpm run dev
```

App URL: `http://localhost:3000`

### Python/backend setup (only if touching backend)
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/ml/requirements.txt
cd apps/ml/models && python train_model.py
```

## Core Dev Commands
- `pnpm run dev`: start Next.js dev server (`apps/web`)
- `pnpm run build`: production build (`apps/web`)
- `pnpm run lint`: ESLint (`apps/web`)
- `pnpm run typecheck`: TypeScript compile check (`apps/web`)
- `pnpm run test:unit`: run Vitest tests (`apps/web`)
- `pnpm run test:e2e`: run Playwright end-to-end tests (`apps/web`)
- `pnpm run test:e2e:headed`: run Playwright e2e tests in headed mode (`cd apps/web && pnpm run test:e2e:headed`)
- `pnpm run test:e2e:ui`: run only dashboard UI Playwright tests (`apps/web`)
- `pnpm run test:e2e:api`: run only API contract Playwright tests (`apps/web`)
- `pnpm run playwright:install`: install Chromium for Playwright (`cd apps/web && pnpm run playwright:install`)
- `pnpm run test`: lint + typecheck (`apps/web`)
- `pnpm run test:all`: lint + typecheck + unit + e2e (`apps/web`)
- `pnpm run generate:data`: regenerate `apps/web/public/data/*.json` from CSVs in `apps/web/data/`

## Recommended Validation Before Finishing Changes
Run this sequence for frontend changes:
```bash
pnpm run test:unit
pnpm run test
pnpm run build
```

For UI-flow changes, also run:
```bash
pnpm run test:e2e
```

For ML/backend-only changes, there is no formal Python test/lint setup in-repo yet; at minimum run:
```bash
cd apps/ml/models && python train_model.py
```

ML training caveat:
- `apps/ml/models/train_model.py` currently relies on relative paths and local data availability; validate input/output paths in your environment before using outputs.

## Testing and Linting Details
- Unit tests live in:
  - `apps/web/tests/lib/metrics.test.ts`
  - `apps/web/tests/components/summary-utils.test.ts`
  - `apps/web/tests/lib/cv-globe-bridge.test.ts`
  - `apps/web/tests/lib/globe-picking.test.ts`
- Playwright e2e tests live in:
  - `apps/web/tests/e2e/landing.spec.js`
  - `apps/web/tests/e2e/dashboard.spec.js`
  - `apps/web/tests/e2e/api-routes.spec.js`
- Playwright config: `apps/web/playwright.config.mjs`
- Playwright note: e2e scripts use `pnpm exec playwright ...`; first run requires network access to fetch package/browsers if they are not already installed.
- Vitest config: `apps/web/vitest.config.ts` (Node environment, alias `@ -> apps/web root`)
- ESLint config: `apps/web/.eslintrc.json`
- TypeScript config: `apps/web/tsconfig.json` (strict mode enabled)

## Architecture Map (High-Value Files)
- App shell + landing route (`/`): `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`
- Landing UI components:
  - `apps/web/components/landing/LandingHero.tsx`
  - `apps/web/components/landing/LandingGlobe.tsx`
  - `apps/web/components/landing/LandingFeatures.tsx`
  - `apps/web/components/landing/LandingWorkflow.tsx`
  - `apps/web/components/landing/LandingFootprint.tsx`
  - `apps/web/components/landing/LandingFooter.tsx`
- Dashboard route (`/dashboard`): `apps/web/app/dashboard/page.tsx`
- Main dashboard UI: `apps/web/components/GlobeDashboard.tsx`
- Dashboard layout/theme controls:
  - `apps/web/components/dashboard/HeroSection.tsx`
  - `apps/web/components/dashboard/LayerSelector.tsx`
  - `apps/web/components/dashboard/ThemeToggle.tsx`
  - `apps/web/components/dashboard/DatabricksChatPopup.tsx`
- Dashboard panel cards:
  - `apps/web/components/dashboard/CountryPanel.tsx`
  - `apps/web/components/dashboard/AgentStatePanel.tsx`
  - `apps/web/components/dashboard/PriorityRankingPanel.tsx`
  - `apps/web/components/dashboard/OciPanel.tsx`
  - `apps/web/components/dashboard/ProjectOutliersPanel.tsx`
  - `apps/web/components/dashboard/SimulationPanel.tsx`
  - `apps/web/components/dashboard/CvPanel.tsx`
- 3D globe + hand controls: `apps/web/components/Globe3D.tsx`
- API route stubs:
  - `apps/web/app/api/globe/heatmap/route.ts`
  - `apps/web/app/api/country/[iso3]/route.ts`
  - `apps/web/app/api/project/[project_id]/route.ts`
  - `apps/web/app/api/agent/country/[iso3]/route.ts`
  - `apps/web/app/api/genie/query/route.ts`
  - `apps/web/app/api/cv/detect/route.ts`
- Frontend API client/types: `apps/web/lib/api/crisiswatch.ts`
- Domain helpers/types: `apps/web/lib/types.ts`, `apps/web/lib/metrics.ts`, `apps/web/lib/countries.ts`
- Integration seams (mock providers):
  - `apps/web/lib/databricks/client.ts`
  - `apps/web/lib/databricks/genie.ts`
  - `apps/web/lib/cv/provider.ts`
  - `apps/web/lib/cv/globeBridge.ts`

## Data Pipeline Notes
- `apps/web/data/` contains large CSV inputs required by `pnpm run generate:data`.
- Generated artifacts consumed by the app:
  - `apps/web/public/data/country-metrics.json`
  - `apps/web/public/data/snapshot.json`
- If changes affect `apps/web/lib/types.ts` metrics fields or API projections, regenerate data and run full validation.

## Environment Variables
- Optional: `NEXT_PUBLIC_GLOBE_WS_URL`
  - Used by `apps/web/components/GlobeDashboard.tsx` for WebSocket anomaly/highlight events.
  - If unset, WebSocket subscription is skipped.
- Optional Databricks API rate limit tuning:
  - `DATABRICKS_EXPENSIVE_RATE_LIMIT` defaults to `12` requests per `DATABRICKS_RATE_LIMIT_WINDOW_SECONDS` for Genie/AI routes.
  - `DATABRICKS_READ_RATE_LIMIT` defaults to `60` requests per `DATABRICKS_RATE_LIMIT_WINDOW_SECONDS` for SQL read routes.
  - `DATABRICKS_RATE_LIMIT_WINDOW_SECONDS` defaults to `900`.

## Implementation Guardrails
- Preserve API response shapes used by `apps/web/lib/api/crisiswatch.ts` unless updating both server routes and client types together.
- Keep globe-related browser APIs in client components (`"use client"`). `apps/web/components/Globe3D.tsx` is loaded dynamically with `ssr: false` for SSR safety.
- Prefer extending provider interfaces (`DatabricksProvider`, `GenieClient`, `CVCountryDetector`) rather than wiring external services directly into UI components.
- When touching metric formulas, update corresponding unit tests in `apps/web/tests/lib/metrics.test.ts`.
- Styling policy (strict): use Tailwind utility classes for all component/page styling.
- Do not introduce or expand semantic CSS utility wrappers (for example `dbx-*`, `landing-*`, `chip-*`) in `globals.css`.
- Use `apps/web/app/globals.css` only for global/base styles, CSS variables, or hard-to-express third-party selectors (for example, canvas internals or browser-wide resets).

## Code Style
- Keep components small and composable; extract logic/helpers instead of growing monolithic UI files.
- Prefer explicit domain types for API payloads/state over `Record<string, unknown>` shapes.
- Remove unused CSS hook class names after Tailwind migration; avoid adding non-semantic class tokens when utilities already express the style.
- Avoid duplicate state updates/effects and keep side effects contained in `useEffect`/callbacks with clear cleanup.

## Known Gaps (Do Not Assume Implemented)
- No Python linting (`ruff`/`flake8`) or Python test suite configured.
- ML scripts/artifacts are evolving quickly; verify assumptions from code, not stale docs.
