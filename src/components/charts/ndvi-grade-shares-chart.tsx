"use client";

import React, { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatObservationDate } from "./index-readout";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { axisLabel, legendStyle, ROUNDED_LINE, secondaryValueAxis, valueAxis } from "./chart-base";
import { ChartScrubCursor, useChartScrub } from "./chart-scrub-view";

echarts.use([
    BarChart,
    LineChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
    CanvasRenderer,
]);

/** Day/area 长势等级 — 图一 bands (not 优≥0.7). */
export type NdviDayGrade = "红" | "橙" | "黄" | "绿";

export const NDVI_DAY_GRADE_ORDER: NdviDayGrade[] = ["红", "橙", "黄", "绿"];

export const NDVI_DAY_GRADE_COLORS: Record<NdviDayGrade, string> = {
    红: "#e53935",
    橙: "#fb8c00",
    黄: "#fdd835",
    绿: "#43a047",
};

export const NDVI_DAY_GRADE_RULE_ZH = "红<0.25 / 橙0.25–0.35 / 黄0.35–0.50 / 绿≥0.50";

export type DayGradeShare = {
    counts: Record<NdviDayGrade, number>;
    pct: Record<NdviDayGrade, number>;
    n: number;
    mean: number | null;
};

export function classifyNdviDayGrade(v: number): NdviDayGrade {
    if (v >= 0.5) return "绿";
    if (v >= 0.35) return "黄";
    if (v >= 0.25) return "橙";
    return "红";
}

/** Prefer clear pixels when any clear=1 exists (matches 色斑 rasterize). */
export function computePixelNdviGradeShares(
    pixels: Array<{ clear?: number; NDVI?: number; ndvi?: number; [k: string]: unknown }>,
): DayGradeShare | null {
    if (!pixels?.length) return null;
    const anyClear = pixels.some((p) => Number(p.clear) === 1);
    const counts: Record<NdviDayGrade, number> = { 红: 0, 橙: 0, 黄: 0, 绿: 0 };
    let sum = 0;
    let n = 0;
    for (const p of pixels) {
        if (anyClear && Number(p.clear) === 0) continue;
        const raw = p.NDVI ?? p.ndvi;
        const v = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(v)) continue;
        counts[classifyNdviDayGrade(v)] += 1;
        sum += v;
        n += 1;
    }
    if (!n) return null;
    const pct = Object.fromEntries(
        NDVI_DAY_GRADE_ORDER.map((k) => [k, Math.round((counts[k] * 1000) / n) / 10]),
    ) as Record<NdviDayGrade, number>;
    return { counts, pct, n, mean: sum / n };
}

interface NdviGradeSharesChartProps {
    selectedShare: DayGradeShare | null;
    historyByDate: Record<string, DayGradeShare>;
    meanByDate?: Record<string, number | null | undefined>;
    selectedDate: string | null;
    onDateSelect: (date: string) => void;
}

export default function NdviGradeSharesChart({
    selectedShare,
    historyByDate,
    meanByDate,
    selectedDate,
    onDateSelect,
}: NdviGradeSharesChartProps) {
    const t = useTranslations("agriPanel");
    const locale = useLocale();
    const gradeLabels = useMemo<Record<NdviDayGrade, string>>(() => ({
        红: t("gradeRed"),
        橙: t("gradeOrange"),
        黄: t("gradeYellow"),
        绿: t("gradeGreen"),
    }), [t]);
    const meanLabel = t("meanNdvi");
    const historyDates = useMemo(
        () => Object.keys(historyByDate).sort((a, b) => a.localeCompare(b)),
        [historyByDate],
    );
    const scrub = useChartScrub(() => historyDates, onDateSelect);

    const stackedOption = useMemo(() => {
        const dates = historyDates;
        const series = NDVI_DAY_GRADE_ORDER.map((g) => ({
            name: gradeLabels[g],
            type: "bar" as const,
            stack: "grade",
            barMaxWidth: 36,
            barCategoryGap: "28%",
            itemStyle: { color: NDVI_DAY_GRADE_COLORS[g] },
            emphasis: { focus: "series" as const },
            data: dates.map((d) => historyByDate[d]?.pct[g] ?? 0),
        }));
        const means = dates.map((d) => {
            const fromShare = historyByDate[d]?.mean;
            if (fromShare != null && Number.isFinite(fromShare)) return +fromShare.toFixed(3);
            const alt = meanByDate?.[d];
            return alt != null && Number.isFinite(alt) ? +Number(alt).toFixed(3) : null;
        });

        // Default zoom: last ~12 months of categories, or last ~30 points if sparse.
        const n = dates.length;
        let zoomStart = 0;
        const zoomEnd = 100;
        if (n > 12) {
            const lastMs = Date.parse(dates[n - 1]);
            let startIdx = Math.max(0, n - 30); // sparse fallback
            if (Number.isFinite(lastMs)) {
                const cutoff = lastMs - 365 * 24 * 60 * 60 * 1000;
                const byYear = dates.findIndex((d) => {
                    const ms = Date.parse(d);
                    return Number.isFinite(ms) && ms >= cutoff;
                });
                // Prefer calendar year when it meaningfully narrows the view.
                if (byYear > 0) startIdx = byYear;
                else if (byYear === 0) startIdx = 0; // span <= ~1y → full view
            }
            zoomStart = startIdx <= 0 ? 0 : (startIdx / n) * 100;
        }
        const needSlider = n > 12 && zoomStart > 0;
        const dataZoom = [
            {
                type: "inside" as const,
                start: zoomStart,
                end: zoomEnd,
                xAxisIndex: 0,
                zoomOnMouseWheel: false,
                moveOnMouseMove: false,
                moveOnMouseWheel: false,
            },
            ...(needSlider
                ? [
                      {
                          type: "slider" as const,
                          start: zoomStart,
                          end: zoomEnd,
                          height: 18,
                          bottom: 4,
                          xAxisIndex: 0,
                      },
                  ]
                : []),
        ];

        return {
            animation: false,
            grid: { top: 36, right: 52, bottom: needSlider ? 56 : 36, left: 44 },
            legend: {
                data: [...NDVI_DAY_GRADE_ORDER.map((grade) => gradeLabels[grade]), meanLabel],
                top: 0,
                ...legendStyle(),
            },
            tooltip: { show: false },
            axisPointer: { show: false },
            dataZoom,
            xAxis: {
                type: "category" as const,
                data: dates,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: axisLabel({
                    hideOverlap: true,
                    formatter: (value: string) => value.slice(5),
                }),
            },
            yAxis: [
                valueAxis({
                    name: "%",
                    min: 0,
                    max: 100,
                    nameTextStyle: axisLabel(),
                }),
                secondaryValueAxis({
                    name: "NDVI",
                    min: 0,
                    max: 1,
                    nameTextStyle: axisLabel(),
                }),
            ],
            series: [
                ...series,
                {
                    name: meanLabel,
                    type: "line",
                    yAxisIndex: 1,
                    data: means,
                    ...ROUNDED_LINE,
                    symbol: "circle",
                    symbolSize: 6,
                    lineStyle: { width: 2.8, color: "#1e88e5", cap: "round", join: "round" },
                    itemStyle: { color: "#1e88e5" },
                    z: 10,
                },
            ],
        };
    }, [historyDates, historyByDate, meanByDate, gradeLabels, meanLabel]);

    // 拖动时显示指针所在日期，松手后与上方曲线及地图共用同一个选中日期。
    const date = scrub.activeDate ?? selectedDate ?? historyDates[historyDates.length - 1];
    const share = scrub.activeDate
        ? historyByDate[scrub.activeDate]
        : selectedDate ? selectedShare : historyByDate[date];
    const mean = share?.mean ?? meanByDate?.[date];

    return (
        <div className="min-w-0 space-y-2">
            {date && (
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs">
                    <time dateTime={date} className="font-medium">{formatObservationDate(date, locale)}</time>
                    {share && mean != null && Number.isFinite(mean) && (
                        <span className="tabular-nums text-muted-foreground">{meanLabel} <strong className="font-semibold text-foreground">{mean.toFixed(2)}</strong></span>
                    )}
                </div>
            )}
            {share ? (
                <dl className="grid grid-cols-4 gap-x-1 rounded-lg bg-background/70 px-1 py-2 text-center">
                    {NDVI_DAY_GRADE_ORDER.map((grade) => (
                        <div key={grade} className="min-w-0">
                            <dt className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: NDVI_DAY_GRADE_COLORS[grade] }} />
                                {gradeLabels[grade]}
                            </dt>
                            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{share.pct[grade]}%</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className="px-1 py-2 text-sm text-muted-foreground">{t("gradeNoPixelsToday")}</p>
            )}
            {historyDates.length >= 2 && (
                <div>
                    <p className="text-[11px] text-muted-foreground">{t("scrubHint")}</p>
                    <div
                        className="relative select-none"
                        style={{ WebkitTouchCallout: "none" }}
                        onContextMenu={(event) => event.preventDefault()}
                    >
                        <ChartScrubCursor x={scrub.cursorX} />
                        <ReactEChartsCore
                            echarts={echarts}
                            option={stackedOption}
                            style={{ height: 250, width: "100%", touchAction: "pan-y" }}
                            onChartReady={scrub.onChartReady}
                            notMerge
                            lazyUpdate
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
