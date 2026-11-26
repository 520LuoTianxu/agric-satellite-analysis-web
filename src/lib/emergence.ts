/**
 * Emergence (出苗) — field median vs soil baseline, and per-pixel rise.
 *
 * Companion API (agric-satellite-analysis-api). These routes are the
 * contract this client calls. Adapt the paths in `agriApi` if that PR
 * names them slightly differently; do not read emergence out of S2 scene
 * NDVI JSON or NDVI min/max/avg.
 *
 *   GET /agri/lands/{land_id}/emergence
 *   GET /agri/lands/{land_id}/emergence/map?date=YYYY-MM-DD
 *
 * Summary: status, emerged_flag, frozen, baseline, as_of_date,
 * first_emerged_date, method_version, summary stats, timeseries
 * (date, ndvi_median, increment_median, …).
 *
 * Map: per-pixel increment and class on lon/lat, a new resource.
 *
 * `EMERGENCE_NDVI_REFERENCE` (0.30) is a chart tick only. It is not a
 * status rule and not a color break.
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
}

export interface EmergenceSummaryStats {
    n_clear: number | null;
    ndvi_median: number | null;
    increment_median: number | null;
    increment_min: number | null;
    /** Trial display noise (for example P99). Not an emergence threshold. */
    noise_floor: number | null;
}

export interface EmergenceSummary {
    field_id: string;
    status: EmergenceStatus;
    emerged_flag: boolean | null;
    frozen: boolean;
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
    /** 0–4 display class from the API. Absent when the resource did not send one. */
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

export function parseEmergenceStatus(value: unknown, emergedFlag: boolean | null): EmergenceStatus {
    const key = str(value)?.toLowerCase().replace(/[\s-]+/g, "_");
    if (key && STATUS_ALIASES[key]) return STATUS_ALIASES[key];
    const raw = str(value);
    if (raw && STATUS_ALIASES[raw]) return STATUS_ALIASES[raw];
    if (emergedFlag === true) return "emerged";
    if (emergedFlag === false) return "not_emerged";
    return "uncertain";
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
        ndvi_median: num(pick(row, "ndvi_median", "median_ndvi", "ndvi_med")),
        ndvi_mean: num(pick(row, "ndvi_mean", "mean_ndvi")),
        ndvi_p05: num(pick(row, "ndvi_p05", "ndvi_p5", "p05", "p5")),
        ndvi_p25: num(pick(row, "ndvi_p25", "p25")),
        ndvi_p75: num(pick(row, "ndvi_p75", "p75")),
        ndvi_p95: num(pick(row, "ndvi_p95", "ndvi_p5_95", "p95")),
        increment_median: num(
            pick(row, "increment_median", "delta_median", "rise_median", "increment", "delta_ndvi"),
        ),
        increment_p05: num(pick(row, "increment_p05", "increment_p5", "delta_p05", "delta_p5")),
        increment_p25: num(pick(row, "increment_p25", "delta_p25")),
        increment_p75: num(pick(row, "increment_p75", "delta_p75")),
        increment_p95: num(pick(row, "increment_p95", "delta_p95")),
        n_clear: num(pick(row, "n_clear", "n", "n_official_clear")),
    };
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
    return {
        field_id: str(pick(root, "field_id", "land_id")) ?? fallbackId,
        status: parseEmergenceStatus(pick(root, "status", "emergence_status", "phase"), emergedFlag),
        emerged_flag: emergedFlag,
        frozen: bool(pick(root, "frozen", "is_frozen")) === true,
        baseline: {
            dates: baselineDates,
            statistic: str(pick(baselineRaw, "statistic", "method")),
            median: num(
                pick(fieldRaw, "median", "ndvi_median") ??
                    pick(baselineRaw, "median", "ndvi_median") ??
                    pick(root, "baseline_median"),
            ),
        },
        as_of_date:
            dateStr(pick(root, "as_of_date", "as_of", "latest_scene_date", "latest_date")) ??
            latest?.date ??
            null,
        first_emerged_date: dateStr(pick(root, "first_emerged_date", "first_emerged")),
        method_version: str(pick(root, "method_version", "method", "version")),
        summary: {
            n_clear: num(pick(statsRaw, "n_clear", "n_official_clear", "n") ?? pick(root, "n_official_clear")),
            ndvi_median: num(pick(statsRaw, "ndvi_median", "latest_ndvi_median")) ?? latest?.ndvi_median ?? null,
            increment_median:
                num(pick(statsRaw, "increment_median", "latest_increment_median")) ??
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
    if (rounded < 0 || rounded > 4) return null;
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
            rise_class: classNumber(pick(props, "class", "rise_class", "cls")),
        };
    }
    const lon = num(pick(row, "lon", "lng", "longitude"));
    const lat = num(pick(row, "lat", "latitude"));
    if (lon == null || lat == null) return null;
    return {
        lon,
        lat,
        increment: num(pick(row, "increment", "delta", "delta_ndvi", "rise", "ndvi_increment")),
        rise_class: classNumber(pick(row, "class", "rise_class", "cls")),
    };
}

export function normalizeEmergenceMap(payload: unknown, fallbackId = "", requestedDate?: string): EmergenceMapLayer {
    const root = asRecord(payload);
    const featureCollection = root?.type === "FeatureCollection" ? root : null;
    const list = featureCollection
        ? featureCollection.features
        : pick(root, "pixels", "points", "samples", "features", "items") ??
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
        increment_median: num(pick(root, "increment_median", "median_increment")),
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

/** Display classes 0–4. Colors follow the reviewed rise-class plate, not NDVI. */
export const EMERGENCE_CLASS_STYLE: Record<
    number,
    { color: string; rgba: [number, number, number, number] }
> = {
    0: { color: "#d0d0d0", rgba: [208, 208, 208, 210] },
    1: { color: "#edf8e9", rgba: [237, 248, 233, 220] },
    2: { color: "#a1d99b", rgba: [161, 217, 155, 228] },
    3: { color: "#41ab5d", rgba: [65, 171, 93, 232] },
    4: { color: "#006d2c", rgba: [0, 109, 44, 236] },
};

export function colorizeRiseClass(riseClass: number): [number, number, number, number] | null {
    return EMERGENCE_CLASS_STYLE[riseClass]?.rgba ?? null;
}
