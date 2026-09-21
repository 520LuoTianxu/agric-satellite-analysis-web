"use client";

import { useTranslations } from "next-intl";
import type { InsightLand, InsightPoint } from "@/lib/parcel-insights";

const COLORS = ["#17745b", "#4773b4", "#b7792b", "#965f9f"];
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
    const pixels = item.spatial?.pixels ?? [];
    if (!pixels.length) return <div className="flex h-48 items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">{t("noPixels")}</div>;
    const minX = Math.min(...pixels.map(p => p[0])), maxX = Math.max(...pixels.map(p => p[0]));
    const minY = Math.min(...pixels.map(p => p[1])), maxY = Math.max(...pixels.map(p => p[1]));
    // 经度按纬度校正比例；每块地单独适配视图，颜色阈值在所有地块间保持一致。
    const factor = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
    const scale = Math.min(270 / Math.max((maxX - minX) * factor, 0.00001), 170 / Math.max(maxY - minY, 0.00001));
    const color = (value: number) => value < .25 ? "#b34a3c" : value < .35 ? "#d89e4c" : value < .5 ? "#b7ca71" : "#238867";
    const size = Math.max(2, Math.min(7, 180 / Math.sqrt(pixels.length)));
    return <figure><svg viewBox="0 0 300 205" role="img" aria-label={`${item.land_name} ${t("spatial")}`} className="h-48 w-full rounded-lg bg-muted/30">
        {pixels.map(([lon, lat, value], i) => <rect key={i} x={15 + (lon - minX) * factor * scale} y={15 + (maxY - lat) * scale} width={size} height={size} fill={color(value)}><title>{`NDVI ${value.toFixed(3)} · ${lon.toFixed(5)}, ${lat.toFixed(5)}`}</title></rect>)}
    </svg><figcaption className="mt-2 text-xs text-muted-foreground">{item.spatial?.date} · {t("spatialLegend")}</figcaption></figure>;
}
