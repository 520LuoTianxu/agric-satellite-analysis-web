"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ProjectHarvestSeriesPoint } from "@/lib/api";
import { tokenColor } from "@/lib/design-tokens";
import { axisLabel, baseTooltip, legendStyle, valueAxis, viz } from "@/components/charts/chart-base";
import { attachNearestDateClick, type AxisClickChart } from "@/components/charts/chart-date-click";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

interface Props {
    series: ProjectHarvestSeriesPoint[];
    selectedDate: string | null;
    blockLabel: (key: string) => string;
    labels: { all: string; cloud: string };
    height?: number;
    onSelectDate?: (date: string) => void;
}

/** 已收获(高+中)% 序列：全部（主色实线）+ 各计算块（分类色细线）+ 云遮%（浅柱）。 */
export default function HarvestSeriesChart({ series, selectedDate, blockLabel, labels, height = 220, onSelectDate }: Props) {
    const option = useMemo(() => {
        const dates = series.map((s) => s.date);
        const blocks = Array.from(new Set(series.flatMap((s) => Object.keys(s.blocks ?? {})))).sort();
        const blockSeries = blocks.length > 1 ? blocks.map((b, i) => ({
            name: blockLabel(b),
            type: "line" as const,
            data: series.map((s) => s.blocks?.[b] ?? null),
            connectNulls: true,
            symbolSize: 4,
            lineStyle: { width: 1.2, color: viz(i + 2) },
            itemStyle: { color: viz(i + 2) },
        })) : [];
        return {
            animation: false,
            grid: { left: 36, right: 12, top: 30, bottom: 26 },
            legend: legendStyle({ top: 0, left: 0, data: [labels.all, ...blockSeries.map((s) => s.name), labels.cloud] }),
            tooltip: baseTooltip({ trigger: "axis", valueFormatter: (v: number | null) => (v == null ? "—" : `${Number(v).toFixed(1)}%`) }),
            xAxis: { type: "category" as const, data: dates, axisTick: { show: false }, axisLabel: axisLabel({ formatter: (v: string) => v.slice(5), hideOverlap: true }) },
            yAxis: valueAxis({ min: 0, max: 100, axisLabel: axisLabel({ formatter: "{value}%" }) }),
            series: [
                { name: labels.cloud, type: "bar" as const, data: series.map((s) => s.cloud_pct), barMaxWidth: 10, itemStyle: { color: tokenColor("--muted-foreground", 0.25) } },
                ...blockSeries,
                {
                    name: labels.all,
                    type: "line" as const,
                    data: series.map((s) => s.harvested_pct),
                    connectNulls: true,
                    label: { show: true, fontSize: 10, color: tokenColor("--muted-foreground"), formatter: (p: { value: number | null }) => (p.value == null ? "" : `${Math.round(p.value)}%`) },
                    lineStyle: { width: 2.2, color: tokenColor("--primary") },
                    itemStyle: { color: tokenColor("--primary") },
                    areaStyle: { color: tokenColor("--primary", 0.08) },
                    markLine: selectedDate && dates.includes(selectedDate) ? {
                        symbol: "none", silent: true, label: { show: false },
                        lineStyle: { color: tokenColor("--foreground", 0.5), type: "dashed" as const },
                        data: [{ xAxis: selectedDate }],
                    } : undefined,
                    z: 3,
                },
            ],
        };
    }, [series, selectedDate, blockLabel, labels]);

    const dates = useMemo(() => series.map((s) => s.date).filter(Boolean), [series]);
    const onSelectDateRef = useRef(onSelectDate);
    const datesRef = useRef(dates);
    const detachDateClickRef = useRef<(() => void) | null>(null);
    onSelectDateRef.current = onSelectDate;
    datesRef.current = dates;

    const onChartReady = useCallback((chart: AxisClickChart) => {
        detachDateClickRef.current?.();
        if (!onSelectDateRef.current) {
            detachDateClickRef.current = null;
            return;
        }
        detachDateClickRef.current = attachNearestDateClick(
            chart,
            () => datesRef.current,
            (date) => onSelectDateRef.current?.(date),
        );
    }, []);

    useEffect(() => () => {
        detachDateClickRef.current?.();
        detachDateClickRef.current = null;
    }, []);

    return <ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height, width: "100%" }}
        onChartReady={onSelectDate ? onChartReady : undefined} />;
}
