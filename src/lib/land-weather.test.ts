import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLandWeatherPath } from "./land-weather.ts";

describe("buildLandWeatherPath", () => {
    it("always requests historical weather only with include_forecast=false", () => {
        const path = buildLandWeatherPath("18509", "2024-01-01", "2024-12-31");
        const url = new URL(path, "https://example.test");
        assert.equal(url.pathname, "/lands/18509/weather");
        assert.equal(url.searchParams.get("start_date"), "2024-01-01");
        assert.equal(url.searchParams.get("end_date"), "2024-12-31");
        assert.equal(url.searchParams.get("include_forecast"), "false");
        assert.equal(url.searchParams.has("include_forecast"), true);
    });

    it("keeps the given land and date window and still omits forecast if a caller asks for it", () => {
        const path = buildLandWeatherPath("999", "2026-11-01", "2026-11-20", true);
        const url = new URL(path, "https://example.test");
        assert.equal(url.pathname, "/lands/999/weather");
        assert.equal(url.searchParams.get("start_date"), "2026-11-01");
        assert.equal(url.searchParams.get("end_date"), "2026-11-20");
        assert.equal(url.searchParams.get("include_forecast"), "false");
    });
});
