"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
    EMERGENCE_STATUSES,
    baselineWindowLabel,
    type EmergenceMapView,
    type EmergenceStatus,
    type EmergenceSummary,
} from "@/lib/emergence";

interface EmergenceStatusBarProps {
    summary: EmergenceSummary | null;
    loading?: boolean;
    error?: string | null;
    view?: EmergenceMapView;
    onViewChange?: (view: EmergenceMapView) => void;
}

export default function EmergenceStatusBar({
    summary,
    loading = false,
    error = null,
    view,
    onViewChange,
}: EmergenceStatusBarProps) {
    const t = useTranslations("emergence");
    const status: EmergenceStatus | null = summary?.status ?? null;
    const empty =
        !loading &&
        !error &&
        status == null &&
        (summary?.timeseries.length ?? 0) === 0;
    const baseline = baselineWindowLabel(summary?.baseline.dates);
    const asOf = summary?.as_of_date;

    return (
        <div className="space-y-2 rounded-xl border border-border bg-card p-2.5">
            <div
                role="status"
                aria-label={t("statusBarLabel")}
                className="grid grid-cols-4 gap-1 rounded-lg bg-muted/50 p-1"
            >
                {EMERGENCE_STATUSES.map((key) => {
                    const active = !loading && !empty && status === key;
                    return (
                        <span
                            key={key}
                            aria-current={active ? "true" : undefined}
                            className={cn(
                                "rounded-md px-1 py-1 text-center text-[11px] leading-tight",
                                active
                                    ? "bg-primary font-semibold text-primary-foreground"
                                    : "text-muted-foreground",
                            )}
                        >
                            {t(`status_${key}`)}
                        </span>
                    );
                })}
            </div>
            <p className={cn("text-[11px] leading-relaxed", error ? "text-destructive" : "text-muted-foreground")}>
                {loading
                    ? t("loading")
                    : error
                      ? error
                      : empty
                          ? t("emptyResult")
                          : t("statusMeta", {
                                baseline: baseline ?? t("baselineMissing"),
                                asOf: asOf ?? t("sceneMissing"),
                                frozen: summary?.frozen ? t("frozen") : "",
                            })}
            </p>
            {view && onViewChange && (
                <div className="flex gap-1">
                    {(["increment", "class"] as EmergenceMapView[]).map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onViewChange(key)}
                            className={cn(
                                "h-7 flex-1 rounded-md border text-[11px] font-medium",
                                view === key
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-background text-muted-foreground",
                            )}
                        >
                            {t(key === "increment" ? "viewIncrement" : "viewClass")}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
