import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampScrubLabelX, companionLines, formatIndexValue, formatObservationDate, formatObservationDay } from "./index-readout.ts";

describe("scrub label position", () => {
    it("keeps the main number inside the chart width", () => {
        assert.equal(clampScrubLabelX(4, 320, 40), 40);
        assert.equal(clampScrubLabelX(300, 320, 40), 280);
        assert.equal(clampScrubLabelX(160, 320, 40), 160);
    });

    it("centers the number when the chart is narrower than the label", () => {
        assert.equal(clampScrubLabelX(0, 48, 40), 24);
        assert.equal(clampScrubLabelX(48, 48, 40), 24);
    });
});

describe("index readout text", () => {
    it("shows NDVI with two decimals and radar with one", () => {
        assert.equal(formatIndexValue(0.186, false), "0.19");
        assert.equal(formatIndexValue(-12.34, true), "-12.3");
    });

    it("writes the selected day as a full date", () => {
        const zh = formatObservationDate("2026-11-25", "zh-CN");
        assert.match(zh, /2026/);
        assert.match(zh, /11/);
        assert.match(zh, /25/);
        assert.equal(formatObservationDate("2026-02-31", "zh-CN"), "2026-02-31");
        const day = formatObservationDay("2026-11-25", "zh-CN");
        assert.match(day, /25/);
        assert.equal(day.includes("星期三"), false);
    });

    it("keeps the main index out of the small print", () => {
        assert.deepEqual(
            companionLines(
                [
                    { key: "ndvi", value: 0.42 },
                    { key: "evi", value: 0.31 },
                    { key: "ndmi", value: null },
                ],
                "ndvi",
                2,
                (key) => key.toUpperCase(),
            ),
            [{ label: "EVI", value: "0.31" }],
        );
    });
});
