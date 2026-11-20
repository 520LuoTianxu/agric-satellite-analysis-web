# T36 Biweekly Visual Polish Plan

**Goal:** cohesive restrained phase/report/PDF controls and readable editorial content on existing PR18.
**Architecture:** keep pure selection/data contracts unchanged; regroup JSX toolbar only and refine component-scoped CSS using existing tokens/shared controls. No global UI edits.
**Tech Stack:** existing React18/Next14/CSS modules/Node24.

- [x] Add RED presentation regressions to `src/lib/biweekly/timeline.test.ts`: cohesive reportToolbar owns existing PDF component; tokenized neutral rail, no phase-color blocks/repeated full-width section borders; native text chart dates and aligned heading/control group. Run target tests, confirm intended failure.
- [x] Modify `src/components/biweekly/biweekly-tab.tsx/.module.css`: quiet neutral rail, selected accents, shared-radius lightweight controls, combined wrapping report toolbar. Modify `mock-pdf-download.tsx/.module.css` into concise real artifact action; preserve href/download/status and non-AI labeling.
- [x] Modify `mock-report.tsx/.module.css`: readable native chart date caption (all six dates), align heading/metric controls, neutral text and unified section spacing; no repetitive section/card borders. Keep fixture values/series and meaningful content unchanged.
- [x] Update preview docs; all Node tests, type-check, lint, build:test, diff check. Check exact preview PID870668 and localHTTP; no browser acceptance claim. Add normal commit, push same branch, update PR18 body if appropriate, no amend/rebase/force/merge/deploy. Parent handles browser QA.

Verification: 34 Node tests pass (including grouping, neutral/tokens, light/dark active-text AA calculation and figure/date aspect constraints); type-check/lint/build:test pass; existing module notices/province710000404 nonblocking. Three locale preview pages serve updatedCSS; actualPDFHTTP200. Listener870668 healthy and retained (no restart needed), width harness unchanged. Actual browser/visual QA pending parent; no acceptance claimed.

### t37 follow-up: breathing room
- [x] RED test: single inset owner, transparent query frame, tokenized vertical24/horizontal16→20→24 at360/600, actualTabp-0; calculate available width at288/400/640/900 without claiming DOM QA.
- [x] Add transparent frame around BiweeklyTab, own border-box inset and12/16/24 spacing; increase reasonable shared-control targets. Only biweekly Tab parent p-3→p-0, other tabs untouched. Keep short rail/data/logic/demo controls.
- [x] Run all tests/type-check/lint/build:test/diff and static previewHTTP; normal commit/push same PR18, no merge/deploy. Parent rechecks visual breathing room/overflow on refreshed assets.

T37 verification: 37 Node tests, type-check/lint/build:test and diff pass. Existing module-mode/province404 notices unchanged. HTTP checked all3 locale pages load new inset/nowrap/sparse CSS and actualPDF200. Existing listener870668 retained. Parent must refresh and recheck new gutter/date/icon/overflow visually; no new screenshot acceptance claim.
