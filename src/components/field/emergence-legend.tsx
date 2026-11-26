"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgriHeatmapImage } from "@/lib/agri-heatmap";
import { MAP_CHROME } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import type { EmergenceMapView } from "@/lib/emergence";

interface EmergenceLegendProps {
    heatmap: AgriHeatmapImage;
    view: EmergenceMapView;
    onViewChange: (view: EmergenceMapView) => void;
}

export default function EmergenceLegend({ heatmap, view, onViewChange }: EmergenceLegendProps) {
    const t = useTranslations("emergence");
    const legend = heatmap.legend.kind === "emergence" ? heatmap.legend : null;
    const gradient = legend?.gradient;
    const min = legend?.min;
    const max = legend?.max;
    const classes = legend?.classes ?? [];
    const total = classes.reduce((sum, item) => sum + (item.count ?? 0), 0);

    return (
        <div className={cn(MAP_CHROME, "w-[228px] rounded-lg px-3 py-2.5")}>
            <div className="mb-2 flex gap-1">
                {(["increment", "class"] as EmergenceMapView[]).map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onViewChange(key)}
                        className={cn(
                            "h-6 flex-1 rounded-md text-[10px] font-medium",
                            view === key
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/70 text-muted-foreground",
                        )}
                    >
                        {t(key === "increment" ? "viewIncrement" : "viewClass")}
                    </button>
                ))}
            </div>

            <p className="mb-1.5 text-[11px] font-semibold tracking-wide">
                {view === "increment" ? t("legendIncrement") : t("legendClass")}
            </p>

            {view === "increment" && gradient && (
                <>
                    <div
                        className="h-3 w-full overflow-hidden rounded-sm border border-border"
                        style={{ background: gradient }}
                    />
                    <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
                        <span>{min}</span>
                        <span>{max}</span>
                    </div>
                </>
            )}

            <ul className={cn("space-y-1", view === "increment" && "mt-2")}>
                {classes.map((item) => {
                    const count = item.count;
                    const pct =
                        total > 0 && count != null ? ` · ${((count / total) * 100).toFixed(1)}%` : "";
                    return (
                        <li key={item.key} className="flex items-center gap-1.5 text-[11px]">
                            <span
                                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-border/60"
                                style={{ background: item.color }}
                            />
                            <span className="min-w-0 text-foreground/90">
                                {t(`class${item.key}`)}
                                {count != null ? (
                                    <span className="text-muted-foreground">
                                        {" "}
                                        {count}
                                        {pct}
                                    </span>
                                ) : null}
                            </span>
                        </li>
                    );
                })}
            </ul>
            <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{t("legendNote")}</p>
            <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                {t("pixelCount", { count: heatmap.pixelCount })}
            </p>
        </div>
    );
}
