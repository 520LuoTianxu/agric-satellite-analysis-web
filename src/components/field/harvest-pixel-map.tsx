"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Map as MapIcon } from "lucide-react";
import { agriApi, type HarvestPixelsResult } from "@/lib/api";
import {
    HARVEST_STATE_STYLE,
    lonLatToWebMercator,
    rasterizeHarvestStatePixels,
    type AgriHeatmapImage,
    type HarvestPixelStateKey,
} from "@/lib/agri-heatmap";
import { cn } from "@/lib/utils";

interface HarvestPixelMapProps {
    landId: string;
    /** 可选影像日期（降序）；默认选第一个 */
    dates: string[];
    fieldGeom?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
    /** 把色膜交给地块地图显示（null 表示移除） */
    onMapOverlayChange?: (img: AgriHeatmapImage | null) => void;
    /** 测试/预览注入：跳过网络请求 */
    fetcher?: (date: string) => Promise<HarvestPixelsResult>;
}

const ORDER: HarvestPixelStateKey[] = ["unharvested", "suspected", "harvested"];
const NODATA_COLOR = "#cbd5e1";

function fmtPct(v: number | null | undefined): string {
    return v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(1)}%`;
}

/** 地块外环（WebMercator 归一化到色膜图片坐标），用于页签内预览描边。 */
function outlinePaths(
    geom: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined,
    img: AgriHeatmapImage,
): string[] {
    if (!geom) return [];
    const [tl, , br] = img.coordinates;
    const [x0, y0] = lonLatToWebMercator(tl[0], tl[1]);
    const [x1, y1] = lonLatToWebMercator(br[0], br[1]);
    const w = x1 - x0;
    const h = y0 - y1;
    if (!(w > 0) || !(h > 0)) return [];
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    return polys.map((rings) =>
        rings
            .map(
                (ring) =>
                    ring
                        .map(([lon, lat], i) => {
                            const [x, y] = lonLatToWebMercator(lon, lat);
                            return `${i ? "L" : "M"}${(((x - x0) / w) * 100).toFixed(2)},${(((y0 - y) / h) * 100).toFixed(2)}`;
                        })
                        .join("") + "Z",
            )
            .join(""),
    );
}

/** 收获页签：按影像日期显示逐像元收获状态（未收获 / 疑似收获 / 已收获）色膜与图例。 */
export default function HarvestPixelMap({ landId, dates, fieldGeom, onMapOverlayChange, fetcher }: HarvestPixelMapProps) {
    const t = useTranslations("harvestTab");
    const [selected, setSelected] = useState<string | null>(dates[0] ?? null);
    const [showOnMap, setShowOnMap] = useState(true);
    const [data, setData] = useState<HarvestPixelsResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // 日期列表变化（切换年份）时若当前日期不在列表中，回到最新一期。
    useEffect(() => {
        if (!selected || !dates.includes(selected)) setSelected(dates[0] ?? null);
    }, [dates, selected]);

    useEffect(() => {
        if (!selected) {
            setData(null);
            return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setError(null);
        const run = fetcher
            ? fetcher(selected)
            : agriApi.harvestPixels(landId, { date: selected, signal: controller.signal });
        run.then(
            (res) => {
                if (controller.signal.aborted) return;
                setData(res);
                setLoading(false);
            },
            (err: unknown) => {
                if (controller.signal.aborted) return;
                const detail = (err as { detail?: string })?.detail;
                setError(typeof detail === "string" && detail ? detail : t("pixelLoadFailed"));
                setData(null);
                setLoading(false);
            },
        );
        return () => controller.abort();
    }, [landId, selected, fetcher, t]);

    const image = useMemo(() => {
        if (!data?.pixels_lonlat?.length) return null;
        const pct = data.crop_pct;
        return rasterizeHarvestStatePixels(
            data.pixels_lonlat,
            {
                title: t("pixelMapTitle"),
                unharvested: `${t("stateUnharvested")} ${fmtPct(pct?.unharvested)}`,
                suspected: `${t("stateSuspected")} ${fmtPct(pct?.suspected)}`,
                harvested: `${t("stateHarvested")} ${fmtPct(pct?.harvested)}`,
            },
            fieldGeom ?? null,
        );
    }, [data, fieldGeom, t]);

    useEffect(() => {
        onMapOverlayChange?.(showOnMap ? image : null);
    }, [image, showOnMap, onMapOverlayChange]);
    useEffect(() => () => onMapOverlayChange?.(null), [onMapOverlayChange]);

    const paths = useMemo(() => (image ? outlinePaths(fieldGeom, image) : []), [fieldGeom, image]);
    const aspect = image ? image.width / Math.max(1, image.height) : 1;

    if (!dates.length) return null;

    return (
        <div className="rounded-lg border bg-card p-3 space-y-2" data-testid="harvest-pixel-map">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                    <MapIcon className="h-3.5 w-3.5" />
                    {t("pixelMapTitle")}
                </p>
                <div className="flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                        {t("pixelDate")}
                        <select
                            className="rounded border bg-background px-1.5 py-0.5 text-[11px] tabular-nums"
                            value={selected ?? ""}
                            onChange={(e) => setSelected(e.target.value)}
                        >
                            {dates.map((d) => (
                                <option key={d} value={d}>
                                    {d}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="accent-primary"
                            checked={showOnMap}
                            onChange={(e) => setShowOnMap(e.target.checked)}
                        />
                        {t("showOnMap")}
                    </label>
                </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
                <div
                    className="relative w-full overflow-hidden rounded-md border bg-muted/40"
                    style={{ aspectRatio: `${Math.min(3, Math.max(0.5, aspect))}` }}
                >
                    {image?.dataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={image.dataUrl}
                            alt={t("pixelMapTitle")}
                            className="absolute inset-0 h-full w-full"
                            style={{ imageRendering: "pixelated" }}
                        />
                    ) : null}
                    {paths.length ? (
                        <svg
                            className="absolute inset-0 h-full w-full"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                        >
                            {paths.map((d, i) => (
                                <path
                                    key={i}
                                    d={d}
                                    fill="none"
                                    stroke="hsl(var(--foreground))"
                                    strokeWidth={1.2}
                                    vectorEffect="non-scaling-stroke"
                                />
                            ))}
                        </svg>
                    ) : null}
                    {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    ) : null}
                    {!loading && error ? (
                        <p className="absolute inset-0 flex items-center justify-center p-2 text-center text-[11px] text-muted-foreground">
                            {error}
                        </p>
                    ) : null}
                </div>

                <ul className="space-y-1.5 min-w-[120px]">
                    {ORDER.map((key) => (
                        <li key={key} className="flex items-center gap-1.5 text-[11px]">
                            <span
                                className="inline-block h-3 w-3 shrink-0 rounded-sm border border-border/60"
                                style={{ background: HARVEST_STATE_STYLE[key].color }}
                            />
                            <span className="flex-1">
                                {t(
                                    key === "unharvested"
                                        ? "stateUnharvested"
                                        : key === "suspected"
                                          ? "stateSuspected"
                                          : "stateHarvested",
                                )}
                            </span>
                            <span className="font-medium tabular-nums">{fmtPct(data?.crop_pct?.[key])}</span>
                        </li>
                    ))}
                    {(data?.crop_pct?.nodata ?? 0) > 0 ? (
                        <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span
                                className="inline-block h-3 w-3 shrink-0 rounded-sm border border-dashed border-border"
                                style={{ background: NODATA_COLOR, opacity: 0.4 }}
                            />
                            <span className="flex-1">{t("stateNodata")}</span>
                            <span className="tabular-nums">{fmtPct(data?.crop_pct?.nodata)}</span>
                        </li>
                    ) : null}
                    {data ? (
                        <li className="pt-1 text-[10px] text-muted-foreground tabular-nums">
                            {t("pixelCount", { count: data.crop_pixel_count ?? data.pixel_count })}
                        </li>
                    ) : null}
                </ul>
            </div>

            {data ? (
                <p className={cn("text-[10px] leading-relaxed text-muted-foreground")}>
                    {data.date !== selected ? `${t("pixelDateFallback", { date: data.date })} ` : ""}
                    {data.source === "live" ? `${t("pixelLive")} ` : ""}
                    {t("pixelMapHint")}
                </p>
            ) : null}
        </div>
    );
}
