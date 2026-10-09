"use client";

import React, { useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { HarvestProgressItem } from "@/lib/api";
import { tokenColor } from "@/lib/design-tokens";
import { axisLabel, baseTooltip, legendStyle, valueAxis, viz } from "./chart-base";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

interface HarvestProgressChartProps {
    items: HarvestProgressItem[];
    labels: { harvested: string; newly: string };
    height?: number;
}

/** 已收获占比（折线，累计状态）+ 较上期新增（柱），按真实观测日期排列。 */
export default function HarvestProgressChart({ items, labels, height = 220 }: HarvestProgressChartProps) {
    const option = useMemo(() => {
        const dates = items.map((it) => it.date.slice(5));
        return {
            animation: false,
            grid: { left: 36, right: 12, top: 30, bottom: 26 },
            legend: legendStyle({ top: 0, left: 0, data: [labels.harvested, labels.newly] }),
            tooltip: baseTooltip({
                trigger: "axis",
                valueFormatter: (v: number) => `${Number(v).toFixed(1)}%`,
            }),
            xAxis: {
                type: "category" as const,
                data: dates,
                axisTick: { show: false },
                axisLabel: axisLabel({ hideOverlap: true }),
            },
            yAxis: valueAxis({ min: 0, max: 100, axisLabel: axisLabel({ formatter: "{value}%" }) }),
            series: [
                {
                    name: labels.newly,
                    type: "bar" as const,
                    data: items.map((it) => it.newly_harvested_pct),
                    barMaxWidth: 14,
                    itemStyle: { color: viz(3, 0.75), borderRadius: [2, 2, 0, 0] },
                },
                {
                    name: labels.harvested,
                    type: "line" as const,
                    data: items.map((it) => it.harvested_pct),
                    symbolSize: 6,
                    lineStyle: { width: 2, color: tokenColor("--primary") },
                    itemStyle: { color: tokenColor("--primary") },
                    areaStyle: { color: tokenColor("--primary", 0.1) },
                },
            ],
        };
    }, [items, labels.harvested, labels.newly]);

    return (
        <ReactEChartsCore
            echarts={echarts}
            option={option}
            notMerge
            style={{ height, width: "100%" }}
        />
    );
}
