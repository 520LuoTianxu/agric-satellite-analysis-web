"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sprout } from "lucide-react";
import { agriApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
    AUTUMN_EMERGENCE_EVENT,
    baselineWindowLabel,
    parseAgriLandId,
    type EmergenceStatus,
    type EmergenceSummary,
} from "@/lib/emergence";

interface EmergenceReportCardProps {
    landId: string;
    onShowOnMap?: () => void;
}

function sentenceKey(status: EmergenceStatus) {
    if (status === "not_emerged") return "sentence_not_emerged" as const;
    if (status === "emerging") return "sentence_emerging" as const;
    if (status === "emerged") return "sentence_emerged" as const;
    return "sentence_uncertain" as const;
}

export default function EmergenceReportCard({ landId, onShowOnMap }: EmergenceReportCardProps) {
    const t = useTranslations("emergence");
    const [summary, setSummary] = useState<EmergenceSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const agriId = parseAgriLandId(landId);
        if (!agriId) {
            setSummary(null);
            setError(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        agriApi
            .emergenceSummary(agriId)
            .then((next) => {
                if (cancelled) return;
                setSummary(next);
                setError(null);
            })
            .catch(() => {
                if (cancelled) return;
                setSummary(null);
                setError("loadFailed");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [landId]);

    useEffect(() => {
        const agriId = parseAgriLandId(landId);
        const onUpdate = (event: Event) => {
            const detail = (event as CustomEvent<EmergenceSummary | null>).detail ?? null;
            if (detail && agriId && detail.field_id && detail.field_id !== agriId) return;
            setSummary(detail);
            setError(null);
            setLoading(false);
        };
        window.addEventListener(AUTUMN_EMERGENCE_EVENT, onUpdate);
        return () => window.removeEventListener(AUTUMN_EMERGENCE_EVENT, onUpdate);
    }, [landId]);

    if (!parseAgriLandId(landId)) return null;

    const status = summary?.status ?? null;
    const pending = summary?.pending === true && status == null && (summary.timeseries.length ?? 0) === 0;
    const increment = summary?.summary.increment_median;
    const body = error
        ? t("loadFailed")
        : pending
          ? t("pending")
          : status
            ? t(sentenceKey(status), {
                  asOf: summary?.as_of_date ?? t("dateMissing"),
                  baseline: baselineWindowLabel(summary?.baseline.dates) ?? t("baselineMissing"),
                  increment:
                      increment != null && status !== "not_emerged" && status !== "uncertain"
                          ? t("incrementClause", { value: increment.toFixed(3) })
                          : "",
              })
            : t("sentence_empty");

    return (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
                <Sprout className="h-4 w-4 text-primary" aria-hidden="true" />
                <h4 className="text-sm font-semibold">{t("cardTitle")}</h4>
                {!loading && status && (
                    <span className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {t(`status_${status}`)}
                    </span>
                )}
            </div>
            {loading ? (
                <Skeleton className="h-10 w-full" />
            ) : (
                <>
                    <p className={cn("text-xs leading-relaxed", error ? "text-destructive" : "text-muted-foreground")}>{body}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{t("referenceNote")}</p>
                </>
            )}
            {onShowOnMap && (
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onShowOnMap}>
                    {t("showOnMap")}
                </Button>
            )}
        </div>
    );
}
