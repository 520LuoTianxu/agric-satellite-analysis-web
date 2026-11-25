import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nearestDateByOffsetX, type AxisClickChart } from "./chart-date-click.ts";
import {
    CHART_SCRUB_CANCEL_PX,
    CHART_SCRUB_HOLD_MS,
    datesInPercentWindow,
    scrubActivates,
    snapCategoryBand,
    uniqueSortedDates,
} from "./chart-scrub.ts";

function chartAt(positions: Record<string, number>): AxisClickChart {
    return {
        containPixel: () => true,
        convertToPixel: (_finder, value) => positions[String(value)] ?? null,
        getZr: () => ({
            on() {},
            off() {},
        }),
    };
}

describe("chart scrub rules", () => {
    it("does not arm on a short press", () => {
        assert.equal(scrubActivates(CHART_SCRUB_HOLD_MS - 1, 0), false);
        assert.equal(scrubActivates(80, 2), false);
    });

    it("arms only after the hold when the finger stayed still", () => {
        assert.equal(scrubActivates(CHART_SCRUB_HOLD_MS, 0), true);
        assert.equal(scrubActivates(CHART_SCRUB_HOLD_MS + 40, CHART_SCRUB_CANCEL_PX), true);
    });

    it("treats movement before the hold as scrolling, not date switching", () => {
        assert.equal(scrubActivates(CHART_SCRUB_HOLD_MS, CHART_SCRUB_CANCEL_PX + 1), false);
        assert.equal(scrubActivates(900, 24), false);
    });
});

describe("observation axis", () => {
    it("keeps each remote-sensing date once, in time order", () => {
        assert.deepEqual(
            uniqueSortedDates(["2026-06-27", "2025-12-02", "2026-06-27", ""]),
            ["2025-12-02", "2026-06-27"],
        );
    });

    it("snaps a season band to observations that actually exist", () => {
        const dates = ["2026-03-02", "2026-04-11", "2026-06-27"];
        assert.deepEqual(snapCategoryBand(dates, "2026-03-01", "2026-04-30"), ["2026-03-02", "2026-04-11"]);
        assert.equal(snapCategoryBand(dates, "2026-01-01", "2026-02-01"), null);
    });

    it("maps a zoom window onto the dates inside it", () => {
        const dates = ["a", "b", "c", "d", "e"];
        assert.deepEqual(datesInPercentWindow(dates, 0, 100), dates);
        assert.deepEqual(datesInPercentWindow(dates, 50, 100), ["c", "d", "e"]);
        assert.deepEqual(datesInPercentWindow(dates, 100, 0), dates);
    });
});

describe("nearestDateByOffsetX", () => {
    it("picks the observation closest to the finger", () => {
        const dates = ["2026-06-01", "2026-06-15", "2026-06-27"];
        const chart = chartAt({
            "2026-06-01": 10,
            "2026-06-15": 40,
            "2026-06-27": 80,
        });
        assert.equal(nearestDateByOffsetX(chart, 36, dates), "2026-06-15");
        assert.equal(nearestDateByOffsetX(chart, 70, dates), "2026-06-27");
    });
});
