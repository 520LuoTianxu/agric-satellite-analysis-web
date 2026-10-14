"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { AlertTriangle, Download, Loader2, RefreshCw, Search } from "lucide-react";
import {
    ApiError,
    projectHarvestApi,
    type HarvestTierKey,
    type ProjectHarvestLayers,
    type ProjectHarvestOverview,
    type ProjectHarvestParcel,
    type ProjectHarvestSummary,
    type ProjectHarvestTotals,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { MAP_CHROME } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { HarvestMapMode } from "./project-harvest-map";

const ProjectHarvestMap = dynamic(() => import("./project-harvest-map"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });
const HarvestSeriesChart = dynamic(() => import("./harvest-series-chart"), { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> });

const TIER_ORDER: HarvestTierKey[] = ["high", "medium", "low", "unharvested", "cloud", "noncrop"];
const PICK = "pick";
const SELECT_CLASS = "h-8 rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
type SortKey = "harvested_pct" | "area_mu" | "land_id" | "cloud_pct" | "noncrop_mu";

const nf1 = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mu = (v: number | null | undefined) => (v == null ? "—" : nf1.format(v));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${nf1.format(v)}%`);

export function HarvestAnalysisView({ groupId, compact = false }: { groupId: string; compact?: boolean }) {
    const t = useTranslations("harvestAnalysis");
    const [overview, setOverview] = useState<ProjectHarvestOverview | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [date, setDate] = useState<string>(PICK);
    const [summary, setSummary] = useState<ProjectHarvestSummary | null>(null);
    const [parcels, setParcels] = useState<ProjectHarvestParcel[]>([]);
    const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
    const [layers, setLayers] = useState<ProjectHarvestLayers["items"]>([]);
    const [mode, setMode] = useState<HarvestMapMode>("tier");
    const [opacity, setOpacity] = useState(0.85);
    const [selected, setSelected] = useState<string | null>(null);
    const [scope, setScope] = useState<"by_block" | "by_status" | "by_town_village">("by_block");
    const [q, setQ] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [sort, setSort] = useState<SortKey>("harvested_pct");
    const [order, setOrder] = useState<"asc" | "desc">("desc");
    const [limit, setLimit] = useState(50);
    const [refresh, setRefresh] = useState(0);
    const [busy, setBusy] = useState<"trigger" | "export" | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    useEffect(() => {
        let cancelled = false;
        setLoadError(null);
        projectHarvestApi.overview(groupId).then((o) => { if (!cancelled) setOverview(o); })
            .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, [groupId, refresh]);

    // 有排队/运行中的运行时每 15 秒刷新一次状态。
    const active = overview?.active_run;
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setRefresh((v) => v + 1), 15_000);
        return () => clearInterval(id);
    }, [active]);

    const validDates = useMemo(() => overview?.valid_dates ?? [], [overview]);
    const blocks = useMemo(() => overview?.blocks ?? [], [overview]);
    const blockName = useCallback((key: string) => {
        const i = blocks.findIndex((b) => b.key === key);
        return i >= 0 ? t("blockName", { n: i + 1 }) : key;
    }, [blocks, t]);

    useEffect(() => {
        if (!overview?.available) return;
        let cancelled = false;
        const d = date === PICK ? undefined : date;
        Promise.all([
            projectHarvestApi.summary(groupId, d ?? PICK),
            projectHarvestApi.parcels(groupId, { date: d ?? PICK, limit: 1000 }),
            projectHarvestApi.geojson(groupId, d ?? PICK),
        ]).then(([s, p, g]) => {
            if (cancelled) return;
            setSummary(s); setParcels(p.items); setGeojson(g);
        }).catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, [groupId, overview, date]);

    // 地图栅格：指定日期直接取；“采用日期”模式下每块取各自最新有效日期。
    useEffect(() => {
        if (!overview?.available || mode === "outline") { setLayers([]); return; }
        let cancelled = false;
        const kind = mode === "rgb" ? "rgb" : "tier";
        const run = async () => {
            if (date !== PICK) return (await projectHarvestApi.layers(groupId, date, kind)).items;
            const want = new Map<string, string>();
            for (const b of blocks) if (b.dates.length) want.set(b.key, b.dates[b.dates.length - 1]);
            const byDate = new Map<string, ProjectHarvestLayers["items"]>();
            for (const d of Array.from(new Set(want.values()))) byDate.set(d, (await projectHarvestApi.layers(groupId, d, kind)).items);
            return blocks.map((b) => byDate.get(want.get(b.key) ?? "")?.find((it) => it.block === b.key) ?? { block: b.key, available: false });
        };
        run().then((items) => { if (!cancelled) setLayers(items); }).catch(() => { if (!cancelled) setLayers([]); });
        return () => { cancelled = true; };
    }, [groupId, overview, blocks, date, mode]);

    const missingBlocks = useMemo(() => (date === PICK ? [] : layers.filter((l) => !l.available).map((l) => blockName(l.block))), [layers, date, blockName]);

    const tableRows = useMemo(() => {
        const ql = q.trim().toLowerCase();
        let rows = parcels.filter((r) => (!statusFilter || r.land_status === statusFilter)
            && (!ql || [r.land_id, r.land_name, r.town_name, r.village_name].join(" ").toLowerCase().includes(ql)));
        const dir = order === "asc" ? 1 : -1;
        rows = [...rows].sort((a, b) => {
            if (sort === "land_id") return dir * (Number(a.land_id) - Number(b.land_id));
            const av = a[sort] ?? -1; const bv = b[sort] ?? -1;
            return dir * ((av as number) - (bv as number));
        });
        return rows;
    }, [parcels, q, statusFilter, sort, order]);

    const legend = overview?.legend ?? [];
    const legendName = (k: HarvestTierKey) => legend.find((l) => l.key === k)?.name ?? k;
    const legendColor = (k: HarvestTierKey) => legend.find((l) => l.key === k)?.color ?? "#999";

    const popupText = useCallback((p: Record<string, unknown>) => [
        `${p.land_name ?? ""} (${p.land_id})`,
        `${t("statusLabel")}: ${p.land_status === "1" ? t("status1") : t("status0")} · ${t("areaMu", { v: mu(p.area_mu as number) })}`,
        `${t("harvested")}: ${pct(p.harvested_pct as number)} · ${t("cloud")}: ${pct(p.cloud_pct as number)}`,
        `${t("obsDate")}: ${p.obs_date ?? "—"}`,
    ], [t]);

    const trigger = async () => {
        setBusy("trigger"); setActionError(null);
        try { await projectHarvestApi.trigger(groupId, {}); setRefresh((v) => v + 1); }
        catch (e) { setActionError(e instanceof ApiError ? e.detail : String(e)); }
        finally { setBusy(null); }
    };
    const exportXlsx = async () => {
        setBusy("export"); setActionError(null);
        try {
            let job = await projectHarvestApi.createExportJob(groupId);
            const deadline = Date.now() + 10 * 60_000;
            while (job.status === "pending" || job.status === "running") {
                if (!mounted.current) return;
                if (Date.now() > deadline) throw new Error(t("exportTimeout"));
                await new Promise((r) => setTimeout(r, 1500));
                job = await projectHarvestApi.getExportJob(groupId, job.job_id);
            }
            if (job.status === "failed") throw new Error(job.error || t("exportFailed"));
            await projectHarvestApi.downloadExportJob(groupId, job);
        } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
        finally { setBusy(null); }
    };

    if (loadError) return <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm"><AlertTriangle className="h-6 w-6 text-warning" />{loadError}
        <Button size="sm" variant="outline" onClick={() => setRefresh((v) => v + 1)}>{t("retry")}</Button></div>;
    if (!overview) return <div className="space-y-3 p-4"><Skeleton className="h-10" /><Skeleton className="h-[480px]" /></div>;
    if (!overview.available) return <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <p>{overview.reason === "tables_missing" ? t("notConfigured") : t("noResult")}</p>
        {active && <p>{t("runActive", { status: t(`runStatus.${active.status}`) })}</p>}
        {overview.can_trigger && <Button size="sm" onClick={trigger} disabled={busy !== null || !!active}>{busy === "trigger" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("compute")}</Button>}
        {actionError && <p className="text-destructive">{actionError}</p>}
    </div>;

    const totals = summary?.totals;
    const dateIdx = date === PICK ? -1 : validDates.indexOf(date);
    const harvestedMu = (s: ProjectHarvestTotals | null | undefined) => (s ? (s.high_mu ?? 0) + (s.medium_mu ?? 0) : null);

    return (
        <div className={cn("flex shrink-0 flex-col gap-3 [&>*]:shrink-0", compact ? "p-3" : "p-4")} data-testid="harvest-analysis">
            {/* 运行信息与操作 */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{overview.method_version}</Badge>
                <span>{t("season", { from: overview.season_from ?? "—", to: overview.season_to ?? "—" })}</span>
                <span>· {t("finishedAt", { at: overview.finished_at ? overview.finished_at.slice(0, 16).replace("T", " ") : "—" })}</span>
                <span>· {t("dedupInfo", { kept: overview.dedup?.kept ?? 0, merged: overview.dedup?.merged ?? 0, mu: mu(overview.dedup?.area_mu) })}</span>
                {active && <Badge variant="secondary"><Loader2 className="mr-1 h-3 w-3 animate-spin" />{t("runActive", { status: t(`runStatus.${active.status}`) })}</Badge>}
                <div className="ml-auto flex gap-2">
                    {overview.can_trigger && <Button size="sm" variant="outline" onClick={trigger} disabled={busy !== null || !!active}>
                        {busy === "trigger" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{t("recompute")}</Button>}
                    <Button size="sm" variant="outline" onClick={exportXlsx} disabled={busy !== null}>
                        {busy === "export" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{t("export")}</Button>
                </div>
            </div>
            {actionError && <p role="alert" className="text-xs text-destructive">{actionError}</p>}

            {/* 日期滑块：只能选有效日期 */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
                <Button size="sm" variant={date === PICK ? "default" : "outline"} onClick={() => setDate(PICK)} title={t("pickHint")}>{t("pickMode")}</Button>
                <div className="flex min-w-[260px] flex-1 flex-col gap-1">
                    <input type="range" aria-label={t("date")} min={0} max={Math.max(validDates.length - 1, 0)} step={1}
                        value={dateIdx >= 0 ? dateIdx : validDates.length - 1}
                        onChange={(e) => setDate(validDates[Number(e.target.value)])}
                        className={cn("w-full accent-primary", date === PICK && "opacity-50")} />
                    <div className="relative flex justify-between text-[10px] text-muted-foreground">
                        {validDates.map((d) => {
                            const covered = blocks.filter((b) => b.dates.includes(d)).length;
                            return <button key={d} type="button" onClick={() => setDate(d)}
                                title={t("coverage", { n: covered, total: blocks.length })}
                                className={cn("tabular-nums", d === date && "font-semibold text-foreground", covered < blocks.length && "opacity-60")}>
                                {d.slice(5)}{covered < blocks.length ? "*" : ""}</button>;
                        })}
                    </div>
                </div>
                <span className="text-sm font-medium tabular-nums">{date === PICK ? t("pickLabel") : date}</span>
            </div>

            <div className={cn("grid gap-3", compact ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "xl:grid-cols-[minmax(0,1fr)_380px]")}>
                {/* 地图 */}
                <div className="relative h-[560px] overflow-hidden rounded-lg border">
                    <ProjectHarvestMap parcels={geojson} layers={layers} mode={mode} opacity={opacity} selectedLandId={selected}
                        onSelect={setSelected} popupText={popupText} />
                    <div className={cn("absolute right-3 top-3 z-10 flex flex-col gap-2 rounded-lg p-2 text-xs", MAP_CHROME)}>
                        <div className="flex gap-1">
                            {(["tier", "rgb", "outline"] as const).map((m) => <Button key={m} size="sm" variant={mode === m ? "default" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setMode(m)}>{t(`mode.${m}`)}</Button>)}
                        </div>
                        {mode !== "outline" && <label className="flex items-center gap-2">{t("opacity")}
                            <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-24 accent-primary" /></label>}
                    </div>
                    <div className={cn("absolute bottom-3 left-3 z-10 space-y-1 rounded-lg p-2 text-xs", MAP_CHROME)} aria-label={t("legend")}>
                        {TIER_ORDER.map((k) => <div key={k} className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: legendColor(k) }} />{legendName(k)}</div>)}
                        <div className="flex items-center gap-2 pt-1 text-muted-foreground"><span className="h-0 w-4 border-t-2 border-foreground" />{t("status1")}<span className="ml-2 h-0 w-4 border-t-2 border-dashed border-foreground" />{t("status0")}</div>
                    </div>
                    {missingBlocks.length > 0 && <div className={cn("absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md px-3 py-1 text-xs", MAP_CHROME)}>{t("noImagery", { blocks: missingBlocks.join("、") })}</div>}
                </div>

                {/* 汇总 */}
                <div className="flex min-h-0 flex-col gap-3">
                    <div className="rounded-lg border bg-card p-3" data-testid="harvest-summary">
                        <div className="mb-2 flex items-baseline justify-between">
                            <h3 className="text-sm font-semibold">{t("summaryTitle")}</h3>
                            <span className="text-xs text-muted-foreground">{date === PICK ? t("pickLabel") : date}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-md bg-muted/60 p-2"><p className="text-[11px] text-muted-foreground">{t("totalArea")}</p><p className="text-base font-semibold tabular-nums">{mu(totals?.area_mu)}</p></div>
                            <div className="rounded-md bg-muted/60 p-2"><p className="text-[11px] text-muted-foreground">{t("cropArea")}</p><p className="text-base font-semibold tabular-nums">{mu(totals?.crop_mu)}</p></div>
                            <div className="rounded-md p-2" style={{ background: `${legendColor("high")}22` }}><p className="text-[11px] text-muted-foreground">{t("harvested")}</p>
                                <p className="text-base font-semibold tabular-nums">{pct(totals?.harvested_pct)}</p><p className="text-[11px] tabular-nums">{t("muValue", { v: mu(harvestedMu(totals)) })}</p></div>
                        </div>
                        <table className="mt-3 w-full text-xs">
                            <tbody>
                                {TIER_ORDER.map((k) => {
                                    const v = totals ? (totals[`${k}_mu` as keyof ProjectHarvestTotals] as number | null) : null;
                                    const base = k === "noncrop" ? totals?.area_mu : totals?.crop_mu;
                                    return <tr key={k} className="border-b last:border-0">
                                        <td className="py-1"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: legendColor(k) }} />{legendName(k)}</td>
                                        <td className="py-1 text-right tabular-nums">{mu(v)}</td>
                                        <td className="w-16 py-1 text-right tabular-nums text-muted-foreground">{v != null && base ? pct((100 * v) / base) : "—"}</td>
                                    </tr>;
                                })}
                            </tbody>
                        </table>
                        <p className="mt-1 text-[11px] text-muted-foreground">{t("pctNote")}</p>
                        {date === PICK && summary?.pick_dates && <p className="mt-1 text-[11px] text-muted-foreground">{t("pickDates")}: {Object.entries(summary.pick_dates).sort().map(([d, n]) => `${d.slice(5)}×${n}`).join("，")}</p>}
                    </div>
                    <div className="rounded-lg border bg-card p-3">
                        <div className="mb-2 flex gap-1">
                            {(["by_block", "by_status", "by_town_village"] as const).map((s) => <Button key={s} size="sm" variant={scope === s ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setScope(s)}>{t(`scope.${s}`)}</Button>)}
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="text-muted-foreground"><tr><th className="text-left font-normal">{t("group")}</th><th className="text-right font-normal">{t("parcels")}</th><th className="text-right font-normal">{t("cropArea")}</th><th className="text-right font-normal">{t("harvested")}</th></tr></thead>
                                <tbody>{(summary?.[scope] ?? []).map((r) => <tr key={r.key} className="border-t">
                                    <td className="py-1">{scope === "by_block" ? blockName(r.key) : scope === "by_status" ? (r.key === "1" ? t("status1") : t("status0")) : r.key}</td>
                                    <td className="text-right tabular-nums">{r.parcel_count}</td><td className="text-right tabular-nums">{mu(r.crop_mu)}</td><td className="text-right tabular-nums">{pct(r.harvested_pct)}</td></tr>)}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-3">
                <h3 className="mb-1 text-sm font-semibold">{t("seriesTitle")}</h3>
                <HarvestSeriesChart series={summary?.series ?? []} selectedDate={date === PICK ? null : date} blockLabel={blockName}
                    labels={{ all: t("seriesAll"), cloud: t("cloud") }} onSelectDate={(d) => validDates.includes(d) && setDate(d)} />
            </div>

            {/* 地块表 */}
            <div className="rounded-lg border bg-card" data-testid="harvest-parcels">
                <div className="flex flex-wrap items-center gap-2 border-b p-3">
                    <h3 className="mr-2 text-sm font-semibold">{t("parcelTable")}</h3>
                    <div className="relative"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input className="h-8 w-56 pl-7 text-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} /></div>
                    <select className={SELECT_CLASS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label={t("statusLabel")}>
                        <option value="">{t("allStatus")}</option><option value="1">{t("status1")}</option><option value="0">{t("status0")}</option></select>
                    <span className="ml-auto text-xs text-muted-foreground">{t("rowCount", { n: tableRows.length })}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                {([["land_id", t("colLand")], [null, t("colName")], [null, t("statusLabel")], [null, t("colVillage")], [null, t("colBlock")], ["area_mu", t("colArea")], [null, t("colCrop")], ["harvested_pct", t("harvested")], [null, t("colHarvestedMu")], [null, legendName("low")], ["noncrop_mu", legendName("noncrop")], ["cloud_pct", t("cloud")], [null, t("obsDate")]] as [SortKey | null, string][]).map(([k, label], i) =>
                                    <th key={i} className={cn("whitespace-nowrap px-2 py-2 font-medium", i > 4 ? "text-right" : "text-left")}>
                                        {k ? <button type="button" onClick={() => { if (sort === k) setOrder(order === "asc" ? "desc" : "asc"); else { setSort(k); setOrder("desc"); } }}>{label}{sort === k ? (order === "asc" ? " ↑" : " ↓") : ""}</button> : label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {tableRows.slice(0, limit).map((r) => <tr key={r.land_id} onClick={() => setSelected(r.land_id)}
                                className={cn("cursor-pointer border-t hover:bg-muted/40", selected === r.land_id && "bg-primary-subtle")}>
                                <td className="px-2 py-1.5 tabular-nums">{r.land_id}</td>
                                <td className="max-w-[220px] truncate px-2" title={r.land_name ?? ""}>{r.land_name}</td>
                                <td className="px-2">{r.land_status === "1" ? t("status1") : t("status0")}</td>
                                <td className="whitespace-nowrap px-2">{[r.town_name, r.village_name].filter(Boolean).join(" ")}</td>
                                <td className="whitespace-nowrap px-2">{r.block_key ? blockName(r.block_key) : "—"}</td>
                                <td className="px-2 text-right tabular-nums">{mu(r.area_mu)}</td>
                                <td className="px-2 text-right tabular-nums">{mu(r.crop_mu)}</td>
                                <td className="px-2 text-right font-medium tabular-nums">{pct(r.harvested_pct)}</td>
                                <td className="px-2 text-right tabular-nums">{mu(r.harvested_mu)}</td>
                                <td className="px-2 text-right tabular-nums">{mu(r.low_mu)}</td>
                                <td className="px-2 text-right tabular-nums">{mu(r.noncrop_mu)}</td>
                                <td className="px-2 text-right tabular-nums">{pct(r.cloud_pct)}</td>
                                <td className="whitespace-nowrap px-2 text-right tabular-nums">{r.obs_date}{r.fallback && <span className="ml-1 text-warning" title={t("fallbackHint")}>{t("fallback")}</span>}</td>
                            </tr>)}
                        </tbody>
                    </table>
                </div>
                {tableRows.length > limit && <div className="p-2"><Button size="sm" variant="outline" className="w-full" onClick={() => setLimit((v) => v + 100)}>{t("showMore")}</Button></div>}
            </div>
        </div>
    );
}
