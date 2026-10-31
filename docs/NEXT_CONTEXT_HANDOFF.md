# CrisisLens Fusion Handoff (For Next Context Window)

## Branch + Goal
- Active repo: `/Users/jakob/codestuff/Hacklytics2026/Fusion/Crisis-api`
- Active branch: `codex/ml-genie-dual-mode`
- Primary objective: Keep Crisis command-center UI shell, but provide **two truly separate operational modes**:
  1. `Genie View` (Databricks strategy/insight workspace)
  2. `ML Mode` (full ML operations workspace from Master)

## What Is Already Implemented

### 1. True mode separation (not mixed tabs)
- Mode switch in top nav:
  - `apps/web/components/command-center/TopNav.tsx`
- Dual-mode render orchestration:
  - `apps/web/components/GlobeDashboard.tsx`
- URL boot mode support:
  - `apps/web/app/dashboard/page.tsx`
  - `?mode=ml` boots ML mode; default is Genie mode.

### 2. Dedicated ML workspace window
- New ML sidebar component:
  - `apps/web/components/command-center/MlSidebar.tsx`
- ML mode now has its own panel stack and controls (separate from Genie right sidebar).

### 3. ML workspace sections (Master-style)
- ML panel container with sections:
  - `apps/web/components/command-center/tabs/MlOpsTab.tsx`
- Sections available:
  - Country Ops
  - Priority Stack
  - Simulation
  - Genie Query

### 4. Rich ML simulation + graphs restored
- Imported Master rich Simulation panel:
  - `apps/web/components/dashboard/SimulationPanel.tsx`
- Added support components/libs:
  - `apps/web/components/dashboard/PanelLoading.tsx`
  - `apps/web/lib/simulation-viz.ts`
  - `apps/web/lib/simulation.ts`
- Simulation API route now returns full quarterly + ML context payload:
  - `apps/web/app/api/analytics-simulate/route.ts`
- Simulation types aligned:
  - `apps/web/lib/api/crisiswatch.ts`

### 5. Voice control restored (Master globe implementation)
- `apps/web/components/Globe3D.tsx` now based on Master globe with:
  - hand control
  - voice control (SpeechRecognition)
  - simulation arcs
- Voice command resolver added:
  - `apps/web/components/dashboard/dashboard-utils.ts`
  - `resolveVoiceCommandToCountryIso3(...)`

### 6. In-Need Rate re-enabled in layer controls
- `apps/web/components/command-center/LayerControls.tsx`
- Added `inNeedRate` to selectable modes.

### 7. Genie query route converted from mock to live Genie client
- Rewrote:
  - `apps/web/app/api/genie-query/route.ts`
- New behavior:
  - uses `genieClient` (real Databricks Genie API)
  - creates/recovers conversation via session cookie + in-memory mapping
  - polls for completion
  - fetches attachment query result
  - infers scored rows + highlight ISOs from real query result columns
- Removed obsolete mock client file:
  - deleted `apps/web/lib/databricks/genie.ts`
- **Bugfix added after live testing**:
  - `apps/web/lib/genieClient.ts` now supports Databricks `statement_response` query-result envelope.
  - This was required for real rows/columns parsing from Genie attachments.

### 8. Databricks chat popup integrated in ML mode
- Added Master popup component:
  - `apps/web/components/dashboard/DatabricksChatPopup.tsx`
- wired in `GlobeDashboard.tsx` only when `workspaceMode === "ml"`.

### 9. Styling tokens for imported Master components
- Added DBX variables in:
  - `apps/web/app/globals.css`

### 10. Env files requested by user added
- Added runtime env values to:
  - `apps/web/.env.local`
  - `.env`
- `.gitignore` ignores these files, so they remain local.

## Current Build/Test Status
- Command run in `apps/web`:
  - `pnpm run test`
- Status:
  - ESLint: pass
  - Typecheck: pass
- Runtime checks performed:
  - Databricks SQL API connectivity: pass (`SELECT 1 AS ok`)
  - Databricks Genie start conversation: pass (with retry/backoff for 429)
  - Local `/api/genie-query` end-to-end check: pass with real row parsing and `highlight_iso3`

## Remaining Gaps / Next Work Required

### A. Continue reducing fixed copy where it blocks realism
- Dynamic ML Genie templates are now data-driven in:
  - `apps/web/components/dashboard/dashboard-utils.ts` (`buildMlGenieQueryTemplates`)
  - `apps/web/components/GlobeDashboard.tsx` (no static `QUERY_TEMPLATES` constant)
- Remaining fixed copy is mostly instructional UI text; only replace if UX requires.

### B. Make Genie rows richer and more deterministic
- `apps/web/app/api/genie-query/route.ts` still infers metrics from generic query result columns.
- Improve next by:
  - adding intent-specific prompt scaffolding
  - forcing output schema via JSON contract in message prompt
  - parsing structured response first, then fallback to table inference.

### C. Strengthen rate-limit resilience for Genie
- Live Genie is reachable, but 429 can occur on burst POSTs.
- Next improvements:
  1. expose 429 retry guidance prominently in UI panel
  2. optionally add client-side cooldown before repeat submits
  3. consider persistent server-side queue/state beyond in-memory mapping

### D. Graph realism / data coherence pass
- Simulation graphs already use real simulation payload and now auto-load on ML mode country selection.
- Perform a visual + data QA:
  - ensure each chart section only renders when required series exists
  - ensure no empty states show misleading placeholders
  - ensure percent/units formatting is consistent by metric.

### E. Genie mode and ML mode state isolation
- Currently both modes share some global states (selected country, layer, highlights) intentionally.
- Confirm expected UX; if undesired, split into mode-scoped state buckets.

## Critical Files Touched
- `apps/web/components/GlobeDashboard.tsx`
- `apps/web/components/Globe3D.tsx`
- `apps/web/components/command-center/TopNav.tsx`
- `apps/web/components/command-center/MlSidebar.tsx`
- `apps/web/components/command-center/tabs/MlOpsTab.tsx`
- `apps/web/components/command-center/LayerControls.tsx`
- `apps/web/components/dashboard/dashboard-utils.ts`
- `apps/web/components/dashboard/SimulationPanel.tsx`
- `apps/web/components/dashboard/DatabricksChatPopup.tsx`
- `apps/web/app/api/genie-query/route.ts`
- `apps/web/app/api/analytics-simulate/route.ts`
- `apps/web/lib/api/crisiswatch.ts`
- `apps/web/lib/simulation.ts`
- `apps/web/lib/simulation-viz.ts`
- `apps/web/lib/globe/arcs.ts`
- `apps/web/lib/globe/simulation-arcs.ts`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/globals.css`

## Suggested Verification Checklist (Next Window)
1. Start server in `apps/web`: `pnpm dev`.
2. Toggle `Genie View` / `ML Mode` in top nav and confirm separate sidebars.
3. In ML mode:
   - run simulation with multiple allocations
   - verify quarterly graph/table updates
   - verify impact arrows toggle affects globe arcs
   - verify voice control can select a country (`go to Canada`).
4. Run 5+ real Genie queries and verify:
   - non-mock source
   - result rows present when query result exists
   - country highlights sync.
5. Run `pnpm run test` before committing.

## Notes
- Do not switch off `codex/ml-genie-dual-mode` until user approves.
- Keep this handoff file updated as the source of truth for continuation.
