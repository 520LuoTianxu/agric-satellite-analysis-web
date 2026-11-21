# Focused Chronological Timeline Implementation Plan

**Goal:** actual continuous proportional timeline without seasonal horizontal overflow or plain segmented navigation.
**Architecture:** extend pure `timeline.ts` with UTC geometry/clipping/focus/shift helpers; add `report-timeline.tsx/.module.css`; parent owns existing selection, timeline owns view window only. Overview/full-window scales explicitly distinct.
**Tech Stack:** existing React/TypeScript/CSS/Radix components, no new deps.

- [x] RED geometry tests: UTC proportions, unequal crop phase durations, clipping/continuity,56-day clamped focus,28-day navigation/endpoints, unique report start markers and future empty periods; update obsolete equal-width chip source guards to chronological axis/no long scroll guards.
- [x] Implement `seasonBounds`, `dateRatio`, `focusWindow`, `shiftWindow`, `buildWindowTimeline` in `src/lib/biweekly/timeline.ts`; keep selection helpers/data unchanged.
- [x] Add `src/components/biweekly/report-timeline.tsx/.module.css`: full-season stage strip,56-day aligned stage/growth/date/report rows, cursor and window controls, complete grouped growthSelect, shared accessible controls and sparse short-cell labels. No cards/modal/long min-width.
- [x] Replace old phase/growth button tree in `biweekly-tab.tsx` with new component; retain report/PDF toolbar and gutter/body fixes. Remove obsolete CSS. Update docs and run all tests/type/lint/build:test/diff/HTTP. 42 tests pass; type/lint/static build pass. Client Guard means HTTP checks verify new chunk/CSS mapping, not an SSR timeline or visual acceptance. No merge/deploy/backend change.

发布阶段：验证后普通提交/推送同PR18并更新说明，浏览器QA仍由主代理完成；远端结果以工具确认。
