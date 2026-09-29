"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { InsightLand, InsightPoint } from "@/lib/parcel-insights";

const COLORS = ["#17745b", "#4773b4", "#b7792b", "#965f9f"];
const EMPTY_SPATIAL_PIXELS: number[][] = [];
const SPATIAL_BANDS = [
    { key: "spatialBandVeryLow", color: "#b34a3c" },
    { key: "spatialBandLow", color: "#d89e4c" },
    { key: "spatialBandModerate", color: "#b7ca71" },
    { key: "spatialBandHigh", color: "#238867" },
] as const;
const stamp = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** 统一量程和日期轴；长缺景断开，不能用平滑曲线制造不存在的观测。 */
export function InsightsCurve({ series, start, end }: { series: Array<{ name: string; points: InsightPoint[] }>; start: string; end: string }) {
    const t = useTranslations("parcelInsights");
    const min = stamp(start), span = Math.max(86400000, stamp(end) - min);
    const x = (day: string) => 50 + ((stamp(day) - min) / span) * 880;
    const y = (value: number) => 220 - ((value + 1) / 2) * 190;
    return <div className="min-w-0 rounded-xl border bg-background p-3">
        <svg viewBox="0 0 970 265" role="img" aria-label={t("curve")} className="w-full min-h-40">
            {[-1, 0, 0.5, 1].map(value => <g key={value}><line x1="50" x2="930" y1={y(value)} y2={y(value)} stroke="currentColor" opacity=".12" /><text x="8" y={y(value) + 4} fontSize="12" fill="currentColor">{value}</text></g>)}
            {series.map((line, lineIndex) => <g key={line.name}>
                {line.points.slice(1).map((point, index) => stamp(point.date) - stamp(line.points[index].date) <= 35 * 86400000 ? <line key={point.date} x1={x(line.points[index].date)} y1={y(line.points[index].ndvi)} x2={x(point.date)} y2={y(point.ndvi)} stroke={COLORS[lineIndex % COLORS.length]} strokeWidth="2.5" /> : null)}
                {line.points.map(point => <circle key={point.date} cx={x(point.date)} cy={y(point.ndvi)} r="3.5" fill={COLORS[lineIndex % COLORS.length]}><title>{`${line.name} · ${point.date} · NDVI ${point.ndvi.toFixed(3)}`}</title></circle>)}
            </g>)}
            <text x="50" y="247" fontSize="12" fill="currentColor">{start}</text><text x="930" y="247" textAnchor="end" fontSize="12" fill="currentColor">{end}</text>
        </svg>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">{series.map((line, index) => <span className="flex items-center gap-2" key={line.name}><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />{line.name}</span>)}</div>
    </div>;
}

export function InsightsSpatial({ item }: { item: InsightLand }) {
    const t = useTranslations("parcelInsights");
    const spatial = item.spatial;
    const pixels = spatial?.pixels ?? EMPTY_SPATIAL_PIXELS;
    const paths = useMemo(() => {
        if (!pixels.length) return [];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [lon, lat] of pixels) {
            minX = Math.min(minX, lon);
            maxX = Math.max(maxX, lon);
            minY = Math.min(minY, lat);
            maxY = Math.max(maxY, lat);
        }
        // 经度按纬度校正比例；每块地单独适配视图，颜色阈值在所有地块间保持一致。
        const factor = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
        const scale = Math.min(270 / Math.max((maxX - minX) * factor, 0.00001), 170 / Math.max(maxY - minY, 0.00001));
        const size = Math.max(2, Math.min(7, 180 / Math.sqrt(pixels.length)));
        const commands = SPATIAL_BANDS.map(() => [] as string[]);
        const counts = SPATIAL_BANDS.map(() => 0);
        for (const [lon, lat, value] of pixels) {
            const band = value < 0.25 ? 0 : value < 0.35 ? 1 : value < 0.5 ? 2 : 3;
            const x = (15 + (lon - minX) * factor * scale).toFixed(1);
            const y = (15 + (maxY - lat) * scale).toFixed(1);
            const side = size.toFixed(1);
            // 同色方块合并成单个SVG路径，避免20块地各创建1600个矩形DOM节点。
            commands[band].push(`M${x} ${y}h${side}v${side}h-${side}Z`);
            counts[band] += 1;
        }
        return SPATIAL_BANDS.map((definition, index) => ({
            ...definition,
            count: counts[index],
            d: commands[index].join(""),
        }));
    }, [pixels]);
    if (!spatial || !pixels.length) return <div className="flex h-48 items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">{t("noPixels")}</div>;
    const coverageDescription = spatial.display_sampled
        ? t("spatialSampled", { displayed: pixels.length, total: spatial.valid_pixels })
        : t("spatialFull", { displayed: pixels.length });
    return <figure>
        <svg viewBox="0 0 300 205" role="img" aria-label={`${item.land_name} ${t("spatial")} ${spatial.date}`} className="h-48 w-full rounded-lg bg-muted/30">
            <title>{`${item.land_name} · ${t("spatial")} · ${spatial.date}`}</title>
            <desc>{`${t("spatialLegend")} · ${coverageDescription}`}</desc>
            {paths.map(path => <path key={path.key} d={path.d} fill={path.color} shapeRendering="crispEdges">
                <title>{t("spatialBandTooltip", { band: t(path.key), count: path.count })}</title>
            </path>)}
        </svg>
        <figcaption className="mt-2 space-y-2 text-xs text-muted-foreground">
            <p>{spatial.date} · {t("spatialLegend")}</p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {SPATIAL_BANDS.map(band => <li key={band.key} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: band.color }} />
                    <span>{t(band.key)}</span>
                </li>)}
            </ul>
            {spatial.display_sampled && <p>{coverageDescription}</p>}
        </figcaption>
    </figure>;
}
