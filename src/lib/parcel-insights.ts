import { ApiError, getApiBase } from "@/lib/api";

export interface PhenologyWindow {
    start_date: string | null;
    end_date: string | null;
    observed_start?: string;
    observed_end?: string;
    peak_date: string | null;
    peak_ndvi?: number;
    confidence: "medium" | "low" | "user";
    status: string;
    start_interval?: string[] | null;
    end_interval?: string[] | null;
}
export interface Phenology {
    land_id?: string;
    start_date?: string;
    end_date?: string;
    status: "detected" | "insufficient_data" | "no_distinct_cycle";
    windows: PhenologyWindow[];
    observation_count: number;
    max_gap_days: number;
    threshold: number | null;
    note: string;
}
export interface InsightPoint { date: string; ndvi: number; evi: number | null; ndmi: number | null; source?: string; }
export interface InsightSummary {
    count: number; first_date: string | null; last_date: string | null;
    mean_ndvi: number | null; peak_ndvi: number | null; mean_ndmi: number | null;
    change: number | null; max_gap_days: number;
}
export interface InsightComparison {
    status: string; count: number; means: Record<string, number>; differences: Record<string, number>;
    comparable_crop?: boolean; note?: string;
}
export interface InsightEvent {
    land_id: string; date: string; action: string; note: string; control_land_id?: string | null; window_days: number;
}
export interface InsightsRequest {
    land_ids: string[]; start_date: string; end_date: string; mode: "historical" | "recent";
    reference_year: number | null; brand_name: string; title: string;
    seasons: Record<string, { start_date: string; end_date: string; crop: string }>;
    events: InsightEvent[];
}
export interface InsightLand {
    land_id: string; land_name: string; crop: string | null; area_mu: number | null; group_name?: string | null;
    boundary: GeoJSON.Geometry | null; series: InsightPoint[]; summary: InsightSummary;
    phenology: Phenology; effective_windows: PhenologyWindow[]; season_source: "manual" | "observed";
    progress: "unknown" | "growth_signal" | "harvest_signal" | "needs_check";
    harvests: Array<{ status: string; harvest_date: string | null; confidence: string }>;
    history: { start_date: string; end_date: string; series: InsightPoint[]; summary: InsightSummary; comparison: InsightComparison; note: string } | null;
    spatial: { date: string; valid_pixels: number; total_pixels: number; low_green_pct: number; ndvi_stddev: number; pixels: number[][]; display_sampled: boolean; note: string } | null;
    notes: string[]; rainfall: { mm: number | null; observed_days: number; period_days: number };
}
export interface InsightsSnapshot {
    snapshot_id: string | null; created_at: string; request: InsightsRequest; items: InsightLand[];
    comparison: InsightComparison; data_note: string; progress_counts: Record<string, number>;
    events: Array<InsightEvent & { before: InsightSummary; after: InsightSummary; change: number | null; relative_change: number | null; note_on_method: string; control: { land_id: string; matched_before: number; matched_after: number } | null }>;
}
export interface InsightsHistory { items: Array<{ id: string; created_at: string; request: InsightsRequest }>; total: number; limit: number; offset: number; }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${getApiBase()}${path}`, options);
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail = typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? body.detail.map((item: { msg: string }) => item.msg).join("; ") : response.statusText;
        throw new ApiError(response.status, detail);
    }
    return response.json();
}

export const parcelInsightsApi = {
    phenology: (landId: string, start?: string, end?: string, signal?: AbortSignal) => {
        const query = new URLSearchParams();
        if (start) query.set("start_date", start);
        if (end) query.set("end_date", end);
        return request<Phenology>(`/lands/${encodeURIComponent(landId)}/phenology?${query}`, { signal });
    },
    analyze: (body: InsightsRequest) => request<InsightsSnapshot>("/parcel-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    history: (offset = 0) => request<InsightsHistory>(`/parcel-insights?limit=10&offset=${offset}`),
    get: (id: string) => request<InsightsSnapshot>(`/parcel-insights/${encodeURIComponent(id)}`),
    download: async (id: string) => {
        const response = await fetch(`${getApiBase()}/parcel-insights/${encodeURIComponent(id)}/report.pdf`);
        if (!response.ok) throw new ApiError(response.status, response.statusText);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `parcel-insights-${id}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // 浏览器开始消费下载后再释放 URL，避免静态站点上的大文件下载被提前取消。
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
};

/** 展开真实日期窗的月份，跨年冬作不再被压成 1 至 12 月的连续季节。 */
export function monthsInWindows(windows: Array<{ start_date: string; end_date: string }>): number[] {
    const months = new Set<number>();
    for (const window of windows) {
        const start = new Date(`${window.start_date}T00:00:00Z`);
        const end = new Date(`${window.end_date}T00:00:00Z`);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) continue;
        const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
        for (let i = 0; i < 36 && day <= end; i += 1) {
            months.add(day.getUTCMonth() + 1);
            day.setUTCMonth(day.getUTCMonth() + 1);
        }
    }
    return [...months].sort((a, b) => a - b);
}
