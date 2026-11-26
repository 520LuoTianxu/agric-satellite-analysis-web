"use client";

import React, { useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
    GridComponent,
    TooltipComponent,
    LegendComponent,
    MarkLineComponent,
    MarkAreaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTranslations } from "next-intl";
import { tokenColor } from "@/lib/design-tokens";
import { axisLabel, baseTooltip, legendStyle, sig } from "./chart-base";
import { EMERGENCE_NDVI_REFERENCE, type EmergenceSummary } from "@/lib/emergence";

echarts.use([
    LineChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    MarkLineComponent,
    MarkAreaComponent,
    CanvasRenderer,
]);

interface EmergenceChartProps {
    summary: EmergenceSummary;
    selectedDate?: string | null;
    onDateSelect?: (date: string) => void;
    height?: number;
}

function bandSpan(low: number | null, high: number | null) {
    if (low == null || high == null) return null;
    return Math.max(0, high - low);
}

export default function EmergenceChart({
    summary,
    selectedDate,
    onDateSelect,
    height = 420,
}: EmergenceChartProps) {
    const t = useTranslations("emergence");
    const points = summary.timeseries;
    const dates = points.map((p) => p.date.slice(5));
    const fullDates = points.map((p) => p.date);
    const baseline = summary.baseline.median;
    const noise = summary.summary.noise_floor;

    const option = useMemo(() => {
        const veg = sig("vegetation");
        const vegSoft = sig("vegetation", 0.16);
        const vegMid = sig("vegetation", 0.28);
        const muted = tokenColor("--muted-foreground");
        const warning = tokenColor("--warning");
        const ndviP05 = points.map((p) => p.ndvi_p05);
        const ndviOuter = points.map((p) => bandSpan(p.ndvi_p05, p.ndvi_p95));
        const ndviP25 = points.map((p) => p.ndvi_p25);
        const ndviInner = points.map((p) => bandSpan(p.ndvi_p25, p.ndvi_p75));
        const incP05 = points.map((p) => p.increment_p05);
        const incOuter = points.map((p) => bandSpan(p.increment_p05, p.increment_p95));
        const incP25 = points.map((p) => p.increment_p25);
        const incInner = points.map((p) => bandSpan(p.increment_p25, p.increment_p75));
        const ndviHigh = points.reduce((max, p) => {
            for (const v of [p.ndvi_median, p.ndvi_mean, p.ndvi_p95]) {
                if (v != null && v > max) max = v;
            }
            return max;
        }, EMERGENCE_NDVI_REFERENCE);
        const yMax = Math.max(0.4, Math.ceil((ndviHigh + 0.05) * 20) / 20);
        const hasNdviBand = ndviOuter.some((v) => v != null);
        const hasIncBand = incOuter.some((v) => v != null);

        const baselineMark =
            baseline == null
                ? []
                : [
                      {
                          yAxis: baseline,
                          lineStyle: { color: warning, type: "dashed" as const, width: 1.25 },
                          label: {
                              formatter: t("chartBaseline", { value: baseline.toFixed(3) }),
                              fontSize: 10,
                              color: warning,
                              position: "insideEndTop" as const,
                          },
                      },
                  ];

        return {
            animation: false,
            textStyle: { fontFamily: "inherit" },
            legend: {
                ...legendStyle(),
                top: 0,
                itemWidth: 12,
                itemHeight: 8,
                textStyle: { fontSize: 10, color: muted },
                data: [t("chartP05"), t("chartP25"), t("chartMedian"), t("chartMean"), t("chartIncrementMedian")],
            },
            tooltip: {
                ...baseTooltip(),
                trigger: "axis" as const,
            },
            axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
            grid: [
                { left: 46, right: 12, top: 28, height: "34%" },
                { left: 46, right: 12, top: "58%", height: "30%" },
            ],
            xAxis: [
                {
                    type: "category" as const,
                    gridIndex: 0,
                    data: dates,
                    axisLabel: { show: false },
                    axisTick: { show: false },
                    axisLine: { lineStyle: { color: tokenColor("--border") } },
                },
                {
                    type: "category" as const,
                    gridIndex: 1,
                    data: dates,
                    axisLabel: axisLabel(),
                    axisLine: { lineStyle: { color: tokenColor("--border") } },
                },
            ],
            yAxis: [
                {
                    type: "value" as const,
                    gridIndex: 0,
                    name: t("chartNdvi"),
                    nameTextStyle: { fontSize: 10, color: muted },
                    min: 0,
                    max: yMax,
                    axisLabel: axisLabel(),
                    splitLine: { lineStyle: { type: "dashed" as const, color: tokenColor("--border") } },
                },
                {
                    type: "value" as const,
                    gridIndex: 1,
                    name: t("chartIncrement"),
                    nameTextStyle: { fontSize: 10, color: muted },
                    axisLabel: axisLabel(),
                    splitLine: { lineStyle: { type: "dashed" as const, color: tokenColor("--border") } },
                },
            ],
            series: [
                ...(hasNdviBand
                    ? [
                          {
                              name: "ndvi-p05-base",
                              type: "line" as const,
                              xAxisIndex: 0,
                              yAxisIndex: 0,
                              data: ndviP05,
                              stack: "ndvi-outer",
                              symbol: "none",
                              lineStyle: { opacity: 0 },
                              areaStyle: { opacity: 0 },
                              tooltip: { show: false },
                          },
                          {
                              name: t("chartP05"),
                              type: "line" as const,
                              xAxisIndex: 0,
                              yAxisIndex: 0,
                              data: ndviOuter,
                              stack: "ndvi-outer",
                              symbol: "none",
                              lineStyle: { opacity: 0 },
                              areaStyle: { color: vegSoft },
                              tooltip: { show: false },
                              legendHoverLink: false,
                          },
                          {
                              name: "ndvi-p25-base",
                              type: "line" as const,
                              xAxisIndex: 0,
                              yAxisIndex: 0,
                              data: ndviP25,
                              stack: "ndvi-inner",
                              symbol: "none",
                              lineStyle: { opacity: 0 },
                              areaStyle: { opacity: 0 },
                              tooltip: { show: false },
                          },
                          {
                              name: t("chartP25"),
                              type: "line" as const,
                              xAxisIndex: 0,
                              yAxisIndex: 0,
                              data: ndviInner,
                              stack: "ndvi-inner",
                              symbol: "none",
                              lineStyle: { opacity: 0 },
                              areaStyle: { color: vegMid },
                              tooltip: { show: false },
                          },
                      ]
                    : []),
                {
                    name: t("chartMedian"),
                    type: "line" as const,
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    data: points.map((p) => p.ndvi_median),
                    symbol: "circle",
                    symbolSize: (_value: unknown, params: { dataIndex?: number }) =>
                        fullDates[params?.dataIndex ?? -1] === selectedDate ? 11 : 6,
                    showSymbol: true,
                    lineStyle: { color: veg, width: 2 },
                    itemStyle: { color: veg },
                    markLine: {
                        silent: true,
                        symbol: ["none", "none"],
                        data: [
                            ...baselineMark,
                            {
                                yAxis: EMERGENCE_NDVI_REFERENCE,
                                lineStyle: { color: muted, type: "dotted" as const, width: 1 },
                                label: {
                                    formatter: t("chartReference"),
                                    fontSize: 10,
                                    color: muted,
                                    position: "insideStartTop" as const,
                                },
                            },
                        ],
                    },
                },
                {
                    name: t("chartMean"),
                    type: "line" as const,
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    data: points.map((p) => p.ndvi_mean),
                    symbol: "none",
                    lineStyle: { color: veg, width: 1.25, type: "dashed" as const },
                    itemStyle: { color: veg },
                },
                ...(hasIncBand
                    ? [
                          {
                              name: "inc-p05-base",
                              type: "line" as const,
                              xAxisIndex: 1,
                              yAxisIndex: 1,
                              data: incP05,
                              stack: "inc-outer",
                              symbol: "none",
                              lineStyle: { opacity: 0 },
                              areaStyle: { opacity: 0 },
                              tooltip: { show: false },
                          },
                          {
                              name: t("chartP05"),
                              type: "line" as const,
                              xAxisIndex: 1,
                              yAxisIndex: 1,
                              data: incOuter,
                              stack: "inc-outer",
                              symbol: "none",
                              lineStyle: { opacity: 0 },
                              areaStyle: { color: "rgba(161,217,155,0.35)" },
                              tooltip: { show: false },
                          },
                          {
                              name: "inc-p25-base",
                              type: "line" as const,
                              xAxisIndex: 1,
                              yAxisIndex: 1,
                              data: incP25,
                              stack: "inc-inner",
                              symbol: "none",
                              lineStyle: { opacity: 0 },
                              areaStyle: { opacity: 0 },
                              tooltip: { show: false },
                          },
                          {
                              name: t("chartP25"),
                              type: "line" as const,
                              xAxisIndex: 1,
                              yAxisIndex: 1,
                              data: incInner,
                              stack: "inc-inner",
                              symbol: "none",
                              lineStyle: { opacity: 0 },
                              areaStyle: { color: "rgba(65,171,93,0.4)" },
                              tooltip: { show: false },
                          },
                      ]
                    : []),
                {
                    name: t("chartIncrementMedian"),
                    type: "line" as const,
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: points.map((p) => p.increment_median),
                    symbol: "circle",
                    symbolSize: 6,
                    lineStyle: { color: "#006d2c", width: 2 },
                    itemStyle: { color: "#006d2c" },
                    markArea:
                        noise == null
                            ? undefined
                            : {
                                  silent: true,
                                  itemStyle: { color: "rgba(222, 196, 144, 0.35)" },
                                  data: [
                                      [
                                          {
                                              yAxis: -Math.abs(noise),
                                              name: t("chartNoise", { value: noise.toFixed(3) }),
                                          },
                                          { yAxis: Math.abs(noise) },
                                      ],
                                  ],
                                  label: { fontSize: 10, color: muted, position: "insideTop" as const },
                              },
                },
            ],
        };
    }, [baseline, dates, fullDates, noise, points, selectedDate, t]);

    return (
        <ReactEChartsCore
            echarts={echarts}
            option={option}
            style={{ height, width: "100%" }}
            notMerge
            onEvents={{
                click: (params: { dataIndex?: number }) => {
                    const idx = params?.dataIndex;
                    if (idx == null || idx < 0) return;
                    const date = fullDates[idx];
                    if (date) onDateSelect?.(date);
                },
            }}
            opts={{ renderer: "canvas" }}
        />
    );
}
