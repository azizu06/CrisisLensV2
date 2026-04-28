# CrisisLens

CrisisLens is a monorepo with a Next.js command-center UI and a Python ML workspace.

## Repository Layout

- `apps/web`: Next.js 14 app (App Router), React 18, TypeScript, Three.js globe, API routes, and tests.
- `apps/ml`: Python model training code and model artifacts.

## Prerequisites

- Node.js 20+
- `pnpm` (workspace package manager)
- Python 3.10+

## Web App (apps/web)

### Install

```bash
pnpm install
```

### Run locally

```bash
pnpm run generate:data
pnpm run dev
```

Open `http://localhost:3000`.

### Common commands

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:unit
pnpm run test:e2e
pnpm run test:all
```

All root scripts delegate to `apps/web`.

## ML Workspace (apps/ml)

### Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r apps/ml/requirements.txt
```

### Train (current script entry)

```bash
python apps/ml/models/train_model.py
```

## Notes

- Frontend tests live in `apps/web/tests` (Vitest + Playwright).
- Web data generation script lives at `apps/web/scripts/generate-country-metrics.mjs`.
- Optional env var: `NEXT_PUBLIC_GLOBE_WS_URL` for real-time globe highlights.

## Geo-Insight Agent Endpoints

Set these env vars in `apps/web/.env.local`:

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_WAREHOUSE_ID`
- `CRISIS_TABLE_FQN`
- `AI_MODEL`

Optional compatibility overrides (if your workspace does not expose AI Gateway path):

- `DATABRICKS_AI_CHAT_PATH` (example: `/api/2.0/ai-gateway/chat/completions`)
- `DATABRICKS_AI_ENDPOINT` (serving endpoint name to call via `/serving-endpoints/{name}/invocations`)

Databricks-backed API routes have an in-memory per-client rate limit. Optional tuning:

- `DATABRICKS_EXPENSIVE_RATE_LIMIT` (default: `12` requests per window for Genie/AI routes)
- `DATABRICKS_READ_RATE_LIMIT` (default: `60` requests per window for SQL read routes)
- `DATABRICKS_RATE_LIMIT_WINDOW_SECONDS` (default: `900`)

Quick checks:

```bash
curl -s "http://localhost:3000/api/geo/metrics?iso3=HTI"
```

```bash
curl -s "http://localhost:3000/api/geo/insight?iso3=HTI"
```

```bash
curl -s -X POST "http://localhost:3000/api/geo/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"Which countries have lower funding coverage than Mali and where should funding increase?"}'
```
