"use client";

import { FieldTabSkeleton } from "@/components/field/field-tab-skeleton";

import React, { useState, useCallback, useEffect } from "react";
import { alertsApi, type Alert } from "@/lib/api";
import { toast } from "sonner";
import {
    CheckCircle2,
    Eye,
    EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { AlertRow } from "@/components/alert-row";
import { formatAlertCount } from "@/lib/alert-session";

/* ── Props ────────────────────────────────────────────────────── */

interface AlertsTabProps {
    landId: string;
    /** Called with the count of open alerts (for badge). */
    onOpenCountChange?: (count: number) => void;
}

export default function AlertsTab({ landId, onOpenCountChange }: AlertsTabProps) {
    const t = useTranslations("alertsTab");
    const tRead = useTranslations("alertReading");
    const [loadFailed, setLoadFailed] = useState(false);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [showClosed, setShowClosed] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const loadAlerts = useCallback(async () => {
        setLoading(true);
        setLoadFailed(false);
        try {
            const res = await alertsApi.listForLand(landId, 200);
            setAlerts(res.items ?? []);
        } catch {
            setLoadFailed(true);
        } finally {
            setLoading(false);
        }
    }, [landId]);

    useEffect(() => {
        loadAlerts();
    }, [loadAlerts]);

    // Report open count to parent for badge
    useEffect(() => {
        if (loading || loadFailed) return;
        const openCount = alerts.filter((a) => a.status === "open").length;
        onOpenCountChange?.(openCount);
    }, [alerts, loading, loadFailed, onOpenCountChange]);

    const toggleStatus = async (alert: Alert) => {
        const newStatus = alert.status === "open" ? "closed" : "open";
        setTogglingId(alert.id);
        try {
            const updated = await alertsApi.update(alert.id, { status: newStatus });
            setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            toast.success(
                newStatus === "closed" ? t("alertClosed") : t("alertReopened"),
            );
        } catch (err: any) {
            toast.error(err.detail || t("failedUpdate"));
        } finally {
            setTogglingId(null);
        }
    };

    if (loading) return <FieldTabSkeleton variant="alerts" />;

    if (loadFailed) {
        return <div role="alert" className="flex items-center justify-between gap-3 py-3 text-sm">
            {tRead("loadFailed")}
            <Button size="sm" variant="outline" onClick={loadAlerts}>{tRead("retry")}</Button>
        </div>;
    }

    const openAlerts = alerts.filter((a) => a.status === "open");
    const closedAlerts = alerts.filter((a) => a.status === "closed");
    // 待处理项先按严重程度、再按观测日期排列，历史记录单独排在末尾。
    const severityRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    openAlerts.sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0) || b.date.localeCompare(a.date));
    const visibleAlerts = showClosed ? [...openAlerts, ...closedAlerts.sort((a, b) => b.date.localeCompare(a.date))] : openAlerts;

    if (alerts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center text-center py-5">
                <CheckCircle2 className="h-8 w-8 text-primary/40 mb-2" />
                <p className="text-sm font-medium">{t("noAlerts")}</p>
                <p className="text-xs text-muted-foreground mt-1 max-md:hidden">
                    {t("noAlertsDesc")}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Summary + filter */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground max-md:text-2xl max-md:font-semibold max-md:tabular-nums">{formatAlertCount(openAlerts.length)}</span>{" "}
                    {t("open")}
                    {closedAlerts.length > 0 && (
                        <span className="ml-1">
                            · {formatAlertCount(closedAlerts.length)} {t("closed")}
                        </span>
                    )}
                </p>
                {closedAlerts.length > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowClosed(!showClosed)}
                        className="px-2 text-xs"
                    >
                        {showClosed ? (
                            <><EyeOff className="h-3 w-3 mr-1" />{t("hideClosed")}</>
                        ) : (
                            <><Eye className="h-3 w-3 mr-1" />{t("showClosed")}</>
                        )}
                    </Button>
                )}
            </div>

            {/* Alert list */}
            <div className="space-y-2">
                {visibleAlerts.map((alert) => (
                    <AlertRow
                        key={alert.id}
                        alert={alert}
                        compact
                        showActions
                        onToggleStatus={toggleStatus}
                        togglingId={togglingId}
                        actionLabels={{ close: t("close"), reopen: t("reopen") }}
                    />
                ))}
            </div>
        </div>
    );
}
