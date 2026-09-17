"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { alertsApi } from "@/lib/api";
import type { Alert } from "@/lib/api";
import { useAlertSummary } from "@/hooks/use-alert-summary";
import { formatAlertCount } from "@/lib/alert-session";
import { toast } from "sonner";
import {
    AlertTriangle,
    Bell,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ShieldAlert,
    CheckCheck,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { AlertRow } from "@/components/alert-row";

/* ── (severity config and rule labels moved to alert-row.tsx) ─── */

const SEVERITY_TABS = ["all", "high", "medium", "low"] as const;

/** Rows per page. The API caps a single request at 200. */
const PAGE_SIZE = 10;

export default function AlertsPage() {
    const t = useTranslations("alertsPage");
    const tRead = useTranslations("alertReading");
    const { data: summary, error: summaryError } = useAlertSummary();
    const requestId = useRef(0);

    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [markingAll, setMarkingAll] = useState(false);
    const [readFilter, setReadFilter] = useState("all");
    const [loadError, setLoadError] = useState<string | null>(null);

    // Filters. Both are applied server-side now: severity used to be a
    // client-side filter over a capped fetch, which is why the page could
    // only ever see the first 200 alerts.
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [severityFilter, setSeverityFilter] = useState<string>("all");
    const [page, setPage] = useState(0);

    const loadAlerts = useCallback(async () => {
        const currentRequest = ++requestId.current;
        setLoading(true);
        setLoadError(null);
        try {
            const res = await alertsApi.list({
                status: statusFilter === "all" ? undefined : statusFilter,
                severity: severityFilter === "all" ? undefined : severityFilter,
                isRead: readFilter === "all" ? undefined : readFilter === "read",
                limit: PAGE_SIZE,
                offset: page * PAGE_SIZE,
            });
            // 快速切换阅读筛选或页码时，旧响应不能覆盖最新列表。
            if (currentRequest !== requestId.current) return;
            setAlerts(res.items);
            setTotal(res.total);
        } catch (err) {
            if (currentRequest === requestId.current) {
                setLoadError(err instanceof Error ? err.message : tRead("loadFailed"));
            }
        } finally {
            if (currentRequest === requestId.current) setLoading(false);
        }
    }, [statusFilter, severityFilter, readFilter, page, tRead]);

    useEffect(() => {
        void loadAlerts();
        return () => { requestId.current += 1; };
    }, [loadAlerts]);

    // A filter change invalidates the current offset: page 8 of "all"
    // is not page 8 of "high".
    useEffect(() => {
        setPage(0);
    }, [statusFilter, severityFilter, readFilter]);

    const markAllRead = async () => {
        setMarkingAll(true);
        try {
            // 批量接口以当前租户和用户为范围，不受列表筛选或当前页影响。
            const result = await alertsApi.markAllRead();
            toast.success(tRead("allReadSuccess", { count: result.marked_count }));
            if (page !== 0) setPage(0);
            else await loadAlerts();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : tRead("failed"));
        } finally {
            setMarkingAll(false);
        }
    };

    const onRead = (updated: Alert) => {
        if (readFilter === "unread") {
            if (alerts.length === 1 && page > 0) setPage((value) => value - 1);
            else void loadAlerts();
        } else {
            setAlerts((previous) => previous.map((item) => item.id === updated.id ? updated : item));
        }
    };

    const toggleStatus = async (alert: Alert) => {
        const newStatus = alert.status === "open" ? "closed" : "open";
        setTogglingId(alert.id);
        try {
            const updated = await alertsApi.update(alert.id, { status: newStatus });
            setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            toast.success(
                newStatus === "closed" ? t("alertClosed") : t("alertReopened"),
            );
            // 更新接口统一刷新共享统计；筛选列表再按关闭状态重新加载。
            if (statusFilter !== "all") loadAlerts();
        } catch (err: any) {
            toast.error(err.detail || t("failedUpdate"));
        } finally {
            setTogglingId(null);
        }
    };

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const rangeFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
    const rangeTo = Math.min(total, (page + 1) * PAGE_SIZE);

    if (loading) {
        return (
            <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-24 w-full rounded-lg" />
                    ))}
                </div>
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-lg" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    {t("subtitle")}
                </p>
            </div>

            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium" title={String(summary?.unread_total ?? "")}>
                    {tRead("myUnread")}：{summary ? formatAlertCount(summary.unread_total) : "—"}
                </span>
                <Button
                    variant="outline"
                    onClick={markAllRead}
                    disabled={markingAll || !summary || !!summaryError || summary.unread_total === 0}
                    title={tRead("allReadHint")}
                >
                    {markingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                    {tRead("markAllRead")}
                </Button>
                <p className="w-full text-xs text-muted-foreground">{tRead("allReadHint")}</p>
            </div>

            {/* Summary. Icon and count both read from the severity tokens,
                so the summary cannot drift from the rows below it. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <SummaryCard
                    label={t("totalOpen")}
                    count={summary?.open_total ?? 0}
                    icon={<Bell className="h-5 w-5 text-primary" />}
                />
                <SummaryCard
                    label={t("high")}
                    count={summary?.high ?? 0}
                    icon={<ShieldAlert className="h-5 w-5 text-sev-high" />}
                    countClass="text-sev-high"
                />
                <SummaryCard
                    label={t("medium")}
                    count={summary?.medium ?? 0}
                    icon={<AlertTriangle className="h-5 w-5 text-sev-medium" />}
                    countClass="text-sev-medium"
                />
                <SummaryCard
                    label={t("low")}
                    count={summary?.low ?? 0}
                    icon={<Bell className="h-5 w-5 text-sev-low" />}
                    countClass="text-sev-low"
                />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
                {/* Severity as a segmented control: four mutually exclusive
                    options are cheaper to read than a closed dropdown. */}
                {/* bg-muted, not bg-surface-2: the page wash is already
                    surface-2, so the track was the exact same colour as the
                    page behind it and the group read as loose text. */}
                <div
                    role="group"
                    aria-label={t("filters")}
                    className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-1"
                >
                    {SEVERITY_TABS.map((sev) => (
                        <button
                            key={sev}
                            type="button"
                            onClick={() => setSeverityFilter(sev)}
                            aria-pressed={severityFilter === sev}
                            className={cn(
                                "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                severityFilter === sev
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {sev === "all" ? t("severityAll") : t(sev)}
                        </button>
                    ))}
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("allStatuses")}</SelectItem>
                        <SelectItem value="open">{t("openOnly")}</SelectItem>
                        <SelectItem value="closed">{t("closedOnly")}</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={readFilter} onValueChange={setReadFilter}>
                    <SelectTrigger className="w-[140px]" aria-label={tRead("filter")}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{tRead("all")}</SelectItem>
                        <SelectItem value="unread">{tRead("unread")}</SelectItem>
                        <SelectItem value="read">{tRead("read")}</SelectItem>
                    </SelectContent>
                </Select>

                {/* A filtered list with no total is a trap: the user reads
                    four alerts and thinks that is all of them. */}
                <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                    {t("showingRange", { from: rangeFrom, to: rangeTo, total })}
                </span>
            </div>

            {/* Alert List */}
            {loadError ? (
                <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
                    <p>{loadError}</p>
                    <Button variant="outline" className="mt-3" onClick={loadAlerts}>{tRead("retry")}</Button>
                </div>
            ) : alerts.length === 0 ? (
                <Card className="border-2 border-dashed">
                    <CardContent className="p-12 text-center">
                        <CheckCircle2 className="mx-auto h-12 w-12 text-primary/30" />
                        <p className="mt-4 text-sm font-medium">{t("noAlerts")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {t("noAlertsDesc")}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-2">
                    {alerts.map((alert) => {
                        return (
                            <AlertRow
                                key={alert.id}
                                alert={alert}
                                onRead={onRead}
                                fieldName={alert.land_name ?? undefined}
                                farmId={alert.farm_id ?? undefined}
                                farmName={alert.farm_name ?? undefined}
                                showActions
                                onToggleStatus={toggleStatus}
                                togglingId={togglingId}
                                actionLabels={{ close: t("close"), reopen: t("reopen") }}
                                closedLabel={t("closed")}
                            />
                        );
                    })}
                </div>
            )}

            {/* Page controls. Shown whenever there is more than one page,
                so the list never silently ends at a boundary. */}
            {pageCount > 1 && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {t("pageOf", { page: page + 1, pages: pageCount })}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 0 || loading}
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            {t("previousPage")}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page + 1 >= pageCount || loading}
                            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                        >
                            {t("nextPage")}
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── Summary Card ─────────────────────────────────────────── */

function SummaryCard({
    label,
    count,
    icon,
    countClass,
}: {
    label: string;
    count: number;
    icon: React.ReactNode;
    /** Severity colour for the metric, matched to the icon. */
    countClass?: string;
}) {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-start gap-3">
                    {icon}
                    <span className="text-sm leading-snug text-muted-foreground">{label}</span>
                </div>
                <p className={cn("mt-3 text-2xl font-bold tracking-tight tabular-nums", countClass)}>
                    <span title={String(count)}>{formatAlertCount(count)}</span>
                </p>
            </CardContent>
        </Card>
    );
}
