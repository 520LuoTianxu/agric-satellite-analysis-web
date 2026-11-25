"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart, BarChart, ScatterChart } from "echarts/charts";
import {
    GridComponent,
    TooltipComponent,
    LegendComponent,
    MarkLineComponent,
    MarkPointComponent,
    MarkAreaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { LandStat, IndexType, WeatherDaily } from "@/lib/api";
import { INDEX_CONFIG } from "@/lib/api";
import { tokenColor } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { DECLOUD_SOURCE, isGoodDecloudQuality } from "@/lib/agri-classify";
import {
    axisLabel,
    indexBandColor,
    indexLineColor,
    legendStyle,
    secondaryValueAxis,
    sig,
    ROUNDED_LINE,
    thresholdMarkLine,
    valueAxis,
} from "./chart-base";
import { ObservationDateRail } from "./chart-date-rail";
import { snapCategoryBand, uniqueSortedDates } from "./chart-scrub";
import { ChartScrubCursor, useChartScrub } from "./chart-scrub-view";
import { clampScrubLabelX, formatIndexValue, formatObservationDate } from "./index-readout";
import { filterRealisticNdviStats } from "@/lib/ndvi-realistic-filter";

// Register only the modules we need (tree-shake friendly)
echarts.use([
    LineChart,
    BarChart,
    ScatterChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    MarkLineComponent,
    MarkPointComponent,
    MarkAreaComponent,
    CanvasRenderer,
]);

export type GrowthStageBand = {
    name: string;
    /** Inclusive start YYYY-MM-DD (or year-agnostic applied per year) */
    startMonth: number;
    startDay?: number;
    endMonth: number;
    endDay?: number;
    color?: string;
};

export type ChartEventMark = {
    date: string;
    value?: number | null;
    label: string;
    /** high = severe, medium = moderate, low = mild */
    level?: "high" | "medium" | "low";
};

interface NdviChartProps {
    stats: LandStat[];
    /** Unused decloud products (fair/bad or unused good) as marked overlays. */
    decloudAltStats?: LandStat[];
    /** Currently selected date (highlights point) */
    selectedDate?: string | null;
    /** Callback when a chart point is clicked */
    onDateSelect?: (date: string) => void;
    /** Height in pixels */
    height?: number;
    /** Which vegetation index to display */
    indexType?: IndexType;
    /** Optional weather data for overlay (precip bars + ET₀ line) */
    weatherData?: WeatherDaily[];
    /** Whether to show weather overlay (default false) */
    showWeatherOverlay?: boolean;
    /** Crop season months (1-12) — soft shade */
    seasonMonths?: number[];
    /** Peak months — stronger shade */
    peakMonths?: number[];
    /** Phenology stage bands for markArea */
    stageBands?: GrowthStageBand[];
    /** NDVI below this in peak months → treat as likely bare / uncropped */
    bareThreshold?: number;
    /** Timeline markers (e.g. historical drought days) */
    eventMarks?: ChartEventMark[];
    /** Optional caption / legend note under chart is handled by parent */
    /** Controlled "only valid observations" filter (default true when uncontrolled). */
    onlyRealistic?: boolean;
    onOnlyRealisticChange?: (value: boolean) => void;
    /** 曲线上方右侧的操作，例如切换指标。 */
    headerExtra?: React.ReactNode;
    /** 主指标的短名称，例如 NDVI。不放在切换按钮上。 */
    heroLabel?: string;
}

export default function NdviChart({
    stats,
    decloudAltStats,
    selectedDate,
    onDateSelect,
    height = 200,
    indexType = "NDVI",
    weatherData,
    showWeatherOverlay = false,
    seasonMonths,
    peakMonths,
    stageBands,
    bareThreshold = 0.25,
    eventMarks,
    onlyRealistic: onlyRealisticProp,
    onOnlyRealisticChange,
    headerExtra,
    heroLabel,
}: NdviChartProps) {
    const t = useTranslations("ndviChart");
    const locale = useLocale();
    const readoutRowRef = useRef<HTMLDivElement>(null);
    const [readoutRowWidth, setReadoutRowWidth] = useState(0);
    const [showObservations, setShowObservations] = useState(false);
    const [showEvents, setShowEvents] = useState(false);
    /** Checked = hide unrealistic / cloud-hole points (default). Uncontrolled unless parent passes props. */
    const [onlyRealisticInternal, setOnlyRealisticInternal] = useState(true);
    const onlyRealistic = onlyRealisticProp ?? onlyRealisticInternal;
    const setOnlyRealistic = (value: boolean) => {
        if (onlyRealisticProp === undefined) setOnlyRealisticInternal(value);
        onOnlyRealisticChange?.(value);
    };
    const displayStats = useMemo(
        () => (onlyRealistic ? filterRealisticNdviStats(stats, { seasonMonths, peakMonths }) : stats),
        [onlyRealistic, stats, seasonMonths, peakMonths],
    );
    const axisDates = useMemo(
        () => uniqueSortedDates([
            ...displayStats.map((point) => point.date),
            ...(showObservations ? (decloudAltStats ?? []).map((point) => point.date) : []),
        ]),
        [displayStats, decloudAltStats, showObservations],
    );
    const onDateSelectRef = useRef(onDateSelect);
    onDateSelectRef.current = onDateSelect;
    const scrub = useChartScrub(
        () => axisDates,
        (date) => onDateSelectRef.current?.(date),
    );
    useEffect(() => {
        const row = readoutRowRef.current;
        if (!row) return;
        const measure = () => setReadoutRowWidth(row.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        return () => observer.disconnect();
    }, [stats.length]);
    const config = INDEX_CONFIG[indexType];
    const seriesName = config.label;
    const isSar = indexType === "VV" || indexType === "VH";
    const dataVals = displayStats
        .map((s) => s.mean)
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    let yMin = config.rescaleMin;
    let yMax = config.rescaleMax + 0.1;
    if (isSar && dataVals.length > 0) {
        const dMin = Math.min(...dataVals);
        const dMax = Math.max(...dataVals);
        const pad = Math.max(1, (dMax - dMin) * 0.15 || 2);
        yMin = Math.min(config.rescaleMin, dMin - pad);
        yMax = Math.max(config.rescaleMax, dMax + pad);
    }


    // Weather data sorted by date for overlay
    const weatherSorted = useMemo(() => {
        if (!weatherData || !showWeatherOverlay || weatherData.length === 0) return null;
        return [...weatherData].sort((a, b) => a.date.localeCompare(b.date));
    }, [weatherData, showWeatherOverlay]);

    const option = useMemo(() => {
        // NDVI data as [date, value] pairs for time axis (optionally filtered)
        const bandLowData = displayStats.map((s) => [s.date, s.p10 ?? null] as [string, number | null]);
        const bandHighData = displayStats.map((s) => {
            const p90 = s.p90 ?? null;
            const p10 = s.p10 ?? null;
            return [s.date, p90 != null && p10 != null ? p90 - p10 : null] as [string, number | null];
        });
        const ndviData = displayStats.map((s) => {
            const d = s.date;
            const v = s.mean ?? null;
            const m = Number(String(d).slice(5, 7));
            const inSeason = !seasonMonths?.length || seasonMonths.includes(m);
            const inPeak = !!peakMonths?.length && peakMonths.includes(m);
            const bare = !isSar && inPeak && typeof v === "number" && v < bareThreshold;
            let color = indexLineColor(indexType);
            let opacity = 1;
            let symbolSize = isSar && displayStats.length <= 3 ? 8 : 4;
            if (d === selectedDate) {
                color = tokenColor("--danger");
                symbolSize = 8;
            } else if (s.may_be_unreliable) {
                color = tokenColor("--warning");
                opacity = 0.85;
                symbolSize = 5;
            } else if (bare) {
                color = tokenColor("--muted-foreground");
                opacity = 0.6;
                symbolSize = 4;
            } else if (!inSeason && !isSar) {
                color = tokenColor("--muted-foreground");
                opacity = 0.45;
            }
            return {
                value: [d, v] as [string, number | null],
                itemStyle: { color, opacity },
                symbol: s.may_be_unreliable ? "diamond" : "circle",
                symbolSize,
                cloudCover: s.cloud_cover ?? null,
                qualityScore: s.quality_score ?? null,
                qualityScoreMethod: s.quality_score_method ?? null,
                decloudQuality: s.decloud_quality ?? null,
                decloudReasons: s.decloud_reasons ?? [],
                productSource: s.product_source ?? null,
                sceneId: s.scene_id ?? null,
                mayBeUnreliable: Boolean(s.may_be_unreliable),
            };
        });
        const altName = t("decloudAltSeries");
        const altData = (decloudAltStats ?? []).map((s) => {
            const unreliable = s.may_be_unreliable || !isGoodDecloudQuality(s.decloud_quality);
            return {
                value: [s.date, s.mean ?? null] as [string, number | null],
                itemStyle: {
                    color: tokenColor(unreliable ? "--warning" : "--caution"),
                    opacity: 0.9,
                },
                symbol: "diamond",
                symbolSize: s.date === selectedDate ? 9 : 5,
                cloudCover: s.cloud_cover ?? null,
                qualityScore: s.quality_score ?? null,
                qualityScoreMethod: s.quality_score_method ?? null,
                decloudQuality: s.decloud_quality ?? null,
                decloudReasons: s.decloud_reasons ?? [],
                productSource: s.product_source ?? null,
                sceneId: s.scene_id ?? null,
                mayBeUnreliable: Boolean(unreliable),
            };
        });

        // 气象叠加只画在已有遥感观测的日期上，避免把没有影像的日历日铺进时间轴。
        const hasWeather = !!weatherSorted && weatherSorted.length > 0;
        const axisDateSet = new Set(axisDates);
        const precipData = weatherSorted
            ? weatherSorted
                .filter((w) => axisDateSet.has(w.date))
                .map((w) => [w.date, w.precipitation_sum ?? 0] as [string, number])
            : [];
        const et0Data = weatherSorted
            ? weatherSorted
                .filter((w) => axisDateSet.has(w.date))
                .map((w) => [w.date, w.et0_fao_mm ?? 0] as [string, number])
            : [];

        const years = Array.from(
            new Set(displayStats.map((s) => Number(String(s.date).slice(0, 4))).filter((y) => Number.isFinite(y))),
        ).sort();

        const pad2 = (n: number) => String(n).padStart(2, "0");
        const markAreaData: any[] = [];
        if (stageBands?.length && years.length) {
            const bandColors = ["rgba(216,243,220,0.35)", "rgba(22,163,74,0.09)", "rgba(82,183,136,0.22)", "rgba(244,162,97,0.18)"];
            years.forEach((y) => {
                stageBands.forEach((b, i) => {
                    const sd = b.startDay ?? 1;
                    const ed = b.endDay ?? 28;
                    markAreaData.push([
                        {
                            name: years.length <= 2 ? b.name : undefined,
                            xAxis: `${y}-${pad2(b.startMonth)}-${pad2(sd)}`,
                            itemStyle: { color: b.color || bandColors[i % bandColors.length] },
                        },
                        { xAxis: `${y}-${pad2(b.endMonth)}-${pad2(ed)}` },
                    ]);
                });
            });
        } else if (seasonMonths?.length && years.length) {
            years.forEach((y) => {
                const sm = Math.min(...seasonMonths);
                const em = Math.max(...seasonMonths);
                markAreaData.push([
                    {
                        name: years.length <= 2 ? "生育期" : undefined,
                        xAxis: `${y}-${pad2(sm)}-01`,
                        itemStyle: { color: "rgba(22,163,74,0.06)" },
                    },
                    { xAxis: `${y}-${pad2(em)}-28` },
                ]);
                if (peakMonths?.length) {
                    const ps = Math.min(...peakMonths);
                    const pe = Math.max(...peakMonths);
                    markAreaData.push([
                        {
                            name: years.length <= 2 ? "旺长期" : undefined,
                            xAxis: `${y}-${pad2(ps)}-01`,
                            itemStyle: { color: "rgba(22,163,74,0.09)" },
                        },
                        { xAxis: `${y}-${pad2(pe)}-28` },
                    ]);
                }
            });
        }
        const snappedMarkArea = markAreaData.flatMap((pair) => {
            const start = pair[0]?.xAxis;
            const end = pair[1]?.xAxis;
            if (typeof start !== "string" || typeof end !== "string") return [];
            const band = snapCategoryBand(axisDates, start, end);
            if (!band) return [];
            return [[{ ...pair[0], xAxis: band[0] }, { ...pair[1], xAxis: band[1] }]];
        });
        const markAreaOption = snappedMarkArea.length
            ? { silent: true, label: { show: true, position: "insideTop", fontSize: 10, color: tokenColor("--muted-foreground") }, data: snappedMarkArea }
            : undefined;

        const valueByDate = new Map(displayStats.map((s) => [s.date, s.mean]));
        // 默认仅突出选中日期；风险标记按日期去重并按需显示，避免大量图钉遮住趋势。
        const visibleMarks = showEvents
            ? [...new Map((eventMarks ?? []).filter((m) => m.date !== selectedDate).map((m) => [m.date, m])).values()]
            : [];
        const selectedValue = selectedDate ? valueByDate.get(selectedDate) : null;
        const markPointOption = {
            symbol: "circle",
            symbolSize: 6,
            label: { show: false },
            data: [
                ...visibleMarks.flatMap((m) => {
                    const value = m.value ?? valueByDate.get(m.date);
                    if (value == null || !Number.isFinite(value)) return [];
                    return [{
                        name: m.label,
                        coord: [m.date, value],
                        itemStyle: { color: tokenColor(m.level === "high" ? "--sev-high" : m.level === "medium" ? "--sev-medium" : "--sev-low") },
                    }];
                }),
                ...(selectedDate && selectedValue != null && Number.isFinite(selectedValue) ? [{
                    name: t("pointLegendSelected"),
                    coord: [selectedDate, selectedValue],
                    symbolSize: 8,
                    itemStyle: { color: tokenColor("--danger"), borderColor: tokenColor("--background"), borderWidth: 2 },
                }] : []),
            ],
        };

        const hasAlt = showObservations && altData.length > 0;
        const showLegend = hasWeather || hasAlt;
        const legendData = [
            seriesName,
            ...(hasAlt ? [altName] : []),
            ...(hasWeather ? ["Precip (mm)", "ET₀ (mm)"] : []),
        ];
        return {
            grid: { top: showLegend ? 28 : 8, right: hasWeather ? 46 : 8, bottom: 4, left: 40 },
            legend: showLegend
                ? {
                    data: legendData,
                    type: "scroll",
                    left: 8,
                    right: 8,
                    top: 0,
                    ...legendStyle(),
                }
                : undefined,
            tooltip: { show: false },
            axisPointer: { show: false },
            xAxis: {
                type: "category" as const,
                data: axisDates,
                boundaryGap: true,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { show: false },
            },
            yAxis: hasWeather
                ? [
                    valueAxis({ min: yMin, max: yMax }),
                    secondaryValueAxis({ name: "mm", nameTextStyle: axisLabel() }),
                ]
                : valueAxis({ min: yMin, max: yMax }),
            series: [
                // p10 band (invisible base)
                {
                    name: "p10",
                    type: "line",
                    data: bandLowData,
                    stack: "band",
                    ...ROUNDED_LINE,
                    lineStyle: { opacity: 0 },
                    symbol: "none",
                    areaStyle: { opacity: 0 },
                    emphasis: { disabled: true },
                },
                // p90 band (visible range area)
                {
                    name: "p90",
                    type: "line",
                    data: bandHighData,
                    stack: "band",
                    ...ROUNDED_LINE,
                    lineStyle: { opacity: 0 },
                    symbol: "none",
                    areaStyle: {
                        color: indexBandColor(indexType),
                    },
                    emphasis: { disabled: true },
                },
                // Mean line (dim off-season / bare peak points)
                {
                    name: seriesName,
                    type: "line",
                    data: ndviData,
                    ...ROUNDED_LINE,
                    connectNulls: false,
                    itemStyle: { color: indexLineColor(indexType) },
                    lineStyle: { color: indexLineColor(indexType), width: 2.8, cap: "round" as const, join: "round" as const },
                    showSymbol: showObservations || displayStats.length <= 3,
                    // Do not LTTB-sample agri timeseries: downsampling on a time axis can
                    // drop/misrender the recent tail (e.g. hide 2026 points).
                    markLine: {
                        silent: true,
                        symbol: ["none", "none"],
                        data: [thresholdMarkLine(config.threshold, t("threshold"), "insideEndTop")],
                    },
                    markArea: markAreaOption,
                    markPoint: markPointOption,
                },
                ...(hasAlt
                    ? [
                        {
                            name: altName,
                            type: "scatter",
                            data: altData,
                            z: 5,
                            symbol: "diamond",
                            itemStyle: { color: tokenColor("--warning") },
                            tooltip: { trigger: "item" as const },
                        },
                    ]
                    : []),
                // Weather overlay: daily precipitation bars on actual dates
                ...(hasWeather
                    ? [
                        {
                            name: "Precip (mm)",
                            type: "bar",
                            yAxisIndex: 1,
                            data: precipData,
                            barMaxWidth: 6,
                            itemStyle: { color: sig("precip", 0.45) },
                            emphasis: { itemStyle: { color: sig("precip", 0.8) } },
                        },
                        {
                            name: "ET₀ (mm)",
                            type: "line",
                            yAxisIndex: 1,
                            data: et0Data,
                            ...ROUNDED_LINE,
                            symbol: "none",
                            lineStyle: { color: sig("et0"), width: 2.2, type: "dashed" as const, cap: "round" as const },
                            itemStyle: { color: sig("et0") },
                        },
                    ]
                    : []),
            ],
        };
    }, [axisDates, displayStats, decloudAltStats, selectedDate, config, seriesName, weatherSorted, indexType, yMin, yMax, isSar, seasonMonths, peakMonths, stageBands, bareThreshold, eventMarks, showObservations, showEvents, t]);

    if (stats.length === 0) {
        return (
            <div className="w-full space-y-2">
                {headerExtra ? <div className="flex justify-end">{headerExtra}</div> : null}
                <div
                    className="flex items-center justify-center text-xs text-muted-foreground"
                    style={{ height }}
                >
                    {t("empty", { index: config.label })}
                </div>
            </div>
        );
    }

    const lineColor = indexLineColor(indexType);
    const grayColor = tokenColor("--muted-foreground");
    const yellowColor = tokenColor("--warning");
    const redColor = tokenColor("--danger");

    const focusDate = scrub.activeDate ?? selectedDate ?? null;
    const focusPoint = focusDate
        ? displayStats.find((point) => point.date === focusDate)
            ?? (showObservations ? decloudAltStats?.find((point) => point.date === focusDate) : undefined)
        : undefined;
    const focusMean = focusPoint && typeof focusPoint.mean === "number" && Number.isFinite(focusPoint.mean)
        ? focusPoint.mean
        : null;
    const focusText = focusMean == null ? "—" : formatIndexValue(focusMean, isSar);
    const focusCloudText = typeof focusPoint?.cloud_cover === "number" && Number.isFinite(focusPoint.cloud_cover)
        ? t("cloud", { percent: Math.round(focusPoint.cloud_cover) })
        : t("cloudNA");
    const focusDateLabel = focusDate ? formatObservationDate(focusDate, locale) : t("scrubHint");

    return (
        <div className="w-full">
            <div className="relative">
                <div>
                    <div className="flex flex-col gap-2">
                        <div className={cn(scrub.scrubbing && "invisible")} aria-hidden={scrub.scrubbing || undefined}>
                            <ObservationDateRail
                                dates={axisDates}
                                activeDate={focusDate}
                                label={t("observationDates")}
                                onSelect={onDateSelect}
                            />
                        </div>
                        <p className={cn(
                            "text-center text-sm leading-none text-muted-foreground",
                            scrub.scrubbing && "font-medium text-foreground",
                        )}>
                            {focusDateLabel}
                        </p>
                    </div>
                    <div ref={readoutRowRef} className="relative mt-2 h-[54px]">
                        {scrub.scrubbing ? (
                            <div
                                className="absolute top-0 z-20 -translate-x-1/2 text-center"
                                style={{ left: clampScrubLabelX(scrub.cursorX ?? 0, readoutRowWidth, 60) }}
                            >
                                <HeroValue text={focusText} suffix={heroLabel} />
                                <p className="mt-0.5 text-xs leading-none text-muted-foreground">
                                    {focusCloudText}
                                </p>
                            </div>
                        ) : (
                            <div className="flex h-full items-center">
                                <div className="pl-3">
                                    <HeroValue text={focusText} suffix={heroLabel} />
                                    <p className="mt-0.5 text-xs leading-none text-muted-foreground">
                                        {focusCloudText}
                                    </p>
                                </div>
                                {headerExtra ? <div className="ml-auto self-center">{headerExtra}</div> : null}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div
                className="relative select-none"
                style={{ WebkitTouchCallout: "none" }}
                aria-label={t("scrubHint")}
                onContextMenu={(event) => event.preventDefault()}
            >
                <ChartScrubCursor x={scrub.cursorX} />
                <ReactEChartsCore
                    echarts={echarts}
                    option={option}
                    style={{ height, width: "100%", touchAction: "pan-y" }}
                    onChartReady={scrub.onChartReady}
                    notMerge
                    lazyUpdate
                />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" className="accent-primary" checked={showObservations} onChange={(e) => setShowObservations(e.target.checked)} />
                    {t("showObservations")}
                </label>
                {!!eventMarks?.length && <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" className="accent-primary" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />
                    {t("showEvents")}
                </label>}
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" className="accent-primary" checked={onlyRealistic} onChange={(e) => setOnlyRealistic(e.target.checked)} />
                    {t("onlyRealistic")}
                </label>
            </div>
            {!isSar ? (
                <details className="rounded-lg bg-muted/35 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer text-[11px] font-medium">
                        {t("pointLegendTitle")}
                    </summary>
                    <ul className="mt-2 grid gap-1.5 text-[11px] text-muted-foreground leading-relaxed">
                        <li className="flex items-start gap-1.5">
                            <span
                                className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: lineColor }}
                                aria-hidden
                            />
                            <span>{t("pointLegendGreen")}</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span
                                className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full opacity-60"
                                style={{ backgroundColor: grayColor }}
                                aria-hidden
                            />
                            <span>{t("pointLegendGray")}</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span
                                className="mt-0.5 h-2.5 w-2.5 shrink-0 rotate-45"
                                style={{ backgroundColor: yellowColor }}
                                aria-hidden
                            />
                            <span>{t("pointLegendYellow")}</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span
                                className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: redColor }}
                                aria-hidden
                            />
                            <span>{t("pointLegendSelected")}</span>
                        </li>
                    </ul>
                </details>
            ) : null}
        </div>
    );
}

function HeroValue({ text, suffix }: { text: string; suffix?: string }) {
    return (
        <span className="inline-flex items-baseline text-foreground">
            <span className="text-[2.5rem] font-semibold leading-none tabular-nums tracking-tight">{text}</span>
            {suffix ? <span className="ml-1 text-sm font-medium text-muted-foreground">{suffix}</span> : null}
        </span>
    );
}

const DECLOUD_REASON_KEYS = new Set([
    "rgb_still_bright",
    "rgb_bright",
    "tiny_rgb_delta",
    "spatial_std_collapse",
    "spatial_std_low",
    "ndvi_far_below_neighbors",
    "ndvi_below_neighbors",
    "no_valid_parcel_pixels",
    "non_finite_reconstruction",
]);

const TOOLTIP_HTML_ESCAPE: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

function escapeTooltipHtml(value: unknown): string {
    return String(value ?? "").replace(/[&<>\"']/g, (character) => TOOLTIP_HTML_ESCAPE[character]);
}

export function formatCloudLine(
    cloudCover: number | null | undefined,
    t: (key: string, values?: Record<string, string | number>) => string,
): string {
    if (typeof cloudCover === "number" && Number.isFinite(cloudCover)) {
        return t("cloud", { percent: Math.round(cloudCover) });
    }
    return t("cloudNA");
}

export function formatDecloudLine(
    info: {
        quality?: string | null;
        reasons?: string[] | null;
        source?: string | null;
        sceneId?: string | null;
        cloudCover?: number | null;
    },
    t: (key: string, values?: Record<string, string | number>) => string,
): string {
    const isDecloud =
        info.source === DECLOUD_SOURCE ||
        (typeof info.sceneId === "string" && info.sceneId.endsWith("_decloud"));
    const reasonText = (info.reasons ?? [])
        .map((r) => (DECLOUD_REASON_KEYS.has(r) ? t(`reason_${r}`) : escapeTooltipHtml(r)))
        .filter(Boolean)
        .join("; ");
    if (isDecloud) {
        const q = (info.quality || "").toLowerCase();
        if (q === "good") return t("decloudGood");
        if (q === "fair") return t("decloudFair", { reason: reasonText || t("reasonUnknown") });
        if (q === "bad") return t("decloudBad", { reason: reasonText || t("reasonUnknown") });
        return t("decloudUnreliable", { reason: reasonText || t("reasonUnknown") });
    }
    if (typeof info.cloudCover === "number" && Number.isFinite(info.cloudCover) && info.cloudCover > 30) {
        return t("decloudNone");
    }
    if (typeof info.cloudCover === "number" && Number.isFinite(info.cloudCover)) {
        return t("decloudClear");
    }
    return t("decloudNA");
}
