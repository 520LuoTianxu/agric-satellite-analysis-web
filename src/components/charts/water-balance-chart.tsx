"use client";

import React, { useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
    GridComponent,
    TooltipComponent,
    MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { WeatherDaily } from "@/lib/api";
import { useTranslations } from "next-intl";
import { axisLabel, ROUNDED_LINE, sig, thresholdMarkLine, valueAxis } from "./chart-base";
import { ChartScrubCursor, ChartScrubReadout, useChartScrub } from "./chart-scrub-view";

echarts.use([
    LineChart,
    GridComponent,
    TooltipComponent,
    MarkLineComponent,
    CanvasRenderer,
]);

interface WaterBalanceChartProps {
    data: WeatherDaily[];
    height?: number;
}

export default function WaterBalanceChart({ data, height = 200 }: WaterBalanceChartProps) {
    const t = useTranslations("weather");
    const dates = useMemo(() => data.map((day) => day.date), [data]);
    const scrub = useChartScrub(() => dates);

    const option = useMemo(() => {
        const et0 = data.map((d) => d.et0_fao_mm);
        const balance = data.map((d) => d.water_balance_30d_mm);

        return {
            grid: { top: 32, right: 12, bottom: 16, left: 42 },
            tooltip: { show: false },
            axisPointer: { show: false },
            xAxis: {
                type: "category" as const,
                data: dates,
                position: "top" as const,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: axisLabel({ hideOverlap: true, formatter: (value: string) => value.slice(5) }),
            },
            yAxis: valueAxis({ name: "mm", nameTextStyle: axisLabel() }),
            series: [
                {
                    name: t("et0"),
                    type: "line",
                    data: et0,
                    ...ROUNDED_LINE,
                    symbol: "none",
                    lineStyle: { color: sig("et0"), width: 2.4, cap: "round", join: "round" },
                    itemStyle: { color: sig("et0") },
                },
                {
                    name: t("waterBalance30d"),
                    type: "line",
                    data: balance,
                    ...ROUNDED_LINE,
                    symbol: "none",
                    lineStyle: { color: sig("water"), width: 2.8, cap: "round", join: "round" },
                    itemStyle: { color: sig("water") },
                    symbolSize: 3,
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: sig("water", 0.12) },
                            { offset: 1, color: sig("water", 0) },
                        ]),
                    },
                    markLine: {
                        silent: true,
                        data: [thresholdMarkLine(0, t("deficit"), "insideEndBottom")],
                    },
                },
            ],
        };
    }, [data, dates, t]);

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
    if (active?.et0_fao_mm != null) lines.push(`${t("et0")}: ${active.et0_fao_mm.toFixed(1)}`);
    if (active?.water_balance_30d_mm != null) lines.push(`${t("waterBalance30d")}: ${active.water_balance_30d_mm.toFixed(1)}`);

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
                    notMerge
                    lazyUpdate
                />
            </div>
        </div>
    );
}
