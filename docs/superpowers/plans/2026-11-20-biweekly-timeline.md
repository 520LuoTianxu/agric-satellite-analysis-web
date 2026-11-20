# Flat Timeline + Mock PDF Implementation Plan

**Goal:** Implement the user-approved chronological timeline and genuine synthetic detailed-PDF downloads without any live data integration.
**Architecture:** Typed date geometry and selection functions, a single timeline view, an editorial raw-data reader, versioned static PDF artifacts from the same fixtures. No report API or AI calls.
**Tech Stack:** Existing Next14/React18/TypeScript/CSS modules; Node tests. Optional offline Python ReportLab4.4.3 generator; no added npm dependency.

## Constraints

No cloud agents, nested card tree, overlays, real data, live AI, backend edits, migrations, deploy or merge. Existing peer tab and guards unchanged. Frontend remains mock until an explicit future integration request.

## Steps

- [x] Tests first: `src/lib/biweekly/timeline.test.ts` for clamped UTC geometry, contiguous crop phenology windows, month ticks, report positions, cross-period ownership, empty selection/navigation. Update obsolete accordion source regression in hierarchy.test.ts.
- [x] Add ISO start/end boundaries to growth fixtures (`mock-report.ts`) and `timeline.ts` pure adapters. Use half-open ranges; marker=report.start; width proportional to days.
- [x] Replace `biweekly-tab.tsx`/CSS tree with flat bands, period controls, ruler, report dots and bounded horizontal scroller; selection cursor and internal auto-centering. Preserve crop/metric functionality and normal-flow report body.
- [x] Replace report-card markup/styles with editorial raw-data sections; detail narrative moves to PDF. Expand standalone demo width.
- [x] Test PDF signature/hash/snapshot linkage and status contract first. Add optional `scripts/generate-biweekly-mock-pdfs.py`, static `public/biweekly-mock/*.pdf`, manifest and `pdf-contract.ts`; real download anchors only for ready artifacts, labels explicitly mock/no actual AI.
- [x] Update preview instructions and future offline backend contract, including known read-only backend PDF/Bailian module paths. Do not use existing model settings/credentials.
- [ ] Verify `node --test src/lib/*.test.ts src/lib/biweekly/*.test.ts`, type-check/lint/build:test, PDF text/page rendering, diff. Safely replace exact old preview PID586134 on3214 only after confirming identity. Push new branch/PR, do not merge/deploy. Parent handles browser QA.

## Verification outcome

24 Node tests pass, type-check/lint/build:test pass, diff clean. All8 PDF files have3 pages and searchable Chinese; representative pages1/3 were rendered and inspected. Re-running the optional generator yields byte-identical PDFs after setting ReportLab document-level invariant. Default/en/es preview and referenced JS/CSS return200; all8 exported PDF downloads return200 with matching SHA256. Only existing Node module-type notices and non-fatal Taiwan boundary710000 cache404 remain.

Existing preview server is retained: port3214, actual listenerPID586138 (wrapper586134), serving this reused worktree's new out/. Parent performs browser/reference-image QA. The supplied reference attachment is private to the parent, so implementation used its detailed visual description; no alternate access attempted.
