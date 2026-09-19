"use client";

import { useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    CircleAlert,
    Clock3,
    Loader2,
    PackageCheck,
    RefreshCw,
    ServerCog,
    TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    adminOpsApi,
    type AdminExecutionJob,
    type AdminExecutionOverview,
    type AdminExecutionWorkItem,
    type AdminJobDetail,
    type AdminWorkItemDetail,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

const REFRESH_INTERVAL = 10_000;
const TERMINAL_STATUSES = new Set(["completed", "succeeded", "done", "success", "failed", "cancelled"]);

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

function statusClass(status: string) {
    if (["completed", "succeeded", "done", "success"].includes(status)) {
        return "border-success/30 bg-success-subtle text-success";
    }
    if (["failed", "cancelled"].includes(status)) {
        return "border-destructive/30 bg-destructive/5 text-destructive";
    }
    if (["leased", "running"].includes(status)) {
        return "border-primary/30 bg-primary-subtle text-primary";
    }
    return "border-warning/30 bg-warning-subtle text-warning-foreground";
}

function statusIcon(status: string) {
    if (["completed", "succeeded", "done", "success"].includes(status)) {
        return <CheckCircle2 className="mr-1 h-3 w-3" />;
    }
    if (["failed", "cancelled"].includes(status)) {
        return <TriangleAlert className="mr-1 h-3 w-3" />;
    }
    return <Loader2 className="mr-1 h-3 w-3 animate-spin" />;
}

function statusLabel(status: string, t: (key: string) => string) {
    const keys: Record<string, string> = {
        pending: "statusPending",
        queued: "statusQueued",
        running: "statusRunning",
        leased: "statusLeased",
        completed: "statusCompleted",
        succeeded: "statusSucceeded",
        done: "statusDone",
        failed: "statusFailed",
        cancelled: "statusCancelled",
    };
    // 未登记的新状态也要原样展示，避免管理页把真实状态误显示成“未知”。
    return keys[status] ? t(keys[status]) : status || t("statusUnknown");
}

function formatProgress(progress: Record<string, unknown>) {
    const values = Object.entries(progress);
    if (!values.length) return "—";
    return values
        .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
        .join(" · ");
}

function summaryChips(counts: Record<string, number>, t: (key: string) => string) {
    return Object.entries(counts)
        .filter(([status]) => status !== "all")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([status, count]) => (
            <span key={status} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
                <span className={cn("h-1.5 w-1.5 rounded-full", statusClass(status).includes("success") ? "bg-success" : statusClass(status).includes("destructive") ? "bg-destructive" : statusClass(status).includes("primary") ? "bg-primary" : "bg-warning")} />
                {statusLabel(status, t)} {count}
            </span>
        ));
}

export function AdminExecutionMonitor() {
    const t = useTranslations("adminOps");
    const locale = useLocale();
    const [jobFilter, setJobFilter] = useState("all");
    const [workItemFilter, setWorkItemFilter] = useState("all");
    const jobStatus = jobFilter === "all" ? undefined : jobFilter;
    const workItemStatus = workItemFilter === "all" ? undefined : workItemFilter;
    const executionKey = `/admin/ops/execution?limit=200&job_status=${jobStatus || ""}&work_item_status=${workItemStatus || ""}`;
    const { data, error, isLoading, mutate } = useSWR<AdminExecutionOverview>(
        executionKey,
        () => adminOpsApi.execution(200, jobStatus, workItemStatus),
        { refreshInterval: REFRESH_INTERVAL, revalidateOnFocus: true },
    );

    const jobs = useMemo(() => data?.jobs || [], [data?.jobs]);
    const workItems = useMemo(() => data?.work_items || [], [data?.work_items]);
    const jobStatusOptions = useMemo(
        () => statusOptions(["pending", "running", "completed", "succeeded", "failed", "cancelled"], data?.job_counts),
        [data?.job_counts],
    );
    const workItemStatusOptions = useMemo(
        () => statusOptions(["pending", "leased", "done", "failed"], data?.work_item_counts),
        [data?.work_item_counts],
    );

    return (
        <section className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2">
                <ExecutionSummaryCard
                    icon={<ServerCog className="h-4 w-4" />}
                    title={t("jobsSummary")}
                    total={data?.job_counts.all || 0}
                    detail={t("jobsSummaryDetail")}
                    counts={data?.job_counts || {}}
                    t={t}
                    chips={summaryChips(data?.job_counts || {}, t)}
                />
                <ExecutionSummaryCard
                    icon={<PackageCheck className="h-4 w-4" />}
                    title={t("workItemsSummary")}
                    total={data?.work_item_counts.all || 0}
                    detail={t("workItemsSummaryDetail")}
                    counts={data?.work_item_counts || {}}
                    t={t}
                    chips={summaryChips(data?.work_item_counts || {}, t)}
                />
            </div>

            {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{t("executionLoadFailed")}</div>}

            <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2"><ServerCog className="h-5 w-5 text-primary" />{t("jobsTitle")}</CardTitle>
                        <CardDescription>{t("jobsDescription")}</CardDescription>
                    </div>
                    <StatusFilter value={jobFilter} onChange={setJobFilter} options={jobStatusOptions} t={t} />
                </CardHeader>
                <CardContent>
                    {isLoading && !data ? <ExecutionLoading /> : jobs.length ? (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[820px] text-left text-sm">
                                <thead className="border-b text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">{t("jobType")}</th><th className="px-3 py-3 font-medium">{t("status")}</th><th className="px-3 py-3 font-medium">{t("land")}</th><th className="px-3 py-3 font-medium">{t("progress")}</th><th className="px-3 py-3 font-medium">{t("createdAt")}</th></tr></thead>
                                <tbody>{jobs.map((job) => <JobRow key={job.id} job={job} locale={locale} t={t} />)}</tbody>
                            </table>
                        </div>
                    ) : <ExecutionEmpty icon={<CircleAlert className="h-5 w-5" />} text={t("noJobs")} />}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary" />{t("workItemsTitle")}</CardTitle>
                        <CardDescription>{t("workItemsDescription")}</CardDescription>
                    </div>
                    <StatusFilter value={workItemFilter} onChange={setWorkItemFilter} options={workItemStatusOptions} t={t} />
                </CardHeader>
                <CardContent>
                    {isLoading && !data ? <ExecutionLoading /> : workItems.length ? (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] text-left text-sm">
                                <thead className="border-b text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">{t("workItemType")}</th><th className="px-3 py-3 font-medium">{t("status")}</th><th className="px-3 py-3 font-medium">{t("worker")}</th><th className="px-3 py-3 font-medium">{t("attempts")}</th><th className="px-3 py-3 font-medium">{t("updatedAt")}</th></tr></thead>
                                <tbody>{workItems.map((item) => <WorkItemRow key={item.id} item={item} locale={locale} t={t} />)}</tbody>
                            </table>
                        </div>
                    ) : <ExecutionEmpty icon={<Clock3 className="h-5 w-5" />} text={t("noWorkItems")} />}
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                    {t("refreshExecution")}
                </Button>
            </div>
        </section>
    );
}

function ExecutionSummaryCard({ icon, title, total, detail, counts, t, chips }: { icon: ReactNode; title: string; total: number; detail: string; counts: Record<string, number>; t: (key: string, values?: Record<string, string | number>) => string; chips: ReactNode }) {
    const terminal = Object.entries(counts).filter(([status]) => TERMINAL_STATUSES.has(status)).reduce((sum, [, count]) => sum + count, 0);
    const nonTerminal = Math.max(0, total - terminal);
    return <Card><CardContent className="pt-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="mt-2 text-3xl font-semibold">{total}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p><p className="mt-2 text-xs text-muted-foreground">{t("terminal")}: {terminal} · {t("nonTerminal")}: {nonTerminal}</p></div><span className="rounded-lg bg-primary-subtle p-2 text-primary">{icon}</span></div><div className="mt-4 flex flex-wrap gap-2">{chips}</div></CardContent></Card>;
}

function StatusFilter({ value, onChange, options, t }: { value: string; onChange: (value: string) => void; options: string[]; t: (key: string) => string }) {
    return <label className="flex items-center gap-2 text-xs text-muted-foreground"><span>{t("statusFilter")}</span><select className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground" value={value} onChange={(event) => onChange(event.target.value)}><option value="all">{t("allStatuses")}</option>{options.map((status) => <option key={status} value={status}>{statusLabel(status, t)}</option>)}</select></label>;
}

function statusOptions(defaults: string[], counts: Record<string, number> | undefined) {
    return Array.from(new Set([...defaults, ...Object.keys(counts || {}).filter((status) => status !== "all")])).sort();
}

function JobRow({ job, locale, t }: { job: AdminExecutionJob; locale: string; t: (key: string) => string }) {
    const [expanded, setExpanded] = useState(false);
    const { data, error, isLoading } = useSWR<AdminJobDetail>(expanded ? `admin-job-${job.id}` : null, () => adminOpsApi.job(job.id), { revalidateOnFocus: false });
    return <>
        <tr className="border-b last:border-0">
            <td className="px-3 py-3"><button className="flex items-center gap-2 text-left font-medium hover:text-primary" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<span>{job.type}</span></button><p className="mt-1 max-w-[270px] truncate text-[11px] text-muted-foreground" title={job.id}>{job.id}</p></td>
            <td className="px-3 py-3"><Badge className={statusClass(job.status)}>{statusIcon(job.status)}{statusLabel(job.status, t)}</Badge></td>
            <td className="px-3 py-3 text-muted-foreground">{job.land_id || "—"}</td>
            <td className="max-w-[340px] px-3 py-3 text-xs text-muted-foreground" title={formatProgress(job.progress_summary)}>{formatProgress(job.progress_summary)}</td>
            <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatTime(job.created_at, locale)}</td>
        </tr>
        {expanded && <tr className="border-b bg-muted/30"><td colSpan={5} className="px-3 py-4"><ExecutionDetail detail={data} error={error} isLoading={isLoading} locale={locale} t={t} kind="job" /></td></tr>}
    </>;
}

function WorkItemRow({ item, locale, t }: { item: AdminExecutionWorkItem; locale: string; t: (key: string) => string }) {
    const [expanded, setExpanded] = useState(false);
    const { data, error, isLoading } = useSWR<AdminWorkItemDetail>(expanded ? `admin-work-item-${item.id}` : null, () => adminOpsApi.workItem(item.id), { revalidateOnFocus: false });
    return <>
        <tr className="border-b last:border-0">
            <td className="px-3 py-3"><button className="flex items-center gap-2 text-left font-medium hover:text-primary" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<span>{item.type}</span></button><p className="mt-1 max-w-[270px] truncate text-[11px] text-muted-foreground" title={item.id}>{item.id}</p></td>
            <td className="px-3 py-3"><Badge className={statusClass(item.status)}>{statusIcon(item.status)}{statusLabel(item.status, t)}</Badge></td>
            <td className="px-3 py-3 text-muted-foreground">{item.lease_owner || "—"}</td>
            <td className="px-3 py-3 text-muted-foreground">{item.attempts}</td>
            <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatTime(item.updated_at, locale)}</td>
        </tr>
        {expanded && <tr className="border-b bg-muted/30"><td colSpan={5} className="px-3 py-4"><ExecutionDetail detail={data} error={error} isLoading={isLoading} locale={locale} t={t} kind="workItem" /></td></tr>}
    </>;
}

function ExecutionDetail({ detail, error, isLoading, locale, t, kind }: { detail: AdminJobDetail | AdminWorkItemDetail | undefined; error: unknown; isLoading: boolean; locale: string; t: (key: string) => string; kind: "job" | "workItem" }) {
    if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loadingDetail")}</div>;
    if (error || !detail) return <div className="text-sm text-destructive">{t("detailLoadFailed")}</div>;
    const jobDetail = detail as AdminJobDetail;
    const workItemDetail = detail as AdminWorkItemDetail;
    const data = kind === "job" ? { params: jobDetail.params_json, progress: jobDetail.progress_json } : { payload: workItemDetail.payload_json, progress: workItemDetail.progress_json, result: workItemDetail.result_json };
    const startTime = kind === "job" ? jobDetail.started_at : workItemDetail.created_at;
    const endTime = kind === "job" ? jobDetail.finished_at : workItemDetail.updated_at;
    const startLabel = kind === "job" ? t("startedAt") : t("createdAt");
    const endLabel = kind === "job" ? t("finishedAt") : t("updatedAt");
    return <div className="space-y-3"><div className="grid gap-3 text-xs sm:grid-cols-3"><div><p className="text-muted-foreground">{startLabel}</p><p className="mt-1 font-medium">{formatTime(startTime, locale)}</p></div><div><p className="text-muted-foreground">{endLabel}</p><p className="mt-1 font-medium">{formatTime(endTime, locale)}</p></div><div><p className="text-muted-foreground">{t("error")}</p><p className={cn("mt-1 font-medium", detail.error && "text-destructive")}>{detail.error || t("noError")}</p></div></div><div className="grid gap-3 lg:grid-cols-3">{Object.entries(data).map(([key, value]) => <div key={key}><p className="mb-1 text-xs font-medium text-muted-foreground">{t(key === "params" ? "params" : key === "payload" ? "payload" : key === "result" ? "result" : "progress")}</p><pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 text-[11px] leading-relaxed">{value ? JSON.stringify(value, null, 2) : "—"}</pre></div>)}</div>{kind === "workItem" && <p className="text-xs text-muted-foreground">{t("attempts")}: {(detail as AdminWorkItemDetail).attempts} · {t("leaseOwner")}: {(detail as AdminWorkItemDetail).lease_owner || "—"} · {t("leaseUntil")}: {formatTime((detail as AdminWorkItemDetail).lease_until, locale)}</p>}</div>;
}

function ExecutionLoading() {
    return <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>;
}

function ExecutionEmpty({ icon, text }: { icon: ReactNode; text: string }) {
    return <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">{icon}<span>{text}</span></div>;
}
