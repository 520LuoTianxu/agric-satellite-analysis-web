"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Loader2 } from "lucide-react";
import {
    cropsApi,
    harvestReportApi,
    type CropOption,
    type HarvestReportBucket,
    type HarvestReportItem,
    type HarvestReportQuery,
    type HarvestReportResult,
} from "@/lib/api";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BUCKETS: HarvestReportBucket[] = ["none", "lt30", "30_90", "ge90", "not_computed"];
const PAGE_SIZE = 50;

/** 与 Excel 汇总表分档颜色一致。 */
const BUCKET_STYLE: Record<HarvestReportBucket, string> = {
    none: "bg-muted text-muted-foreground",
    lt30: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
    "30_90": "bg-orange-300 text-orange-950 dark:bg-orange-700/60 dark:text-orange-50",
    ge90: "bg-orange-700 text-white",
    not_computed: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

function isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function defaultRange(): { from: string; to: string } {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 60);
    return { from: isoDay(from), to: isoDay(to) };
}

function useDebounced<T>(value: T, ms = 400): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setV(value), ms);
        return () => clearTimeout(id);
    }, [value, ms]);
    return v;
}

type SortKey =
    | "land_name"
    | "group_name"
    | "area_mu"
    | "first_harvest_date"
    | "latest_date"
    | "harvested_pct"
    | "suspected_pct"
    | "combined_pct"
    | "combined_area_mu"
    | "newly_combined_pct"
    | "confidence"
    | "days_since_last_image";

/** 收获进度条：已收获（深橙）+ 疑似（浅橙）堆叠。 */
function ProgressBar({ harvested, suspected }: { harvested: number; suspected: number }) {
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950">
            <div className="flex h-full">
                <div className="h-full bg-orange-700" style={{ width: `${Math.min(harvested, 100)}%` }} />
                <div
                    className="h-full bg-orange-300"
                    style={{ width: `${Math.max(Math.min(suspected, 100 - harvested), 0)}%` }}
                />
            </div>
        </div>
    );
}

export function HarvestReportView() {
    const t = useTranslations("harvestReport");
    const locale = useLocale();
    const nf1 = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
    const nf2 = useMemo(
        () => new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
        [locale],
    );

    const initial = useMemo(defaultRange, []);
    const [from, setFrom] = useState(initial.from);
    const [to, setTo] = useState(initial.to);
    const [groupId, setGroupId] = useState("");
    const [crop, setCrop] = useState("");
    const [bucket, setBucket] = useState<HarvestReportBucket | "">("");
    const [minPctInput, setMinPctInput] = useState("");
    const [qInput, setQInput] = useState("");
    const [sort, setSort] = useState<SortKey>("combined_pct");
    const [order, setOrder] = useState<"asc" | "desc">("desc");
    const [page, setPage] = useState(1);

    const minPctRaw = useDebounced(minPctInput);
    const q = useDebounced(qInput.trim());

    const [data, setData] = useState<HarvestReportResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [crops, setCrops] = useState<CropOption[]>([]);
    // 分组下拉：累积见过的分组（选中某分组后接口只返回该分组）
    const [groups, setGroups] = useState<Map<string, string | null>>(new Map());
    const [cropIds, setCropIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        cropsApi
            .list()
            .then(setCrops)
            .catch(() => setCrops([]));
    }, []);

    const minPct = useMemo(() => {
        const v = Number(minPctRaw);
        return minPctRaw !== "" && Number.isFinite(v) && v > 0 ? Math.min(v, 100) : null;
    }, [minPctRaw]);

    const query: HarvestReportQuery = useMemo(
        () => ({
            from,
            to,
            groupId: groupId || undefined,
            crop: crop || undefined,
            status: bucket ? [bucket] : undefined,
            minPct,
            q: q || undefined,
            sort,
            order,
        }),
        [from, to, groupId, crop, bucket, minPct, q, sort, order],
    );

    // 筛选变化回到第一页
    useEffect(() => setPage(1), [from, to, groupId, crop, bucket, minPct, q, sort, order]);

    useEffect(() => {
        if (!from || !to || from > to) return;
        const ctrl = new AbortController();
        setLoading(true);
        setError(null);
        harvestReportApi
            .list({ ...query, page, pageSize: PAGE_SIZE }, ctrl.signal)
            .then((res) => {
                setData(res);
                setGroups((prev) => {
                    const next = new Map(prev);
                    for (const g of res.facets.groups) next.set(g.id, g.name);
                    return next;
                });
                setCropIds((prev) => new Set([...prev, ...res.facets.crops.map((c) => c.id)]));
            })
            .catch((e: unknown) => {
                if ((e as { name?: string })?.name === "AbortError") return;
                setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!ctrl.signal.aborted) setLoading(false);
            });
        return () => ctrl.abort();
    }, [query, page, from, to]);

    const cropLabel = useCallback(
        (id: string | null) => {
            if (!id) return "—";
            const c = crops.find((x) => x.key === id);
            if (!c) return id;
            return locale === "zh" ? c.name_zh || c.name : c.name || c.name_zh;
        },
        [crops, locale],
    );

    const onSort = (key: SortKey) => {
        if (sort === key) setOrder(order === "desc" ? "asc" : "desc");
        else {
            setSort(key);
            setOrder(key === "land_name" || key === "group_name" ? "asc" : "desc");
        }
    };

    const onExport = async () => {
        setExporting(true);
        setExportError(null);
        try {
            await harvestReportApi.exportXlsx(query);
        } catch (e) {
            setExportError(e instanceof Error ? e.message : String(e));
        } finally {
            setExporting(false);
        }
    };

    const reset = () => {
        const r = defaultRange();
        setFrom(r.from);
        setTo(r.to);
        setGroupId("");
        setCrop("");
        setBucket("");
        setMinPctInput("");
        setQInput("");
        setSort("combined_pct");
        setOrder("desc");
    };

    const summary = data?.summary;
    const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
    const pct = (v: number | null | undefined) => (v == null ? "—" : `${nf1.format(v)}%`);
    const mu = (v: number | null | undefined) => (v == null ? "—" : nf2.format(v));
    const selectCls =
        "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

    const SortTh = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
        <th className={cn("px-2 py-2 font-medium", className)}>
            <button
                type="button"
                onClick={() => onSort(k)}
                className={cn(
                    "inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground",
                    sort === k && "text-foreground",
                )}
            >
                {label}
                {sort === k ? (
                    order === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
                ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                )}
            </button>
        </th>
    );

    const kpis: { label: string; value: string; hint?: string }[] = summary
        ? [
              {
                  label: t("kpi.parcels"),
                  value: String(summary.parcel_count),
                  hint: t("kpi.parcelsHint", { computed: summary.computed_count }),
              },
              { label: t("kpi.area"), value: t("kpi.mu", { value: mu(summary.total_area_mu) }) },
              {
                  label: t("kpi.harvestedArea"),
                  value: t("kpi.mu", { value: mu(summary.harvested_area_mu) }),
              },
              {
                  label: t("kpi.combinedArea"),
                  value: t("kpi.mu", { value: mu(summary.combined_area_mu) }),
              },
              {
                  label: t("kpi.avgPct"),
                  value: pct(summary.avg_combined_pct),
                  hint: t("kpi.avgHint", { weighted: pct(summary.area_weighted_combined_pct) }),
              },
          ]
        : [];

    return (
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        {t("subtitle", { minSave: summary?.min_save_pct ?? 3 })}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <Button onClick={onExport} disabled={exporting || !data}>
                        {exporting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="mr-2 h-4 w-4" />
                        )}
                        {exporting ? t("exporting") : t("export")}
                    </Button>
                    {exportError && (
                        <span className="text-xs text-destructive">{t("exportFailed", { error: exportError })}</span>
                    )}
                </div>
            </div>

            <Card>
                <CardContent className="flex flex-wrap items-end gap-3 p-4">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {t("from")}
                        <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {t("to")}
                        <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {t("group")}
                        <select className={cn(selectCls, "w-48")} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                            <option value="">{t("allGroups")}</option>
                            {[...groups.entries()].map(([id, name]) => (
                                <option key={id} value={id}>
                                    {name ? `${name} (${id})` : id}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {t("crop")}
                        <select className={cn(selectCls, "w-32")} value={crop} onChange={(e) => setCrop(e.target.value)}>
                            <option value="">{t("allCrops")}</option>
                            {[...cropIds].map((id) => (
                                <option key={id} value={id}>
                                    {cropLabel(id)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {t("status")}
                        <select
                            className={cn(selectCls, "w-32")}
                            value={bucket}
                            onChange={(e) => setBucket(e.target.value as HarvestReportBucket | "")}
                        >
                            <option value="">{t("allStatus")}</option>
                            {BUCKETS.map((b) => (
                                <option key={b} value={b}>
                                    {t(`bucket.${b}`)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {t("minPct")}
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            inputMode="decimal"
                            value={minPctInput}
                            onChange={(e) => setMinPctInput(e.target.value)}
                            className="h-9 w-24"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {t("search")}
                        <Input value={qInput} onChange={(e) => setQInput(e.target.value)} className="h-9 w-44" />
                    </label>
                    <Button variant="ghost" size="sm" onClick={reset}>
                        {t("reset")}
                    </Button>
                </CardContent>
            </Card>

            {summary && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    {kpis.map((k) => (
                        <Card key={k.label}>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">{k.label}</div>
                                <div className="mt-1 text-xl font-semibold tabular-nums">{k.value}</div>
                                {k.hint && <div className="mt-0.5 text-xs text-muted-foreground">{k.hint}</div>}
                            </CardContent>
                        </Card>
                    ))}
                    <Card>
                        <CardContent className="flex flex-col gap-1.5 p-4">
                            {BUCKETS.map((b) => (
                                <button
                                    key={b}
                                    type="button"
                                    onClick={() => setBucket(bucket === b ? "" : b)}
                                    className={cn(
                                        "flex items-center justify-between gap-2 rounded px-1 text-xs hover:bg-muted",
                                        bucket === b && "ring-1 ring-ring",
                                    )}
                                >
                                    <span className={cn("rounded px-1.5 py-0.5", BUCKET_STYLE[b])}>{t(`bucket.${b}`)}</span>
                                    <span className="font-semibold tabular-nums">{summary.bucket_counts[b] ?? 0}</span>
                                </button>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            )}

            <Card>
                <CardContent className="p-0">
                    {error ? (
                        <div className="p-6 text-sm text-destructive">{t("loadFailed", { error })}</div>
                    ) : (
                        <div className="relative overflow-x-auto">
                            {loading && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                            )}
                            <table className="w-full text-[13px]">
                                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                                    <tr>
                                        <SortTh k="land_name" label={t("col.land")} />
                                        <SortTh k="group_name" label={t("col.group")} />
                                        <th className="whitespace-nowrap px-2 py-2 font-medium">{t("col.crop")}</th>
                                        <th className="px-2 py-2 font-medium">{t("col.region")}</th>
                                        <SortTh k="area_mu" label={t("col.area")} className="text-right" />
                                        <SortTh k="combined_pct" label={t("col.combined")} className="min-w-[150px]" />
                                        <SortTh k="harvested_pct" label={t("col.harvested")} className="text-right" />
                                        <SortTh k="suspected_pct" label={t("col.suspected")} className="text-right" />
                                        <SortTh k="combined_area_mu" label={t("col.combinedArea")} className="text-right" />
                                        <SortTh k="newly_combined_pct" label={t("col.newly")} className="text-right" />
                                        <SortTh k="first_harvest_date" label={t("col.firstHarvest")} />
                                        <SortTh k="latest_date" label={t("col.latest")} />
                                        <th className="px-2 py-2 font-medium">{t("col.status")}</th>
                                        <SortTh k="confidence" label={t("col.confidence")} />
                                        <SortTh k="days_since_last_image" label={t("col.lastImage")} className="text-right" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {data?.items.map((r) => (
                                        <Row key={r.land_id} r={r} t={t} pct={pct} mu={mu} cropLabel={cropLabel} />
                                    ))}
                                    {!loading && data && data.items.length === 0 && (
                                        <tr>
                                            <td colSpan={15} className="p-8 text-center text-muted-foreground">
                                                {t("empty")}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {data && data.total > 0 && (
                        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
                            <span>{t("pageInfo", { page, pages, total: data.total })}</span>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                    {t("prev")}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= pages}
                                    onClick={() => setPage(page + 1)}
                                >
                                    {t("next")}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Row({
    r,
    t,
    pct,
    mu,
    cropLabel,
}: {
    r: HarvestReportItem;
    t: ReturnType<typeof useTranslations<"harvestReport">>;
    pct: (v: number | null | undefined) => string;
    mu: (v: number | null | undefined) => string;
    cropLabel: (id: string | null) => string;
}) {
    const region = [r.province_name, r.city_name, r.county_name].filter(Boolean).join(" / ") || "—";
    const status =
        r.status && ["growing", "harvesting", "harvested"].includes(r.status)
            ? t(`statusLabel.${r.status as "growing" | "harvesting" | "harvested"}`)
            : (r.status ?? "—");
    const conf =
        r.confidence_level && ["high", "medium", "low"].includes(r.confidence_level)
            ? t(`confidence.${r.confidence_level as "high" | "medium" | "low"}`)
            : null;
    return (
        <tr className="border-b last:border-0 hover:bg-muted/30">
            <td className="min-w-[180px] max-w-[240px] px-2 py-2">
                <Link
                    title={r.land_name || r.land_id}
                    href={`/farms/fields/detail?fieldId=${encodeURIComponent(r.land_id)}&farmId=${encodeURIComponent(r.farm_id || "")}&groupId=${encodeURIComponent(r.group_id || "")}`}
                    className="block truncate font-medium hover:underline"
                >
                    {r.land_name || r.land_id}
                </Link>
                <div className="text-xs text-muted-foreground">#{r.land_id}</div>
            </td>
            <td className="max-w-[160px] truncate px-2 py-2" title={r.group_name ?? undefined}>
                {r.group_name || r.group_id || "—"}
            </td>
            <td className="whitespace-nowrap px-2 py-2">{cropLabel(r.crop_type)}</td>
            <td className="whitespace-nowrap px-2 py-2 text-xs">{region}</td>
            <td className="px-2 py-2 text-right tabular-nums">{mu(r.area_mu)}</td>
            <td className="px-2 py-2">
                {r.computed ? (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold tabular-nums">{pct(r.combined_pct)}</span>
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px]", BUCKET_STYLE[r.bucket])}>
                                {t(`bucket.${r.bucket}`)}
                            </span>
                        </div>
                        <ProgressBar harvested={r.harvested_pct ?? 0} suspected={r.suspected_pct ?? 0} />
                    </div>
                ) : (
                    <span
                        className={cn("rounded px-1.5 py-0.5 text-[10px]", BUCKET_STYLE.not_computed)}
                        title={t("notComputedHint")}
                    >
                        {t("bucket.not_computed")}
                    </span>
                )}
            </td>
            <td className="px-2 py-2 text-right tabular-nums">{pct(r.harvested_pct)}</td>
            <td className="px-2 py-2 text-right tabular-nums text-orange-600 dark:text-orange-300">
                {pct(r.suspected_pct)}
            </td>
            <td className="px-2 py-2 text-right tabular-nums">{mu(r.combined_area_mu)}</td>
            <td className="px-2 py-2 text-right tabular-nums">
                {r.newly_combined_pct ? `+${pct(r.newly_combined_pct)}` : "—"}
            </td>
            <td className="whitespace-nowrap px-2 py-2 tabular-nums">{r.first_harvest_date ?? "—"}</td>
            <td className="whitespace-nowrap px-2 py-2 tabular-nums">{r.latest_date ?? "—"}</td>
            <td className="whitespace-nowrap px-2 py-2">
                {status}
                {r.confirmed === false && (
                    <span className="ml-1 text-[10px] text-muted-foreground">({t("provisional")})</span>
                )}
            </td>
            <td className="whitespace-nowrap px-2 py-2 text-xs">
                {r.confidence != null ? `${conf ?? ""} ${r.confidence.toFixed(2)}`.trim() : "—"}
            </td>
            <td className="px-2 py-2 text-right tabular-nums">
                {r.days_since_last_image != null ? t("days", { n: r.days_since_last_image }) : "—"}
            </td>
        </tr>
    );
}
