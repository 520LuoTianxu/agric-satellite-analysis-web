"use client";

import { useTranslations } from "next-intl";
import type { AgriHeatmapImage } from "@/lib/agri-heatmap";
import { MAP_CHROME } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

export default function EmergenceLegend({ heatmap }: { heatmap: AgriHeatmapImage }) {
    const t = useTranslations("emergence");
    const legend = heatmap.legend;
    if (legend.kind !== "emergence") return null;
    // 以已绘制图层的模式和日期为准，切换期间图例仍与地图上的颜色对应。
    const classified = legend.view === "class";
    const total = legend.classes.reduce((sum, item) => sum + (item.count ?? 0), 0);

    return (
        <section className={cn(MAP_CHROME, "w-fit max-w-[min(15rem,65vw)] rounded-xl px-3 py-2.5")}>
            <h3 className="text-xs font-semibold">{t(classified ? "legendClass" : "legendIncrement")}</h3>
            {legend.date && <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{legend.date}</p>}
            {classified ? (
                <ul className="mt-2 space-y-1.5">
                    {legend.classes.map((item) => (
                        <li key={item.key} className="flex items-center gap-2 text-xs">
                            <span className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: item.color }} />
                            <span>{t(`class${item.key}`)}</span>
                            <span className="ml-auto pl-2 font-medium tabular-nums" title={t("pixelCount", { count: item.count ?? 0 })}>
                                {total ? `${(((item.count ?? 0) / total) * 100).toFixed(1)}%` : "—"}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <>
                    <div className="mt-2 h-2 rounded-full" style={{ background: legend.gradient }} />
                    <div className="mt-1 flex justify-between text-[11px] tabular-nums"><span>{legend.min}</span><span>{legend.max}</span></div>
                    <p className="mt-1 text-xs text-muted-foreground">{t("incrementHint")}</p>
                </>
            )}
        </section>
    );
}
