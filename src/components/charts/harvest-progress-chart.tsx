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
    labels: {
        harvested: string;
        suspected: string;
        combined: string;
        newly: string;
        interpolated: string;
        confidence: string;
        levels: Record<string, string>;
    };
    height?: number;
}

const LEVEL_SIZE: Record<string, number> = { high: 8, medium: 6, low: 4 };

/**
 * 已收获占比（折线，累计状态）+ 疑似收获（浅色面积，叠在已收获之上到“已收获+疑似”）+ 较上期新增（柱）。
 * 实线与圆点为真实观测（点越大置信度越高），虚线为按日插值（仅在开启插值时出现）。
 */
export default function HarvestProgressChart({ items, labels, height = 220 }: HarvestProgressChartProps) {
    const option = useMemo(() => {
        const dates = items.map((it) => it.date.slice(5));
        const hasInterp = items.some((it) => it.interpolated);
        const hasSuspected = items.some((it) => (it.suspected_harvest_pct ?? 0) > 0);
        const legend = [
            labels.harvested,
            ...(hasSuspected ? [labels.suspected] : []),
            labels.newly,
            ...(hasInterp ? [labels.interpolated] : []),
        ];
        const byIndex = new Map(items.map((it, i) => [i, it]));
        return {
            animation: false,
            grid: { left: 36, right: 12, top: 30, bottom: 26 },
            legend: legendStyle({ top: 0, left: 0, data: legend }),
            tooltip: baseTooltip({
                trigger: "axis",
                formatter: (params: { dataIndex: number; seriesName: string; value: number | null; marker: string }[]) => {
                    if (!params.length) return "";
                    const it = byIndex.get(params[0].dataIndex);
                    if (!it) return "";
                    const lines = [`${it.date}${it.interpolated ? ` · ${labels.interpolated}` : ""}`];
                    for (const p of params) {
                        if (p.value == null) continue;
                        if (p.seriesName === labels.suspected) {
                            // 面积画到“已收获+疑似”，提示里显示疑似本身与合计。
                            const s = it.suspected_harvest_pct ?? 0;
                            lines.push(
                                `${p.marker}${labels.suspected}: ${s.toFixed(1)}%（${labels.combined} ${Number(p.value).toFixed(1)}%）`,
                            );
                            continue;
                        }
                        lines.push(`${p.marker}${p.seriesName}: ${Number(p.value).toFixed(1)}%`);
                    }
                    if (it.confidence != null) {
                        const level = it.confidence_level ? labels.levels[it.confidence_level] ?? it.confidence_level : "";
                        lines.push(`${labels.confidence}: ${level} ${it.confidence.toFixed(2)}`);
                    }
                    return lines.join("<br/>");
                },
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
                    // 插值行的新增是日增量，不画柱，避免与观测期新增重复计数。
                    data: items.map((it) => (it.interpolated ? null : it.newly_harvested_pct)),
                    barMaxWidth: 14,
                    itemStyle: { color: viz(3, 0.75), borderRadius: [2, 2, 0, 0] },
                },
                ...(hasSuspected
                    ? [
                          {
                              name: labels.suspected,
                              type: "line" as const,
                              data: items.map(
                                  (it) =>
                                      it.harvested_or_suspected_pct ??
                                      it.harvested_pct + (it.suspected_harvest_pct ?? 0),
                              ),
                              showSymbol: false,
                              lineStyle: { width: 1, type: "dotted" as const, color: tokenColor("--primary", 0.5) },
                              itemStyle: { color: tokenColor("--primary", 0.4) },
                              // 浅色：叠在已收获面积之上，只露出疑似部分。
                              areaStyle: { color: tokenColor("--primary", 0.07) },
                              z: 0,
                          },
                      ]
                    : []),
                ...(hasInterp
                    ? [
                          {
                              name: labels.interpolated,
                              type: "line" as const,
                              data: items.map((it) => it.harvested_pct),
                              showSymbol: false,
                              lineStyle: { width: 1.5, type: "dashed" as const, color: tokenColor("--primary", 0.6) },
                              itemStyle: { color: tokenColor("--primary", 0.6) },
                              z: 1,
                          },
                      ]
                    : []),
                {
                    name: labels.harvested,
                    type: "line" as const,
                    data: items.map((it) =>
                        it.interpolated
                            ? null
                            : {
                                  value: it.harvested_pct,
                                  symbolSize: LEVEL_SIZE[it.confidence_level ?? ""] ?? 6,
                                  itemStyle: {
                                      color: tokenColor("--primary", it.confidence_level === "low" ? 0.45 : 1),
                                  },
                              },
                    ),
                    connectNulls: true,
                    lineStyle: { width: 2, color: tokenColor("--primary") },
                    itemStyle: { color: tokenColor("--primary") },
                    areaStyle: hasInterp ? undefined : { color: tokenColor("--primary", 0.1) },
                    z: 2,
                },
            ],
        };
    }, [items, labels]);

    return (
        <ReactEChartsCore
            echarts={echarts}
            option={option}
            notMerge
            style={{ height, width: "100%" }}
        />
    );
}
