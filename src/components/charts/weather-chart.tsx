"use client";

import React, { useEffect, useMemo, useRef } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
    GridComponent,
    TooltipComponent,
    DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { WeatherDaily } from "@/lib/api";
import { useTranslations } from "next-intl";
import { axisLabel, ROUNDED_LINE, sig, secondaryValueAxis, valueAxis } from "./chart-base";
import { datesInPercentWindow } from "./chart-scrub";
import { ChartScrubCursor, ChartScrubReadout, useChartScrub } from "./chart-scrub-view";

echarts.use([
    LineChart,
    BarChart,
    GridComponent,
    TooltipComponent,
    DataZoomComponent,
    CanvasRenderer,
]);

interface WeatherChartProps {
    data: WeatherDaily[];
    height?: number;
}

function dailyMean(day: WeatherDaily): number | null {
    if (day.temperature_2m_mean != null && Number.isFinite(day.temperature_2m_mean)) return day.temperature_2m_mean;
    if (day.temperature_2m_min != null && day.temperature_2m_max != null) {
        return (day.temperature_2m_min + day.temperature_2m_max) / 2;
    }
    return null;
}

export default function WeatherChart({ data, height = 220 }: WeatherChartProps) {
    const t = useTranslations("weather");
    const dates = useMemo(() => data.map((day) => day.date), [data]);
    const zoomRef = useRef({ start: 0, end: 100 });
    const windowDefault = useMemo(() => {
        if (data.length <= 45) return { start: 0, end: 100 };
        return { start: Math.max(0, ((data.length - 45) / data.length) * 100), end: 100 };
    }, [data.length]);

    useEffect(() => {
        zoomRef.current = windowDefault;
    }, [windowDefault]);

    const scrub = useChartScrub(() => datesInPercentWindow(dates, zoomRef.current.start, zoomRef.current.end));

    const option = useMemo(() => {
        const tempMin = data.map((day) => day.temperature_2m_min);
        const tempMax = data.map((day) => day.temperature_2m_max);
        const mean = data.map((day) => dailyMean(day));
        const precip = data.map((day) => day.precipitation_sum);
        const many = data.length > 45;
        const tempColor = sig("temp");

        return {
            grid: { top: 32, right: 42, bottom: many ? 36 : 16, left: 36 },
            tooltip: { show: false },
            axisPointer: { show: false },
            xAxis: {
                type: "category" as const,
                data: dates,
                position: "top" as const,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: axisLabel({
                    hideOverlap: true,
                    formatter: (value: string) => value.slice(5),
                }),
            },
            yAxis: [
                valueAxis({ name: "°C", nameTextStyle: axisLabel() }),
                secondaryValueAxis({ name: "mm", nameTextStyle: axisLabel() }),
            ],
            dataZoom: many
                ? [{
                    type: "slider" as const,
                    start: windowDefault.start,
                    end: windowDefault.end,
                    bottom: 6,
                    height: 16,
                    showDetail: false,
                    brushSelect: false,
                    borderColor: "transparent",
                    backgroundColor: "rgba(14,165,233,0.06)",
                    fillerColor: "rgba(14,165,233,0.16)",
                }]
                : undefined,
            series: [
                {
                    name: "tempBase",
                    type: "line",
                    data: tempMin,
                    stack: "temp",
                    ...ROUNDED_LINE,
                    lineStyle: { opacity: 0 },
                    symbol: "none",
                    areaStyle: { opacity: 0 },
                    emphasis: { disabled: true },
                    tooltip: { show: false },
                },
                {
                    name: t("tempRange"),
                    type: "line",
                    data: tempMax.map((max, index) => {
                        const min = tempMin[index];
                        if (max == null || min == null) return null;
                        return max - min;
                    }),
                    stack: "temp",
                    ...ROUNDED_LINE,
                    lineStyle: { opacity: 0 },
                    symbol: "none",
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: sig("temp", 0.38) },
                            { offset: 1, color: sig("temp", 0.08) },
                        ]),
                    },
                    emphasis: { disabled: true },
                },
                {
                    name: t("temperature"),
                    type: "line",
                    data: mean,
                    ...ROUNDED_LINE,
                    symbol: "none",
                    lineStyle: { color: tempColor, width: 3, cap: "round", join: "round" },
                    itemStyle: { color: tempColor },
                    z: 3,
                },
                {
                    name: t("precipitation"),
                    type: "bar",
                    yAxisIndex: 1,
                    data: precip,
                    barMaxWidth: 7,
                    itemStyle: { color: sig("precip", 0.72), borderRadius: [3, 3, 0, 0] },
                },
            ],
        };
    }, [data, dates, t, windowDefault.end, windowDefault.start]);

    if (data.length === 0) {
        return (
            <div
                className="flex items-center justify-center text-xs text-muted-foreground"
                style={{ height }}
            >
                {t("noData")}
            </div>
        );
    }

    const active = scrub.activeDate ? data.find((day) => day.date === scrub.activeDate) : undefined;
    const lines: string[] = [];
    if (active?.temperature_2m_min != null && active.temperature_2m_max != null) {
        lines.push(`${t("temperature")}: ${active.temperature_2m_min.toFixed(1)}° – ${active.temperature_2m_max.toFixed(1)}°C`);
    }
    if (active?.precipitation_sum != null) {
        lines.push(`${t("precipitation")}: ${active.precipitation_sum.toFixed(1)} mm`);
    }

    return (
        <div className="w-full">
            <ChartScrubReadout
                active={scrub.scrubbing}
                hint={t("scrubHint")}
                title={scrub.activeDate}
                lines={lines}
            />
            <div
                className="relative select-none"
                style={{ WebkitTouchCallout: "none" }}
                onContextMenu={(event) => event.preventDefault()}
            >
                <ChartScrubCursor x={scrub.cursorX} />
                <ReactEChartsCore
                    echarts={echarts}
                    option={option}
                    style={{ height, width: "100%", touchAction: "pan-y" }}
                    onChartReady={scrub.onChartReady}
                    onEvents={{
                        datazoom: (event: { start?: number; end?: number; batch?: { start?: number; end?: number }[] }) => {
                            const value = event.batch?.[0] ?? event;
                            if (typeof value.start === "number" && typeof value.end === "number") {
                                zoomRef.current = { start: value.start, end: value.end };
                            }
                        },
                    }}
                    notMerge
                    lazyUpdate
                />
            </div>
        </div>
    );
}
