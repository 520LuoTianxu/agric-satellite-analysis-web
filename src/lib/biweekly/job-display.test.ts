import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  canDownloadBiweeklyJob,
  decidePollTick,
  isGenerateInFlight,
  isInFlightJobStatus,
  isTerminalJobStatus,
  cardFromSummary,
  conclusionPieces,
  jobFromApi,
  jobFromLatest,
  jobRegistrationNote,
  jobStatusPreview,
  normalizeLatestJob,
  REGISTRATION_PENDING_NOTE,
  selectPeriodJob,
  samePollScope,
} from "./job-display.ts";

/** Real official period-15 payload observed on the page 2026-11-23 (Asia/Shanghai). */
const PERIOD_15_FIXTURE = {
  period_id: "15",
  issue: 15,
  start: "2026-03-21",
  end_exclusive: "2026-04-04",
  end_inclusive: "2026-04-03",
  snapshot: null,
  pack_pdf: null,
  optical_descriptive_days: 1,
  s1_products: 2,
  has_eligible_optics: true,
  plan_status: "smart_plant_task",
  latest_job: {
    job_id: "bj-ef25e6391ad7437b",
    status: "ready",
    created_at: "2026-11-23T15:18:51+08:00",
    reference: false,
  },
  observation_source: "parcel_scene_products",
};

test("conclusion pieces keep bold and the three colors, and ignore other tags", () => {
  assert.deepEqual(conclusionPieces("叶子里的水少了一些，<b>要留意浇水</b>。"), [
    {type: "text", text: "叶子里的水少了一些，"},
    {type: "bold", text: "要留意浇水"},
    {type: "text", text: "。"},
  ]);
  assert.deepEqual(conclusionPieces('<font color="#9C2B1B" backColor="#F8D6D2">东北部偏弱</font>'), [
    {type: "mark", text: "东北部偏弱", color: "#9C2B1B", background: "#F8D6D2"},
  ]);
  assert.deepEqual(conclusionPieces("<script>alert(1)</script>你好"), [
    {type: "text", text: "alert(1)你好"},
  ]);
  assert.deepEqual(conclusionPieces("A &amp; B"), [{type: "text", text: "A & B"}]);
});

test("summary card keeps plain conclusion lines and drops an empty payload", () => {
  assert.deepEqual(cardFromSummary({title: "本期结论", lines: [" 要留意浇水。 ", ""]}), {
    title: "本期结论",
    lines: ["要留意浇水。"],
    periods: {
      current: {label: "本期", start: null, end: null},
      prior: {label: "上一期", start: null, end: null},
    },
    metrics: [],
    weather: [],
  });
  assert.equal(cardFromSummary({title: "本期结论", lines: []}), null);
  assert.equal(cardFromSummary(null), null);
});

test("summary card keeps current and prior core parameters and drops unusable numbers", () => {
  const card = cardFromSummary({
    job_id: "bj-1",
    status: "ready",
    title: "本期结论",
    lines: ["长势稳定。"],
    source: "conclusion",
    periods: {
      current: {label: "本期", start: "2026-05-06", end: "2026-05-19"},
      prior: {label: "上一期", start: "2026-04-22", end: "2026-05-05"},
    },
    metrics: [
      {key: "ndvi", abbr: "NDVI", name: "长势", unit: "", decimals: 2, current: 0.65, prior: 0.5, current_days: 2, prior_days: 1},
      {key: "lswi", abbr: "LSWI", name: "含水", unit: "", decimals: 2, current: "0.22", prior: 0.41},
      {key: "savi", abbr: "SAVI", name: "裸土", unit: "", current: "bad", prior: "also-bad"},
      {key: "blank", abbr: "E", name: " ", current: 1, prior: 1},
    ],
    weather: [
      {key: "precipitation_mm", name: "有效降雨", unit: "毫米", decimals: 1, current: 0.1, prior: 5.5},
      {key: "et0_mm", name: "蒸散", unit: "毫米", current: 31.7, prior: 5.5},
      {key: "mean_c", name: "", unit: "℃", decimals: 1, current: 18.2, prior: 13.7},
    ],
  });
  assert.ok(card);
  assert.deepEqual(card.metrics.find(row => row.key === "ndvi"), {
    key: "ndvi",
    abbr: "NDVI",
    name: "长势",
    unit: "",
    decimals: 2,
    current: 0.65,
    prior: 0.5,
  });
  assert.equal(card.weather.find(row => row.name === "有效降雨")?.name, "有效降雨");
  assert.equal(card.periods.prior.start, "2026-04-22");
  const partial = card.metrics.find(row => row.key === "lswi");
  assert.ok(partial);
  assert.equal(partial.current, null);
  assert.equal(partial.prior, 0.41);
  assert.equal(JSON.stringify(partial).includes("0.22"), false);
  assert.equal(card.metrics.some(row => row.key === "savi"), false);
  assert.equal(card.metrics.some(row => row.key === "blank"), false);
  assert.equal(card.weather.some(row => row.key === "mean_c"), false);
  assert.equal(card.weather.find(row => row.key === "et0_mm")?.decimals, 1);
  assert.equal(JSON.stringify(card).includes("bad"), false);
  assert.equal(JSON.stringify(card).includes("also-bad"), false);

  const metricsOnly = cardFromSummary({
    metrics: [{key: "ndvi", abbr: "NDVI", name: "长势", current: 0.65, prior: null}],
    weather: null,
  });
  assert.equal(metricsOnly?.lines.length, 0);
  assert.equal(metricsOnly?.metrics[0]?.current, 0.65);
  assert.equal(metricsOnly?.metrics[0]?.decimals, 2);
  assert.equal(metricsOnly?.periods.current.label, "本期");
  assert.equal(metricsOnly?.periods.current.start, null);
  assert.equal(metricsOnly?.weather.length, 0);
  assert.equal(cardFromSummary({lines: [], metrics: [{name: "长势", current: "x", prior: null}], weather: []}), null);
});

test("P15 ready latest_job with null snapshot/pack_pdf hydrates a downloadable job", () => {
  assert.equal(PERIOD_15_FIXTURE.snapshot, null);
  assert.equal(PERIOD_15_FIXTURE.pack_pdf, null);
  const job = jobFromLatest(PERIOD_15_FIXTURE.latest_job);
  assert.deepEqual(job, {
    job_id: "bj-ef25e6391ad7437b",
    status: "ready",
    created_at: "2026-11-23T15:18:51+08:00",
    reference: false,
  });
  assert.equal(canDownloadBiweeklyJob(job), true);
  assert.equal("artifactUrl" in (job as object), false);
});

test("selectPeriodJob restores each period's latest_job and does not leak the previous job", () => {
  const period15 = selectPeriodJob({periodLatest: PERIOD_15_FIXTURE.latest_job, localJob: null});
  const period14 = selectPeriodJob({periodLatest: null, localJob: period15});
  const period12 = selectPeriodJob({
    periodLatest: {job_id: "bj-77f9bbfabcbbed32", status: "failed", created_at: "2026-11-23T15:00:00+08:00", reference: false},
    localJob: period15,
  });
  assert.equal(period15?.job_id, "bj-ef25e6391ad7437b");
  assert.equal(period14, null);
  assert.equal(period12?.job_id, "bj-77f9bbfabcbbed32");
  assert.equal(period12?.status, "failed");
  assert.equal(canDownloadBiweeklyJob(period12), false);
  assert.equal(canDownloadBiweeklyJob(period14), false);
});

test("a new generate job wins over a stale ready latest_job until the tracked id is current", () => {
  const ready = jobFromLatest(PERIOD_15_FIXTURE.latest_job);
  const next = jobFromApi({job_id: "bj-aaaaaaaaaaaaaaaa", status: "dispatched", kind: "generate"});
  const shown = selectPeriodJob({
    periodLatest: PERIOD_15_FIXTURE.latest_job,
    localJob: next,
    trackedJobId: "bj-aaaaaaaaaaaaaaaa",
  });
  assert.equal(shown?.job_id, "bj-aaaaaaaaaaaaaaaa");
  assert.equal(shown?.status, "dispatched");
  assert.equal(canDownloadBiweeklyJob(shown), false);
  assert.equal(isGenerateInFlight(shown), true);

  const finished = selectPeriodJob({
    periodLatest: {job_id: "bj-aaaaaaaaaaaaaaaa", status: "ready", created_at: "2026-11-23T16:00:00+08:00", reference: false},
    localJob: {job_id: "bj-aaaaaaaaaaaaaaaa", status: "ready", kind: "generate", artifact: {path: "artifacts/bj-aaaaaaaaaaaaaaaa.pdf"}},
    trackedJobId: "bj-aaaaaaaaaaaaaaaa",
  });
  assert.equal(finished?.job_id, "bj-aaaaaaaaaaaaaaaa");
  assert.equal(canDownloadBiweeklyJob(finished), true);
  assert.equal(finished?.artifact?.path, "artifacts/bj-aaaaaaaaaaaaaaaa.pdf");
  assert.notEqual(finished?.job_id, ready?.job_id);
});

test("queued/dispatched poll updates to ready and surfaces failed", () => {
  const scope = {landId: "32696", periodId: "15", jobId: "bj-new", generation: 1};
  const queued = decidePollTick({
    request: scope,
    current: scope,
    response: {job_id: "bj-new", status: "queued", kind: "generate"},
    attempts: 1,
    consecutiveErrors: 0,
  });
  assert.equal(queued.action, "apply-and-continue");
  if (queued.action === "apply-and-continue") assert.equal(queued.job.status, "queued");

  const dispatched = decidePollTick({
    request: scope,
    current: scope,
    response: {job_id: "bj-new", status: "dispatched", kind: "generate"},
    attempts: 2,
    consecutiveErrors: 0,
  });
  assert.equal(dispatched.action, "apply-and-continue");

  const ready = decidePollTick({
    request: scope,
    current: scope,
    response: {
      job_id: "bj-new",
      status: "ready",
      kind: "generate",
      artifact: {path: "artifacts/bj-new.pdf", sha256: "abc", size_bytes: 10, mime: "application/pdf"},
    },
    attempts: 3,
    consecutiveErrors: 0,
  });
  assert.equal(ready.action, "apply-and-stop");
  if (ready.action === "apply-and-stop") {
    assert.equal(ready.job.status, "ready");
    assert.equal(canDownloadBiweeklyJob(ready.job), true);
  }

  const failed = decidePollTick({
    request: scope,
    current: scope,
    response: {job_id: "bj-new", status: "failed", error_code: "GENERATE_FAILED", artifact: null},
    attempts: 4,
    consecutiveErrors: 0,
  });
  assert.equal(failed.action, "apply-and-stop");
  if (failed.action === "apply-and-stop") {
    assert.equal(failed.job.status, "failed");
    assert.equal(failed.job.error_code, "GENERATE_FAILED");
    assert.equal(canDownloadBiweeklyJob(failed.job), false);
    assert.equal(jobStatusPreview(failed.job).error_code, "GENERATE_FAILED");
  }
});

test("cancelled, unmounted, or stale land/period/job poll results are ignored", () => {
  const request = {landId: "32696", periodId: "15", jobId: "bj-new", generation: 2};
  const readyBody = {job_id: "bj-new", status: "ready"};
  assert.equal(decidePollTick({
    request,
    current: request,
    cancelled: true,
    response: readyBody,
    attempts: 1,
    consecutiveErrors: 0,
  }).action, "ignore");
  assert.equal(decidePollTick({
    request,
    current: {...request, periodId: "14"},
    response: readyBody,
    attempts: 1,
    consecutiveErrors: 0,
  }).action, "ignore");
  assert.equal(decidePollTick({
    request,
    current: {...request, landId: "19994"},
    response: readyBody,
    attempts: 1,
    consecutiveErrors: 0,
  }).action, "ignore");
  assert.equal(decidePollTick({
    request,
    current: {...request, jobId: "bj-other"},
    response: readyBody,
    attempts: 1,
    consecutiveErrors: 0,
  }).action, "ignore");
  assert.equal(decidePollTick({
    request,
    current: {...request, generation: 3},
    response: readyBody,
    attempts: 1,
    consecutiveErrors: 0,
  }).action, "ignore");
  assert.equal(samePollScope(request, request), true);
  assert.equal(samePollScope(request, {...request, periodId: "14"}), false);
});

test("poll errors stay visible and stop after the error or attempt budget, never looping forever", () => {
  const scope = {landId: "32696", periodId: "15", jobId: "bj-new", generation: 1};
  const transient = decidePollTick({
    request: scope,
    current: scope,
    error: "HTTP_502",
    attempts: 2,
    consecutiveErrors: 1,
    maxConsecutiveErrors: 3,
  });
  assert.equal(transient.action, "retry");

  const budget = decidePollTick({
    request: scope,
    current: scope,
    error: "HTTP_502",
    attempts: 3,
    consecutiveErrors: 2,
    maxConsecutiveErrors: 3,
  });
  assert.equal(budget.action, "stop-error");
  if (budget.action === "stop-error") assert.equal(budget.error, "HTTP_502");

  const timeout = decidePollTick({
    request: scope,
    current: scope,
    response: {job_id: "bj-new", status: "dispatched"},
    attempts: 5,
    consecutiveErrors: 0,
    maxAttempts: 5,
  });
  assert.equal(timeout.action, "stop-timeout");
  if (timeout.action === "stop-timeout") {
    assert.match(timeout.error, /已停止自动刷新/);
    assert.equal(timeout.job?.status, "dispatched");
  }
});

test("missing latest_job stays an empty state and evidence_limited is not a fake download", () => {
  assert.equal(jobFromLatest(null), null);
  assert.equal(jobFromLatest(undefined), null);
  assert.equal(normalizeLatestJob({status: "ready"}), null);
  assert.equal(selectPeriodJob({periodLatest: null, localJob: null}), null);
  assert.equal(canDownloadBiweeklyJob(null), false);
  assert.equal(canDownloadBiweeklyJob({status: "ready"}), false);

  const limitedOnly = jobFromLatest({job_id: "bj-limited", status: "evidence_limited", created_at: "2026-11-23T15:00:00+08:00", reference: false});
  assert.equal(limitedOnly?.status, "evidence_limited");
  assert.equal(canDownloadBiweeklyJob(limitedOnly), false);
  assert.equal(canDownloadBiweeklyJob({...limitedOnly!, artifact: null}), false);
  assert.equal(canDownloadBiweeklyJob({...limitedOnly!, artifact: {kind: "evidence_limited_brief"}}), false);
  assert.equal(
    canDownloadBiweeklyJob({
      ...limitedOnly!,
      artifact: {path: "artifacts/bj-limited-brief.pdf", kind: "evidence_limited_brief", sha256: "def", size_bytes: 100},
    }),
    true,
  );
});

test("status helpers and official GET mapping do not invent artifactUrl", () => {
  assert.equal(isTerminalJobStatus("ready"), true);
  assert.equal(isTerminalJobStatus("evidence_limited"), true);
  assert.equal(isTerminalJobStatus("failed"), true);
  assert.equal(isInFlightJobStatus("queued"), true);
  assert.equal(isInFlightJobStatus("dispatched"), true);
  assert.equal(isGenerateInFlight({status: "dispatched", kind: "backfill"}), false);
  const mapped = jobFromApi({
    job_id: "bj-ef25e6391ad7437b",
    kind: "generate",
    status: "ready",
    error_code: null,
    dispatched_to_production: true,
    artifact: {path: "artifacts/bj-ef25e6391ad7437b.pdf", filename: "种植双周报.pdf", mime: "application/pdf", sha256: "e299", size_bytes: 9104920, kind: "official_visual_artifact"},
    result: {phase: "抽穗期", brief: "ok"},
  });
  assert.equal(mapped?.kind, "generate");
  assert.equal(mapped?.artifact?.kind, "official_visual_artifact");
  assert.equal("artifactUrl" in (mapped as object), false);
  assert.equal(canDownloadBiweeklyJob(mapped), true);
});

test("biweekly tab hydrates latest_job, polls GET job, and does not gate download on pack_pdf or snapshot", () => {
  const tab = readFileSync("src/components/biweekly/biweekly-tab.tsx", "utf8");
  const client = readFileSync("src/lib/biweekly/local-trigger.ts", "utf8");
  const catalog = readFileSync("src/lib/biweekly/local-catalog.ts", "utf8");
  assert.match(catalog, /latest_job\?:/);
  assert.match(client, /export function getJob/);
  assert.match(tab, /jobFromLatest/);
  assert.match(tab, /selectPeriodJob/);
  assert.match(tab, /canDownloadBiweeklyJob/);
  assert.match(tab, /getJob\(/);
  assert.match(tab, /downloadJob/);
  assert.doesNotMatch(tab, /href=\{jobDownloadUrl/);
  assert.match(tab, /AbortController/);
  assert.match(tab, /clearTimeout/);
  assert.doesNotMatch(tab, /pack_pdf/);
  assert.doesNotMatch(tab, /snapshot/);
  assert.doesNotMatch(tab, /artifactUrl/);
});

test("registration_pending is in-flight, not downloadable, and keeps polling", () => {
  const latest = {job_id: "bj-ef25e6391ad7437b", status: "registration_pending", created_at: "2026-11-23T15:21:02+08:00"};
  const job = jobFromLatest(latest);
  assert.equal(isInFlightJobStatus("registration_pending"), true);
  assert.equal(isGenerateInFlight(job), true);
  assert.equal(isTerminalJobStatus("registration_pending"), false);
  assert.equal(canDownloadBiweeklyJob(job), false);
  assert.equal(
    canDownloadBiweeklyJob({...job, artifact: {path: "artifacts/x.pdf", key: "reports/default/32696/biweekly-bj-ef25e6391ad7437b.pdf"}}),
    false,
  );
  assert.equal(jobRegistrationNote(job), REGISTRATION_PENDING_NOTE);
  assert.equal(jobStatusPreview(job).note, REGISTRATION_PENDING_NOTE);
  assert.equal(jobStatusPreview(job).status, "registration_pending");

  const decision = decidePollTick({
    request: {landId: "32696", periodId: "15", jobId: latest.job_id, generation: 1},
    current: {landId: "32696", periodId: "15", jobId: latest.job_id, generation: 1},
    response: {job_id: latest.job_id, status: "registration_pending"},
    attempts: 2,
    consecutiveErrors: 0,
  });
  assert.equal(decision.action, "apply-and-continue");
});

test("ready latest_job from official P15 is still downloadable after registration_pending handling", () => {
  const job = jobFromLatest(PERIOD_15_FIXTURE.latest_job);
  assert.equal(job?.status, "ready");
  assert.equal(canDownloadBiweeklyJob(job), true);
  assert.equal(isGenerateInFlight(job), false);
});
