"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { AlertTriangle, Info, Loader2, RefreshCw, Wheat } from "lucide-react";
import { agriApi, type HarvestProgressItem, type HarvestProgressResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgriHeatmapImage } from "@/lib/agri-heatmap";
import { cn } from "@/lib/utils";

const HarvestProgressChart = dynamic(() => import("@/components/charts/harvest-progress-chart"), {
    ssr: false,
    loading: () => <Skeleton className="h-[220px] w-full rounded-lg" />,
});

const HarvestPixelMap = dynamic(() => import("@/components/field/harvest-pixel-map"), {
    ssr: false,
    loading: () => <Skeleton className="h-[160px] w-full rounded-lg" />,
});

interface HarvestTabProps {
    landId: string;
    /** 地块边界：用于逐像元色膜裁剪与页签内预览描边 */
    fieldGeom?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
    /** 把逐像元收获状态色膜交给地块地图（null 表示移除） */
    onMapOverlayChange?: (img: AgriHeatmapImage | null) => void;
}

function fmtPct(v: number | null | undefined): string {
    return v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(1)}%`;
}

function fmtMu(v: number | null | undefined): string {
    return v == null || !Number.isFinite(v) ? "—" : v.toFixed(1);
}

const LEVEL_CLASS: Record<string, string> = {
    high: "border-success/40 bg-success-subtle text-success",
    medium: "border-warning/40 bg-warning-subtle text-warning",
    low: "border-destructive/40 bg-destructive/10 text-destructive",
};

const KNOWN_REASONS = new Set([
    "low_valid_pct",
    "few_pixels",
    "long_gap",
    "small_margin",
    "unconfirmed",
    "s1_confirmed",
    "s1_agree",
    "s1_disagree",
    "residue_signature",
    "suspected_harvest",
    "promoted_bare",
    "promoted_abrupt",
    "promoted_s1",
    "interpolated",
]);

/** 置信度徽标：等级 + 分数，悬停显示原因。 */
function ConfidenceBadge({ item }: { item: HarvestProgressItem }) {
    const t = useTranslations("harvestTab");
    if (item.confidence == null || !item.confidence_level) return <span className="text-muted-foreground">—</span>;
    const reasons = (item.confidence_reasons ?? []).map((r) => (KNOWN_REASONS.has(r) ? t(`reason.${r}`) : r));
    const title = [`${t("confidence")} ${item.confidence.toFixed(2)}`, ...reasons].join("\n");
    return (
        <span
            title={title}
            className={cn(
                "inline-flex items-center rounded border px-1.5 py-px text-[10px] font-medium tabular-nums",
                LEVEL_CLASS[item.confidence_level] ?? "border-border text-muted-foreground",
            )}
        >
            {t(`level.${item.confidence_level}`)} {Math.round(item.confidence * 100)}
        </span>
    );
}

/** 地块「收获」页签：按影像日期展示已收获面积占比与较上期新增（后端启发式估算）。 */
export default function HarvestTab({ landId, fieldGeom, onMapOverlayChange }: HarvestTabProps) {
    const t = useTranslations("harvestTab");
    const thisYear = new Date().getFullYear();
    const years = useMemo(() => [thisYear, thisYear - 1, thisYear - 2], [thisYear]);
    const [year, setYear] = useState(thisYear);
    const [includeZero, setIncludeZero] = useState(false);
    const [interpolate, setInterpolate] = useState(false);
    const [data, setData] = useState<HarvestProgressResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const load = useCallback(async () => {
        // 切换年份/开关时取消上一次请求，避免旧响应覆盖新结果。
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setError(null);
        try {
            const res = await agriApi.harvestProgress(landId, {
                from: `${year}-01-01`,
                to: year === thisYear ? undefined : `${year}-12-31`,
                includeZero,
                interpolate: interpolate ? "daily" : "none",
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            setData(res);
        } catch (err: unknown) {
            if (controller.signal.aborted) return;
            const detail = (err as { detail?: string })?.detail;
            setError(typeof detail === "string" && detail ? detail : t("loadFailed"));
            setData(null);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [landId, year, thisYear, includeZero, interpolate, t]);

    useEffect(() => {
        void load();
        return () => abortRef.current?.abort();
    }, [load]);

    const items = useMemo(() => data?.items ?? [], [data]);
    // 统计卡片与表格只用真实观测；插值点只画在图上。
    const observed = useMemo(() => items.filter((it) => !it.interpolated), [items]);
    const latest = observed.length ? observed[observed.length - 1] : null;
    const rowsDesc = useMemo(() => [...observed].reverse(), [observed]);
    // 旧版结果没有疑似字段：不显示疑似列。
    const pixelDates = useMemo(() => rowsDesc.map((it) => it.date), [rowsDesc]);
    const showSuspected = useMemo(() => observed.some((it) => it.suspected_harvest_pct != null), [observed]);
    const chartLabels = useMemo(
        () => ({
            harvested: t("seriesHarvested"),
            suspected: t("seriesSuspected"),
            combined: t("combined"),
            newly: t("seriesNewly"),
            interpolated: t("seriesInterpolated"),
            confidence: t("confidence"),
            levels: { high: t("level.high"), medium: t("level.medium"), low: t("level.low") },
        }),
        [t],
    );

    return (
        <div className="p-4 space-y-4">
            <div className="space-y-1">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Wheat className="h-4 w-4" />
                    {t("title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{t("description")}</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
                    {years.map((y) => (
                        <button
                            key={y}
                            type="button"
                            onClick={() => setYear(y)}
                            className={cn(
                                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                                year === y
                                    ? "bg-background shadow-sm text-primary"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {y === thisYear ? t("thisYear") : String(y)}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="accent-primary"
                            checked={includeZero}
                            onChange={(e) => setIncludeZero(e.target.checked)}
                        />
                        {t("includeZero")}
                    </label>
                    <label
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none"
                        title={t("interpolateHint")}
                    >
                        <input
                            type="checkbox"
                            className="accent-primary"
                            checked={interpolate}
                            onChange={(e) => setInterpolate(e.target.checked)}
                        />
                        {t("interpolateDaily")}
                    </label>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => void load()}
                        disabled={loading}
                        title={t("refresh")}
                        aria-label={t("refresh")}
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </Button>
                </div>
            </div>

            {loading && !data ? (
                <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-[220px] w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            ) : error ? (
                <div className="rounded-lg border bg-card p-6 flex flex-col items-center gap-3 text-center">
                    <AlertTriangle className="h-7 w-7 text-warning" />
                    <p className="text-xs text-muted-foreground">{error}</p>
                    <Button size="sm" variant="outline" onClick={() => void load()}>
                        <RefreshCw className="mr-2 h-3.5 w-3.5" />
                        {t("retry")}
                    </Button>
                </div>
            ) : items.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed p-8 text-center space-y-2">
                    <Wheat className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">{t("emptyTitle")}</p>
                    <p className="text-xs text-muted-foreground">
                        {includeZero ? t("emptyDescAll") : t("emptyDesc")}
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg border bg-card p-2.5">
                            <p className="text-[11px] text-muted-foreground">{t("latestPct")}</p>
                            <p className="mt-0.5 text-lg font-bold text-primary tabular-nums">{fmtPct(latest?.harvested_pct)}</p>
                            {latest && (latest.suspected_harvest_pct ?? 0) > 0 ? (
                                <p className="text-[10px] tabular-nums text-primary/60" title={t("suspectedHint")}>
                                    {t("latestSuspected", { pct: fmtPct(latest.suspected_harvest_pct) })}
                                </p>
                            ) : null}
                            <p className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-1">
                                {latest?.date}
                                {latest ? <ConfidenceBadge item={latest} /> : null}
                            </p>
                        </div>
                        <div className="rounded-lg border bg-card p-2.5">
                            <p className="text-[11px] text-muted-foreground">{t("latestNewly")}</p>
                            <p className="mt-0.5 text-lg font-bold tabular-nums">+{fmtPct(latest?.newly_harvested_pct)}</p>
                        </div>
                        <div className="rounded-lg border bg-card p-2.5">
                            <p className="text-[11px] text-muted-foreground">{t("latestArea")}</p>
                            <p className="mt-0.5 text-lg font-bold tabular-nums">{fmtMu(latest?.harvested_area_mu)}</p>
                            <p className="text-[10px] text-muted-foreground">
                                {data?.parcel_area_mu != null ? t("ofTotalMu", { total: fmtMu(data.parcel_area_mu) }) : t("unitMu")}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-3 space-y-1">
                        <p className="text-xs font-semibold">{t("chartTitle")}</p>
                        <HarvestProgressChart items={items} labels={chartLabels} />
                    </div>

                    <HarvestPixelMap
                        landId={landId}
                        dates={pixelDates}
                        fieldGeom={fieldGeom}
                        onMapOverlayChange={onMapOverlayChange}
                    />

                    <div className="rounded-lg border bg-card p-3">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b text-left text-[11px] text-muted-foreground">
                                    <th className="py-1.5 font-medium">{t("colDate")}</th>
                                    <th className="py-1.5 text-right font-medium">{t("colPct")}</th>
                                    {showSuspected ? (
                                        <th className="py-1.5 text-right font-medium" title={t("suspectedHint")}>
                                            {t("colSuspected")}
                                        </th>
                                    ) : null}
                                    <th className="py-1.5 text-right font-medium">{t("colNewly")}</th>
                                    <th className="py-1.5 text-right font-medium">{t("colArea")}</th>
                                    <th className="py-1.5 text-right font-medium">{t("colConfidence")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rowsDesc.map((it) => (
                                    <tr key={it.date} className="border-b border-border/50 last:border-0">
                                        <td className="py-1.5 tabular-nums">{it.date}</td>
                                        <td className="py-1.5 text-right font-medium tabular-nums">
                                            {fmtPct(it.harvested_pct)}
                                            {it.confirmed === false ? (
                                                <span
                                                    className="ml-1 text-[10px] font-normal text-warning"
                                                    title={t("provisionalHint")}
                                                >
                                                    {t("provisional")}
                                                </span>
                                            ) : null}
                                        </td>
                                        {showSuspected ? (
                                            <td
                                                className={cn(
                                                    "py-1.5 text-right tabular-nums",
                                                    (it.suspected_harvest_pct ?? 0) > 0
                                                        ? "text-primary/60"
                                                        : "text-muted-foreground",
                                                )}
                                                title={
                                                    (it.suspected_harvest_pct ?? 0) > 0
                                                        ? `${t("combined")} ${fmtPct(it.harvested_or_suspected_pct)}`
                                                        : undefined
                                                }
                                            >
                                                {(it.suspected_harvest_pct ?? 0) > 0 ? fmtPct(it.suspected_harvest_pct) : "—"}
                                            </td>
                                        ) : null}
                                        <td
                                            className={cn(
                                                "py-1.5 text-right tabular-nums",
                                                it.newly_harvested_pct > 0 ? "text-primary" : "text-muted-foreground",
                                            )}
                                        >
                                            {it.newly_harvested_pct > 0 ? `+${fmtPct(it.newly_harvested_pct)}` : "—"}
                                        </td>
                                        <td className="py-1.5 text-right tabular-nums">{fmtMu(it.harvested_area_mu)}</td>
                                        <td className="py-1.5 text-right">
                                            <ConfidenceBadge item={it} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{t("confidenceNote")}</p>
                        {showSuspected ? (
                            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{t("suspectedHint")}</p>
                        ) : null}
                    </div>
                </>
            )}

            {data && (
                <div className="flex gap-2 rounded-lg border border-dashed border-warning/50 bg-warning-subtle/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <span>
                        {data.heuristic ? t("heuristicNote") : null}
                        {data.rule_zh ? ` ${data.rule_zh}` : ""}
                    </span>
                </div>
            )}
        </div>
    );
}
