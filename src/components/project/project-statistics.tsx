"use client";

import { Bell, Map, MapPin, ScanLine, ShieldAlert, SquareDashed } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { type ProjectFilters, type summarizeProjectLands } from "@/lib/project-monitoring";

type Stats = ReturnType<typeof summarizeProjectLands>;

export function ProjectStatistics({ stats, available, onFilter, inline = false }: {
    stats: Stats;
    available: boolean;
    onFilter: (filter: Partial<ProjectFilters>) => void;
    inline?: boolean;
}) {
    const t = useTranslations("projectMonitoring");
    const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const cards = [
        { key: "landCount", icon: Map, value: number(stats.count), note: t("unmarkedCount", { count: stats.unmarked }),
            action: { focus: "all", risk: "all", data: "all" } as Partial<ProjectFilters> },
        { key: "totalArea", icon: SquareDashed, value: t("areaValue", { value: number(stats.areaMu) }),
            note: stats.missingArea ? t("missingArea", { count: stats.missingArea }) : t("areaBasis") },
        { key: "coverage", icon: ScanLine, value: available && stats.coverage !== null ? `${stats.coverage.toFixed(1)}%` : "—",
            note: available ? t("freshCount", { count: stats.freshCount, total: stats.count }) : t("data.unavailable"),
            action: { data: "fresh", focus: "all", risk: "all" } as Partial<ProjectFilters> },
        { key: "riskCount", icon: ShieldAlert, value: available ? number(stats.riskCount) : "—",
            note: available ? t("severityCounts", stats.risks) : t("data.unavailable"),
            action: { focus: "risk", risk: "all" } as Partial<ProjectFilters>, danger: stats.risks.high > 0 },
        { key: "riskArea", icon: MapPin, value: available ? t("areaValue", { value: number(stats.riskAreaMu) }) : "—",
            note: stats.riskMissingArea ? t("missingArea", { count: stats.riskMissingArea })
                : available && stats.riskAreaPercent !== null ? t("riskAreaShare", { value: stats.riskAreaPercent.toFixed(1) })
                : t("riskAreaNote"), action: { focus: "risk", risk: "all" } as Partial<ProjectFilters> },
        { key: "openAlerts", icon: Bell, value: available ? number(stats.openAlerts) : "—",
            note: available ? t("highAlerts", { count: stats.openHigh }) : t("data.unavailable"),
            action: { focus: "pending", risk: "all" } as Partial<ProjectFilters> },
    ];
    return (
        <div
            className={cn(
                inline
                    ? "grid min-w-[32rem] grid-cols-6 gap-1"
                    : "grid auto-cols-[minmax(10rem,1fr)] grid-flow-col gap-2 overflow-x-auto px-4 pb-3 lg:grid-flow-row lg:grid-cols-6",
            )}
            aria-label={t("statistics")}
        >
            {cards.map(({ key, icon: Icon, value, note, action, danger }) => (
                <button key={key} type="button" disabled={!action || (!available && key !== "landCount")}
                    onClick={() => action && onFilter(action)}
                    className={cn(
                        "flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-3 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        inline && "min-w-0 gap-0.5 p-1.5 shadow-none",
                        action ? "enabled:hover:border-primary/40" : "cursor-default",
                    )}>
                    <span className={cn("flex items-center gap-2 text-xs text-muted-foreground", inline && "gap-1 truncate text-[10px]")} title={inline ? `${t(`stats.${key}`)}：${note}` : undefined}>
                        <Icon className={cn("h-4 w-4", inline && "h-3 w-3 shrink-0")} />
                        <span className="truncate">{t(`stats.${key}`)}</span>
                    </span>
                    <span className={cn("font-mono font-bold tabular-nums", inline ? "text-base" : "text-2xl", danger && "text-sev-high")}>{value}</span>
                    {inline ? <span className="sr-only">{note}</span> : <span className="text-xs text-muted-foreground">{note}</span>}
                </button>
            ))}
        </div>
    );
}
