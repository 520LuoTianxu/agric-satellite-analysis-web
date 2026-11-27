"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { baselineWindowLabel, type EmergenceMapView, type EmergenceSummary } from "@/lib/emergence";

interface EmergenceStatusBarProps {
    summary: EmergenceSummary | null;
    loading?: boolean;
    error?: string | null;
    view?: EmergenceMapView;
    onViewChange?: (view: EmergenceMapView) => void;
}

export default function EmergenceStatusBar({
    summary, loading, error, view, onViewChange,
}: EmergenceStatusBarProps) {
    const t = useTranslations("emergence");
    const status = summary?.status;
    const baseline = baselineWindowLabel(summary?.baseline.dates);

    return (
        <section className="space-y-2 px-1 pt-1">
            <div role="status" aria-busy={loading || undefined} className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("seasonAssessment")}</p>
                {error ? <p className="text-sm text-destructive">{error}</p>
                    : loading ? (
                        <>
                            <span className="sr-only">{t("loading")}</span>
                            <div aria-hidden="true" className="space-y-2 py-1 motion-reduce:[&_.animate-pulse]:animate-none">
                                <Skeleton className="h-7 w-24" />
                                <Skeleton className="h-3 w-4/5" />
                            </div>
                        </>
                    )
                    : status ? (
                        <>
                            <div className="flex flex-wrap items-baseline gap-x-3">
                                <h3 className="text-2xl font-semibold tracking-tight">{t(`status_${status}`)}</h3>
                                {status === "emerged" && summary.first_emerged_date && (
                                    <span className="text-xs text-muted-foreground">{t("confirmedOn", { date: summary.first_emerged_date })}</span>
                                )}
                            </div>
                            <p className="text-sm leading-relaxed">{t(`meaning_${status}`)}</p>
                        </>
                    ) : <p className="text-sm">{t(summary?.pending ? "pending" : "emptyResult")}</p>}
            </div>
            {status && !error && !loading && (
                <details className="text-xs leading-relaxed text-muted-foreground">
                    <summary className="w-fit cursor-pointer font-medium text-foreground">{t("howJudged")}</summary>
                    <p className="mt-1">{t("fieldRule")}</p>
                    {baseline && <p>{t("baselineDates", { dates: baseline })}</p>}
                    {summary.frozen && <p>{t("frozenMeaning")}</p>}
                </details>
            )}
            {view && onViewChange && (
                <div role="group" aria-label={t("mapMode")} className="flex flex-wrap items-center gap-1 pt-1">
                    <span className="mr-1.5 text-xs text-muted-foreground">{t("mapMode")}</span>
                    {(["class", "increment"] as const).map((key) => (
                        <button key={key} type="button" aria-pressed={view === key} onClick={() => onViewChange(key)}
                            className={cn("rounded-full px-3 py-1.5 text-xs font-medium", view === key
                                ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                            {t(key === "class" ? "viewClass" : "viewIncrement")}
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
