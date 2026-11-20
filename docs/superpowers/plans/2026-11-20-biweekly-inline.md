# Inline biweekly phase hierarchy implementation plan

**Goal:** Replace the superseded modal design with a first-level 种植双周报 field tab, phase → crop growth period → report hierarchy and inline content.
**Architecture:** Keep typed synthetic report content; add crop-specific grouping adapter and narrow container-aware presentation. Do not pass real parcel facts into fixtures. No Dialog/portal/report API. Existing defaults/auth/weather and report sections remain intact.

1. Add failing tests for first-level biweekly tab, unique ownership of cross-period reports, multiple reports per growth period and future empty phases. Add source integration checks for actual trigger/content and no Dialog.
2. Add four reports per crop, explicit primary/covered growth-period metadata and crop-specific S1/S2/S3 tree. S labels denote agronomic phases, not sensors.
3. Remove summary from parcel-analysis, add top-level trigger/content and all locale labels. Replace old modal/standalone route with the same inline hierarchy component. Reuse report sections with narrow responsive rules and no nested scrolling.
4. Verify tests, typecheck, lint, build:test; restart only our preview server on 3214 to serve new output. Push a new branch/PR to master, do not merge/deploy.

## File responsibilities / checkpoints

- `src/lib/biweekly/mock-report.ts`: eight deterministic report fixtures, typed ownership, `getPhaseTree(crop)` and `growthPeriodNames(crop, ids)`.
- `src/components/biweekly/biweekly-tab.tsx` and `.module.css`: hierarchy/selectors/empty states and current selection, no real parcel inputs.
- `src/components/biweekly/mock-report.tsx` and `.module.css`: reusable normal-flow `MockReportContent({report})`; delete superseded modal/demo CSS and markup.
- `src/lib/field-detail-tabs.ts` and field detail page: append same-level peer, keep default and existing order. Parcel analysis loses only superseded mock summary.
- `messages/{zh,en,es}.json`: peer label; standalone demo page uses same component.
- Tests: `src/lib/biweekly/{mock-report,hierarchy}.test.ts`, `src/lib/field-detail-tabs.test.ts`; docs `docs/biweekly-mock-preview.md`.

- [x] Red: node tests failed for missing hierarchy/peer and existing modal design.
- [x] Green: four-per-crop fixtures, unique primary period and multi-report period; peer registration and inline content.
- [x] Self-review: remove obsolete dialog/summary CSS and ensure actual report classes adapt to narrow container.
- [x] Verification: `node --test src/lib/*.test.ts src/lib/biweekly/*.test.ts`, `npm run type-check`, `npm run lint`, `npm run build:test`, `git diff --check`.
- [ ] Delivery: new branch/commit/PR only; preview healthy on 3214. Parent performs browser QA.

Validation outcome: 17 tests pass, type-check/lint/build:test exit0, git diff --check clean. Existing prebuild Taiwan boundary710000 URL404 is non-fatal; Node test module-type warnings persist without changing package module semantics. Preview HTML and referenced JS/CSS return200 for default/en/es. Browser visual QA remains with parent.
