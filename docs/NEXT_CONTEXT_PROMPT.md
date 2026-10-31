# Next Context Prompt (Use This Verbatim)

You are continuing work in:
- Repo: `/Users/jakob/codestuff/Hacklytics2026/Fusion/Crisis-api`
- Branch: `codex/ml-genie-dual-mode`

Read first:
1. `/Users/jakob/codestuff/Hacklytics2026/Fusion/Crisis-api/NEXT_CONTEXT_HANDOFF.md`
2. `git status`

Mission:
- Keep Crisis UI shell with two separated modes:
  - `Genie View` for Databricks strategy
  - `ML Mode` for full ML operations
- Ensure ML features from Master are fully usable in ML mode.
- Remove remaining hardcoded data behavior where practical.
- Keep all graphs driven by live ML/simulation or Genie-backed data.

Current known-good state:
- `pnpm run test` passes in `/Users/jakob/codestuff/Hacklytics2026/Fusion/Crisis-api/apps/web`.
- Databricks SQL connectivity confirmed.
- Genie connectivity confirmed.
- `/api/genie-query` returns live parsed rows/highlights.
- Voice control exists in globe and In-Need Rate layer is restored.

Priority TODOs for this next session:
1. Improve Genie result determinism and schema control
- File: `/Users/jakob/codestuff/Hacklytics2026/Fusion/Crisis-api/apps/web/app/api/genie-query/route.ts`
- Add stronger query scaffolding so Genie reliably returns fields needed for UI ranking/metrics.
- Preserve robust fallback parsing.

2. Harden Genie 429/timeout UX
- File: `/Users/jakob/codestuff/Hacklytics2026/Fusion/Crisis-api/apps/web/components/GlobeDashboard.tsx`
- Show actionable user messaging when rate-limited/timeouts happen.
- Add client-side cooldown or retry strategy to avoid rapid repeated submits.

3. Do a realism pass for ML mode charts and states
- Files:
  - `/Users/jakob/codestuff/Hacklytics2026/Fusion/Crisis-api/apps/web/components/dashboard/SimulationPanel.tsx`
  - `/Users/jakob/codestuff/Hacklytics2026/Fusion/Crisis-api/apps/web/components/command-center/tabs/MlOpsTab.tsx`
- Verify empty/loading/error handling is accurate and not misleading.
- Keep labels/units consistent with returned data.

4. Final verification
- Run in `apps/web`:
  - `pnpm run test`
- Run local dev server and validate:
  - mode switching behavior
  - ML simulation and arcs
  - Genie responses and highlights
  - voice command selection

Constraints:
- Stay on `codex/ml-genie-dual-mode`.
- Do not revert unrelated user changes.
- Keep the two workspaces clearly separated (not merged in one panel).

When done:
- Update `/Users/jakob/codestuff/Hacklytics2026/Fusion/Crisis-api/NEXT_CONTEXT_HANDOFF.md` with exact completed work.
- Summarize tests and runtime checks executed.
