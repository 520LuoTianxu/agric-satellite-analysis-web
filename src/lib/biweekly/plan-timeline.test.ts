import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addDays } from "./timeline.ts";
import { buildPlanTimeline, planStagesFromPayload, PHASE_LABELS } from "./plan-timeline.ts";

const seasonPayload = {
  season_id: "2026/27",
  label: "2026/27 种植季",
  crop_name: "小麦",
  stages: [
    { name: "播种前准备", source_stage_name: "播种前准备", start: "2026-09-20", end_inclusive: "2026-10-05", end_exclusive: "2026-10-06", mapping_status: "NOT_APPLICABLE", phase_label: null, phase_code: null, monitored: false, tags: [] },
    { name: "播种期", source_stage_name: "播种期", start: "2026-10-06", end_inclusive: "2026-10-15", end_exclusive: "2026-10-16", mapping_status: "NOT_APPLICABLE", phase_label: null, phase_code: null, monitored: false, tags: [] },
    { name: "出苗期", start: "2026-10-16", end_inclusive: "2026-10-31", end_exclusive: "2026-11-01", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: [] },
    { name: "分蘖期", start: "2026-11-01", end_inclusive: "2026-11-30", end_exclusive: "2026-12-01", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: [] },
    { name: "越冬期", start: "2026-12-01", end_inclusive: "2027-02-15", end_exclusive: "2027-02-16", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: ["DORMANCY"] },
    { name: "返青期", start: "2027-02-16", end_inclusive: "2027-03-10", end_exclusive: "2027-03-11", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: [] },
    { name: "拔节孕穗期", start: "2027-03-11", end_inclusive: "2027-04-10", end_exclusive: "2027-04-11", mapping_status: "MAPPED", phase_label: "S2", phase_code: "TRANS", tags: [] },
    { name: "抽穗期", start: "2027-04-11", end_inclusive: "2027-04-25", end_exclusive: "2027-04-26", mapping_status: "MAPPED", phase_label: "S3", phase_code: "REPRO", tags: [] },
    { name: "灌浆期", start: "2027-04-26", end_inclusive: "2027-05-19", end_exclusive: "2027-05-20", mapping_status: "MAPPED", phase_label: "S3", phase_code: "REPRO", tags: [] },
    { name: "成熟期", start: "2027-05-20", end_inclusive: "2027-06-05", end_exclusive: "2027-06-06", mapping_status: "MAPPED", phase_label: "S3", phase_code: "REPRO", tags: [] },
  ],
};

test("maps seasons payload into a timeline including pre-S1 stages", () => {
  const stages = planStagesFromPayload(seasonPayload);
  assert.deepEqual(stages.map((row) => row.name), [
    "播种前准备",
    "播种期",
    "出苗期",
    "分蘖期",
    "越冬期",
    "返青期",
    "拔节孕穗期",
    "抽穗期",
    "灌浆期",
    "成熟期",
  ]);
  assert.equal(stages[0].monitored, false);
  assert.equal(stages[0].phase_label, null);
  assert.equal(stages[1].mapping_status, "NOT_APPLICABLE");
  assert.equal(stages[2].phase_label, "S1");
  assert.equal(stages[6].phase_label, "S2");
  assert.equal(stages[7].phase_label, "S3");
  assert.equal(stages[6].phase_name, PHASE_LABELS.S2);
  assert.ok(!stages.some((row) => row.name === "孕穗"));
  assert.ok(!stages.some((row) => row.name === "起身期"));

  const fromNative = planStagesFromPayload({
    native_plan: {
      intervals: [
        { source_stage_name: "播种前准备", start: "2026-09-20", end_inclusive: "2026-10-05", end_exclusive: "2026-10-06", mapping_status: "NOT_APPLICABLE", phase_label: null },
        { source_stage_name: "出苗期", start: "2026-10-16", end_inclusive: "2026-10-31", mapping_status: "MAPPED", phase_label: "S1" },
      ],
    },
  });
  assert.equal(fromNative[0].name, "播种前准备");
  assert.equal(fromNative[1].end_exclusive, "2026-11-01");

  const view = buildPlanTimeline(stages, {
    period_id: "5",
    label: "第5期",
    start: "2026-11-09",
    end_inclusive: "2026-11-22",
    end_exclusive: "2026-11-23",
  });
  assert.equal(view.empty, false);
  assert.equal(view.start, "2026-09-20");
  assert.equal(view.end, "2027-06-06");
  assert.deepEqual(view.phases.map((phase) => phase.label), ["S1", "S2", "S3"]);
  assert.equal(view.phases[0].name, "营养生长");
  assert.equal(view.phases[1].name, "营养/生殖并进");
  assert.equal(view.phases[2].name, "生殖生长");
  assert.equal(view.phases[0].start, "2026-10-16");
  assert.ok(view.phases[0].left > 0);
  assert.equal(view.stages.filter((row) => !row.monitored).length, 2);
  assert.ok(view.period);
  assert.equal(view.period?.label, "第5期");
  assert.ok(view.period!.left > view.stages[1].left);
  assert.ok(view.period!.left + view.period!.width <= 1);
  assert.ok(view.period!.start >= "2026-11-01" && view.period!.start < "2026-12-01");
});

test("does not invent stages and shows an empty view without dates", () => {
  assert.deepEqual(planStagesFromPayload({}), []);
  assert.equal(buildPlanTimeline([]).empty, true);
  const skipped = planStagesFromPayload({
    stages: [
      { name: "出苗期", phase_label: "S1" },
      { name: "孕穗", start: "2027-03-01", end_inclusive: "2027-03-10", end_exclusive: "2027-03-11", phase_label: "S2" },
    ],
  });
  assert.deepEqual(skipped.map((row) => row.name), ["孕穗"]);
});

test("live tab renders the Smart plan timeline, not the mock report axis", () => {
  const tab = readFileSync("src/components/biweekly/biweekly-tab.tsx", "utf8");
  const component = readFileSync("src/components/biweekly/plan-timeline.tsx", "utf8");
  assert.match(tab, /PlanPhenologyTimeline/);
  assert.match(tab, /planStagesFromPayload/);
  assert.doesNotMatch(tab, /ReportTimeline/);
  assert.doesNotMatch(tab, /MOCK_REPORTS/);
  assert.doesNotMatch(tab, /Mock排期/);
  const policy = readFileSync("src/lib/biweekly/plan-timeline.ts", "utf8");
  assert.doesNotMatch(component, /phase_mapping/);
  assert.doesNotMatch(component, /算法/);
  assert.match(component, /S1/);
  assert.match(component, /phase\.name/);
  assert.match(policy, /营养生长/);
  assert.match(policy, /营养\/生殖并进/);
  assert.match(policy, /生殖生长/);
  assert.match(component, /未纳入监测/);
  assert.match(component, /本季种植方案暂无生育期日期/);
});
