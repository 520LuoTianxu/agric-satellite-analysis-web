"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Clock3,
    Layers3,
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    adminOpsApi,
    type AdminExecutionGroup,
    type AdminExecutionGroupDetail,
    type AdminExecutionJob,
    type AdminExecutionOverview,
    type AdminExecutionWorkItem,
    type AdminJobDetail,
    type AdminWorkItemDetail,
} from "@/lib/api";
import { taskTypeLabel } from "@/lib/task-type-labels";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

const REFRESH_INTERVAL = 10_000;
// 外层只展示父任务，仍限制单页数量，避免低配电脑一次挂载大量表格节点。
const PAGE_SIZE = 50;
// 子任务数量可能达到数百甚至数千，弹窗只渲染当前页，避免一次性创建大量 DOM。
const CHILD_PAGE_SIZE = 50;
// 单条 JSON 详情设置上限，防止异常 payload/result 把浏览器内存和布局线程拖垮。
const MAX_JSON_CHARS = 12_000;
const MAX_INLINE_TEXT_CHARS = 320;
const TERMINAL_STATUSES = new Set([
    "completed",
    "succeeded",
    "done",
    "success",
    "failed",
    "cancelled",
    "partial",
]);

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
    if (status === "partial") {
        return <CircleAlert className="mr-1 h-3 w-3" />;
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
        partial: "statusPartial",
    };
    // 未登记的新状态也要原样展示，避免管理页把真实状态误显示成“未知”。
    return keys[status] ? t(keys[status]) : status || t("statusUnknown");
}

function formatProgress(progress: Record<string, unknown>) {
    const values = Object.entries(progress);
    if (!values.length) return "—";
    return values
        .map(([key, value]) => `${key}: ${truncateText(formatInlineValue(value), MAX_INLINE_TEXT_CHARS)}`)
        .join(" · ");
}

function truncateText(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function formatInlineValue(value: unknown) {
    if (typeof value === "object" && value !== null) {
        try {
            return JSON.stringify(value) ?? String(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
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

function countStatuses(items: Array<{ status: string }>) {
    return items.reduce<Record<string, number>>((counts, item) => {
        counts[item.status] = (counts[item.status] || 0) + 1;
        return counts;
    }, {});
}

export function AdminExecutionMonitor() {
    const t = useTranslations("adminOps");
    const locale = useLocale();
    const [groupFilter, setGroupFilter] = useState("all");
    const [groupOffset, setGroupOffset] = useState(0);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const groupStatus = groupFilter === "all" ? undefined : groupFilter;
    const executionKey = `/admin/ops/execution?limit=${PAGE_SIZE}&group_status=${groupStatus || ""}&group_offset=${groupOffset}`;
    const { data, error, isLoading, mutate } = useSWR<AdminExecutionOverview>(
        executionKey,
        () => adminOpsApi.execution(PAGE_SIZE, groupStatus, groupOffset),
        { refreshInterval: REFRESH_INTERVAL, revalidateOnFocus: true },
    );
    const detailKey = selectedGroupId
        ? `/admin/ops/execution-groups/${encodeURIComponent(selectedGroupId)}`
        : null;
    const { data: groupDetail, error: detailError, isLoading: detailLoading } = useSWR<AdminExecutionGroupDetail>(
        detailKey,
        () => adminOpsApi.executionGroup(selectedGroupId as string),
        { revalidateOnFocus: false },
    );

    const groups = useMemo(() => data?.groups || [], [data?.groups]);
    const groupStatusOptions = useMemo(
        () => statusOptions(["pending", "running", "completed", "partial", "failed", "cancelled"], data?.group_counts),
        [data?.group_counts],
    );

    return (
        <section className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
                <ExecutionSummaryCard
                    icon={<Layers3 className="h-4 w-4" />}
                    title={t("parentJobsSummary")}
                    total={data?.group_counts.all || 0}
                    detail={t("parentJobsSummaryDetail")}
                    counts={data?.group_counts || {}}
                    t={t}
                    chips={summaryChips(data?.group_counts || {}, t)}
                />
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
                        <CardTitle className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary" />{t("executionGroupsTitle")}</CardTitle>
                        <CardDescription>{t("executionGroupsDescription")}</CardDescription>
                    </div>
                    <StatusFilter value={groupFilter} onChange={(value) => { setGroupFilter(value); setGroupOffset(0); }} options={groupStatusOptions} t={t} />
                </CardHeader>
                <CardContent>
                    {isLoading && !data ? <ExecutionLoading /> : groups.length ? <><div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-left text-sm">
                            <thead className="border-b text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">{t("jobType")}</th><th className="px-3 py-3 font-medium">{t("status")}</th><th className="px-3 py-3 font-medium">{t("childProgress")}</th><th className="px-3 py-3 font-medium">{t("land")}</th><th className="px-3 py-3 font-medium">{t("progress")}</th><th className="px-3 py-3 font-medium">{t("createdAt")}</th><th className="px-3 py-3 font-medium" /></tr></thead>
                            <tbody>{groups.map((group) => <ExecutionGroupRow key={group.id} group={group} locale={locale} t={t} onOpen={() => setSelectedGroupId(group.id)} />)}</tbody>
                        </table>
                    </div><ExecutionPagination offset={groupOffset} rowCount={groups.length} total={groupFilter === "all" ? data?.group_counts.all || 0 : data?.group_counts[groupFilter] || 0} hasMore={data?.group_has_more || false} onPrevious={() => setGroupOffset((current) => Math.max(0, current - PAGE_SIZE))} onNext={() => setGroupOffset((current) => current + PAGE_SIZE)} t={t} /></> : <ExecutionEmpty icon={<CircleAlert className="h-5 w-5" />} text={t("noExecutionGroups")} />}
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                    {t("refreshExecution")}
                </Button>
            </div>

            <ExecutionGroupDialog
                groupId={selectedGroupId}
                detail={groupDetail}
                error={detailError}
                isLoading={detailLoading}
                locale={locale}
                t={t}
                onClose={() => setSelectedGroupId(null)}
            />
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

function ExecutionPagination({ offset, rowCount, total, hasMore, onPrevious, onNext, t }: { offset: number; rowCount: number; total: number; hasMore: boolean; onPrevious: () => void; onNext: () => void; t: (key: string, values?: Record<string, string | number>) => string }) {
    if (offset === 0 && !hasMore) return null;
    const from = rowCount ? offset + 1 : 0;
    const to = offset + rowCount;
    return <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground"><span>{t("showingRange", { from, to, total })}</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={onPrevious} disabled={offset === 0 || rowCount === 0}><ChevronLeft className="mr-1 h-3.5 w-3.5" />{t("previous")}</Button><Button variant="outline" size="sm" onClick={onNext} disabled={!hasMore || rowCount === 0}>{t("next")}<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div></div>;
}

function ExecutionGroupRow({ group, locale, t, onOpen }: { group: AdminExecutionGroup; locale: string; t: (key: string) => string; onOpen: () => void }) {
    return <tr className="border-b last:border-0 hover:bg-muted/30">
        <td className="px-3 py-3"><button className="text-left font-medium hover:text-primary" onClick={onOpen}><span className="block">{taskTypeLabel(group.type, t)}</span><span className="mt-1 block max-w-[300px] truncate text-[11px] font-normal text-muted-foreground" title={group.parent_job_id || group.id}>{group.parent_job_id || group.id}</span></button></td>
        <td className="px-3 py-3"><Badge className={statusClass(group.status)}>{statusIcon(group.status)}{statusLabel(group.status, t)}</Badge></td>
        <td className="px-3 py-3"><ChildProgress counts={group.child_counts} t={t} /></td>
        <td className="px-3 py-3 text-muted-foreground">{group.land_id || "—"}</td>
        <td className="max-w-[300px] px-3 py-3 text-xs text-muted-foreground" title={formatProgress(group.progress_summary)}>{formatProgress(group.progress_summary)}</td>
        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatTime(group.created_at, locale)}</td>
        <td className="px-3 py-3"><Button variant="ghost" size="sm" onClick={onOpen}>{t("viewDetails")}</Button></td>
    </tr>;
}

function ChildProgress({ counts, t }: { counts: Record<string, number>; t: (key: string) => string }) {
    const total = counts.total || 0;
    if (!total) return <span className="text-xs text-muted-foreground">{t("noChildren")}</span>;
    return <div className="min-w-[175px] space-y-1"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium">{counts.completed || 0} / {total}</span><span className="text-muted-foreground">{t("terminal")}: {counts.terminal || 0}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, ((counts.terminal || 0) / total) * 100)}%` }} /></div><div className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground"><span>{t("failedChildren")}: {counts.failed || 0}</span><span>{t("pendingChildren")}: {(counts.pending || 0) + (counts.running || 0)}</span></div></div>;
}

function ExecutionGroupDialog({ groupId, detail, error, isLoading, locale, t, onClose }: { groupId: string | null; detail: AdminExecutionGroupDetail | undefined; error: unknown; isLoading: boolean; locale: string; t: (key: string, values?: Record<string, string | number>) => string; onClose: () => void }) {
    return <Dialog open={Boolean(groupId)} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="flex h-[min(90vh,56rem)] w-[min(96vw,86rem)] max-w-[96vw] flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-4 pr-12 text-left">
                <DialogTitle>{detail ? taskTypeLabel(detail.type, t) : t("groupDetailTitle")}</DialogTitle>
                <DialogDescription>{detail ? `${statusLabel(detail.status, t)} · ${detail.parent_job_id || detail.id}` : t("loadingDetail")}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {isLoading && <ExecutionLoading />}
                {Boolean(error) && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{t("detailLoadFailed")}</div>}
                {detail && !error && <ExecutionGroupDetailContent detail={detail} locale={locale} t={t} />}
            </div>
        </DialogContent>
    </Dialog>;
}

function ExecutionGroupDetailContent({ detail, locale, t }: { detail: AdminExecutionGroupDetail; locale: string; t: (key: string) => string }) {
    const counts = detail.child_counts;
    const [jobOffset, setJobOffset] = useState(0);
    const [workItemOffset, setWorkItemOffset] = useState(0);
    const workItemStatusCounts = useMemo(() => countStatuses(detail.work_items), [detail.work_items]);

    // 切换父任务时回到第一页，避免新任务沿用旧任务的分页位置而显示空白。
    useEffect(() => {
        setJobOffset(0);
        setWorkItemOffset(0);
    }, [detail.id]);

    const visibleJobs = detail.jobs.slice(jobOffset, jobOffset + CHILD_PAGE_SIZE);
    const visibleWorkItems = detail.work_items.slice(
        workItemOffset,
        workItemOffset + CHILD_PAGE_SIZE,
    );

    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-5">
                <DetailStat label={t("children")} value={counts.total || 0} />
                <DetailStat label={t("terminalChildren")} value={counts.terminal || 0} />
                <DetailStat label={t("completedChildren")} value={counts.completed || 0} />
                <DetailStat label={t("failedChildren")} value={counts.failed || 0} />
                <DetailStat label={t("pendingChildren")} value={(counts.pending || 0) + (counts.running || 0)} />
            </div>
            {detail.work_items.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary-subtle/30 px-4 py-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{t("downloadWorkerWorkItems")}: {detail.work_items.length}</span>
                        <div className="flex flex-wrap gap-2">{summaryChips(workItemStatusCounts, t)}</div>
                    </div>
                    <p className="mt-2 text-muted-foreground">{t("downloadWorkerWorkItemsHint")}</p>
                </div>
            )}
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-xs sm:grid-cols-4">
                <div>
                    <p className="text-muted-foreground">{t("status")}</p>
                    <Badge className={cn("mt-1", statusClass(detail.status))}>
                        {statusIcon(detail.status)}{statusLabel(detail.status, t)}
                    </Badge>
                </div>
                <div><p className="text-muted-foreground">{t("createdAt")}</p><p className="mt-1 font-medium">{formatTime(detail.created_at, locale)}</p></div>
                <div><p className="text-muted-foreground">{t("startedAt")}</p><p className="mt-1 font-medium">{formatTime(detail.started_at, locale)}</p></div>
                <div><p className="text-muted-foreground">{t("finishedAt")}</p><p className="mt-1 font-medium">{formatTime(detail.finished_at, locale)}</p></div>
            </div>
            {detail.error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><span className="font-medium">{t("error")}：</span>{truncateText(detail.error, MAX_INLINE_TEXT_CHARS)}</div>}
            {detail.parent_job && <ParentJobDetail detail={detail.parent_job} t={t} />}
            {detail.work_items.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold">{t("downloadWorkerWorkItems")} ({detail.work_items.length})</h3>
                    <div className="space-y-2">
                        {visibleWorkItems.map((item) => <ChildWorkItemDetail key={item.id} item={item} locale={locale} t={t} />)}
                    </div>
                    <ExecutionPagination
                        offset={workItemOffset}
                        rowCount={visibleWorkItems.length}
                        total={detail.work_items.length}
                        hasMore={workItemOffset + visibleWorkItems.length < detail.work_items.length}
                        onPrevious={() => setWorkItemOffset((current) => Math.max(0, current - CHILD_PAGE_SIZE))}
                        onNext={() => setWorkItemOffset((current) => current + CHILD_PAGE_SIZE)}
                        t={t}
                    />
                </div>
            )}
            {detail.jobs.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold">{t("childJobs")} ({detail.jobs.length})</h3>
                    <div className="space-y-2">
                        {visibleJobs.map((job) => <ChildJobDetail key={job.id} job={job} locale={locale} t={t} />)}
                    </div>
                    <ExecutionPagination
                        offset={jobOffset}
                        rowCount={visibleJobs.length}
                        total={detail.jobs.length}
                        hasMore={jobOffset + visibleJobs.length < detail.jobs.length}
                        onPrevious={() => setJobOffset((current) => Math.max(0, current - CHILD_PAGE_SIZE))}
                        onNext={() => setJobOffset((current) => current + CHILD_PAGE_SIZE)}
                        t={t}
                    />
                </div>
            )}
            {detail.jobs.length === 0 && detail.work_items.length === 0 && <ExecutionEmpty icon={<Clock3 className="h-5 w-5" />} text={t("noChildren")} />}
        </div>
    );
}

function DetailStat({ label, value }: { label: string; value: number }) {
    return <div className="rounded-lg border bg-background px-3 py-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

function ParentJobDetail({ detail, t }: { detail: AdminExecutionJob; t: (key: string) => string }) {
    const [open, setOpen] = useState(false);
    const { data, error, isLoading } = useSWR<AdminJobDetail>(
        open ? `/admin/ops/jobs/${encodeURIComponent(detail.id)}` : null,
        () => adminOpsApi.job(detail.id),
        { revalidateOnFocus: false },
    );

    return (
        <details
            className="rounded-lg border bg-muted/20"
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                {t("parentJob")}: {taskTypeLabel(detail.type, t)} <span className="ml-2 text-xs font-normal text-muted-foreground">{detail.id}</span>
            </summary>
            {open && <JobFullDetail data={data} error={error} isLoading={isLoading} t={t} />}
        </details>
    );
}

function ChildJobDetail({ job, locale, t }: { job: AdminExecutionJob; locale: string; t: (key: string) => string }) {
    const [open, setOpen] = useState(false);
    const { data, error, isLoading } = useSWR<AdminJobDetail>(
        open ? `/admin/ops/jobs/${encodeURIComponent(job.id)}` : null,
        () => adminOpsApi.job(job.id),
        { revalidateOnFocus: false },
    );

    return (
        <details
            className="rounded-lg border bg-background"
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span><span className="font-medium">{taskTypeLabel(job.type, t)}</span><span className="ml-2 text-[11px] text-muted-foreground">{job.id}</span></span>
                <span className="flex items-center gap-3"><Badge className={statusClass(job.status)}>{statusIcon(job.status)}{statusLabel(job.status, t)}</Badge><span className="text-xs text-muted-foreground">{formatTime(job.created_at, locale)}</span></span>
            </summary>
            {open && <div className="space-y-3 border-t p-4"><JobSummary job={job} locale={locale} t={t} /><JobFullDetail data={data} error={error} isLoading={isLoading} t={t} /></div>}
        </details>
    );
}

function ChildWorkItemDetail({ item, locale, t }: { item: AdminExecutionWorkItem; locale: string; t: (key: string) => string }) {
    const [open, setOpen] = useState(false);
    const { data, error, isLoading } = useSWR<AdminWorkItemDetail>(
        open ? `/admin/ops/work-items/${encodeURIComponent(item.id)}` : null,
        () => adminOpsApi.workItem(item.id),
        { revalidateOnFocus: false },
    );

    return (
        <details
            className="rounded-lg border bg-background"
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span><span className="font-medium">{taskTypeLabel(item.type, t)}</span><span className="ml-2 text-[11px] text-muted-foreground">{item.id}</span></span>
                <span className="flex flex-wrap items-center justify-end gap-3"><span className="text-xs text-muted-foreground">{t("worker")}: {item.lease_owner || "—"}</span><span className="text-xs text-muted-foreground">{t("attempts")}: {item.attempts}</span><Badge className={statusClass(item.status)}>{statusIcon(item.status)}{statusLabel(item.status, t)}</Badge><span className="text-xs text-muted-foreground">{formatTime(item.updated_at, locale)}</span></span>
            </summary>
            {open && <div className="space-y-3 border-t p-4"><WorkItemSummary item={item} locale={locale} t={t} /><WorkItemFullDetail data={data} error={error} isLoading={isLoading} t={t} /></div>}
            {!open && item.error && <p className="border-t px-4 py-2 text-xs text-destructive">{t("error")}：{truncateText(item.error, MAX_INLINE_TEXT_CHARS)}</p>}
        </details>
    );
}

function JobSummary({ job, locale, t }: { job: AdminExecutionJob; locale: string; t: (key: string) => string }) {
    return <><div className="grid gap-3 text-xs sm:grid-cols-4"><div><p className="text-muted-foreground">{t("land")}</p><p className="mt-1 font-medium">{job.land_id || "—"}</p></div><div><p className="text-muted-foreground">{t("startedAt")}</p><p className="mt-1 font-medium">{formatTime(job.started_at, locale)}</p></div><div><p className="text-muted-foreground">{t("finishedAt")}</p><p className="mt-1 font-medium">{formatTime(job.finished_at, locale)}</p></div><div><p className="text-muted-foreground">{t("error")}</p><p className={cn("mt-1 font-medium", job.error && "text-destructive")}>{job.error ? truncateText(job.error, MAX_INLINE_TEXT_CHARS) : t("noError")}</p></div></div><p className="text-xs text-muted-foreground">{t("progress")}: {formatProgress(job.progress_summary)}</p></>;
}

function WorkItemSummary({ item, locale, t }: { item: AdminExecutionWorkItem; locale: string; t: (key: string) => string }) {
    return <><div className="grid gap-3 text-xs sm:grid-cols-4"><div><p className="text-muted-foreground">{t("worker")}</p><p className="mt-1 font-medium">{item.lease_owner || "—"}</p></div><div><p className="text-muted-foreground">{t("attempts")}</p><p className="mt-1 font-medium">{item.attempts}</p></div><div><p className="text-muted-foreground">{t("leaseUntil")}</p><p className="mt-1 font-medium">{formatTime(item.lease_until, locale)}</p></div><div><p className="text-muted-foreground">{t("error")}</p><p className={cn("mt-1 font-medium", item.error && "text-destructive")}>{item.error ? truncateText(item.error, MAX_INLINE_TEXT_CHARS) : t("noError")}</p></div></div><p className="text-xs text-muted-foreground">{t("progress")}: {formatProgress(item.progress_summary)}</p></>;
}

function JobFullDetail({ data, error, isLoading, t }: { data: AdminJobDetail | undefined; error: unknown; isLoading: boolean; t: (key: string) => string }) {
    if (isLoading) return <InlineDetailLoading />;
    if (error) return <InlineDetailError text={t("detailLoadFailed")} />;
    if (!data) return null;
    return <div className="grid gap-3 lg:grid-cols-2"><JsonBlock label={t("params")} value={data.params_json} /><JsonBlock label={t("progress")} value={data.progress_json} /></div>;
}

function WorkItemFullDetail({ data, error, isLoading, t }: { data: AdminWorkItemDetail | undefined; error: unknown; isLoading: boolean; t: (key: string) => string }) {
    if (isLoading) return <InlineDetailLoading />;
    if (error) return <InlineDetailError text={t("detailLoadFailed")} />;
    if (!data) return null;
    return <div className="grid gap-3 lg:grid-cols-3"><JsonBlock label={t("payload")} value={data.payload_json} /><JsonBlock label={t("progress")} value={data.progress_json} /><JsonBlock label={t("result")} value={data.result_json} /></div>;
}

function InlineDetailLoading() {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading...</div>;
}

function InlineDetailError({ text }: { text: string }) {
    return <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{text}</div>;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
    const text = value === null || value === undefined ? "—" : truncateText(formatJson(value), MAX_JSON_CHARS);
    return <div><p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p><pre className="max-h-64 overflow-auto rounded-md border bg-background p-3 text-[11px] leading-relaxed">{text}</pre></div>;
}

function formatJson(value: unknown) {
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

function ExecutionLoading() {
    return <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>;
}

function ExecutionEmpty({ icon, text }: { icon: ReactNode; text: string }) {
    return <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">{icon}<span>{text}</span></div>;
}
