"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, CheckCircle2, ExternalLink, ShieldAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { RISK_CLASSES, type ProjectLand } from "@/lib/project-monitoring";
import { ruleLabel } from "@/lib/alert-rules";
import { cn } from "@/lib/utils";
import { formatAlertCount } from "@/lib/alert-session";
import { MAP_CHROME } from "@/lib/design-tokens";
import { isDecloudProduct } from "@/lib/agri-classify";

export function ProjectRiskBadge({ land }: { land: Pick<ProjectLand, "riskLevel"> }) {
    const t = useTranslations("projectMonitoring");
    const Icon = land.riskLevel === "high" ? ShieldAlert : land.riskLevel === "medium" ? AlertTriangle
        : land.riskLevel === "low" ? Bell : land.riskLevel === "normal" ? CheckCircle2 : AlertTriangle;
    return <span className={cn("inline-flex items-center gap-1 text-xs font-medium", RISK_CLASSES[land.riskLevel])}>
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />{t(`risk.${land.riskLevel}`)}
    </span>;
}

export function ProjectLandPanel({ land, groupId, freshnessDays, onClose }: {
    land: ProjectLand;
    groupId: string;
    freshnessDays: number;
    onClose: () => void;
}) {
    const t = useTranslations("projectMonitoring");
    const tRules = useTranslations("alertRules");
    const closeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const previousFocus = document.activeElement;
        closeRef.current?.focus({ preventScroll: true });
        return () => { if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true }); };
    }, [land.landId]);
    const monitoring = land.monitoring;
    const observation = monitoring?.observation;
    const previous = monitoring?.previous_observation;
    const firstAlert = monitoring?.alerts[0];
    const openAlertCount = monitoring?.open_alert_count ?? 0;
    // 同一日期的有效观测与最新影像是同一批数据时只展示一次，避免用户误以为有两次更新。
    const latestSceneDiffers = Boolean(monitoring?.latest_scene_date && monitoring.latest_scene_date !== observation?.date);
    const href = `/farms/fields/detail?groupId=${encodeURIComponent(groupId)}&fieldId=${encodeURIComponent(land.landId)}`;
    const emptyValue = t("notAvailable");
    const unregistered = t("notRegistered");
    return (
        <aside aria-label={t("landDetails")} className={cn("flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl", MAP_CHROME)}>
            <div className="flex items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0 space-y-2">
                    <p className="break-words text-lg font-semibold">{land.landName}</p>
                    <ProjectRiskBadge land={land} />
                </div>
                <Button ref={closeRef} variant="ghost" size="icon" onClick={onClose} aria-label={t("closeDetails")}><X aria-hidden="true" className="h-4 w-4" /></Button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto p-4">
                <section className="space-y-3">
                    <h2 className="text-sm font-semibold">{t("overview")}</h2>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                    {[
                        [t("area"), land.areaMu === null ? emptyValue : t("areaValue", { value: land.areaMu.toFixed(2) })],
                        [t("crop"), land.cropText || unregistered],
                        [t("planting"), land.cropStatus || unregistered],
                        [t("owner"), land.ownerName || unregistered],
                    ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}
                    </dl>
                </section>
                {!land.geometry && <p className="text-xs text-warning">{t("unmarkedNote")}</p>}
                <section className="space-y-2 rounded-lg border bg-surface-2 p-3">
                    <h2 className="text-sm font-semibold">{t("riskSummary")}</h2>
                    <p className={cn("text-sm", firstAlert ? "font-medium" : "")}>{firstAlert ? ruleLabel(firstAlert.rule_name, tRules)
                        : t(land.dataStatus === "fresh" ? "noCurrentAlerts" : "cannotAssess")}</p>
                    {firstAlert && <p className="text-xs text-muted-foreground">{t("alertEvidence", { date: firstAlert.date })}</p>}
                    {openAlertCount > 0 && <p className="text-xs font-medium text-warning">{t("pendingCount", { count: formatAlertCount(openAlertCount) })}</p>}
                    {firstAlert && <p className="text-xs text-muted-foreground">{t("verificationNote")}</p>}
                </section>
                <section className="space-y-2">
                    <h2 className="text-sm font-semibold">{t("dataQuality")}</h2>
                    <p className={cn("text-xs", land.dataStatus === "fresh" ? "text-success" : "text-warning")}>{t(`data.${land.dataStatus}`)}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        <p className="text-xs text-muted-foreground">{t("observedAt", { date: observation?.date ?? emptyValue })}</p>
                        {latestSceneDiffers && <p className="text-xs text-muted-foreground">{t("latestScene", { date: monitoring?.latest_scene_date ?? emptyValue })}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground">{land.dataStatus === "fresh" || land.dataStatus === "stale" ? t("freshnessRule", { days: freshnessDays }) : t("dataGap")}</p>
                    {observation && <p className="text-xs text-muted-foreground">{t("source", { source: isDecloudProduct({ source: observation.source }) ? t("decloud") : t("optical") })}
                        {observation.cloud_cover !== null ? ` · ${t("cloud", { value: observation.cloud_cover.toFixed(1) })}` : ""}</p>}
                </section>
                <section className="space-y-2">
                    <h2 className="text-sm font-semibold">{t("indicators")}</h2>
                    <p className="text-xs text-muted-foreground">{previous ? t("comparison", { date: previous.date }) : t("noComparison")}</p>
                    <div className="grid grid-cols-3 gap-2">
                        {(["ndvi", "evi", "ndmi"] as const).map((index) => {
                            const currentValue = observation?.[index];
                            const priorValue = previous?.[index];
                            const change = currentValue != null && priorValue != null ? currentValue - priorValue : null;
                            return <div key={index} className="min-w-0 space-y-1 rounded-lg border p-2">
                                <p className="text-xs text-muted-foreground">{index.toUpperCase()}</p>
                                <p className="font-mono text-sm font-semibold tabular-nums">{currentValue?.toFixed(3) ?? "—"}</p>
                                <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                    {change !== null && (change < 0 ? <ArrowDownRight aria-hidden="true" className="h-3 w-3" /> : <ArrowUpRight aria-hidden="true" className="h-3 w-3" />)}
                                    {change === null ? "—" : t("changeValue", { value: `${change >= 0 ? "+" : ""}${change.toFixed(3)}` })}
                                </p>
                            </div>;
                        })}
                    </div>
                </section>
                {monitoring && monitoring.alerts.length > 0 && <section className="space-y-2">
                    <h2 className="text-sm font-semibold">{t("alertReasons", { count: formatAlertCount(monitoring.risk_alert_count) })}</h2>
                    {monitoring.alerts.map((alert) => <div key={alert.id} className="space-y-2 rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-medium">{ruleLabel(alert.rule_name, tRules)}</span>
                            <span className="text-xs text-muted-foreground">{t(alert.status === "open" ? "pending" : "closedEvidence")}</span>
                        </div>
                        <p className="break-words text-xs text-muted-foreground">{alert.message}</p>
                        <p className="font-mono text-xs text-muted-foreground">{alert.date}</p>
                    </div>)}
                    {monitoring.risk_alert_count > monitoring.alerts.length && <p className="text-xs text-muted-foreground">{t("moreAlerts")}</p>}
                </section>}
            </div>
            <div className="border-t p-4">
                <Button className="w-full" asChild>
                    <Link href={href} data-tour="land-detail" data-tour-href={href}>
                        <ExternalLink aria-hidden="true" className="mr-2 h-4 w-4" />{t("fullDetail")}
                    </Link>
                </Button>
            </div>
        </aside>
    );
}
