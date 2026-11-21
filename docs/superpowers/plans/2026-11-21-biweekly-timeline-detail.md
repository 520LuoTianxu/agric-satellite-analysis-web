# Timeline Detail Implementation Plan

**Goal:** polish the existing continuous timeline without changing its information architecture or Mock sources.
**Architecture:** add two pure presentation helpers to timeline.ts; keep UTC geometry and selection unchanged. Layer interval-local cursors beneath labels and align record/ruler spacing in the isolated timeline component/CSS.
**Tech Stack:** React, TypeScript, CSS modules, existing Button/Select/Tooltip; no dependency or backend changes.

- [x] RED: src/lib/biweekly/timeline-detail.test.ts tests `cursorWithinInterval(anchor,{left,width})` half-open seam ownership/invalid width and coordinate reconstruction across both crops/windows/288–900; `timelineDateLabels(start,endExclusive)` crossyear and last-day handling; precise period boundaryTicks; UI guards for local cursor labels,28px targets/date selection, explicit offwindow action and full Tooltip provenance. Run node --test on this file and observe expected missing behavior.
- [x] GREEN: src/lib/biweekly/timeline.ts exports helpers, adds boundaryTicks from visible growth intervals without changing report/date positions. report-timeline.tsx/CSS use helpers, local cursors/label backplates, bounded focus outline, shared92px dot center/28px target/124px canvas, three sparse atomic date labels, useful Tooltip/return state. Retain all overview phases/current gutters/shared controls and data/PDF fixtures.
- [x] Regression: node --test src/lib/*.test.ts src/lib/biweekly/*.test.ts; npm run type-check; npm run lint; npm run build:test; git diff --check. Revisit stale CSS assertions only for intentional changes. Inspect diff/status; HTTP verify new JS/CSS runtime and8 PDFs/3locale paths, no screenshot-acceptance claim.
- [x] Handoff documentation: docs/biweekly-mock-preview.md records detail changes and top-loader evidence/uncertainty. 47 tests/type/lint/build:test/diff pass;3locale asset runtime/8PDF HTTP checks pass. Demo widths/readouts unchanged.

发布动作：普通提交并推送同PR18，再更新最新说明（实际远端head以工具确认为准）。保留3214健康PID870668/out映射。浏览器QA待主代理，不amend/forcepush/merge/deploy/backend编辑。
