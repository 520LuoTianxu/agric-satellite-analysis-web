"use client";

import React, { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { alertsApi } from "@/lib/api";
import { formatAlertCount } from "@/lib/alert-session";
import type { Alert } from "@/lib/api";
import { listPlantingGroups, formatMu, type AgricGroup } from "@/lib/agric";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
    FolderKanban,
    Map,
    ChevronRight,
    Bell,
    CheckCircle2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { AlertRow } from "@/components/alert-row";
import { cn } from "@/lib/utils";

/** How many alert rows the panel shows before deferring to the alerts page. */
const ALERT_PREVIEW = 4;

/** Farm rows shown before deferring to the farms page. Four fills the
 *  column against the four alerts on the right; three left a row's worth
 *  of dead space inside the card. */
const FARM_PREVIEW = 4;

export default function DashboardPage() {
    const t = useTranslations("dashboard");
    const [groups, setGroups] = useState<AgricGroup[]>([]);
    const [groupTotal, setGroupTotal] = useState(0);
    const [fieldTotal, setFieldTotal] = useState(0);
    const [openAlerts, setOpenAlerts] = useState<Alert[]>([]);
    const [openAlertTotal, setOpenAlertTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [groupRes, alertRes] = await Promise.all([
                    listPlantingGroups({ pageNum: 1, pageSize: 10 }),
                    alertsApi.list({ status: "open", limit: 10 }),
                ]);
                if (cancelled) return;
                setGroups(groupRes.rows);
                setGroupTotal(groupRes.total);
                setFieldTotal(groupRes.rows.reduce((sum, group) => sum + (Number(group.groupNum) || 0), 0));
                setOpenAlerts(alertRes.items);
                setOpenAlertTotal(alertRes.total);
            } catch (err) {
                console.error("Dashboard load failed:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <div className="p-6 lg:p-8 max-w-6xl mx-auto">
                <div className="mb-8 space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-[108px] w-full rounded-lg" />
                    ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                    <div className="flex flex-col gap-4">
                        <Skeleton className="h-[268px] w-full rounded-lg" />
                        <Skeleton className="h-[164px] w-full rounded-lg" />
                    </div>
                    <Skeleton className="h-[448px] w-full rounded-lg" />
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
                    {t("welcomeTo", { orgName: "" })}
                </p>
            </div>

            {/* Stats. Open alerts is the only tinted metric - one coloured
                number in a row of neutral ones is what makes it read first. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                    icon={<FolderKanban className="h-5 w-5 text-primary" />}
                    label={t("farms")}
                    value={groupTotal}
                />
                <StatCard
                    icon={<Map className="h-5 w-5 text-primary" />}
                    label={t("fields")}
                    value={fieldTotal}
                    sublabel={t("acrossAllFarms")}
                />
                <StatCard
                    icon={<Bell className="h-5 w-5 text-primary" />}
                    label={t("openAlerts")}
                    value={formatAlertCount(openAlertTotal)}
                    sublabel={t("requireAttention")}
                    tone={openAlertTotal > 0 ? "danger" : "default"}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                {/* ── Left column ─────────────────────────────────── */}
                <div className="flex flex-col gap-4">
                    {/* Farms. flex-1 lets this card take up the slack so the
                        column ends level with the alerts panel beside it,
                        whatever the farm and alert counts happen to be. */}
                    <Card className="flex flex-col lg:flex-1">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <CardTitle>{t("yourFarms")}</CardTitle>
                            <Button variant="link" className="h-auto p-0" asChild>
                                <Link href="/farms">{t("viewAllFarms")}</Link>
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-1">
                            {groups.length === 0 ? (
                                <div className="rounded-lg border-2 border-dashed p-12 text-center">
                                    <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground/40" />
                                    <p className="mt-4 text-sm font-medium">{t("noFarmsYet")}</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {t("noGroupsYet")}
                                    </p>
                                    <Button className="mt-4" asChild>
                                        <Link href="/farms">{t("viewAllFarms")}</Link>
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {groups.slice(0, FARM_PREVIEW).map((group) => (
                                        <GroupRow
                                            key={String(group.groupId)}
                                            group={group}
                                            fieldCountLabel={(count) => t("fieldCount", { count })}
                                        />
                                    ))}
                                    {groups.length > FARM_PREVIEW && (
                                        <Link
                                            href="/farms"
                                            className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary/80"
                                        >
                                            {t("viewAllFarms")}
                                            <ChevronRight className="h-4 w-4" />
                                        </Link>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Quick actions sit below the farms they act on, so a
                        returning user is not stepping over them daily. */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("quickActions")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Link
                                    href="/farms"
                                    className="flex items-center gap-3 rounded-lg border p-4 hover:border-primary/30 hover:bg-primary-subtle transition-colors text-left w-full"
                                >
                                    <IconWell><FolderKanban className="h-5 w-5 text-primary" /></IconWell>
                                    <div>
                                        <p className="text-sm font-medium">{t("viewAllFarms")}</p>
                                        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("browseGroupsDesc")}</p>
                                    </div>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* ── Right column: the one thing a farm manager opens
                       the app to see. ─────────────────────────────── */}
                <Card className="flex flex-col">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle>{t("openAlerts")}</CardTitle>
                        {openAlertTotal > 0 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                                {openAlertTotal}
                            </span>
                        )}
                    </CardHeader>
                    <CardContent className="flex-1">
                        {openAlerts.length === 0 ? (
                            <div className="py-10 text-center">
                                <CheckCircle2 className="mx-auto h-5 w-5 text-success" />
                                <p className="mt-3 text-sm font-medium">{t("noOpenAlerts")}</p>
                                <p className="mt-1 text-[13px] text-muted-foreground">
                                    {t("noOpenAlertsDesc")}
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {openAlerts.slice(0, ALERT_PREVIEW).map((alert) => (
                                    <AlertRow
                                        key={alert.id}
                                        alert={alert}
                                        fieldName={alert.land_name ?? undefined}
                                        farmId={alert.farm_id ?? undefined}
                                        farmName={alert.farm_name ?? undefined}
                                    />
                                ))}
                                {openAlertTotal > ALERT_PREVIEW && (
                                    <Link
                                        href="/alerts"
                                        className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary/80"
                                    >
                                        {t("viewAllAlerts")}
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

/* ── Pieces ───────────────────────────────────────────────── */

/** 40px tinted square that carries a 20px icon. */
function IconWell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle">
            {children}
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    sublabel,
    tone = "default",
}: {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    sublabel?: string;
    tone?: "default" | "danger";
}) {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-center gap-3">
                    {icon}
                    <span className="text-sm text-muted-foreground">{label}</span>
                </div>
                <p
                    className={cn(
                        "mt-3 text-2xl font-bold tracking-tight tabular-nums",
                        tone === "danger" && "text-danger",
                    )}
                >
                    {value}
                </p>
                {sublabel && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{sublabel}</p>
                )}
            </CardContent>
        </Card>
    );
}

function GroupRow({
    group,
    fieldCountLabel,
}: {
    group: AgricGroup;
    fieldCountLabel: (count: number) => string;
}) {
    const groupId = String(group.groupId);
    const fieldCount = Number(group.groupNum) || 0;
    const areaText = formatMu(group.effectiveArea ?? group.groupArea);

    return (
        <Link
            href={`/farms/detail?groupId=${encodeURIComponent(groupId)}`}
            className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:border-primary/30 hover:shadow-md transition-all"
        >
            <div className="flex min-w-0 items-center gap-3">
                <IconWell><FolderKanban className="h-5 w-5 text-primary" /></IconWell>
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{group.groupName || groupId}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {fieldCountLabel(fieldCount)}
                        {areaText !== "—" && (
                            <>
                                {" · "}
                                <span className="font-mono tabular-nums">{areaText}</span>
                            </>
                        )}
                    </p>
                </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
    );
}
