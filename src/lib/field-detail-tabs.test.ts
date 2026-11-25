import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    FIELD_DETAIL_DEFAULT_TAB,
    PARCEL_ANALYSIS_TAB,
    applyFieldDetailTabParams,
    resolveFieldDetailTab,
    resolveParcelAnalysisSection,
    shouldShowHarvestMapOverlay,
} from "./field-detail-tabs.ts";

describe("resolveFieldDetailTab", () => {
    it("defaults to growth analysis", () => {
        assert.equal(resolveFieldDetailTab(undefined), FIELD_DETAIL_DEFAULT_TAB);
        assert.equal(resolveFieldDetailTab(null), "ndvi");
        assert.equal(resolveFieldDetailTab(""), "ndvi");
        assert.equal(resolveFieldDetailTab("unknown-tab"), "ndvi");
    });

    it("keeps current visible and hidden tabs", () => {
        for (const tab of ["ndvi", "weather", "soil", "alerts", "parcel-analysis", "share", "scouting"]) {
            assert.equal(resolveFieldDetailTab(tab), tab);
        }
    });

    it("maps legacy report tabs into parcel analysis", () => {
        assert.equal(resolveFieldDetailTab("land-report"), PARCEL_ANALYSIS_TAB);
        assert.equal(resolveFieldDetailTab("season-growth"), PARCEL_ANALYSIS_TAB);
        assert.equal(resolveFieldDetailTab("harvest"), PARCEL_ANALYSIS_TAB);
    });
});

describe("resolveParcelAnalysisSection", () => {
    it("defaults to the land-report section", () => {
        assert.equal(resolveParcelAnalysisSection(), "land-report");
        assert.equal(resolveParcelAnalysisSection("ndvi"), "land-report");
    });

    it("honors legacy tab values and section query", () => {
        assert.equal(resolveParcelAnalysisSection("season-growth"), "season-growth");
        assert.equal(resolveParcelAnalysisSection("harvest"), "harvest");
        assert.equal(resolveParcelAnalysisSection("parcel-analysis", "harvest"), "harvest");
        assert.equal(resolveParcelAnalysisSection("land-report", "season-growth"), "season-growth");
    });
});

describe("shouldShowHarvestMapOverlay", () => {
    it("shows harvest overlay only when the harvest section is open", () => {
        assert.equal(shouldShowHarvestMapOverlay("parcel-analysis", true), true);
        assert.equal(shouldShowHarvestMapOverlay("parcel-analysis", false), false);
        assert.equal(shouldShowHarvestMapOverlay("ndvi", true), false);
        assert.equal(shouldShowHarvestMapOverlay("harvest", false), true);
    });
});

describe("applyFieldDetailTabParams", () => {
    it("omits default growth tab and default land-report section", () => {
        const params = new URLSearchParams("fieldId=1&tab=weather&section=harvest");
        applyFieldDetailTabParams(params, "ndvi");
        assert.equal(params.get("fieldId"), "1");
        assert.equal(params.get("tab"), null);
        assert.equal(params.get("section"), null);
    });

    it("writes canonical parcel-analysis and non-default section", () => {
        const params = new URLSearchParams("fieldId=1&tab=harvest");
        applyFieldDetailTabParams(params, "harvest", "harvest");
        assert.equal(params.get("tab"), "parcel-analysis");
        assert.equal(params.get("section"), "harvest");
        applyFieldDetailTabParams(params, "parcel-analysis", "land-report");
        assert.equal(params.get("tab"), "parcel-analysis");
        assert.equal(params.get("section"), null);
    });
});

it("keeps planting biweekly as a peer of parcel analysis without changing default", async () => {
    const { FIELD_DETAIL_VISIBLE_TABS } = await import("./field-detail-tabs.ts");
    assert.deepEqual(
        [...FIELD_DETAIL_VISIBLE_TABS],
        ["ndvi", "weather", "soil", "alerts", "biweekly", "parcel-analysis"],
    );
    assert.equal(resolveFieldDetailTab("biweekly"), "biweekly");
    assert.equal(FIELD_DETAIL_DEFAULT_TAB, "ndvi");
    const params = new URLSearchParams("fieldId=9&section=harvest");
    applyFieldDetailTabParams(params, "biweekly");
    assert.equal(params.get("tab"), "biweekly");
    assert.equal(params.get("section"), null);
});
