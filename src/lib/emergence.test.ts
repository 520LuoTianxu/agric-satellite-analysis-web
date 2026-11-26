import assert from "node:assert/strict";
import test from "node:test";
import {
    autumnEmergencePath,
    autumnSeasonKeyFromSowingDate,
    emergenceHasResult,
    emergencePollSettled,
    normalizeEmergenceMap,
    normalizeEmergenceSummary,
} from "./emergence.ts";

const SUMMARY = {
    land_id: "33052",
    field_id: "33052",
    eligible: false,
    pending: false,
    season_key: "2026-autumn",
    status: null,
    status_zh: null,
    emerged_flag: false,
    frozen: false,
    baseline: { dates: [], start: null, end: null, statistic: null },
    noise_floor: null,
    method_version: "ww_autumn_soil_baseline_v1",
    summary: {},
    timeseries: [],
    disclaimer_zh: "相对该地块秋季晴空低平台的土壤本底判断持续抬升。",
};

test("empty crop land stays empty instead of not_emerged", () => {
    const summary = normalizeEmergenceSummary(SUMMARY, "33052");
    assert.equal(summary.field_id, "33052");
    assert.equal(summary.status, null);
    assert.equal(summary.pending, false);
    assert.equal(summary.eligible, false);
    assert.equal(summary.season_key, "2026-autumn");
    assert.equal(emergenceHasResult(summary), false);
    assert.equal(emergencePollSettled(summary), true);
});

test("pending winter wheat keeps polling until a status arrives", () => {
    const summary = normalizeEmergenceSummary({
        ...SUMMARY,
        eligible: true,
        pending: true,
    });
    assert.equal(summary.pending, true);
    assert.equal(summary.status, null);
    assert.equal(emergencePollSettled(summary), false);
});

test("autumn-emergence series uses median_ndvi and median_increment", () => {
    const summary = normalizeEmergenceSummary({
        ...SUMMARY,
        eligible: true,
        pending: false,
        status: "emerging",
        status_zh: "出苗中",
        emerged_flag: false,
        noise_floor: 0.028,
        baseline: {
            dates: ["2026-09-12", "2026-09-17"],
            start: "2026-09-12",
            end: "2026-09-17",
            statistic: "per-pixel median",
        },
        as_of_date: "2026-10-02",
        summary: {
            n_clear: 4,
            n_pixels: 120,
            median_increment: 0.041,
            class_counts: { "0": 20, "1": 40, "2": 60 },
        },
        timeseries: [
            {
                date: "2026-09-12",
                in_baseline: true,
                n_pixels: 120,
                median_ndvi: 0.12,
                median_increment: 0.0,
                share_above_noise: 0.01,
            },
            {
                date: "2026-09-17",
                in_baseline: true,
                n_pixels: 118,
                median_ndvi: 0.14,
                median_increment: 0.01,
                share_above_noise: 0.04,
            },
            {
                date: "2026-10-02",
                in_baseline: false,
                n_pixels: 120,
                median_ndvi: 0.19,
                median_increment: 0.041,
                share_above_noise: 0.62,
            },
        ],
    });
    assert.equal(summary.status, "emerging");
    assert.equal(summary.summary.noise_floor, 0.028);
    assert.equal(summary.summary.increment_median, 0.041);
    assert.equal(summary.summary.n_clear, 4);
    assert.equal(summary.timeseries[0]?.ndvi_median, 0.12);
    assert.equal(summary.timeseries[0]?.increment_median, 0);
    assert.equal(summary.timeseries[0]?.in_baseline, true);
    assert.equal(summary.timeseries[2]?.n_clear, 120);
    assert.equal(summary.baseline.median, 0.13);
    assert.equal(emergencePollSettled(summary), true);
    assert.equal(emergenceHasResult(summary), true);
});

test("pixels endpoint class 0/1/2 is read from pixels_lonlat", () => {
    const layer = normalizeEmergenceMap(
        {
            land_id: "33052",
            field_id: "33052",
            date: "2026-10-02",
            counts: { "0": 1, "1": 1, "2": 1 },
            pixels_lonlat: [
                { lon: 113.1, lat: 34.2, increment: 0.01, class: 0, baseline_ndvi: 0.12, ndvi: 0.13 },
                { lon: 113.2, lat: 34.2, increment: 0.05, class: 1, baseline_ndvi: 0.12, ndvi: 0.17 },
                { lon: 113.3, lat: 34.2, increment: 0.09, class: 2, baseline_ndvi: 0.12, ndvi: 0.21 },
            ],
        },
        "33052",
        "2026-10-02",
    );
    assert.equal(layer.pixels.length, 3);
    assert.deepEqual(
        layer.pixels.map((pixel) => pixel.rise_class),
        [0, 1, 2],
    );
    assert.equal(layer.class_counts?.["2"], 1);
    assert.equal(layer.date, "2026-10-02");
    assert.ok(layer.increment_median != null);
});

test("schedule and summary share the autumn-emergence path", () => {
    assert.equal(autumnEmergencePath("33052"), "/agri/lands/33052/autumn-emergence");
    assert.equal(autumnEmergencePath("a/b"), "/agri/lands/a%2Fb/autumn-emergence");
});

test("sowing date maps onto the autumn season key", () => {
    assert.equal(autumnSeasonKeyFromSowingDate("2026-10-08"), "2026-autumn");
    assert.equal(autumnSeasonKeyFromSowingDate("2027-01-15"), "2026-autumn");
    assert.equal(autumnSeasonKeyFromSowingDate("2026-04-01"), null);
    assert.equal(autumnSeasonKeyFromSowingDate(""), null);
});
