"use client";

import { useTranslations } from "next-intl";
import type { Phenology, PhenologyWindow } from "@/lib/parcel-insights";
import { Button } from "@/components/ui/button";

/** 保留全部识别证据；不完整周期可用观测起止日期回填代理窗口，并明确提示人工核对。 */
export function PhenologyCandidates({ landName, data, selected, disabled, onSelect }: {
    landName: string;
    data: Phenology;
    selected?: { start_date: string; end_date: string };
    disabled: boolean;
    onSelect: (window: PhenologyWindow) => void;
}) {
    const t = useTranslations("parcelInsights");
    const complete = data.windows.filter(window => window.start_date && window.end_date);
    const isSelected = (window: PhenologyWindow) => !!selected && !!(window.start_date || window.end_date)
        && (!window.start_date || selected.start_date === window.start_date)
        && (!window.end_date || selected.end_date === window.end_date);
    const filled = data.windows.some(isSelected);
    const needsDates = !!selected && (!selected.start_date || !selected.end_date);
    const selectedWindow = data.windows.find(isSelected);
    const observedBoundaryFilled = !!selected && !!selectedWindow && (
        (!selectedWindow.start_date && selected.start_date === selectedWindow.observed_start)
        || (!selectedWindow.end_date && selected.end_date === selectedWindow.observed_end)
    );

    return <section aria-label={`${landName} ${t("inferenceResults")}`} className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
        <p className="font-medium">{t("inferenceSummary", { count: data.windows.length, complete: complete.length, observations: data.observation_count })}</p>
        <p role="status" className={filled ? "font-medium text-primary" : "text-muted-foreground"}>
            {filled ? observedBoundaryFilled ? t("observedWindowFilled") : needsDates ? t("partialWindowFilled") : t("windowFilled") : data.windows.length ? t("chooseWindow") : t("noCompleteWindow")}
        </p>
        <div className="grid gap-2 md:grid-cols-2">
            {data.windows.map((window, index) => {
                const canFill = !!window.start_date && !!window.end_date;
                const active = isSelected(window);
                return <article key={`${window.observed_start || window.start_date}-${index}`} className="space-y-2 rounded-md border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{t("candidateWindow", { number: index + 1 })}</span>
                        <span className="text-muted-foreground">{canFill ? t("completeWindow") : t("partialWindow")}</span>
                    </div>
                    <p>{window.start_date || t("startUnknown")} ~ {window.end_date || t("endUnknown")}</p>
                    {!canFill && <p className="text-muted-foreground">{t("observedRange")} {window.observed_start || window.start_date || "—"} ~ {window.observed_end || window.end_date || "—"}</p>}
                    <p className="text-muted-foreground">{t("peak")} {window.peak_date || "—"} · {window.confidence === "medium" ? t("mediumConfidence") : t("lowConfidence")}</p>
                    {window.start_interval && <p className="text-muted-foreground">{t("startInterval")} {window.start_interval.join(" ~ ")}</p>}
                    {window.end_interval && <p className="text-muted-foreground">{t("endInterval")} {window.end_interval.join(" ~ ")}</p>}
                    <Button type="button" size="sm" variant={active ? "secondary" : "outline"} disabled={disabled} aria-pressed={active} onClick={() => onSelect(window)}>
                        {active ? t("windowApplied") : canFill ? t("applyWindow") : window.observed_start || window.observed_end ? t("fillObservedRange") : t("fillKnownDates")}
                    </Button>
                </article>;
            })}
        </div>
        <p className="text-muted-foreground">{data.note}</p>
    </section>;
}
