# Mock biweekly report implementation plan

**Goal:** Build the approved sidebar summary and wide continuous report, all new data deterministic synthetic fixtures.
**Architecture:** Typed local fixture adapter shared by a sidebar Dialog and a standalone synthetic route. No business API calls or auth changes. CSS-module responsive layout and SVG visualizations; existing Radix focus/escape handling.
**Tech Stack:** Next14/React18/TypeScript, existing Radix Dialog, CSS modules, node:test.

## Constraints
- Local isolated worktree from origin/master. No backend/DB/deploy/cloud tasks.
- Persistent Mock label, no real parcel evidence mixed into fixtures. FVC/LAI simulated, unvalidated; PSRI unavailable. Historical weather only.
- Global organization guard unchanged. Standalone /biweekly-demo outside authenticated AppShell, synthetic only; denied organizations remain blocked by global guard.
- No nested tabs; selectors, anchors and metric buttons really update fixtures/charts. No pretend PDF action.

## Steps
1. Test deterministic fixture identities, half-open phase coverage, weather sums, final chart/card consistency, selection fallback and synthetic status using src/lib/biweekly/mock-report.test.ts. Run node --test src/lib/biweekly/mock-report.test.ts and observe RED, implement mock-report.ts and obtain GREEN.
2. Create src/components/biweekly/mock-report.tsx + mock-report.module.css: summary trigger, accessible wide Dialog reader, continuous sections, SVG trend and synthetic cell schematic, method accordion.
3. Add synthetic route src/app/[locale]/biweekly-demo/page.tsx and entry in parcel-analysis-tab.tsx; leave existing lazy sections/state untouched. Document preview/deploy constraints in docs/biweekly-mock-preview.md.
4. Run node tests, npm run type-check, npm run lint, npm run build:test; inspect static route/server response. Browser visual review if sanctioned tools available, otherwise document not performed. Commit only intended files; no merge/deploy.
