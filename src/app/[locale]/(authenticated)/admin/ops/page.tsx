"use client";

import { useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { Activity, Ban, CheckCircle2, Clock3, Cpu, Loader2, Play, RefreshCw, ServerCrash, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { adminOpsApi, type AdminOpsOverview, type AdminTaskRun, type DownloadWorkerStatus } from "@/lib/api";
import { AdminExecutionMonitor } from "@/components/admin/execution-monitor";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

const REFRESH_INTERVAL = 10_000;

function formatTime(value: string | null, locale: string) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(locale, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(new Date(value));
}

function formatAge(seconds: number | null, t: (key: string, values?: Record<string, number>) => string) {
    if (seconds === null) return t("never");
    if (seconds < 60) return t("secondsAgo", { count: seconds });
    return t("minutesAgo", { count: Math.floor(seconds / 60) });
}

function formatQueueDepth(worker: DownloadWorkerStatus) {
    if (worker.pending_queue_count === null) return null;
    const queues = Object.entries(worker.queue_depths || {})
        .map(([name, count]) => `${name} ${count}`)
        .join(" · ");
    return queues ? `${worker.pending_queue_count}（${queues}）` : `${worker.pending_queue_count}`;
}

function workerTone(status: DownloadWorkerStatus["status"]) {
    if (status === "online") return "border-success/30 bg-success-subtle text-success";
    if (status === "stale") return "border-warning/40 bg-warning-subtle text-warning-foreground";
    return "border-destructive/30 bg-destructive/5 text-destructive";
}

function runTone(status: AdminTaskRun["status"]) {
    if (status === "success") return "border-success/30 bg-success-subtle text-success";
    if (status === "failed") return "border-destructive/30 bg-destructive/5 text-destructive";
    if (status === "cancelled") return "border-muted-foreground/30 bg-muted text-muted-foreground";
    return "border-primary/30 bg-primary-subtle text-primary";
}

export default function AdminOperationsPage() {
    const t = useTranslations("adminOps");
    const locale = useLocale();
    const [triggering, setTriggering] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [smartLandList, setSmartLandList] = useState("");
    const [smartFromLandId, setSmartFromLandId] = useState("");
    const [smartToLandId, setSmartToLandId] = useState("");
    const [smartYears, setSmartYears] = useState("3");
    const [satelliteHistoryLandList, setSatelliteHistoryLandList] = useState("");
    const [satelliteHistoryYears, setSatelliteHistoryYears] = useState("5");
    const { data, error, isLoading, mutate } = useSWR<AdminOpsOverview>(
        "/admin/ops/overview",
        () => adminOpsApi.overview(100),
        { refreshInterval: REFRESH_INTERVAL, revalidateOnFocus: true },
    );

    const counts = useMemo(() => {
        const workers = data?.workers || [];
        const runs = data?.runs || [];
        return {
            online: workers.filter((item) => item.status === "online").length,
            offline: workers.filter((item) => item.status === "offline" || item.status === "stale" || item.status === "unknown").length,
            active: runs.filter((item) => item.status === "queued" || item.status === "running").length,
        };
    }, [data]);

    async function trigger(taskKey: string) {
        setTriggering(taskKey);
        setNotice(null);
        try {
            await adminOpsApi.trigger({ task_key: taskKey });
            setNotice(t("triggered"));
            await mutate();
        } catch (triggerError) {
            setNotice(triggerError instanceof Error ? triggerError.message : t("triggerFailed"));
        } finally {
            setTriggering(null);
        }
    }

    async function triggerSmartBackfill() {
        const landIds = smartLandList
            .split(/[\s,，]+/)
            .map((value) => value.trim())
            .filter(Boolean);
        const hasList = landIds.length > 0;
        const hasRange = Boolean(smartFromLandId.trim() || smartToLandId.trim());
        if (hasList === hasRange || (hasRange && (!smartFromLandId.trim() || !smartToLandId.trim()))) {
            setNotice(t("smartSelectionRequired"));
            return;
        }
        const years = Number(smartYears);
        if (!Number.isInteger(years) || years < 1 || years > 10) {
            setNotice(t("smartYearsInvalid"));
            return;
        }
        setTriggering("smart-land-backfill");
        setNotice(null);
        try {
            await adminOpsApi.trigger({
                task_key: "smart-land-backfill",
                ...(hasList ? { landIdList: landIds } : {
                    from_land_id: smartFromLandId.trim(),
                    to_land_id: smartToLandId.trim(),
                }),
                years,
                sensors: ["S1", "S2"],
            });
            setNotice(t("triggered"));
            await mutate();
        } catch (triggerError) {
            setNotice(triggerError instanceof Error ? triggerError.message : t("triggerFailed"));
        } finally {
            setTriggering(null);
        }
    }

    async function triggerSatelliteHistoryBackfill() {
        const landIds = satelliteHistoryLandList
            .split(/[\s,，]+/)
            .map((value) => value.trim())
            .filter(Boolean);
        const years = Number(satelliteHistoryYears);
        if (!Number.isInteger(years) || years < 1 || years > 10) {
            setNotice(t("satelliteHistoryYearsInvalid"));
            return;
        }
        setTriggering("satellite-history-backfill");
        setNotice(null);
        try {
            await adminOpsApi.trigger({
                task_key: "satellite-history-backfill",
                ...(landIds.length ? { landIdList: landIds } : {}),
                years,
                sensors: ["S1", "S2"],
            });
            setNotice(t("triggered"));
            await mutate();
        } catch (triggerError) {
            setNotice(triggerError instanceof Error ? triggerError.message : t("triggerFailed"));
        } finally {
            setTriggering(null);
        }
    }

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p>
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                    {t("refresh")}
                </Button>
            </section>

            {notice && <div className="rounded-lg border border-primary/20 bg-primary-subtle px-4 py-3 text-sm text-primary" role="status">{notice}</div>}
            {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{t("loadFailed")}</div>}

            <section className="grid gap-3 sm:grid-cols-3">
                <MetricCard icon={<Cpu className="h-4 w-4" />} label={t("onlineWorkers")} value={counts.online} detail={t("workerCount", { count: data?.workers.length || 0 })} />
                <MetricCard icon={<ServerCrash className="h-4 w-4" />} label={t("attentionWorkers")} value={counts.offline} detail={t("attentionHint")} tone={counts.offline > 0 ? "warning" : "default"} />
                <MetricCard icon={<Activity className="h-4 w-4" />} label={t("activeRuns")} value={counts.active} detail={t("autoRefresh", { seconds: REFRESH_INTERVAL / 1000 })} />
            </section>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5 text-primary" />{t("workersTitle")}</CardTitle>
                    <CardDescription>{t("workersDescription")}</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading && !data ? <Loading /> : data?.workers.length ? (
                        <div className="grid gap-3 lg:grid-cols-2">
                            {data.workers.map((worker) => <WorkerCard key={worker.worker_id} worker={worker} locale={locale} t={t} />)}
                        </div>
                    ) : <EmptyState icon={<ServerCrash className="h-5 w-5" />} text={t("noWorkers")} />}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" />{t("tasksTitle")}</CardTitle>
                    <CardDescription>{t("tasksDescription")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {data?.tasks.map((task) => (
                        <div key={task.key} className="flex flex-col gap-3 rounded-lg border bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium">{task.label}</p>
                                    <Badge variant={task.enabled ? "default" : "outline"}>{task.enabled ? t("enabled") : t("disabled")}</Badge>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
                                <p className="mt-2 text-xs text-muted-foreground">{task.schedule}</p>
                            </div>
                            {task.key === "smart-land-backfill" ? (
                                <div className="w-full max-w-3xl space-y-3 rounded-md border bg-muted/20 p-3 sm:w-[560px]">
                                    <p className="text-xs text-muted-foreground">{t("smartBackfillHint")}</p>
                                    <textarea
                                        className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                        value={smartLandList}
                                        onChange={(event) => setSmartLandList(event.target.value)}
                                        placeholder={t("landIdListPlaceholder")}
                                        aria-label={t("landIdList")}
                                    />
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        <Input value={smartFromLandId} onChange={(event) => setSmartFromLandId(event.target.value)} placeholder={t("fromLandId")} aria-label={t("fromLandId")} />
                                        <Input value={smartToLandId} onChange={(event) => setSmartToLandId(event.target.value)} placeholder={t("toLandId")} aria-label={t("toLandId")} />
                                        <Input type="number" min={1} max={10} value={smartYears} onChange={(event) => setSmartYears(event.target.value)} placeholder={t("years")} aria-label={t("years")} />
                                    </div>
                                    <Button size="sm" onClick={triggerSmartBackfill} disabled={triggering !== null || !task.enabled}>
                                        {triggering === task.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                        {t("runNow")}
                                    </Button>
                                </div>
                            ) : task.key === "satellite-history-backfill" ? (
                                <div className="w-full max-w-3xl space-y-3 rounded-md border bg-muted/20 p-3 sm:w-[560px]">
                                    <p className="text-xs text-muted-foreground">{t("satelliteHistoryHint")}</p>
                                    <textarea
                                        className="min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                        value={satelliteHistoryLandList}
                                        onChange={(event) => setSatelliteHistoryLandList(event.target.value)}
                                        placeholder={t("satelliteHistoryLandListPlaceholder")}
                                        aria-label={t("landIdList")}
                                    />
                                    <Input type="number" min={1} max={10} value={satelliteHistoryYears} onChange={(event) => setSatelliteHistoryYears(event.target.value)} placeholder={t("years")} aria-label={t("years")} />
                                    <Button size="sm" onClick={triggerSatelliteHistoryBackfill} disabled={triggering !== null || !task.enabled}>
                                        {triggering === task.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                        {t("runNow")}
                                    </Button>
                                </div>
                            ) : (
                                <Button size="sm" className="shrink-0" onClick={() => trigger(task.key)} disabled={triggering !== null}>
                                    {triggering === task.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                    {t("runNow")}
                                </Button>
                            )}
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t("runsTitle")}</CardTitle>
                    <CardDescription>{t("runsDescription")}</CardDescription>
                </CardHeader>
                <CardContent>
                    {data?.runs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">{t("task")}</th><th className="px-3 py-3 font-medium">{t("status")}</th><th className="px-3 py-3 font-medium">{t("createdAt")}</th><th className="px-3 py-3 font-medium">{t("finishedAt")}</th><th className="px-3 py-3 font-medium">{t("detail")}</th></tr></thead><tbody>{data.runs.map((run) => <RunRow key={run.id} run={run} locale={locale} t={t} />)}</tbody></table></div> : <EmptyState icon={<Clock3 className="h-5 w-5" />} text={t("noRuns")} />}
                </CardContent>
            </Card>

            <AdminExecutionMonitor />
        </div>
    );
}

function MetricCard({ icon, label, value, detail, tone = "default" }: { icon: ReactNode; label: string; value: number; detail: string; tone?: "default" | "warning" }) {
    return <Card><CardContent className="flex items-start justify-between gap-4 pt-5"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className={cn("mt-2 text-3xl font-semibold", tone === "warning" && "text-warning")}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className="rounded-lg bg-primary-subtle p-2 text-primary">{icon}</span></CardContent></Card>;
}

function WorkerCard({ worker, locale, t }: { worker: DownloadWorkerStatus; locale: string; t: (key: string, values?: Record<string, string | number>) => string }) {
    const statusLabel = worker.status === "online" ? t("online") : worker.status === "stale" ? t("stale") : worker.status === "offline" ? t("offline") : t("unknown");
    return <div className="rounded-lg border bg-background/60 p-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={cn("mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full", worker.status === "online" ? "bg-success" : worker.status === "stale" ? "bg-warning" : "bg-destructive")} /><div className="min-w-0"><p className="truncate font-medium" title={worker.worker_id}>{worker.worker_id}</p><p className="mt-1 text-xs text-muted-foreground">{t("lastClaim", { age: formatAge(worker.age_seconds, t) })}</p></div></div><Badge className={workerTone(worker.status)}>{statusLabel}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted-foreground">{t("lastClaimAt")}</p><p className="mt-1 font-medium">{formatTime(worker.last_claim_at, locale)}</p></div><div><p className="text-muted-foreground">{t("pollInterval")}</p><p className="mt-1 font-medium">{t("seconds", { count: worker.poll_interval_seconds })}</p></div><div><p className="text-muted-foreground">{t("pendingQueue")}</p><p className="mt-1 font-medium">{formatQueueDepth(worker) ?? t("queueUnavailable")}</p></div><div><p className="text-muted-foreground">{t("latestClaimCount")}</p><p className="mt-1 font-medium">{worker.last_claim_count}</p></div><div><p className="text-muted-foreground">{t("totalClaims")}</p><p className="mt-1 font-medium">{worker.total_claims}</p></div></div></div>;
}

function RunRow({ run, locale, t }: { run: AdminTaskRun; locale: string; t: (key: string, values?: Record<string, string | number>) => string }) {
    const [expanded, setExpanded] = useState(false);
    const statusLabel = run.status === "success" ? t("success") : run.status === "failed" ? t("failed") : run.status === "cancelled" ? t("cancelled") : run.status === "running" ? t("running") : t("queued");
    const detail = run.error || (run.result ? JSON.stringify(run.result) : run.celery_task_id || "—");
    return <>
        <tr className="border-b last:border-0">
            <td className="px-3 py-3 font-medium"><button className="text-left hover:text-primary" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>{run.label}</button></td>
            <td className="px-3 py-3"><Badge className={runTone(run.status)}>{run.status === "success" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : run.status === "failed" ? <TriangleAlert className="mr-1 h-3 w-3" /> : run.status === "cancelled" ? <Ban className="mr-1 h-3 w-3" /> : <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{statusLabel}</Badge></td>
            <td className="px-3 py-3 text-muted-foreground">{formatTime(run.created_at, locale)}</td>
            <td className="px-3 py-3 text-muted-foreground">{formatTime(run.finished_at, locale)}</td>
            <td className={cn("max-w-[300px] truncate px-3 py-3 text-xs", run.error ? "text-destructive" : "text-muted-foreground")} title={detail}>{detail}</td>
        </tr>
        {expanded && <tr className="border-b bg-muted/30"><td colSpan={5} className="px-3 py-4"><div className="grid gap-3 text-xs sm:grid-cols-2"><div><p className="mb-1 font-medium text-muted-foreground">{t("params")}</p><pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 leading-relaxed">{JSON.stringify(run.params || {}, null, 2)}</pre></div><div><p className="mb-1 font-medium text-muted-foreground">{t("result")}</p><pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 leading-relaxed">{run.result ? JSON.stringify(run.result, null, 2) : "—"}</pre></div><div className="sm:col-span-2"><p className="mb-1 font-medium text-muted-foreground">{t("error")}</p><p className={cn("rounded-md border bg-background p-3", run.error && "text-destructive")}>{run.error || t("noError")}</p></div><p className="text-muted-foreground">{t("taskId")}: {run.celery_task_id || "—"} · {t("triggeredBy")}: {run.triggered_by || "—"}</p></div></td></tr>}
    </>;
}

function Loading() {
    return <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>;
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
    return <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">{icon}<span>{text}</span></div>;
}
