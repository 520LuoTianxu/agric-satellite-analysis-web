"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
    ApiError,
    agriApi,
    cropsApi,
    landsApi,
    type AgriLandScenesSummary,
    type AgriSceneProduct,
    type BackfillStatusResponse,
    type CropOption,
    type LandStat,
    type GrowingSeasonWindow,
    type HarvestDetectResult,
    type IndexType,
} from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
import { monthsInWindows, type Phenology } from "@/lib/parcel-insights";
import PhenologyPicker from "./phenology-picker";
import {
    rasterizeAgriPixels,
    rasterizeAgriLonLatPixels,
    sensorForIndex,
    AGRI_PRIMARY_MODES,
    DROUGHT_CLOUD_MAX_PCT,
    isDroughtDayClass,
    isDecloudProduct,
    isOfficialOpticalScene,
    type AgriDroughtClass,
    type AgriFloodClass,
    type AgriHeatIndex,
    type AgriHeatmapImage,
} from "@/lib/agri-heatmap";
import {
    classifyDroughtSeries,
    classifyFloodSeriesByDate,
    isFloodDayClass,
    isGoodDecloudQuality,
    isFloodWatchClass,
    isSpringFloodMonth,
    opticalTooltipFields,
    pickOfficialOptical,
    pickOpticalForNdvi,
    s1CalibrationEpochForScene,
    s1PlatformForScene,
    sceneCloudDisplay,
    sceneCloudPct,
} from "@/lib/agri-classify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Eye, EyeOff, RefreshCw, History, MoreHorizontal, Check, Plus, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { reverseDescScenesPage } from "@/lib/agri-scenes-page";
import { IndexExplainer } from "@/components/field/index-explainer";
import { toast } from "sonner";
import { formatLandAreaMu, isOversizedLand, resolveLandAreaMu } from "@/lib/land-schedule-filter";
import type { DayGradeShare } from "@/components/charts/ndvi-grade-shares-chart";
import { computePixelNdviGradeShares } from "@/components/charts/ndvi-grade-shares-chart";
import { filterRealisticNdviStats } from "@/lib/ndvi-realistic-filter";

const NdviChart = dynamic(() => import("@/components/charts/ndvi-chart"), {
    ssr: false,
    loading: () => <Skeleton className="h-[200px] w-full rounded-md" />,
});

const NdviGradeSharesChart = dynamic(
    () => import("@/components/charts/ndvi-grade-shares-chart"),
    {
        ssr: false,
        loading: () => <Skeleton className="h-[220px] w-full rounded-md" />,
    },
);

type SeriesKey = AgriHeatIndex;
type SceneHistoryCursor = { date: string; sceneId: string };
type HeatmapMeta = {
    landId: string;
    sceneId: string;
    pixels: number;
    date: string;
    index: string;
    sensor: AgriSceneProduct["sensor"];
    mean: number | null;
    source: AgriSceneProduct["pixels_source"];
    stacItemId: string | null;
    algorithmVersion: string | null;
    gridSpacingM: { x: number; y: number } | null;
    radiometricCalibration: AgriSceneProduct["radiometric_calibration"];
    platform: string | null;
    processingVersion: string | null;
    calibrationEpoch: string | null;
};

type SceneProvenanceMeta = Pick<
    HeatmapMeta,
    | "sensor"
    | "source"
    | "stacItemId"
    | "algorithmVersion"
    | "gridSpacingM"
    | "radiometricCalibration"
    | "platform"
    | "processingVersion"
    | "calibrationEpoch"
>;

function sceneProvenanceMeta(scene: AgriSceneProduct): SceneProvenanceMeta {
    const cellSize = scene.analysis_grid?.cell_size_m;
    const cellSizeX = cellSize?.x;
    const cellSizeY = cellSize?.y;
    return {
        sensor: scene.sensor,
        source: scene.pixels_source ?? null,
        stacItemId: scene.stac_item_id ?? null,
        algorithmVersion: scene.algorithm_version ?? null,
        gridSpacingM:
            typeof cellSizeX === "number" &&
            Number.isFinite(cellSizeX) &&
            typeof cellSizeY === "number" &&
            Number.isFinite(cellSizeY)
                ? { x: cellSizeX, y: cellSizeY }
                : null,
        radiometricCalibration: scene.radiometric_calibration ?? null,
        platform: scene.sensor === "S1" ? s1PlatformForScene(scene) : null,
        processingVersion:
            scene.radiometric_calibration?.processing_version ?? null,
        calibrationEpoch:
            scene.sensor === "S1" ? s1CalibrationEpochForScene(scene) : null,
    };
}

const SERIES_META: Record<
    SeriesKey,
    {
        sensor: "S1" | "S2";
        avgKey: keyof AgriSceneProduct | null;
        /** Chart / date list derived from this sensor avg column */
        chartKey: keyof AgriSceneProduct | null;
    }
> = {
    ndvi: {
        sensor: "S2",
        avgKey: "ndvi_avg",
        chartKey: "ndvi_avg",
    },
    evi: {
        sensor: "S2",
        avgKey: "evi_avg",
        chartKey: "evi_avg",
    },
    ndmi: {
        sensor: "S2",
        avgKey: "ndmi_avg",
        chartKey: "ndmi_avg",
    },
    ndre: {
        sensor: "S2",
        avgKey: "ndre_avg",
        chartKey: "ndre_avg",
    },
    mndwi: {
        sensor: "S2",
        avgKey: "mndwi_avg",
        chartKey: "mndwi_avg",
    },
    cire: {
        sensor: "S2",
        avgKey: "cire_avg",
        chartKey: "cire_avg",
    },
    vv: {
        sensor: "S1",
        avgKey: "vv_avg",
        chartKey: "vv_avg",
    },
    vh: {
        sensor: "S1",
        avgKey: "vh_avg",
        chartKey: "vh_avg",
    },
    drought: {
        sensor: "S2",
        avgKey: null,
        chartKey: "ndvi_avg",
    },
    flood: {
        sensor: "S1",
        avgKey: null,
        chartKey: "vv_avg",
    },
};

/** Preferred button order: primary modes first, then other indices. */
const BUTTON_ORDER: SeriesKey[] = [
    ...AGRI_PRIMARY_MODES,
    // EVI 保留计算和查看能力，但通过“更多指数”入口访问。
    "evi",
    "ndmi",
    "ndre",
    "mndwi",
    "cire",
    "vv",
    "vh",
];

function scenesToStats(scenes: AgriSceneProduct[], key: SeriesKey, landId: string): LandStat[] {
    const meta = SERIES_META[key];
    const avgKey = meta.chartKey;
    if (!avgKey) return [];
    const byDate = new Map<string, AgriSceneProduct[]>();
    for (const s of scenes) {
        if (s.sensor !== meta.sensor) continue;
        if (key === "drought" && isDecloudProduct(s) && !isGoodDecloudQuality(s.decloud_quality)) continue;
        const arr = byDate.get(s.date) ?? [];
        arr.push(s);
        byDate.set(s.date, arr);
    }
    const out: LandStat[] = [];
    const dates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
    dates.forEach((date, i) => {
        const group = byDate.get(date) ?? [];
        const picked =
            meta.sensor === "S2"
                ? key === "drought"
                    ? pickOfficialOptical(group, { neighbors: scenes })
                    : pickOpticalForNdvi(group, { neighbors: scenes })
                : group[0];
        if (!picked) return;
        if (key === "drought" && !isOfficialOpticalScene(picked)) return;
        const v = picked[avgKey];
        if (typeof v !== "number" || Number.isNaN(v)) return;
        const tip = opticalTooltipFields(picked);
        // Only S1 products currently carry per-polarization pixel coverage; S2 exposes cloud coverage separately.
        const qualityMetricKey = avgKey === "vv_avg" ? "VV" : avgKey === "vh_avg" ? "VH" : null;
        const qualityMetric = qualityMetricKey
            ? picked.quality_metrics?.[qualityMetricKey]
            : null;
        const validFraction = qualityMetric?.valid_fraction;
        const parcelCoverageScore =
            qualityMetric?.method === "parcel_mask_valid_fraction_v1" &&
            typeof validFraction === "number" &&
            Number.isFinite(validFraction) &&
            validFraction >= 0 &&
            validFraction <= 1
                ? validFraction
                : null;
        out.push({
            id: `agri-${key}-${date}-${i}`,
            land_id: landId,
            date,
            mean: v,
            median: v,
            min: v,
            max: v,
            p10: v,
            p90: v,
            stddev: null,
            quality_score: parcelCoverageScore,
            quality_score_method: qualityMetricKey
                ? qualityMetric?.method ?? "unknown"
                : null,
            created_at: "",
            cloud_cover: tip.cloudCover,
            decloud_quality: tip.decloudQuality,
            decloud_reasons: tip.decloudReasons,
            product_source: tip.productSource,
            scene_id: tip.sceneId,
            may_be_unreliable: tip.mayBeUnreliable,
        });
    });
    return out;
}

function formatCloudCoverLabel(
    pct: number | null | undefined,
    source: "parcel" | "stac" | null | undefined,
    t: (key: string, values?: Record<string, string | number>) => string,
): string {
    if (pct == null || !Number.isFinite(pct)) return "";
    const rounded = Math.round(pct);
    if (source === "parcel") return t("parcelCloudCover", { percent: rounded });
    if (source === "stac") return t("sceneCloudCover", { percent: rounded });
    return t("cloudCover", { percent: rounded });
}

function decloudQualityChip(
    quality: string | null | undefined,
    t: (key: string) => string,
): string {
    if (quality === "good") return ` · ${t("decloudChip_good")}`;
    if (quality === "fair") return ` · ${t("decloudChip_fair")}`;
    if (quality === "bad") return ` · ${t("decloudChip_bad")}`;
    return "";
}

function collectDecloudAltStats(
    scenes: AgriSceneProduct[],
    key: SeriesKey,
    mainStats: LandStat[],
    landId: string,
): LandStat[] {
    const meta = SERIES_META[key];
    if (key === "drought" || meta.sensor !== "S2") return [];
    const avgKey = meta.chartKey;
    if (!avgKey) return [];
    const pickedIds = new Set(mainStats.map((s) => s.scene_id).filter(Boolean));
    const out: LandStat[] = [];
    for (const s of scenes) {
        if (s.sensor !== "S2" || !isDecloudProduct(s)) continue;
        if (s.scene_id && pickedIds.has(s.scene_id)) continue;
        let v = s[avgKey];
        // Fair/bad reconstructions sometimes persisted with null ndvi_avg while
        // pixels are all 0 — still show the pink alt marker so "去云无" is not the
        // only story for that date.
        if (typeof v !== "number" || Number.isNaN(v)) v = 0;
        const tip = opticalTooltipFields(s);
        out.push({
            id: `agri-${key}-decloud-alt-${s.date}-${s.scene_id ?? out.length}`,
            land_id: landId,
            date: s.date,
            mean: v,
            median: v,
            min: v,
            max: v,
            p10: v,
            p90: v,
            stddev: null,
            quality_score: null,
            created_at: "",
            cloud_cover: tip.cloudCover,
            decloud_quality: tip.decloudQuality,
            decloud_reasons: tip.decloudReasons,
            product_source: tip.productSource,
            scene_id: tip.sceneId,
            decloud_alt: true,
            may_be_unreliable: tip.mayBeUnreliable,
        });
    }
    return out;
}


/** Avg field used to score a scene for default-date picking. */
function sceneSeriesAvg(scene: AgriSceneProduct, key: SeriesKey): number | null {
    const avgKey = SERIES_META[key].avgKey ?? SERIES_META[key].chartKey;
    if (!avgKey) return null;
    const v = scene[avgKey];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const RECENT_DATE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const RECENT_DATE_CHIP_CAP = 14;
const PRIMARY_SERIES_KEYS: SeriesKey[] = ["ndvi", "drought", "flood"];

function compareAgriScenesChronologically(a: AgriSceneProduct, b: AgriSceneProduct): number {
    return a.date.localeCompare(b.date)
        || a.sensor.localeCompare(b.sensor)
        || a.scene_id.localeCompare(b.scene_id);
}

function seriesIsAvailable(key: SeriesKey, scenes: AgriSceneProduct[]): boolean {
    const meta = SERIES_META[key];
    const hasSensor = scenes.some((s) => s.sensor === meta.sensor);
    if (!hasSensor) return false;
    if (key === "drought" || key === "flood") return true;
    if (
        meta.avgKey &&
        !scenes.some(
            (s) => s.sensor === meta.sensor && typeof s[meta.avgKey!] === "number",
        )
    ) {
        return false;
    }
    return true;
}

/** Optical veg indices where avg > 0.1 is a useful clear-sky signal. */
const VEG_AVG_KEYS = new Set<SeriesKey>(["ndvi", "evi", "ndmi", "ndre", "cire", "drought"]);

/**
 * Prefer latest scene with usable vegetation / low cloud — not raw latest
 * (which is often fully cloudy → solid red NDVI film).
 */
function pickBestDefaultDate(scenes: AgriSceneProduct[], key: SeriesKey): string | null {
    const sensor = sensorForIndex(key);
    const list = scenes.filter((s) => s.sensor === sensor);
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));

    // S1 / flood: cloud/NDVI heuristics do not apply — raw latest.
    if (sensor === "S1") {
        return sorted[sorted.length - 1]!.date;
    }

    // 1) Latest with official optical (clear raw or good decloud) AND (for veg) avg > 0.1
    for (let i = sorted.length - 1; i >= 0; i--) {
        const s = sorted[i]!;
        if (!isOfficialOpticalScene(s)) continue;
        const avg = sceneSeriesAvg(s, key);
        if (avg == null) continue;
        if (VEG_AVG_KEYS.has(key) && !(avg > 0.1)) continue;
        return s.date;
    }

    // 2) Fallback: date with max series avg (prefer strongest veg signal)
    const scoreKey = SERIES_META[key].chartKey ?? ("ndvi_avg" as const);
    let bestDate: string | null = null;
    let bestAvg = -Infinity;
    for (const s of sorted) {
        const v = s[scoreKey];
        if (typeof v === "number" && Number.isFinite(v) && v > bestAvg) {
            bestAvg = v;
            bestDate = s.date;
        }
    }
    if (bestDate) return bestDate;

    // 3) Last resort: raw latest
    return sorted[sorted.length - 1]!.date;
}

function sceneLooksCloudyOrLowVeg(scene: AgriSceneProduct | undefined, key: SeriesKey): boolean {
    if (!scene || sensorForIndex(key) !== "S2") return false;
    const pct = sceneCloudPct(scene);
    const cloudy = pct != null && pct > DROUGHT_CLOUD_MAX_PCT;
    const avg = sceneSeriesAvg(scene, key);
    const lowVeg = avg != null && avg <= 0.1;
    return cloudy || lowVeg;
}

const UNCROPPED_NDVI = 0.25;

/** Default maize-like stage bands (month ranges) — overridden by crop season when available */

export interface AgriTimeseriesPanelProps {
    landId: string;
    /** Bound crop key / label for season calendar */
    cropType?: string | null;
    /** Field area in hectares — donut center shows 亩 (×15) */
    areaHa?: number | null;
    /** Exact land area from the backend, used to protect oversized scheduled pulls. */
    landAreaMu?: number | null;
    /** When true, parent already has monitoring layers */
    hasMonitoringData?: boolean;
    /** Push 色斑图 overlay to the field map */
    onHeatmapChange?: (heatmap: AgriHeatmapImage | null) => void;
    /** Controlled heat mode (from map-bottom chips) */
    mode?: AgriHeatIndex;
    onModeChange?: (mode: AgriHeatIndex) => void;
    /** Parent 指数 tab active — clear overlay when false, reload when true */
    enabled?: boolean;
}

const MAX_RS_HISTORY_YEARS = 5;

function dateYearsAgo(years: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().slice(0, 10);
}

function defaultRsDateFrom(): string {
    return dateYearsAgo(2);
}

function earliestRsDateFrom(): string {
    return dateYearsAgo(MAX_RS_HISTORY_YEARS);
}

function clampRsDateFrom(value: string): string {
    const minimum = earliestRsDateFrom();
    return value && value < minimum ? minimum : value;
}

const MAX_SEASON_WINDOWS = 3;

type SeasonWindowDraft = {
    id: string;
    start_date: string;
    end_date: string;
    crops: string[];
    label: string;
};

function newWindowId(): string {
    return `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function yearFromIso(iso: string): number {
    const y = Number(String(iso || "").slice(0, 4));
    return Number.isFinite(y) && y > 1970 ? y : new Date().getFullYear();
}

function distinctCropsInWindows(windows: SeasonWindowDraft[]): string[] {
    const out: string[] = [];
    for (const w of windows) {
        for (const c of w.crops) {
            if (!out.includes(c)) out.push(c);
        }
    }
    return out;
}

export default function AgriTimeseriesPanel({
    landId,
    cropType,
    areaHa = null,
    landAreaMu = null,
    hasMonitoringData = false,
    onHeatmapChange,
    mode: modeProp,
    onModeChange,
    enabled = true,
}: AgriTimeseriesPanelProps) {
    const t = useTranslations("agriPanel");
    const locale = useLocale();
    const gridSpacingFormatter = useMemo(
        () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
        [locale],
    );
    const [backfilling, setBackfilling] = useState(false);
    const [backfillActive, setBackfillActive] = useState(false);
    const [refreshDateOpen, setRefreshDateOpen] = useState(false);
    const [refreshDateFrom, setRefreshDateFrom] = useState(defaultRsDateFrom);
    const [cropCatalog, setCropCatalog] = useState<CropOption[]>([]);
    /** Growing-season windows for this pull (rotation = multi; intercrop = crops length 2). */
    const [seasonWindows, setSeasonWindows] = useState<SeasonWindowDraft[]>([]);
    const [inferredPhenology, setInferredPhenology] = useState<Phenology | null>(null);
    // 分析窗口来自有效影像或用户选择；未识别出窗口时不回退到夏玉米日历。
    // 日期窗比月份集合更严格，避免把同月的休耕期或其他年份误判为本茬旱情。
    const isWithinSeason = useCallback((day: string) => seasonWindows.some(window =>
        window.start_date && window.end_date && window.start_date <= day && day <= window.end_date
    ), [seasonWindows]);
    const seasonMonths = useMemo(() => monthsInWindows(seasonWindows), [seasonWindows]);
    const peakMonths = useMemo(() => Array.from(new Set((inferredPhenology?.windows ?? []).map(window => Number(window.peak_date?.slice(5, 7))).filter(Boolean))), [inferredPhenology]);
    const [harvestResult, setHarvestResult] = useState<HarvestDetectResult | null>(null);
    const [harvestLoading, setHarvestLoading] = useState(false);
    const [harvestError, setHarvestError] = useState(false);
    const [backfillProgress, setBackfillProgress] = useState<BackfillStatusResponse | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const backfillPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [summary, setSummary] = useState<AgriLandScenesSummary | null>(null);
    const [scenes, setScenes] = useState<AgriSceneProduct[]>([]);
    const [sceneCursors, setSceneCursors] = useState<Record<"S1" | "S2", SceneHistoryCursor | null>>({ S1: null, S2: null });
    const [loadingEarlierSensor, setLoadingEarlierSensor] = useState<"S1" | "S2" | null>(null);
    const [loadEarlierError, setLoadEarlierError] = useState(false);
    const [cropOption, setCropOption] = useState<CropOption | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [seriesInternal, setSeriesInternal] = useState<SeriesKey>("ndvi");
    const earlierScenesRequestRef = useRef<AbortController | null>(null);
    const series = modeProp ?? seriesInternal;
    const setSeries = useCallback(
        (next: SeriesKey) => {
            setSeriesInternal(next);
            onModeChange?.(next);
        },
        [onModeChange],
    );
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [heatmapVisible, setHeatmapVisible] = useState(true);
    const [heatmapLoading, setHeatmapLoading] = useState(false);
    const [heatmapError, setHeatmapError] = useState<"failed" | "tooLarge" | null>(null);
    const [heatmapMeta, setHeatmapMeta] = useState<HeatmapMeta | null>(null);
    /** Per-date pixel NDVI grade shares (图一 bands) — from dedicated API (+ heatmap fill). */
    const [dayGradeByDate, setDayGradeByDate] = useState<Record<string, DayGradeShare>>({});
    const dayGradeByDateRef = useRef(dayGradeByDate);
    dayGradeByDateRef.current = dayGradeByDate;
    /** Shared with NdviChart + stacked grade shares — hide cloudy/unrealistic dates. */
    const [onlyRealistic, setOnlyRealistic] = useState(true);
    const gradeSharesFetchKeyRef = useRef<string | null>(null);
    const initialGradeSharesRangeRef = useRef<{ from: string; to: string } | null>(null);
    const gradeSharesLoadedRangesRef = useRef(new Set<string>());
    const gradeSharesRequestsRef = useRef(new Map<string, Promise<boolean>>());
    /** Request generation rejects stale results; the request ref de-duplicates and aborts pixel downloads. */
    const heatmapLoadGenRef = useRef(0);
    const heatmapRequestRef = useRef<{ key: string; controller: AbortController } | null>(null);
    /** Prefetched film — kept even when enabled=false (map cleared, cache retained). */
    const cachedHeatmapRef = useRef<{
        /** 地块是缓存身份的一部分，避免切换到同日地块时复用上一个地块的色膜。 */
        landId: string;
        date: string;
        index: SeriesKey;
        img: AgriHeatmapImage | null;
        meta: HeatmapMeta | null;
    } | null>(null);
    const loadHeatmapRef = useRef<(date: string, index: SeriesKey) => Promise<void>>(async () => {});
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;
    const heatmapVisibleRef = useRef(heatmapVisible);
    heatmapVisibleRef.current = heatmapVisible;

    useEffect(() => () => {
        // 离开地块页面后取消可能仍在传输的大体量像元响应，并阻止卸载后的旧结果生效。
        heatmapLoadGenRef.current += 1;
        heatmapRequestRef.current?.controller.abort();
        heatmapRequestRef.current = null;
        earlierScenesRequestRef.current?.abort();
        earlierScenesRequestRef.current = null;
    }, []);

    useEffect(() => {
        if (modeProp && modeProp !== seriesInternal) {
            setSeriesInternal(modeProp);
        }
    }, [modeProp, seriesInternal]);

    useEffect(() => {
        let cancelled = false;
        cropsApi
            .list()
            .then((list) => {
                if (cancelled) return;
                setCropCatalog(list);
                const key = (cropType || "").toLowerCase();
                const hit =
                    list.find((c) => c.key === key) ||
                    list.find((c) => c.name_zh === cropType) ||
                    null;
                setCropOption(hit);
            })
            .catch(() => {
                if (!cancelled) {
                    setCropOption(null);
                    setCropCatalog([]);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [cropType]);

    useEffect(() => { setSeasonWindows([]); setInferredPhenology(null); }, [landId]);

    useEffect(() => {
        if (!landId) return;
        earlierScenesRequestRef.current?.abort();
        earlierScenesRequestRef.current = null;
        setLoadingEarlierSensor(null);
        setLoadEarlierError(false);
        setSceneCursors({ S1: null, S2: null });
        initialGradeSharesRangeRef.current = null;
        gradeSharesLoadedRangesRef.current.clear();
        gradeSharesRequestsRef.current.clear();
        let cancelled = false;
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        setDayGradeByDate({});
        gradeSharesFetchKeyRef.current = null;
        (async () => {
            try {
                // Newest page first: order=desc&limit=500, then reverse to ascending for charts.
                // Avoids offset=0 (oldest page) dropping 2026 when total > 500.
                const SCENE_PAGE_LIMIT = 500;
                const [sum, s2Desc, s1Desc] = await Promise.all([
                    agriApi.scenesSummary(landId, { signal: controller.signal }),
                    agriApi.scenes(landId, {
                        sensor: "S2",
                        limit: SCENE_PAGE_LIMIT,
                        order: "desc",
                        signal: controller.signal,
                    }),
                    agriApi.scenes(landId, {
                        sensor: "S1",
                        limit: SCENE_PAGE_LIMIT,
                        order: "desc",
                        signal: controller.signal,
                    }),
                ]);
                if (cancelled) return;
                setSummary(sum);
                const s2Items = reverseDescScenesPage(s2Desc.items);
                const s1Items = reverseDescScenesPage(s1Desc.items);
                const initialGradeDates = s2Items
                    .filter((scene) => typeof scene.ndvi_avg === "number")
                    .map((scene) => scene.date)
                    .sort();
                initialGradeSharesRangeRef.current = initialGradeDates.length ? {
                    from: initialGradeDates[0]!,
                    to: initialGradeDates[initialGradeDates.length - 1]!,
                } : null;
                const all = [...s2Items, ...s1Items].sort(compareAgriScenesChronologically);
                setSceneCursors({
                    S2: s2Desc.items.length ? {
                        date: s2Desc.items[s2Desc.items.length - 1]!.date,
                        sceneId: s2Desc.items[s2Desc.items.length - 1]!.scene_id,
                    } : null,
                    S1: s1Desc.items.length ? {
                        date: s1Desc.items[s1Desc.items.length - 1]!.date,
                        sceneId: s1Desc.items[s1Desc.items.length - 1]!.scene_id,
                    } : null,
                });
                setScenes(all);
                const hasS2 = sum.sensors.some((s) => s.sensor === "S2" && s.count > 0);
                const nextSeries: SeriesKey = modeProp ?? (hasS2 ? "ndvi" : "vv");
                setSeriesInternal(nextSeries);
                onModeChange?.(nextSeries);
                const bestDate = pickBestDefaultDate(all, nextSeries);
                if (bestDate) setSelectedDate(bestDate);
                // 像元色斑预取与场景列表分开加载，避免大像元响应阻塞时间轴首屏。
                // 即使指数 tab 未激活也预取；地图叠加仍由 enabled 控制是否发布。
                if (!cancelled && bestDate) {
                    void loadHeatmapRef.current(bestDate, nextSeries);
                }
            } catch (e: any) {
                if (!cancelled) setError(t("loadFailed"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
            earlierScenesRequestRef.current?.abort();
            earlierScenesRequestRef.current = null;
            // Do NOT clear heatmap here — React Strict Mode remount races with loadHeatmap
            // and can wipe a just-loaded overlay. Clear only when enabled flips false or unmount via land change handled by next effect.
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [landId, reloadKey]);

    const stopBackfillPoll = useCallback(() => {
        if (backfillPollRef.current) {
            clearInterval(backfillPollRef.current);
            backfillPollRef.current = null;
        }
    }, []);

    const applyBackfillStatus = useCallback(
        (res: BackfillStatusResponse, opts?: { wasActive?: boolean }) => {
            setBackfillProgress(res);
            setBackfillActive(res.has_active_backfill);
            if (res.has_active_backfill) return true;
            if (opts?.wasActive) {
                setReloadKey((k) => k + 1);
                toast.success(t("refreshComplete"));
            }
            return false;
        },
        [t],
    );

    const startBackfillPoll = useCallback(() => {
        if (!landId) return;
        stopBackfillPoll();
        let wasActive = true;
        const tick = async () => {
            try {
                const res = await landsApi.backfillStatus(landId);
                const stillActive = applyBackfillStatus(res, { wasActive });
                if (stillActive) {
                    wasActive = true;
                } else {
                    wasActive = false;
                    stopBackfillPoll();
                }
            } catch {
                /* ignore transient poll errors */
            }
        };
        void tick();
        backfillPollRef.current = setInterval(tick, 5000);
    }, [landId, applyBackfillStatus, stopBackfillPoll]);

    // One-shot on mount: resume polling only if a current-wave job is truly active
    useEffect(() => {
        if (!landId) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await landsApi.backfillStatus(landId);
                if (cancelled) return;
                const active = applyBackfillStatus(res);
                if (active) startBackfillPoll();
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
            stopBackfillPoll();
        };
    }, [landId]); // eslint-disable-line react-hooks/exhaustive-deps

    const openRefreshRsDialog = () => {
        if (oversizedLand) {
            toast.error(t("landTooLargeWarning", { area: formatLandAreaMu(areaMu) }));
            return;
        }
        setRefreshDateFrom(defaultRsDateFrom());
        setRefreshDateOpen(true);
    };

    const updateSeasonWindow = (id: string, patch: Partial<SeasonWindowDraft>) => {
        setSeasonWindows((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    };

    const toggleWindowCrop = (id: string, cropKey: string) => {
        setSeasonWindows((prev) => {
            const target = prev.find((w) => w.id === id);
            if (!target) return prev;
            const has = target.crops.includes(cropKey);
            let nextCrops: string[];
            if (has) {
                nextCrops = target.crops.filter((c) => c !== cropKey);
            } else {
                if (target.crops.length >= 2) return prev;
                const others = distinctCropsInWindows(prev.filter((w) => w.id !== id));
                const distinct = new Set([...others, ...target.crops, cropKey]);
                if (distinct.size > 2) return prev;
                nextCrops = [...target.crops, cropKey];
            }
            return prev.map((w) => (w.id === id ? { ...w, crops: nextCrops } : w));
        });
    };

    const addSeasonWindow = (preset?: "spring_corn" | "summer_corn" | "blank") => {
        const y = yearFromIso(refreshDateFrom);
        let draft: SeasonWindowDraft;
        if (preset === "spring_corn") {
            draft = {
                id: newWindowId(),
                start_date: `${y}-04-01`,
                end_date: `${y}-08-31`,
                crops: ["corn"],
                label: t("springCornWindow"),
            };
        } else if (preset === "summer_corn") {
            draft = {
                id: newWindowId(),
                start_date: `${y}-06-01`,
                end_date: `${y}-09-30`,
                crops: ["corn"],
                label: t("summerCornWindow"),
            };
        } else {
            const key = cropOption?.key;
            draft = {
                id: newWindowId(),
                start_date: "",
                end_date: "",
                crops: key ? [key] : [],
                label: "",
            };
        }
        setSeasonWindows((prev) => {
            if (prev.length >= MAX_SEASON_WINDOWS) {
                return prev; // max 3 rotation windows per year
            }
            const others = distinctCropsInWindows(prev);
            for (const c of draft.crops) {
                if (!others.includes(c) && others.length >= 2) {
                    return prev; // block 3rd distinct crop
                }
            }
            return [...prev, draft];
        });
    };

    const removeSeasonWindow = (id: string) => {
        setSeasonWindows((prev) => prev.filter((w) => w.id !== id));
    };

    const runHarvestDetect = async () => {
        if (!landId) return;
        setHarvestLoading(true);
        setHarvestError(false);
        try {
            const w = seasonWindows[seasonWindows.length - 1];
            const res = await agriApi.harvestDetect(landId, {
                start_date: w?.start_date,
                end_date: w?.end_date,
                crops: w?.crops,
                label: w?.label || undefined,
            });
            setHarvestResult(res);
            if (res.status === "detected" && res.harvest_date) {
                setSelectedDate(res.harvest_date);
                toast.success(t("harvestDetected"));
            } else if (res.status === "no_growth") {
                toast(t("harvestNoGrowth"));
            } else {
                toast(t("harvestUncertain"));
            }
        } catch {
            // 请求失败与遥感证据不足是不同状态，避免将网络异常展示为检测结论。
            setHarvestResult(null);
            setHarvestError(true);
            toast.error(t("harvestFailed"));
        } finally {
            setHarvestLoading(false);
        }
    };

    const handleRefreshRs = async () => {
        if (oversizedLand) {
            toast.error(t("landTooLargeWarning", { area: formatLandAreaMu(areaMu) }));
            return;
        }
        setRefreshDateOpen(false);
        setBackfilling(true);
        try {
            const today = new Date().toISOString().slice(0, 10);
            // 前端日期控件可被手动输入绕过 min 属性，因此提交前再次限制最多回溯五年。
            const dateFrom = clampRsDateFrom(refreshDateFrom);
            setRefreshDateFrom(dateFrom);
            const growing_seasons: GrowingSeasonWindow[] = seasonWindows
                .filter((w) => w.start_date && w.end_date && w.crops.length > 0)
                .map((w) => ({
                    crops: w.crops.slice(0, 2),
                    start_date: w.start_date,
                    end_date: w.end_date,
                    ...(w.label.trim() ? { label: w.label.trim() } : {}),
                }));
            await landsApi.backfillIndices(landId, {
                force: true,
                date_from: dateFrom,
                date_to: today,
                ...(growing_seasons.length ? { growing_seasons } : {}),
            });
            setBackfillActive(true);
            setBackfillProgress((prev) =>
                prev
                    ? { ...prev, has_active_backfill: true, phase: "stac", message: t("refreshInProgress") }
                    : {
                          land_id: landId,
                          has_active_backfill: true,
                          pending_jobs: 0,
                          running_jobs: 0,
                          completed_jobs: 0,
                          failed_jobs: 0,
                          total_jobs: 0,
                          percent: 0,
                          phase: "stac",
                          message: t("refreshInProgress"),
                      },
            );
            toast.success(t("refreshStarted"));
            startBackfillPoll();
        } catch (e: any) {
            if (e?.status === 409) {
                setBackfillActive(true);
                startBackfillPoll();
            }
            toast.error(e?.detail || t("refreshFailed"));
        } finally {
            setBackfilling(false);
        }
    };

    // When switching series, keep date if still valid; else prefer usable optical scene
    useEffect(() => {
        if (!scenes.length) return; // wait for initial scenes fetch; do not null out date early
        const sensor = sensorForIndex(series);
        const dates = scenes
            .filter((s) => s.sensor === sensor)
            .map((s) => s.date)
            .sort();
        if (!dates.length) {
            setSelectedDate(null);
            return;
        }
        setSelectedDate((prev) =>
            prev && dates.includes(prev) ? prev : (pickBestDefaultDate(scenes, series) ?? dates[dates.length - 1]),
        );
    }, [series, scenes]);

    const publishHeatmap = useCallback(
        (img: AgriHeatmapImage | null) => {
            if (!onHeatmapChange) return;
            if (enabledRef.current && heatmapVisibleRef.current) {
                onHeatmapChange(img);
            }
        },
        [onHeatmapChange],
    );

    const loadHeatmap = useCallback(
        async (date: string, index: SeriesKey) => {
            if (!landId) return;
            const requestKey = JSON.stringify([landId, date, index]);
            const activeRequest = heatmapRequestRef.current;
            // 两个 UI 触发点可能在同一帧请求相同像元；复用进行中的请求避免重复下载。
            if (activeRequest?.key === requestKey && !activeRequest.controller.signal.aborted) return;
            activeRequest?.controller.abort();
            const controller = new AbortController();
            heatmapRequestRef.current = { key: requestKey, controller };
            const gen = ++heatmapLoadGenRef.current;
            const meta = SERIES_META[index];
            setHeatmapLoading(true);
            setHeatmapError(null);
            // 新请求尚未完成时，不把上个日期的统计与来源误显示成当前选择的数据。
            setHeatmapMeta(null);
            try {
                const res = await agriApi.scenes(landId, {
                    sensor: meta.sensor,
                    from: date,
                    to: date,
                    limit: 5,
                    includePixels: 1,
                    signal: controller.signal,
                });
                // Ignore stale overlapping NDVI/EVI (or date) loads
                if (gen !== heatmapLoadGenRef.current) return;
                const official = res.items.filter(isOfficialOpticalScene);
                const withLonlat = (list: AgriSceneProduct[]) =>
                    list.find((s) => (s.pixels_lonlat?.length ?? 0) > 0);
                const withGrid = (list: AgriSceneProduct[]) =>
                    list.find((s) => (s.pixel_data?.pixels?.length ?? 0) > 0);
                const scene =
                    index === "flood"
                        ? res.items.find(
                              (s) =>
                                  s.radiometric_calibration?.method ===
                                  "esa_sigma_nought_lut",
                          ) ?? res.items[0]
                        : index === "drought"
                        ? (withLonlat(official) ?? withGrid(official) ?? official[0])
                        : (withLonlat(official) ??
                          withLonlat(res.items) ??
                          withGrid(res.items) ??
                          official[0] ??
                          res.items[0]);
                if (index === "drought" && !isWithinSeason(date)) {
                    cachedHeatmapRef.current = { landId, date, index, img: null, meta: null };
                    setHeatmapMeta(null);
                    publishHeatmap(null);
                    if (enabledRef.current) {
                        toast(t("outOfSeasonDrought"), {
                            description: `${date} · ${t(`indexLabels.${index}`)}`,
                        });
                    }
                    return;
                }
                if (index === "drought" && scene && !isOfficialOpticalScene(scene)) {
                    cachedHeatmapRef.current = { landId, date, index, img: null, meta: null };
                    setHeatmapMeta(null);
                    publishHeatmap(null);
                    if (enabledRef.current) {
                        toast(t("cloudSkipDrought"), {
                            description: `${date} · ${t(`indexLabels.${index}`)}`,
                        });
                    }
                    return;
                }
                if (
                    index === "flood" &&
                    scene &&
                    scene.radiometric_calibration?.method !== "esa_sigma_nought_lut"
                ) {
                    // 洪涝像元阈值是绝对Sigma0分贝；缺少场景LUT时隐藏色斑，避免近似尺度误导。
                    cachedHeatmapRef.current = { landId, date, index, img: null, meta: null };
                    setHeatmapMeta(null);
                    publishHeatmap(null);
                    return;
                }
                const lonlat = scene?.pixels_lonlat;
                const grid = scene?.pixel_data;
                if (!(lonlat?.length || grid?.pixels?.length)) {
                    cachedHeatmapRef.current = { landId, date, index, img: null, meta: null };
                    setHeatmapMeta(null);
                    publishHeatmap(null);
                    if (enabledRef.current) {
                        toast(t("pixelDataMissing"), {
                            description: `${meta.sensor} · ${date} · ${t(`indexLabels.${index}`)}`,
                        });
                    }
                    console.warn("[agri-heatmap] missing pixels_lonlat/pixel_data", {
                        landId,
                        date,
                        index,
                        source: scene?.pixels_source,
                    });
                    return;
                }
                // Day pixel NDVI grade shares (图一) — prefer lonlat; clear pixels preferred
                if (meta.sensor === "S2" && (index === "ndvi" || index === "drought" || index === "evi")) {
                    const sharePixels = lonlat?.length
                        ? lonlat
                        : null;
                    if (sharePixels?.length) {
                        const share = computePixelNdviGradeShares(sharePixels);
                        if (share) {
                            setDayGradeByDate((prev) =>
                                prev[date] && prev[date]!.n === share.n ? prev : { ...prev, [date]: share },
                            );
                        }
                    }
                }
                const img = lonlat?.length
                    ? rasterizeAgriLonLatPixels(lonlat, index, meta.sensor)
                    : rasterizeAgriPixels(grid!, index, meta.sensor);
                if (img && scene) {
                    img.previewRgbUrl = scene.rgb_url ?? null;
                    img.previewLargeRgbUrl = scene.large_rgb_url ?? null;
                    img.previewHeatmapUrl = scene.heatmap_url ?? null;
                    img.previewS2HeatmapUrl = scene.s2_heatmap_url ?? null;
                }
                if (gen !== heatmapLoadGenRef.current) return;
                const nextMeta: HeatmapMeta | null =
                    img
                        ? {
                              landId,
                              sceneId: scene.scene_id,
                              pixels: img.pixelCount,
                              date,
                              index: t(`indexLabels.${index}`),
                              mean: img.mean,
                              ...sceneProvenanceMeta(scene),
                          }
                        : null;
                cachedHeatmapRef.current = { landId, date, index, img, meta: nextMeta };
                setHeatmapMeta(nextMeta);
                publishHeatmap(img);
                if (!img && enabledRef.current) {
                    toast(t("heatmapNoPixelsRendered"), {
                        description: `${date} · ${t(`indexLabels.${index}`)}`,
                    });
                }
            } catch (e) {
                if (controller.signal.aborted || gen !== heatmapLoadGenRef.current) return;
                cachedHeatmapRef.current = { landId, date, index, img: null, meta: null };
                setHeatmapMeta(null);
                publishHeatmap(null);
                // 413由地块/场景像元量触发，重复请求不会成功；向用户说明超限原因。
                setHeatmapError(e instanceof ApiError && e.status === 413 ? "tooLarge" : "failed");
            } finally {
                if (gen === heatmapLoadGenRef.current) {
                    if (heatmapRequestRef.current?.controller === controller) {
                        heatmapRequestRef.current = null;
                    }
                    setHeatmapLoading(false);
                }
            }
        },
        [landId, publishHeatmap, t, isWithinSeason],
    );
    loadHeatmapRef.current = loadHeatmap;

    /** One bulk API call — server aggregates lonlat_v1 pixels (no include_pixels loop). */
    const loadDayGradeShares = useCallback(
        async (from?: string, to?: string, signal?: AbortSignal): Promise<boolean> => {
            if (!landId) return false;
            const rangeKey = `${landId}:${from ?? ""}:${to ?? ""}`;
            if (gradeSharesLoadedRangesRef.current.has(rangeKey)) return true;
            const inFlight = gradeSharesRequestsRef.current.get(rangeKey);
            if (inFlight) return inFlight;

            const request = agriApi.ndviDayGradeShares(landId, {
                from,
                to,
                limit: 500,
                signal,
            }).then((res) => {
                if (signal?.aborted) return false;
                const next: Record<string, DayGradeShare> = {};
                for (const item of res.items ?? []) {
                    const d = String(item.date).slice(0, 10);
                    if (!d) continue;
                    next[d] = {
                        counts: {
                            红: Number(item.counts?.["红"] ?? 0),
                            橙: Number(item.counts?.["橙"] ?? 0),
                            黄: Number(item.counts?.["黄"] ?? 0),
                            绿: Number(item.counts?.["绿"] ?? 0),
                        },
                        pct: {
                            红: Number(item.pct?.["红"] ?? 0),
                            橙: Number(item.pct?.["橙"] ?? 0),
                            黄: Number(item.pct?.["黄"] ?? 0),
                            绿: Number(item.pct?.["绿"] ?? 0),
                        },
                        n: Number(item.n ?? 0),
                        mean: item.mean != null && Number.isFinite(Number(item.mean)) ? Number(item.mean) : null,
                    };
                }
                setDayGradeByDate((prev) => ({ ...prev, ...next }));
                gradeSharesLoadedRangesRef.current.add(rangeKey);
                return true;
            }).catch(() => false).finally(() => {
                if (gradeSharesRequestsRef.current.get(rangeKey) === request) {
                    gradeSharesRequestsRef.current.delete(rangeKey);
                }
            });
            gradeSharesRequestsRef.current.set(rangeKey, request);
            return request;
        },
        [landId],
    );

    const loadEarlierScenes = useCallback(async (sensor: "S1" | "S2") => {
        if (!landId || earlierScenesRequestRef.current) return;
        const sensorScenes = scenes.filter((scene) => scene.sensor === sensor);
        const cursor = sceneCursors[sensor];
        if (!sensorScenes.length || !cursor) return;
        const controller = new AbortController();
        earlierScenesRequestRef.current = controller;
        setLoadingEarlierSensor(sensor);
        setLoadEarlierError(false);
        try {
            const page = await agriApi.scenes(landId, {
                sensor,
                limit: 500,
                order: "desc",
                beforeDate: cursor.date,
                beforeSceneId: cursor.sceneId,
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;

            const pageScenes = reverseDescScenesPage(page.items);
            const existingKeys = new Set(scenes.map((scene) => (
                `${scene.sensor}:${scene.date}:${scene.scene_id}`
            )));
            const uniquePageScenes = pageScenes.filter((scene) => {
                const key = `${scene.sensor}:${scene.date}:${scene.scene_id}`;
                if (existingKeys.has(key)) return false;
                existingKeys.add(key);
                return true;
            });

            // 时序行可能按景分页，但图一分级按天选景；先完整拿到本页日期的分级结果，再扩展可见历史。
            if (sensor === "S2") {
                const initialGradeRange = initialGradeSharesRangeRef.current;
                if (initialGradeRange) {
                    const loadedGradesReady = await loadDayGradeShares(
                        initialGradeRange.from,
                        initialGradeRange.to,
                        controller.signal,
                    );
                    if (!loadedGradesReady && !controller.signal.aborted) {
                        throw new Error("当前 NDVI 日分级数据加载失败");
                    }
                }
                const gradeDates = uniquePageScenes
                    .filter((scene) => typeof scene.ndvi_avg === "number")
                    .map((scene) => scene.date)
                    .sort();
                if (gradeDates.length) {
                    const gradesLoaded = await loadDayGradeShares(
                        gradeDates[0],
                        gradeDates[gradeDates.length - 1],
                        controller.signal,
                    );
                    if (!gradesLoaded && !controller.signal.aborted) {
                        throw new Error("NDVI 日分级数据加载失败");
                    }
                }
            }
            if (controller.signal.aborted) return;

            const lastPageScene = page.items[page.items.length - 1];
            if (lastPageScene) {
                setSceneCursors((current) => ({
                    ...current,
                    [sensor]: { date: lastPageScene.date, sceneId: lastPageScene.scene_id },
                }));
            }
            setSummary((current) => {
                if (!current) return current;
                const previousCount = current.sensors.find((item) => item.sensor === sensor)?.count ?? 0;
                return {
                    ...current,
                    total: Math.max(0, current.total + page.total - previousCount),
                    sensors: current.sensors.map((item) => (
                        item.sensor === sensor ? { ...item, count: page.total } : item
                    )),
                };
            });

            if (!uniquePageScenes.length) {
                // 游标之后无旧数据通常表示载入窗口期间有新场景入库，重载最新页以对齐总数。
                if (page.total > sensorScenes.length) setReloadKey((key) => key + 1);
                return;
            }

            const mergedScenes = [...scenes, ...uniquePageScenes].sort(compareAgriScenesChronologically);
            const mergedS2Dates = mergedScenes
                .filter((scene) => scene.sensor === "S2" && typeof scene.ndvi_avg === "number")
                .map((scene) => scene.date)
                .sort();
            // 新旧页的图一分级分别请求；标记扩展后的窗口，避免 state 更新后再重复拉整段历史。
            if (mergedS2Dates.length) {
                gradeSharesFetchKeyRef.current = `${landId}:${mergedS2Dates[0]}:${mergedS2Dates[mergedS2Dates.length - 1]}`;
            }
            setScenes(mergedScenes);

            if (
                page.items.length < page.limit
                && sensorScenes.length + uniquePageScenes.length < page.total
            ) {
                // 页尾与服务端总数不吻合说明分页期间数据发生变化，回到最新窗口校准列表。
                setReloadKey((key) => key + 1);
            }
        } catch {
            if (!controller.signal.aborted) setLoadEarlierError(true);
        } finally {
            if (earlierScenesRequestRef.current === controller) {
                earlierScenesRequestRef.current = null;
                setLoadingEarlierSensor(null);
            }
        }
    }, [landId, loadDayGradeShares, sceneCursors, scenes]);

    const selectDateExplicit = useCallback(
        (date: string) => {
            setSelectedDate(date);
            const sensor = sensorForIndex(series);
            const scene = scenes.find((s) => s.sensor === sensor && s.date === date);
            if (sceneLooksCloudyOrLowVeg(scene, series)) {
                toast(t("lowVegetationHeatmapNote"), {
                    description: `${date} · ${t(`indexLabels.${series}`)}`,
                });
            }
        },
        [scenes, series, t],
    );


    // Prefetch/reload film whenever date or series changes (tab may be inactive).
    useEffect(() => {
        if (!selectedDate) return;
        const cache = cachedHeatmapRef.current;
        if (cache && cache.landId === landId && cache.date === selectedDate && cache.index === series) {
            setHeatmapError(null);
            setHeatmapMeta(cache.meta);
            return;
        }
        void loadHeatmap(selectedDate, series);
    }, [landId, selectedDate, series, loadHeatmap]);

    // enabled gate：只同步地图显示状态；大体量像元请求由上方 effect 统一触发，避免重复拉取。
    useEffect(() => {
        if (!selectedDate) {
            heatmapLoadGenRef.current += 1;
            heatmapRequestRef.current?.controller.abort();
            heatmapRequestRef.current = null;
            setHeatmapLoading(false);
            setHeatmapMeta(null);
            onHeatmapChange?.(null);
            return;
        }
        if (!enabled) {
            // 保留后台预取；切换 tab 不取消正在加载的像元。
            onHeatmapChange?.(null);
            return;
        }
        if (!heatmapVisible) {
            onHeatmapChange?.(null);
            return;
        }
        const cache = cachedHeatmapRef.current;
        if (cache && cache.landId === landId && cache.date === selectedDate && cache.index === series) {
            setHeatmapError(null);
            setHeatmapMeta(cache.meta);
            onHeatmapChange?.(cache.img);
            return;
        }
        // 当前日期尚无缓存时先清除旧日期色膜，等待唯一的预取请求完成。
        onHeatmapChange?.(null);
    }, [enabled, heatmapVisible, landId, selectedDate, series, onHeatmapChange]);

    const stats = useMemo(() => scenesToStats(scenes, series, landId), [scenes, series, landId]);
    const decloudAltStats = useMemo(
        () => collectDecloudAltStats(scenes, series, stats, landId),
        [scenes, series, stats, landId],
    );

    const availableKeys = useMemo(
        () => BUTTON_ORDER.filter((key) => seriesIsAvailable(key, scenes)),
        [scenes],
    );
    const primaryKeys = useMemo(() => {
        const preferred = PRIMARY_SERIES_KEYS.filter((k) => availableKeys.includes(k));
        return preferred.length ? preferred : availableKeys.slice(0, 4);
    }, [availableKeys]);
    const overflowKeys = useMemo(
        () => availableKeys.filter((k) => !primaryKeys.includes(k)),
        [availableKeys, primaryKeys],
    );
    const seriesInOverflow = overflowKeys.includes(series);

    const allDates = useMemo(
        () => [...new Set(stats.map((s) => s.date))].sort((a, b) => b.localeCompare(a)),
        [stats],
    );
    const recentDates = useMemo(() => {
        if (!allDates.length) return [] as string[];
        const latest = allDates[0]!; // already desc
        const latestMs = Date.parse(`${latest}T00:00:00Z`);
        if (!Number.isFinite(latestMs)) return allDates.slice(0, RECENT_DATE_CHIP_CAP);
        const cutoff = latestMs - RECENT_DATE_WINDOW_MS;
        const inWindow = allDates.filter((d) => {
            const ms = Date.parse(`${d}T00:00:00Z`);
            return Number.isFinite(ms) && ms >= cutoff;
        });
        return inWindow.slice(0, RECENT_DATE_CHIP_CAP);
    }, [allDates]);
    const chipDates = useMemo(() => {
        const set = new Set(recentDates);
        if (selectedDate && !set.has(selectedDate) && allDates.includes(selectedDate)) {
            return [selectedDate, ...recentDates];
        }
        return recentDates;
    }, [recentDates, selectedDate, allDates]);

    const droughtByDate = useMemo(() => {
        const s2 = scenes.filter((s) => s.sensor === "S2");
        const classified = classifyDroughtSeries(s2, seasonMonths);
        const out: Record<string, AgriDroughtClass> = {};
        for (const [date, cls] of classified) {
            if (isWithinSeason(date) && isDroughtDayClass(cls)) out[date] = cls;
        }
        return out;
    }, [scenes, seasonMonths, isWithinSeason]);

    const floodByDate = useMemo(() => {
        const s1 = scenes.filter((s) => s.sensor === "S1");
        return classifyFloodSeriesByDate(s1);
    }, [scenes]);

    const floodUnclassifiedDates = useMemo(() => {
        const dates = new Set(
            scenes
                .filter(
                    (scene) =>
                        scene.sensor === "S1" &&
                        typeof scene.vv_avg === "number" &&
                        Number.isFinite(scene.vv_avg) &&
                        Boolean(scene.date),
                )
                .map((scene) => scene.date),
        );
        for (const date of floodByDate.keys()) dates.delete(date);
        return dates;
    }, [scenes, floodByDate]);

    const droughtEventMarks = useMemo(
        () =>
            Object.entries(droughtByDate)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, cls]) => ({
                    date,
                    label: t(`droughtChip_${cls}`),
                    level:
                        cls === "severe"
                            ? ("high" as const)
                            : cls === "moderate"
                              ? ("medium" as const)
                              : ("low" as const),
                })),
        [droughtByDate, t],
    );

    const floodEventMarks = useMemo(
        () =>
            [...floodByDate.entries()]
                .filter(([, cls]) => isFloodDayClass(cls) || isFloodWatchClass(cls))
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, cls]) => ({
                    date,
                    label: t(
                        `floodChip_${cls === "flood_severe" ? "severe" : cls === "flood_moderate" ? "moderate" : "watch"}`,
                    ),
                    level: cls === "flood_severe" ? ("high" as const) : cls === "flood_moderate" ? ("medium" as const) : ("low" as const),
                })),
        [floodByDate, t],
    );

    const harvestEventMarks = useMemo(() => {
        if (harvestResult?.status === "detected" && harvestResult.harvest_date) {
            return [
                {
                    date: harvestResult.harvest_date,
                    label: t("harvestLabel"),
                    level: "high" as const,
                },
            ];
        }
        return [];
    }, [harvestResult, t]);

    const ndviEventMarks = useMemo(
        () => [...droughtEventMarks, ...harvestEventMarks],
        [droughtEventMarks, harvestEventMarks],
    );

    const droughtDayCount = droughtEventMarks.length;
    const floodDayCount = [...floodByDate.values()].filter(isFloodDayClass).length;
    const floodWatchCount = [...floodByDate.values()].filter(isFloodWatchClass).length;
    const clearS2Count = useMemo(() => {
        const dates = new Set<string>();
        for (const s of scenes) {
            if (s.sensor === "S2" && isOfficialOpticalScene(s) && typeof s.ndvi_avg === "number") {
                dates.add(s.date);
            }
        }
        return dates.size;
    }, [scenes]);

    const cloudByDate = useMemo(() => {
        const sensor = sensorForIndex(series);
        const out: Record<string, { pct: number | null; source: "parcel" | "stac" | null }> = {};
        for (const d of allDates) {
            const group = scenes.filter((s) => s.sensor === sensor && s.date === d);
            const picked =
                sensor === "S2"
                    ? series === "drought"
                        ? pickOfficialOptical(group, { neighbors: scenes })
                        : pickOpticalForNdvi(group, { neighbors: scenes })
                    : group[0];
            out[d] = sceneCloudDisplay(picked ?? null);
        }
        return out;
    }, [allDates, scenes, series]);
    const cloudPctByDate = useMemo(() => {
        const out: Record<string, number | null> = {};
        for (const [d, v] of Object.entries(cloudByDate)) out[d] = v.pct;
        return out;
    }, [cloudByDate]);

    const selectedBare = useMemo(() => {
        if (!selectedDate || (series !== "ndvi" && series !== "drought" && series !== "evi")) return false;
        const st = stats.find((s) => s.date === selectedDate);
        if (!st || st.mean == null) return false;
        const m = Number(selectedDate.slice(5, 7));
        return peakMonths.includes(m) && st.mean < UNCROPPED_NDVI;
    }, [selectedDate, stats, series, peakMonths]);

    const areaMu = useMemo(
        () => resolveLandAreaMu(landAreaMu, areaHa),
        [areaHa, landAreaMu],
    );
    const oversizedLand = isOversizedLand(areaMu);

    const selectedDayShare = useMemo(() => {
        if (!selectedDate) return null;
        return dayGradeByDate[selectedDate] ?? null;
    }, [selectedDate, dayGradeByDate]);

    /** Selected scene for current series sensor + date (cloud cover, etc.). */
    const selectedScene = useMemo(() => {
        if (!selectedDate) return null;
        const sensor = sensorForIndex(series);
        const matches = scenes.filter((s) => s.sensor === sensor && s.date === selectedDate);
        if (!matches.length) return null;
        if (sensor === "S2") {
            return (
                (series === "drought"
                    ? pickOfficialOptical(matches, { neighbors: scenes })
                    : pickOpticalForNdvi(matches, { neighbors: scenes })) ??
                matches[0] ??
                null
            );
        }
        if (series === "flood") {
            return (
                matches.find(
                    (scene) =>
                        scene.radiometric_calibration?.method ===
                        "esa_sigma_nought_lut",
                ) ?? matches[0]
            );
        }
        return matches[0] ?? null;
    }, [scenes, selectedDate, series]);

    // 无像元、低质量或被算法门控的场景仍可查看来源与定标信息。
    const selectedSceneMeta = selectedScene
        ? sceneProvenanceMeta(selectedScene)
        : null;
    const activeHeatmapMeta =
        heatmapMeta?.landId === landId &&
        heatmapMeta.date === selectedDate &&
        heatmapMeta.sensor === sensorForIndex(series) &&
        heatmapMeta.sceneId === selectedScene?.scene_id
            ? heatmapMeta
            : null;
    const detailsMeta = activeHeatmapMeta ?? selectedSceneMeta;

    const selectedCloud = useMemo(() => {
        if (!selectedScene || sensorForIndex(series) !== "S2") {
            return { pct: null as number | null, source: null as "parcel" | "stac" | null };
        }
        return sceneCloudDisplay(selectedScene);
    }, [selectedScene, series]);
    const cloudCoverPct = selectedCloud.pct;

    const cloudCoverOver30 = useMemo(() => {
        if (!selectedScene) return false;
        if (cloudCoverPct != null) return cloudCoverPct > DROUGHT_CLOUD_MAX_PCT;
        return selectedScene.cloud_cover_over_30 === true;
    }, [selectedScene, cloudCoverPct]);

    const selectedDecloudAlt = useMemo(() => {
        if (!selectedDate) return null;
        return decloudAltStats.find((s) => s.date === selectedDate) ?? null;
    }, [selectedDate, decloudAltStats]);

    const sceneMeanByDate = useMemo(() => {
        const out: Record<string, number | null> = {};
        const byDate = new Map<string, AgriSceneProduct[]>();
        for (const s of scenes) {
            if (s.sensor !== "S2") continue;
            const arr = byDate.get(s.date) ?? [];
            arr.push(s);
            byDate.set(s.date, arr);
        }
        for (const [date, group] of byDate) {
            const picked = pickOpticalForNdvi(group);
            if (picked && typeof picked.ndvi_avg === "number") out[date] = picked.ndvi_avg;
        }
        return out;
    }, [scenes]);

    /** Same date set as NdviChart when「仅显示有效观测」is on; keep full dayGradeByDate in state. */
    const realisticStatDates = useMemo(() => {
        if (!onlyRealistic) return null;
        const filterOpts =
            series === "ndvi" || series === "evi" || series === "drought"
                ? { seasonMonths, peakMonths }
                : series === "ndmi"
                  ? { seasonMonths }
                  : {};
        return new Set(filterRealisticNdviStats(stats, filterOpts).map((s) => s.date));
    }, [onlyRealistic, stats, series, seasonMonths, peakMonths]);

    const stackedHistoryByDate = useMemo(() => {
        if (!realisticStatDates) return dayGradeByDate;
        const out: Record<string, DayGradeShare> = {};
        for (const [date, share] of Object.entries(dayGradeByDate)) {
            if (realisticStatDates.has(date)) out[date] = share;
        }
        return out;
    }, [dayGradeByDate, realisticStatDates]);

    const stackedMeanByDate = useMemo(() => {
        if (!realisticStatDates) return sceneMeanByDate;
        const out: Record<string, number | null> = {};
        for (const [date, mean] of Object.entries(sceneMeanByDate)) {
            if (realisticStatDates.has(date)) out[date] = mean;
        }
        return out;
    }, [sceneMeanByDate, realisticStatDates]);

    // Bulk load 图一 grade shares via dedicated API (server-side lonlat aggregation).
    useEffect(() => {
        if (!landId || !scenes.length) return;
        const s2Dates = [
            ...new Set(
                scenes
                    .filter((s) => s.sensor === "S2" && typeof s.ndvi_avg === "number")
                    .map((s) => s.date),
            ),
        ].sort();
        if (!s2Dates.length) return;
        const from = s2Dates[0]!;
        const to = s2Dates[s2Dates.length - 1]!;
        const fetchKey = `${landId}:${from}:${to}`;
        if (gradeSharesFetchKeyRef.current === fetchKey) return;
        gradeSharesFetchKeyRef.current = fetchKey;
        // 地块或统计日期窗口改变时停止旧聚合请求，防止同日期键把前一块地的分级结果写入当前图表。
        const controller = new AbortController();
        let settled = false;
        const gradeSharesRequests = gradeSharesRequestsRef.current;
        void loadDayGradeShares(from, to, controller.signal).finally(() => {
            settled = true;
        });
        return () => {
            controller.abort();
            // 被新窗口取代的请求不能留下已占用的去重键，否则新请求会被误判为重复。
            if (!settled && gradeSharesFetchKeyRef.current === fetchKey) {
                gradeSharesFetchKeyRef.current = null;
                gradeSharesRequests.delete(fetchKey);
            }
        };
    }, [landId, scenes, loadDayGradeShares]);

    const total = summary?.total ?? 0;
    const loadedSceneCounts = useMemo(
        () => scenes.reduce((counts, scene) => {
            counts[scene.sensor] += 1;
            return counts;
        }, { S1: 0, S2: 0 }),
        [scenes],
    );
    const partialSensors = useMemo(
        () => (summary?.sensors ?? []).filter(
            (sensor) => loadedSceneCounts[sensor.sensor] < sensor.count,
        ),
        [summary, loadedSceneCounts],
    );
    const partialSceneCounts = partialSensors
        .map((sensor) => `${sensor.sensor} ${loadedSceneCounts[sensor.sensor]}/${sensor.count}`)
        .join(" · ");

    if (!landId) return null;
    if (!loading && hasMonitoringData && total === 0) return null;

    const CHART_INDEX_TYPE: Partial<Record<SeriesKey, IndexType>> = {
        ndvi: "NDVI",
        evi: "EVI",
        ndmi: "NDMI",
        ndre: "NDRE",
        cire: "CIRE",
        mndwi: "MNDWI",
        drought: "NDVI",
        vv: "VV",
        vh: "VH",
        flood: "VV",
    };
    const chartIndexType: IndexType = CHART_INDEX_TYPE[series] ?? "NDVI";
    const selectedMean = stats.find((point) => point.date === selectedDate)?.mean;

    return (
        <Card data-tour="timeseries" className="overflow-hidden border-border/60 bg-card shadow-sm">
            <CardHeader className="border-b border-border/50 bg-muted/20 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                        <CardTitle className="flex flex-wrap items-center gap-1.5 text-xs font-semibold tracking-tight">
                            <span>{t("title")}</span>
                        </CardTitle>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                            {t("subtitle", {
                                landId: landId ?? "—",
                                scenes: summary ? t("scenesCount", { total: summary.total }) : "",
                            })}
                        </p>
                        {oversizedLand && (
                            <div role="alert" className="mt-1 flex items-start gap-1.5 text-[11px] text-warning">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>{t("landTooLargeWarning", { area: formatLandAreaMu(areaMu) })}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Button
                            type="button"
                            size="sm"
                            variant="default"
                            className="h-7 text-[11px] gap-1.5"
                            onClick={openRefreshRsDialog}
                            disabled={oversizedLand || backfilling || backfillActive}
                            title={oversizedLand ? t("landTooLargeWarning", { area: formatLandAreaMu(areaMu) }) : backfillActive ? t("refreshInProgress") : t("refreshRsTitle")}
                        >
                            {backfilling || backfillActive ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            {t("refreshRs")}
                        </Button>
                        {summary && (
                            <div className="flex flex-wrap gap-1 justify-end">
                                {summary.sensors.map((s) => (
                                    <Badge key={s.sensor} variant="secondary" className="text-[10px] tabular-nums">
                                        {s.sensor} {s.count}
                                    </Badge>
                                ))}
                            </div>
                        )}
                        {partialSceneCounts && (
                            <div className="max-w-[20rem] space-y-1 text-right">
                                <p role="status" aria-live="polite" className="text-[11px] leading-snug text-muted-foreground">
                                    {t("historyWindowPartial", { sensors: partialSceneCounts })}
                                </p>
                                {series === "drought" && partialSensors.some((sensor) => sensor.sensor === "S2") ? (
                                    <p className="text-[11px] leading-snug text-muted-foreground">
                                        {t("droughtHistoryPartial")}
                                    </p>
                                ) : null}
                                <div className="flex flex-wrap justify-end gap-1">
                                    {partialSensors.map((sensor) => (
                                        <Button
                                            key={sensor.sensor}
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-[10px]"
                                            disabled={loading || !sceneCursors[sensor.sensor] || loadingEarlierSensor !== null}
                                            aria-label={`${t("loadEarlier")} ${sensor.sensor}`}
                                            onClick={() => void loadEarlierScenes(sensor.sensor)}
                                        >
                                            {loadingEarlierSensor === sensor.sensor ? (
                                                <Loader2 className="mr-1 h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                            ) : null}
                                            {loadingEarlierSensor === sensor.sensor ? t("loadingEarlier") : t("loadEarlier")}
                                            <span className="ml-1 tabular-nums">{sensor.sensor}</span>
                                        </Button>
                                    ))}
                                </div>
                                {loadEarlierError ? (
                                    <p role="alert" className="text-[11px] leading-snug text-destructive">
                                        {t("loadEarlierFailed")}
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
                <PhenologyPicker landId={landId}
                    onLoaded={data => {
                        setInferredPhenology(data);
                        setSeasonWindows(current => current.length ? current : data.windows.slice(-MAX_SEASON_WINDOWS).map(window => ({
                            id: newWindowId(), start_date: window.start_date || window.observed_start || "",
                            end_date: window.end_date || window.observed_end || "", crops: cropOption?.key ? [cropOption.key] : [], label: t("remoteSensingWindow"),
                        })));
                    }}
                    onSelect={window => setSeasonWindows([{ id: newWindowId(), start_date: window.start_date!, end_date: window.end_date!, crops: cropOption?.key ? [cropOption.key] : [], label: t("remoteSensingWindow") }])} />
                <IndexExplainer index={series} />
                <Dialog open={refreshDateOpen} onOpenChange={setRefreshDateOpen}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>{t("refreshRsDateTitle")}</DialogTitle>
                            <DialogDescription>{t("refreshRsDateDesc")}</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-3 py-2">
                            <div className="grid gap-2">
                                <Label htmlFor="rs-date-from">{t("refreshRsDateFrom")}</Label>
                                <Input
                                    id="rs-date-from"
                                    type="date"
                                    value={refreshDateFrom}
                                    min={earliestRsDateFrom()}
                                    max={new Date().toISOString().slice(0, 10)}
                                    onChange={(e) => setRefreshDateFrom(clampRsDateFrom(e.target.value))}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label>{t("refreshRsSeasons")}</Label>
                                <p className="text-[10px] text-muted-foreground leading-snug">
                                    {t("refreshRsSeasonsHint")}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{t("refreshRsMaxCrops")}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{t("refreshRsMaxWindows")}</p>
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                    <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" disabled={seasonWindows.length >= MAX_SEASON_WINDOWS} onClick={() => addSeasonWindow("spring_corn")}>
                                        {t("refreshRsPresetSpringCorn")}
                                    </Button>
                                    <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" disabled={seasonWindows.length >= MAX_SEASON_WINDOWS} onClick={() => addSeasonWindow("summer_corn")}>
                                        {t("refreshRsPresetSummerCorn")}
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={seasonWindows.length >= MAX_SEASON_WINDOWS} onClick={() => addSeasonWindow("blank")}>
                                        <Plus className="h-3 w-3 mr-1" />
                                        {t("refreshRsWindowAdd")}
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-56 overflow-y-auto pt-1">
                                    {seasonWindows.map((w, idx) => (
                                        <div key={w.id} className="rounded-md border border-border/60 p-2 space-y-1.5 bg-muted/20">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-medium text-muted-foreground">#{idx + 1}</span>
                                                <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => removeSeasonWindow(w.id)}>
                                                    <Trash2 className="h-3 w-3 mr-1" />
                                                    {t("refreshRsWindowRemove")}
                                                </Button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <div className="grid gap-0.5">
                                                    <Label className="text-[10px]">{t("refreshRsWindowStart")}</Label>
                                                    <Input
                                                        type="date"
                                                        className="h-8 text-xs"
                                                        value={w.start_date}
                                                        onChange={(e) => updateSeasonWindow(w.id, { start_date: e.target.value })}
                                                    />
                                                </div>
                                                <div className="grid gap-0.5">
                                                    <Label className="text-[10px]">{t("refreshRsWindowEnd")}</Label>
                                                    <Input
                                                        type="date"
                                                        className="h-8 text-xs"
                                                        value={w.end_date}
                                                        onChange={(e) => updateSeasonWindow(w.id, { end_date: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid gap-0.5">
                                                <Label className="text-[10px]">{t("refreshRsWindowCrops")}</Label>
                                                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                                                    {(cropCatalog.length ? cropCatalog : cropOption ? [cropOption] : []).slice(0, 40).map((c) => {
                                                        const on = w.crops.includes(c.key);
                                                        return (
                                                            <Button
                                                                key={c.key}
                                                                type="button"
                                                                size="sm"
                                                                variant={on ? "default" : "outline"}
                                                                className="h-6 text-[10px] px-1.5"
                                                                onClick={() => toggleWindowCrop(w.id, c.key)}
                                                            >
                                                                {c.name_zh || c.name}
                                                            </Button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="grid gap-0.5">
                                                <Label className="text-[10px]">{t("refreshRsWindowLabel")}</Label>
                                                <Input
                                                    className="h-8 text-xs"
                                                    value={w.label}
                                                    placeholder={t("cropTypeExample")}
                                                    onChange={(e) => updateSeasonWindow(w.id, { label: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {!seasonWindows.length ? (
                                    <p className="text-[10px] text-muted-foreground">{t("refreshRsSeasonsEmpty")}</p>
                                ) : null}
                            </div>
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button type="button" variant="outline" onClick={() => setRefreshDateOpen(false)}>
                                {t("refreshRsDateCancel")}
                            </Button>
                            <Button type="button" onClick={handleRefreshRs} disabled={oversizedLand || !refreshDateFrom || backfilling}>
                                {t("refreshRsDateConfirm")}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                {backfillActive && (
                    <div className="rounded-md border border-info/30 bg-info-subtle/60 px-2.5 py-2 space-y-1.5">
                        <p className="text-[11px] text-info flex items-center gap-1.5 font-medium">
                            <History className="h-3 w-3 shrink-0" />
                            {backfillProgress?.phase === "bridge"
                                ? t("progressBridge")
                                : backfillProgress?.message || t("refreshInProgress")}
                        </p>
                        {backfillProgress && backfillProgress.phase !== "bridge" && (
                            <p className="text-[10px] text-info/80 tabular-nums">
                                {t("progressCounts", {
                                    done: backfillProgress.completed_jobs,
                                    total: Math.max(
                                        backfillProgress.total_jobs,
                                        backfillProgress.completed_jobs
                                            + backfillProgress.pending_jobs
                                            + backfillProgress.running_jobs,
                                    ),
                                    running: backfillProgress.running_jobs,
                                    pending: backfillProgress.pending_jobs,
                                })}
                            </p>
                        )}
                        <div
                            role="progressbar"
                            aria-label={t("refreshProgressLabel")}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={
                                backfillProgress?.phase === "bridge"
                                    ? 100
                                    : Math.min(100, Math.max(0, backfillProgress?.percent ?? 0))
                            }
                            className="h-1.5 w-full rounded-full bg-info/15 overflow-hidden"
                        >
                            <div
                                className="h-full rounded-full bg-info transition-[width] duration-500 motion-reduce:transition-none"
                                style={{
                                    width: `${
                                        backfillProgress?.phase === "bridge"
                                            ? 100
                                            : Math.min(100, Math.max(2, backfillProgress?.percent ?? 0))
                                    }%`,
                                }}
                            />
                        </div>
                    </div>
                )}
                {loading && (
                    <div role="status" aria-live="polite" className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-xs">
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        {t("loading")}
                    </div>
                )}
                {error && (
                    <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-destructive/5 px-3 py-2 text-[11px]">
                        <span>{error}</span>
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setReloadKey((k) => k + 1)}>{t("retry")}</Button>
                    </div>
                )}
                {!loading && !error && total === 0 && (
                    <p className="text-[11px] text-muted-foreground py-3 leading-relaxed">
                        {t("empty")}
                    </p>
                )}
                {!loading && total > 0 && (
                    <>
                        <div className="flex flex-wrap gap-1.5 items-center rounded-xl bg-muted/40 p-2">
                            {primaryKeys.map((key) => {
                                return (
                                    <Button
                                        key={key}
                                        type="button"
                                        size="sm"
                                        variant={series === key ? "default" : "outline"}
                                        className={cn(
                                            "h-7 text-xs px-2.5 shrink-0",
                                            (key === "drought" || key === "flood") &&
                                                series !== key &&
                                                "border-primary/40",
                                        )}
                                        onClick={() => setSeries(key)}
                                        aria-pressed={series === key}
                                        title={t(`indexHints.${key}`)}
                                    >
                                        {t(`indexLabels.${key}`)}
                                    </Button>
                                );
                            })}
                            {overflowKeys.length > 0 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={seriesInOverflow ? "secondary" : "outline"}
                                            className="h-7 w-7 p-0 shrink-0"
                                            title={t("moreIndices")}
                                            aria-label={t("moreIndices")}
                                        >
                                            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                                            <span className="sr-only">{t("moreIndices")}</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="min-w-[10rem]">
                                        {overflowKeys.map((key) => {
                                            const active = series === key;
                                            return (
                                                <DropdownMenuItem
                                                    key={key}
                                                    onSelect={() => setSeries(key)}
                                                    className="text-xs gap-2"
                                                >
                                                    <span className="flex-1">{t(`indexLabels.${key}`)}</span>
                                                    {active ? (
                                                        <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                                                    ) : null}
                                                </DropdownMenuItem>
                                            );
                                        })}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 shrink-0 ml-auto"
                                title={heatmapVisible ? t("hideHeatmap") : t("showHeatmap")}
                                aria-label={heatmapVisible ? t("hideHeatmap") : t("showHeatmap")}
                                onClick={() => {
                                    setHeatmapVisible((v) => {
                                        const next = !v;
                                        if (!next) onHeatmapChange?.(null);
                                        return next;
                                    });
                                }}
                            >
                                {heatmapVisible ? (
                                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                            </Button>
                        </div>
                        {(series === "drought" || series === "flood") && (
                            <p className="text-[11px] text-muted-foreground leading-snug">
                                {t(`indexHints.${series}`)}
                                {series === "drought" && clearS2Count > 0
                                    ? ` · ${t("droughtDaysCount", { drought: droughtDayCount, clear: clearS2Count })}`
                                    : ""}
                                {series === "flood"
                                    ? ` · ${t("floodDaysCount", {
                                          flood: floodDayCount,
                                          watch: floodWatchCount,
                                          unknown: floodUnclassifiedDates.size,
                                      })}`
                                    : ""}
                            </p>
                        )}
                        <div className="rounded-lg bg-background p-2.5">
                            {/* 收获日识别属于历史曲线操作，和当前指标、日期放在同一行，避免单独占一块空间。 */}
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                                    <span>{t(`indexLabels.${series}`)}</span>
                                    <span className="tabular-nums">{selectedDate ?? "—"} · {selectedMean != null ? selectedMean.toFixed(2) : "—"}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 shrink-0 text-[11px]"
                                        disabled={!landId || harvestLoading || !seasonWindows.length}
                                        title={t("harvestDetectHint")}
                                        onClick={() => void runHarvestDetect()}
                                    >
                                        {harvestLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                                        {t("harvestDetect")}
                                    </Button>
                                    {harvestResult?.status === "detected" && harvestResult.harvest_date ? (
                                        <Badge variant="secondary" className="text-[11px] tabular-nums">
                                            {harvestResult.harvest_date} · {t(harvestResult.confidence === "high" ? "confidenceHigh" : harvestResult.confidence === "medium" ? "confidenceMedium" : harvestResult.confidence === "low" ? "confidenceLow" : "confidenceUnknown")}
                                        </Badge>
                                    ) : harvestResult ? (
                                        <Badge variant="secondary" className="text-[11px]">
                                            {t(harvestResult.status === "no_growth" ? "harvestNoGrowthShort" : "harvestUncertainShort")}
                                        </Badge>
                                    ) : null}
                                </div>
                            </div>
                            {harvestError && <p role="alert" className="mb-2 text-[11px] text-destructive">{t("harvestFailed")}</p>}
                            {stats.length > 0 ? (
                                <NdviChart
                                    stats={stats}
                                    decloudAltStats={decloudAltStats}
                                    selectedDate={selectedDate}
                                    onDateSelect={(d) => selectDateExplicit(d)}
                                    height={280}
                                    indexType={chartIndexType}
                                    seasonMonths={
                                        series === "ndvi" ||
                                        series === "evi" ||
                                        series === "drought" ||
                                        series === "ndmi"
                                            ? seasonMonths
                                            : undefined
                                    }
                                    peakMonths={
                                        series === "ndvi" || series === "evi" || series === "drought"
                                            ? peakMonths
                                            : undefined
                                    }
                                    eventMarks={
                                        series === "drought" || series === "ndvi" || series === "ndmi"
                                            ? ndviEventMarks
                                            : series === "flood" || series === "vv"
                                              ? floodEventMarks
                                              : undefined
                                    }
                                    onlyRealistic={onlyRealistic}
                                    onOnlyRealisticChange={setOnlyRealistic}
                                />
                            ) : (
                                <p className="text-xs text-muted-foreground py-2">{t("noMeanPoints")}</p>
                            )}
                        </div>
                        {(series === "ndvi" || series === "evi" || series === "drought") && (
                            <>
                                <div className="rounded-lg bg-background p-2.5 space-y-3">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[11px] font-medium text-foreground">{t("dayGrowthGrade")}</span>
                                        <Badge variant="secondary" className="text-[10px]">
                                            {locale === "zh"
                                                ? cropOption?.season_label_zh || cropOption?.name_zh || t("cropSeason")
                                                : locale === "en"
                                                  ? cropOption?.name || t("cropSeason")
                                                  : t("cropSeason")}
                                        </Badge>
                                        {selectedBare && (
                                            <Badge variant="destructive" className="text-[10px]">
                                                {t("bareLandSuspicion", { threshold: UNCROPPED_NDVI })}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-snug">
                                        {t("gradeShareExplanation", { rule: t("gradeShareRule") })}
                                    </p>
                                    <NdviGradeSharesChart
                                        variant="donut"
                                        selectedShare={selectedDayShare}
                                        areaMu={areaMu}
                                        selectedDate={selectedDate}
                                        height={200}
                                    />
                                </div>
                                <div className="rounded-lg bg-background p-2.5 space-y-3">
                                    <span className="text-[11px] font-medium text-foreground">{t("growthShareTrend")}</span>
                                    <NdviGradeSharesChart
                                        variant="stacked"
                                        historyByDate={stackedHistoryByDate}
                                        meanByDate={stackedMeanByDate}
                                        height={250}
                                    />
                                </div>
                            </>
                        )}
                        <div data-tour="select-date" className="space-y-3 rounded-lg bg-muted/20 p-2.5">
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {selectedDate
                                    ? t("heatmapDate", { date: selectedDate, mode: t(`indexLabels.${series}`) })
                                    : t("pickDate")}
                                {cloudCoverPct != null
                                    ? ` · ${formatCloudCoverLabel(cloudCoverPct, selectedCloud.source, t)}`
                                    : ""}
                                {decloudQualityChip(
                                    selectedScene?.decloud_quality ??
                                        selectedDecloudAlt?.decloud_quality,
                                    t,
                                )}
                                {series === "flood" && selectedDate && isSpringFloodMonth(selectedDate)
                                    ? ` · ${t("floodSpringNote")}`
                                    : ""}
                                {series === "flood" &&
                                selectedDate &&
                                floodUnclassifiedDates.has(selectedDate)
                                    ? ` · ${t("floodBaselineUnavailable")}`
                                    : ""}
                                {heatmapLoading ? (
                                    <span role="status" aria-live="polite">{t("rendering")}</span>
                                ) : ""}
                            </p>
                            {heatmapError && (
                                <div role="alert" className="flex items-center justify-between gap-2 text-[11px] text-destructive">
                                    <span>{t(heatmapError === "tooLarge" ? "heatmapTooLarge" : "heatmapFailed")}</span>
                                    {heatmapError !== "tooLarge" && (
                                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => selectedDate && void loadHeatmap(selectedDate, series)}>{t("retry")}</Button>
                                    )}
                                </div>
                            )}
                            {series === "flood" &&
                                selectedScene &&
                                selectedScene.radiometric_calibration?.method !== "esa_sigma_nought_lut" && (
                                    <p role="status" className="text-[11px] text-muted-foreground">
                                        {t("floodCalibrationOverlayUnavailable")}
                                    </p>
                                )}
                            {detailsMeta && (
                                <details className="text-[11px] text-muted-foreground">
                                    <summary className="cursor-pointer">{t("dataDetails")}</summary>
                                    {activeHeatmapMeta && (
                                        <p className="mt-1 tabular-nums">{t("pixelsMeta", { pixels: activeHeatmapMeta.pixels })}{activeHeatmapMeta.mean != null ? t("meanMeta", { mean: activeHeatmapMeta.mean.toFixed(2) }) : ""}</p>
                                    )}
                                    {detailsMeta.source && (
                                        <p>{t("pixelSource", { source: t(`pixelSource${detailsMeta.source === "db_lonlat" ? "DbLonlat" : detailsMeta.source === "oss" ? "Oss" : "LegacyGrid"}`) })}</p>
                                    )}
                                    {detailsMeta.gridSpacingM && (
                                        <p>
                                            {t("gridSpacingMeta", {
                                                x: gridSpacingFormatter.format(detailsMeta.gridSpacingM.x),
                                                y: gridSpacingFormatter.format(detailsMeta.gridSpacingM.y),
                                            })}
                                        </p>
                                    )}
                                    {detailsMeta.stacItemId && (
                                        <p className="break-all">
                                            {t("stacItemMeta", { id: detailsMeta.stacItemId })}
                                        </p>
                                    )}
                                    {detailsMeta.platform && (
                                        <p>{t("s1PlatformMeta", { platform: detailsMeta.platform })}</p>
                                    )}
                                    {detailsMeta.algorithmVersion && (
                                        <p>{t("algorithmVersionMeta", { version: detailsMeta.algorithmVersion })}</p>
                                    )}
                                    {detailsMeta.processingVersion && (
                                        <p>
                                            {t("s1ProcessingVersionMeta", {
                                                version: detailsMeta.processingVersion,
                                            })}
                                        </p>
                                    )}
                                    {detailsMeta.calibrationEpoch && (
                                        <p>
                                            {detailsMeta.calibrationEpoch ===
                                            "s1c-auxcal-pre-2026-02-03"
                                                ? t("s1CalibrationEpochPre")
                                                : detailsMeta.calibrationEpoch ===
                                                    "s1c-auxcal-post-2026-02-03"
                                                  ? t("s1CalibrationEpochPost")
                                                  : t("s1CalibrationEpochUnknown")}
                                        </p>
                                    )}
                                    {detailsMeta.calibrationEpoch?.startsWith("s1c-auxcal-") && (
                                        <p>{t("s1CalibrationEpochScope")}</p>
                                    )}
                                    {detailsMeta.radiometricCalibration && (
                                        <>
                                            <p>
                                                {detailsMeta.radiometricCalibration.method === "esa_sigma_nought_lut"
                                                    ? t("radiometricCalibrationLut")
                                                    : t("radiometricCalibrationApprox", {
                                                          scale:
                                                              detailsMeta.radiometricCalibration.fallback_scale ?? "—",
                                                      })}
                                            </p>
                                            {detailsMeta.radiometricCalibration.thermal_noise_correction === "not_performed_by_this_pipeline" && (
                                                <p>{t("thermalNoiseNotApplied")}</p>
                                            )}
                                        </>
                                    )}
                                    {detailsMeta.sensor === "S1" &&
                                        !detailsMeta.radiometricCalibration && (
                                            <p>{t("radiometricCalibrationUnknown")}</p>
                                        )}
                                </details>
                            )}
                            {selectedDate && (
                                <div className="space-y-2">
                                    <div className="flex max-h-36 flex-wrap gap-2 items-center overflow-y-auto">
                                        {chipDates.map((date) => {
                                            const active = selectedDate === date;
                                            const chipCloud = active ? cloudCoverPct : cloudPctByDate[date];
                                            const chipOver30 =
                                                typeof chipCloud === "number" &&
                                                chipCloud > DROUGHT_CLOUD_MAX_PCT;
                                            const droughtCls = droughtByDate[date];
                                            const floodCls = floodByDate.get(date);
                                            return (
                                                <Button
                                                    key={date}
                                                    type="button"
                                                    size="sm"
                                                    variant={active ? "default" : "outline"}
                                                    className={cn(
                                                        "h-7 rounded-lg text-[11px] px-2 tabular-nums shrink-0 gap-1.5",
                                                        active && cloudCoverOver30 && "ring-1 ring-warning/50",
                                                    )}
                                                    onClick={() => selectDateExplicit(date)}
                                                    aria-pressed={active}
                                                >
                                                    {date.slice(5)}
                                                    {droughtCls && (
                                                        <span
                                                            className={cn(
                                                                "rounded px-0.5 text-[9px] font-medium",
                                                                droughtCls === "severe" &&
                                                                    "bg-danger-subtle text-sev-high",
                                                                droughtCls === "moderate" &&
                                                                    "bg-warning-subtle text-warning",
                                                                droughtCls === "mild" &&
                                                                    "bg-caution-subtle text-caution",
                                                            )}
                                                        >
                                                            {droughtCls === "severe"
                                                                ? t("droughtChip_severe")
                                                                : droughtCls === "moderate"
                                                                  ? t("droughtChip_moderate")
                                                                  : t("droughtChip_mild")}
                                                        </span>
                                                    )}
                                                    {floodCls && (isFloodDayClass(floodCls) || isFloodWatchClass(floodCls)) && (
                                                        <span
                                                            className={cn(
                                                                "rounded px-0.5 text-[9px] font-medium",
                                                                floodCls === "flood_severe" &&
                                                                    "bg-danger-subtle text-sev-high",
                                                                floodCls === "flood_moderate" &&
                                                                    "bg-info-subtle text-info",
                                                                floodCls === "watch" &&
                                                                    "bg-caution-subtle text-caution",
                                                            )}
                                                        >
                                                            {floodCls === "watch"
                                                                ? t("floodChip_watch")
                                                                : floodCls === "flood_severe"
                                                                  ? t("floodChip_severe")
                                                                  : t("floodChip_moderate")}
                                                        </span>
                                                    )}
                                                    {series === "flood" && floodUnclassifiedDates.has(date) && (
                                                        <span className="rounded px-0.5 text-[9px] font-medium bg-muted text-muted-foreground">
                                                            {t("floodChip_unknown")}
                                                        </span>
                                                    )}
                                                    {active && chipCloud != null && (
                                                        <span
                                                            className={cn(
                                                                "rounded px-0.5 text-[9px] font-normal tabular-nums",
                                                                chipOver30
                                                                    ? "bg-warning-subtle text-warning"
                                                                    : "bg-primary-foreground/15 text-primary-foreground",
                                                            )}
                                                        >
                                                            {Math.round(chipCloud)}%
                                                        </span>
                                                    )}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                    {allDates.length > 0 && (
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[10px] text-muted-foreground shrink-0">
                                                {t("yearDates")}
                                            </span>
                                            <Select
                                                value={selectedDate}
                                                onValueChange={(v) => selectDateExplicit(v)}
                                            >
                                                <SelectTrigger className="h-7 text-[11px] w-full max-w-[14rem]">
                                                    <SelectValue placeholder={t("selectDate")} />
                                                </SelectTrigger>
                                                <SelectContent className="max-h-72">
                                                    {allDates.map((date) => {
                                                        const cloud = cloudByDate[date];
                                                        const pct = cloud?.pct ?? null;
                                                        const droughtCls = droughtByDate[date];
                                                        const floodCls = floodByDate.get(date);
                                                        const droughtBit = droughtCls
                                                            ? ` · ${
                                                                  droughtCls === "severe"
                                                                      ? t("droughtChip_severe")
                                                                      : droughtCls === "moderate"
                                                                        ? t("droughtChip_moderate")
                                                                        : t("droughtChip_mild")
                                                              }`
                                                            : "";
                                                        const floodBit =
                                                            floodCls &&
                                                            (isFloodDayClass(floodCls) || isFloodWatchClass(floodCls))
                                                                ? ` · ${
                                                                      floodCls === "watch"
                                                                          ? t("floodChip_watch")
                                                                          : floodCls === "flood_severe"
                                                                            ? t("floodChip_severe")
                                                                            : t("floodChip_moderate")
                                                                  }`
                                                                : "";
                                                        const floodUnknownBit =
                                                            series === "flood" && floodUnclassifiedDates.has(date)
                                                                ? ` · ${t("floodChip_unknown")}`
                                                                : "";
                                                        const cloudBit =
                                                            pct != null
                                                                ? ` · ${formatCloudCoverLabel(pct, cloud?.source, t)}`
                                                                : "";
                                                        const label = `${date}${cloudBit}${droughtBit}${floodBit}${floodUnknownBit}`;
                                                        return (
                                                            <SelectItem
                                                                key={date}
                                                                value={date}
                                                                className="text-xs tabular-nums [content-visibility:auto] [contain-intrinsic-size:2rem]"
                                                            >
                                                                {label}
                                                            </SelectItem>
                                                        );
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
