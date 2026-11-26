/**
 * Autumn emergence (出苗) — rise above the soil baseline, per pixel.
 *
 * Daily results come from official daily product fields plus the land-level
 * emerged flag. The browser talks to the same autumn-emergence reads. Nginx maps the
 * app's `/satellite-api` prefix onto the API `/v1` prefix, so these paths
 * are written without `/v1` and without `/satellite-api`:
 *
 *   GET  /agri/lands/{land_id}/autumn-emergence
 *   GET  /agri/lands/{land_id}/autumn-emergence/pixels?date=YYYY-MM-DD
 *   POST /agri/lands/{land_id}/autumn-emergence
 *        { sowing_date: "YYYY-MM-DD", season?: "YYYY-autumn" }
 *
 * POST only schedules work on the same backfill-indices / satellite_batch
 * claim path as 更新影像. Task progress is that pull's job status, not a
 * long poll of this GET while pending is true. Read this GET when a result
 * is ready. The browser does not download satellite imagery. A missing
 * crop_type does not block the manual POST; automatic compute skips those
 * lands.
 *
 * Pixel class is 0 / 1 / 2 (within noise, above noise, sustained).
 * Status is not_emerged / emerging / emerged / uncertain, or null while
 * pending or empty. `EMERGENCE_NDVI_REFERENCE` (0.30) is a chart tick only.
 */

export const EMERGENCE_NDVI_REFERENCE = 0.3;

/** Display stretch for the increment film. Not an NDVI 0–1 scale. */
export const EMERGENCE_INCREMENT_RANGE: [number, number] = [0.04, 0.2];

export type EmergenceStatus = "not_emerged" | "emerging" | "emerged" | "uncertain";

export const EMERGENCE_STATUSES: EmergenceStatus[] = [
    "not_emerged",
    "emerging",
    "emerged",
    "uncertain",
];

export type EmergenceMapView = "increment" | "class";

export interface EmergenceBaseline {
    dates: string[];
    statistic: string | null;
    median: number | null;
}

export interface EmergenceTimeseriesPoint {
    date: string;
    /** True when this clear day is part of the soil-baseline window. */
    in_baseline: boolean;
    ndvi_median: number | null;
    ndvi_mean: number | null;
    ndvi_p05: number | null;
    ndvi_p25: number | null;
    ndvi_p75: number | null;
    ndvi_p95: number | null;
    increment_median: number | null;
    increment_p05: number | null;
    increment_p25: number | null;
    increment_p75: number | null;
    increment_p95: number | null;
    n_clear: number | null;
    share_above_noise: number | null;
    share_sustained: number | null;
    status: EmergenceStatus | null;
}

export interface EmergenceSummaryStats {
    n_clear: number | null;
    ndvi_median: number | null;
    increment_median: number | null;
    increment_min: number | null;
    /** This land's residual P99. Not a fixed 0.035 and not an NDVI cutoff. */
    noise_floor: number | null;
}

export interface EmergenceSummary {
    field_id: string;
    /** Null when the season has no status yet (pending or not computed). */
    status: EmergenceStatus | null;
    emerged_flag: boolean | null;
    frozen: boolean;
    /** False while the API is still computing this season. */
    pending: boolean;
    /** False when automatic compute skips the land. Manual POST is still allowed. */
    eligible: boolean;
    season_key: string | null;
    baseline: EmergenceBaseline;
    as_of_date: string | null;
    first_emerged_date: string | null;
    method_version: string | null;
    summary: EmergenceSummaryStats;
    timeseries: EmergenceTimeseriesPoint[];
}

/** One clear pixel on the emergence map resource. NDVI is not stored. */
export interface EmergenceMapPixel {
    lon: number;
    lat: number;
    increment: number | null;
    /** Product class 0, 1, or 2. Absent when the resource did not send one. */
    rise_class: number | null;
}

export interface EmergenceMapLayer {
    field_id: string;
    date: string | null;
    baseline_dates: string[];
    pixels: EmergenceMapPixel[];
    class_counts: Record<string, number> | null;
    increment_median: number | null;
    increment_min: number | null;
}

const STATUS_ALIASES: Record<string, EmergenceStatus> = {
    not_emerged: "not_emerged",
    notemerged: "not_emerged",
    none: "not_emerged",
    absent: "not_emerged",
    no: "not_emerged",
    false: "not_emerged",
    未出苗: "not_emerged",
    emerging: "emerging",
    rising: "emerging",
    in_progress: "emerging",
    partial: "emerging",
    出苗中: "emerging",
    emerged: "emerged",
    yes: "emerged",
    true: "emerged",
    已出苗: "emerged",
    uncertain: "uncertain",
    unknown: "uncertain",
    不确定: "uncertain",
};

/**
 * Agri parcel id for `/agri/lands/{id}/…`.
 * The field primary key is that id. A blank id is not an agri land.
 */
export function parseAgriLandId(
    land: { land_id?: string | null; source_parcel_id?: string | null } | string | null | undefined,
): string | null {
    if (land == null) return null;
    const raw = typeof land === "string" ? land : land.land_id || land.source_parcel_id;
    const id = String(raw ?? "").trim();
    return id || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function pick(obj: Record<string, unknown> | null, ...keys: string[]): unknown {
    if (!obj) return undefined;
    for (const key of keys) {
        if (obj[key] != null && obj[key] !== "") return obj[key];
    }
    return undefined;
}

function num(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function str(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return null;
}

function dateStr(value: unknown): string | null {
    const s = str(value);
    if (!s) return null;
    return s.slice(0, 10);
}

function bool(value: unknown): boolean | null {
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1" || value === "true") return true;
    if (value === 0 || value === "0" || value === "false") return false;
    return null;
}

export function parseEmergenceStatus(value: unknown, emergedFlag: boolean | null): EmergenceStatus | null {
    if (value == null || value === "") {
        return emergedFlag === true ? "emerged" : null;
    }
    const key = str(value)?.toLowerCase().replace(/[\s-]+/g, "_");
    if (key && STATUS_ALIASES[key]) return STATUS_ALIASES[key];
    const raw = str(value);
    if (raw && STATUS_ALIASES[raw]) return STATUS_ALIASES[raw];
    if (emergedFlag === true) return "emerged";
    if (emergedFlag === false) return "not_emerged";
    return "uncertain";
}

/** Gateway path for the autumn-emergence summary GET and the schedule POST. */
export function autumnEmergencePath(landId: string): string {
    return `/agri/lands/${encodeURIComponent(landId)}/autumn-emergence`;
}

/** Sowing-year autumn key (`2026-autumn`). Feb–Aug dates are not an autumn season. */
export function autumnSeasonKeyFromSowingDate(iso: string): string | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (month >= 9) return `${year}-autumn`;
    if (month === 1) return `${year - 1}-autumn`;
    return null;
}

/**
 * A summary can be shown as a result. `pending: true` with no status is not
 * a result, and it is not a reason to keep polling this GET.
 */
export function emergencePollSettled(summary: EmergenceSummary): boolean {
    if (summary.status != null) return true;
    if (summary.timeseries.length > 0) return true;
    return summary.pending === false;
}

/**
 * Same progress sentence as an imagery pull, with the task name changed to 出苗.
 * Job counts and the failure note stay as the backfill status wrote them.
 */
export function emergenceTaskProgressTitle(imageryTitle: string): string {
    const adapted = imageryTitle
        .replaceAll("正在拉取遥感数据", "正在拉取出苗数据")
        .replaceAll("遥感回填已完成", "出苗数据拉取完成")
        .replaceAll("遥感回填", "出苗数据拉取")
        .replaceAll("正在写入遥感结果", "正在整理出苗数据")
        .replaceAll("正在整理影像", "正在整理出苗数据");
    if (adapted.includes("出苗")) return adapted;
    return `出苗 · ${adapted}`;
}

export function emergenceHasResult(summary: EmergenceSummary | null | undefined): boolean {
    if (!summary) return false;
    return summary.status != null || summary.timeseries.length > 0;
}

export const AUTUMN_EMERGENCE_EVENT = "agri-autumn-emergence";

export function notifyAutumnEmergenceUpdated(summary: EmergenceSummary | null) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(AUTUMN_EMERGENCE_EVENT, { detail: summary }));
}

function dateList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const item of value) {
        const d = dateStr(item);
        if (d && !out.includes(d)) out.push(d);
    }
    return out;
}

function pointFrom(raw: unknown): EmergenceTimeseriesPoint | null {
    const row = asRecord(raw);
    if (!row) return null;
    const date = dateStr(pick(row, "date", "scene_date", "obs_date"));
    if (!date) return null;
    return {
        date,
        in_baseline: bool(pick(row, "in_baseline")) === true,
        ndvi_median: num(pick(row, "median_ndvi", "ndvi_median", "ndvi_med")),
        ndvi_mean: num(pick(row, "ndvi_mean", "mean_ndvi")),
        ndvi_p05: num(pick(row, "ndvi_p05", "ndvi_p5", "p05", "p5")),
        ndvi_p25: num(pick(row, "ndvi_p25", "p25")),
        ndvi_p75: num(pick(row, "ndvi_p75", "p75")),
        ndvi_p95: num(pick(row, "ndvi_p95", "ndvi_p5_95", "p95")),
        increment_median: num(
            pick(row, "median_increment", "increment_median", "delta_median", "rise_median", "increment", "delta_ndvi"),
        ),
        increment_p05: num(pick(row, "increment_p05", "increment_p5", "delta_p05", "delta_p5")),
        increment_p25: num(pick(row, "increment_p25", "delta_p25")),
        increment_p75: num(pick(row, "increment_p75", "delta_p75")),
        increment_p95: num(pick(row, "increment_p95", "delta_p95")),
        n_clear: num(pick(row, "n_pixels", "n_clear", "n", "n_official_clear")),
        share_above_noise: num(pick(row, "share_above_noise", "share_above")),
        share_sustained: num(pick(row, "share_sustained")),
        status: parseEmergenceStatus(pick(row, "status", "status_zh"), bool(pick(row, "emerged_flag"))),
    };
}

function medianOf(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid] ?? null;
    const left = sorted[mid - 1];
    const right = sorted[mid];
    if (left == null || right == null) return null;
    return (left + right) / 2;
}

export function normalizeEmergenceSummary(payload: unknown, fallbackId = ""): EmergenceSummary {
    const root = asRecord(payload) ?? {};
    const baselineRaw = asRecord(pick(root, "baseline", "soil_baseline"));
    const fieldRaw = asRecord(pick(baselineRaw, "field", "ndvi_field", "ndvi"));
    const statsRaw = asRecord(pick(root, "summary", "stats", "summary_stats")) ?? {};
    const noiseRaw = asRecord(pick(root, "noise_floor_trial", "noise"));
    const emergedFlag = bool(pick(root, "emerged_flag", "emerged"));
    const seriesRaw = pick(root, "timeseries", "series", "points", "dates");
    const timeseries = (Array.isArray(seriesRaw) ? seriesRaw : [])
        .map(pointFrom)
        .filter((p): p is EmergenceTimeseriesPoint => p != null)
        .sort((a, b) => a.date.localeCompare(b.date));
    const baselineDates = dateList(
        pick(baselineRaw, "dates", "baseline_dates") ?? pick(root, "baseline_dates"),
    );
    const latest = timeseries.length ? timeseries[timeseries.length - 1] : null;
    const eligibleRaw = pick(root, "eligible");
    const baselineMedian =
        num(
            pick(fieldRaw, "median", "ndvi_median", "median_ndvi") ??
                pick(baselineRaw, "median", "ndvi_median", "median_ndvi") ??
                pick(statsRaw, "median_baseline_ndvi") ??
                pick(root, "baseline_median"),
        ) ?? medianOf(
            timeseries
                .filter((point) => point.in_baseline && point.ndvi_median != null)
                .map((point) => point.ndvi_median as number),
        );
    return {
        field_id: str(pick(root, "field_id", "land_id")) ?? fallbackId,
        status: parseEmergenceStatus(pick(root, "status", "emergence_status", "phase"), emergedFlag),
        emerged_flag: emergedFlag,
        frozen: bool(pick(root, "frozen", "is_frozen")) === true,
        pending: bool(pick(root, "pending")) === true,
        eligible: eligibleRaw == null ? true : bool(eligibleRaw) === true,
        season_key: str(pick(root, "season_key", "season")),
        baseline: {
            dates: baselineDates,
            statistic: str(pick(baselineRaw, "statistic", "method")),
            median: baselineMedian,
        },
        as_of_date:
            dateStr(pick(root, "as_of_date", "as_of", "latest_scene_date", "latest_date")) ??
            latest?.date ??
            null,
        first_emerged_date: dateStr(pick(root, "first_emerged_date", "first_emerged")),
        method_version: str(pick(root, "method_version", "method", "version")),
        summary: {
            n_clear: num(pick(statsRaw, "n_clear", "n_official_clear", "n") ?? pick(root, "n_official_clear")),
            ndvi_median: num(pick(statsRaw, "median_ndvi", "ndvi_median", "latest_ndvi_median")) ?? latest?.ndvi_median ?? null,
            increment_median:
                num(pick(statsRaw, "median_increment", "increment_median", "latest_increment_median")) ??
                latest?.increment_median ??
                null,
            increment_min: num(pick(statsRaw, "increment_min", "min_increment")),
            noise_floor: num(
                pick(statsRaw, "noise_floor", "trial_threshold_used") ??
                    pick(noiseRaw, "trial_threshold_used", "abs_p99") ??
                    pick(root, "noise_floor"),
            ),
        },
        timeseries,
    };
}

function classNumber(value: unknown): number | null {
    const n = num(value);
    if (n == null) return null;
    const rounded = Math.round(n);
    if (rounded < 0 || rounded > 2) return null;
    return rounded;
}

function pixelFrom(raw: unknown): EmergenceMapPixel | null {
    if (Array.isArray(raw)) {
        const lon = num(raw[0]);
        const lat = num(raw[1]);
        if (lon == null || lat == null) return null;
        return {
            lon,
            lat,
            increment: num(raw[2]),
            rise_class: classNumber(raw[3]),
        };
    }
    const row = asRecord(raw);
    if (!row) return null;
    if (row.type === "Feature") {
        const geom = asRecord(row.geometry);
        const coords = Array.isArray(geom?.coordinates) ? geom.coordinates : null;
        const props = asRecord(row.properties) ?? {};
        const lon = num(coords?.[0]);
        const lat = num(coords?.[1]);
        if (lon == null || lat == null) return null;
        return {
            lon,
            lat,
            increment: num(pick(props, "increment", "delta", "delta_ndvi", "rise", "ndvi_increment")),
            rise_class: classNumber(pick(props, "class", "pixel_class", "rise_class", "cls")),
        };
    }
    const lon = num(pick(row, "lon", "lng", "longitude"));
    const lat = num(pick(row, "lat", "latitude"));
    if (lon == null || lat == null) return null;
    return {
        lon,
        lat,
        increment: num(pick(row, "increment", "delta", "delta_ndvi", "rise", "ndvi_increment")),
        rise_class: classNumber(pick(row, "class", "pixel_class", "rise_class", "cls")),
    };
}

export function normalizeEmergenceMap(payload: unknown, fallbackId = "", requestedDate?: string): EmergenceMapLayer {
    const root = asRecord(payload);
    const featureCollection = root?.type === "FeatureCollection" ? root : null;
    const list = featureCollection
        ? featureCollection.features
        : pick(root, "pixels_lonlat", "pixels", "points", "samples", "features", "items") ??
          (Array.isArray(payload) ? payload : []);
    const pixels = (Array.isArray(list) ? list : [])
        .map(pixelFrom)
        .filter((p): p is EmergenceMapPixel => p != null)
        .filter((p) => p.increment != null || p.rise_class != null);
    const countsRaw = asRecord(pick(root, "class_counts", "counts"));
    let classCounts: Record<string, number> | null = null;
    if (countsRaw) {
        classCounts = {};
        for (const [key, value] of Object.entries(countsRaw)) {
            const n = num(value);
            if (n != null) classCounts[key] = n;
        }
    }
    return {
        field_id: str(pick(root, "field_id", "land_id")) ?? fallbackId,
        date: dateStr(pick(root, "date", "scene_date", "as_of_date")) ?? requestedDate ?? null,
        baseline_dates: dateList(pick(root, "baseline_dates", "baseline")),
        pixels,
        class_counts: classCounts,
        increment_median:
            num(pick(root, "median_increment", "increment_median")) ??
            medianOf(pixels.map((pixel) => pixel.increment).filter((value): value is number => value != null)),
        increment_min: num(pick(root, "increment_min", "min_increment")),
    };
}

export function baselineWindowLabel(dates: string[] | null | undefined): string | null {
    if (!dates?.length) return null;
    const sorted = [...dates].sort();
    if (sorted.length === 1) return sorted[0]!;
    return `${sorted[0]}–${sorted[sorted.length - 1]}`;
}

const INCREMENT_STOPS: [number, number, number][] = [
    [255, 255, 204],
    [217, 240, 163],
    [173, 221, 142],
    [120, 198, 121],
    [49, 163, 84],
    [0, 104, 55],
];

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function sampleStops(stops: [number, number, number][], t: number): [number, number, number] {
    const x = Math.max(0, Math.min(1, t));
    if (x <= 0) return stops[0]!;
    if (x >= 1) return stops[stops.length - 1]!;
    const pos = x * (stops.length - 1);
    const i = Math.floor(pos);
    const f = pos - i;
    const a = stops[i]!;
    const b = stops[Math.min(i + 1, stops.length - 1)]!;
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

/** YlGn-like ramp for relative increment. Pale at the low end, never the NDVI red scale. */
export const EMERGENCE_INCREMENT_GRADIENT =
    "linear-gradient(90deg, rgb(255,255,204), rgb(217,240,163), rgb(173,221,142), rgb(120,198,121), rgb(49,163,84), rgb(0,104,55))";

export function colorizeIncrement(value: number): [number, number, number, number] {
    const [lo, hi] = EMERGENCE_INCREMENT_RANGE;
    const t = hi === lo ? 0.5 : (value - lo) / (hi - lo);
    const [r, g, b] = sampleStops(INCREMENT_STOPS, t);
    return [Math.round(r), Math.round(g), Math.round(b), 230];
}

/**
 * Product classes from autumn-emergence pixels:
 * 0 within noise, 1 above noise but not sustained, 2 sustained.
 */
export const EMERGENCE_CLASS_STYLE: Record<
    number,
    { color: string; rgba: [number, number, number, number] }
> = {
    0: { color: "#d0d0d0", rgba: [208, 208, 208, 210] },
    1: { color: "#a1d99b", rgba: [161, 217, 155, 228] },
    2: { color: "#006d2c", rgba: [0, 109, 44, 236] },
};

export function colorizeRiseClass(riseClass: number): [number, number, number, number] | null {
    return EMERGENCE_CLASS_STYLE[riseClass]?.rgba ?? null;
}
