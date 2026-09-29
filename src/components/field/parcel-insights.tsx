"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, Loader2, Search, Sprout, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { landsApi, type LandParcel } from "@/lib/api";
import { parcelInsightsApi, type InsightEvent, type InsightsHistory, type InsightsRequest, type InsightsSnapshot, type InsightLand, type Phenology, type PhenologyWindow } from "@/lib/parcel-insights";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InsightsCurve, InsightsSpatial } from "./insights-visuals";
import { PhenologyCandidates } from "./phenology-candidates";

type View = "compare" | "checkup" | "history" | "progress" | "service";
type Selected = { land_id: string; land_name: string; crop_type: string | null };
const SELECT = "h-10 w-full rounded-md border bg-background px-2 text-sm";
const MAX_INSIGHT_PERIOD_DAYS = 550;
const MIN_INSIGHT_DATE = "2015-01-01";
const show = (value: number | null | undefined, decimals = 3) => value == null ? "—" : value.toFixed(decimals);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const previousDay = () => new Date(Date.parse(`${today()}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const shiftIsoDay = (value: string, days: number) => {
    const shifted = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(shifted.getTime())) return "";
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted.toISOString().slice(0, 10);
};
const laterDate = (left: string, right: string) => left > right ? left : right;
const earlierDate = (left: string, right: string) => left < right ? left : right;

/** 所有结果与生成时的条件绑定；表单修改不会悄悄改变已保存报告。 */
export default function ParcelInsights() {
    const t = useTranslations("parcelInsights");
    const params = useSearchParams();
    const groupId = params.get("groupId") || "";
    const fieldId = params.get("fieldId") || "";
    const [view, setView] = useState<View>("compare");
    const [mode, setMode] = useState<"historical" | "recent">("historical");
    const [lands, setLands] = useState<LandParcel[]>([]);
    const [selected, setSelected] = useState<Selected[]>([]);
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [start, setStart] = useState(() => `${Number(today().slice(0, 4)) - 1}-01-01`);
    const [end, setEnd] = useState(() => `${Number(today().slice(0, 4)) - 1}-12-31`);
    const [reference, setReference] = useState(() => String(Number(today().slice(0, 4)) - 2));
    const [title, setTitle] = useState(t("defaultTitle"));
    const [brand, setBrand] = useState(t("defaultBrand"));
    const [seasons, setSeasons] = useState<InsightsRequest["seasons"]>({});
    const [events, setEvents] = useState<InsightEvent[]>([]);
    const [event, setEvent] = useState<InsightEvent>({ land_id: "", date: "", action: "", note: "", window_days: 30 });
    const [result, setResult] = useState<InsightsSnapshot | null>(null);
    const [busy, setBusy] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState("");
    const [inferBusy, setInferBusy] = useState<string | null>(null);
    const [inferences, setInferences] = useState<Record<string, { data?: Phenology; error?: string }>>({});
    const inferenceRequest = useRef<AbortController | null>(null);
    const prefillFieldId = useRef(fieldId);
    const selectionManuallyChanged = useRef(false);
    const [history, setHistory] = useState<InsightsHistory | null>(null);
    const [historyOffset, setHistoryOffset] = useState(0);
    const [historyError, setHistoryError] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyRevision, setHistoryRevision] = useState(0);
    const [openHistory, setOpenHistory] = useState(false);

    const latestAllowedDate = mode === "historical" ? previousDay() : today();
    const earliestAllowedStart = end
        ? laterDate(MIN_INSIGHT_DATE, shiftIsoDay(end, -MAX_INSIGHT_PERIOD_DAYS))
        : MIN_INSIGHT_DATE;
    const latestAllowedEnd = start
        ? earlierDate(latestAllowedDate, shiftIsoDay(start, MAX_INSIGHT_PERIOD_DAYS))
        : latestAllowedDate;
    const periodDays = start && end
        ? (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000
        : Number.NaN;
    const invalidPeriod = !start || !end || !Number.isFinite(periodDays)
        || start < MIN_INSIGHT_DATE || start > end
        || periodDays > MAX_INSIGHT_PERIOD_DAYS || end > latestAllowedDate;
    const referenceNumber = Number(reference);
    const invalidReference = !!reference && (
        !Number.isInteger(referenceNumber) || referenceNumber < 2015
        || referenceNumber > 2100 || referenceNumber >= Number(start.slice(0, 4))
    );
    // 日期均为ISO 8601的YYYY-MM-DD，可按字典序核对，避免把必然被API拒绝的区间提交出去。
    const isSeasonInvalid = (window: { start_date: string; end_date: string }) => (
        !window.start_date || !window.end_date || window.start_date > window.end_date
        || window.start_date < start || window.end_date > end
    );
    const incompleteSeason = Object.values(seasons).some(window => !window.start_date || !window.end_date);
    const invalidSeasonRange = Object.values(seasons).some(window =>
        !!window.start_date && !!window.end_date && isSeasonInvalid(window)
    );
    const eventOutsideRange = events.some(item => item.date < start || item.date > end);
    const invalidEventDays = !Number.isInteger(event.window_days) || event.window_days < 7 || event.window_days > 60;

    useEffect(() => () => { inferenceRequest.current?.abort(); }, []);

    useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300); return () => clearTimeout(timer); }, [search]);
    useEffect(() => {
        let cancelled = false;
        setListLoading(true); setListError(false);
        void landsApi.list({ group_id: groupId || undefined, q: query, limit: 30, offset: page * 30 })
            .then(data => { if (!cancelled) { setLands(data.items); setTotal(data.total); } })
            .catch(() => { if (!cancelled) setListError(true); })
            .finally(() => { if (!cancelled) setListLoading(false); });
        return () => { cancelled = true; };
    }, [groupId, query, page, retry]);
    useEffect(() => {
        if (prefillFieldId.current !== fieldId) {
            prefillFieldId.current = fieldId;
            selectionManuallyChanged.current = false;
        }
        if (!fieldId || selectionManuallyChanged.current) return;
        let cancelled = false;
        void landsApi.get(fieldId).then(land => {
            // URL预选只在用户尚未接管地块选择时生效，避免慢响应覆盖手动选择或已打开的快照。
            if (!cancelled && !selectionManuallyChanged.current) {
                setSelected([{ land_id: land.land_id, land_name: land.land_name || land.land_id, crop_type: land.crop_type }]);
            }
        }).catch(() => {
            if (!cancelled && !selectionManuallyChanged.current) setError(t("loadFailed"));
        });
        return () => { cancelled = true; };
    }, [fieldId, t]);
    useEffect(() => {
        if (!openHistory) return;
        let cancelled = false;
        setHistoryLoading(true); setHistoryError(false);
        void parcelInsightsApi.history(historyOffset).then(data => { if (!cancelled) setHistory(data); })
            .catch(() => { if (!cancelled) setHistoryError(true); })
            .finally(() => { if (!cancelled) setHistoryLoading(false); });
        return () => { cancelled = true; };
    }, [openHistory, historyOffset, historyRevision]);

    const markSelectionManuallyChanged = () => {
        if (prefillFieldId.current !== fieldId) {
            prefillFieldId.current = fieldId;
            selectionManuallyChanged.current = false;
        }
        selectionManuallyChanged.current = true;
    };
    const toggleLand = (land: Selected) => {
        markSelectionManuallyChanged();
        if (inferBusy === land.land_id) { inferenceRequest.current?.abort(); setInferBusy(null); }
        setInferences(current => { const next = { ...current }; delete next[land.land_id]; return next; });
        setSelected(current => current.some(item => item.land_id === land.land_id) ? current.filter(item => item.land_id !== land.land_id) : current.length < 20 ? [...current, land] : current);
        setSeasons(current => { const next = { ...current }; delete next[land.land_id]; return next; });
        setEvents(current => current.filter(item => item.land_id !== land.land_id && item.control_land_id !== land.land_id));
        setEvent(current => current.land_id === land.land_id || current.control_land_id === land.land_id ? { ...current, land_id: "", control_land_id: null } : current);
    };
    const clearInferences = () => {
        // 条件变化后丢弃旧结果并取消在途请求，避免旧区间的响应回填到新表单。
        inferenceRequest.current?.abort();
        setInferBusy(null); setInferences({});
    };
    const setAnalysisMode = (next: "historical" | "recent") => {
        const currentDay = today();
        const currentYear = Number(currentDay.slice(0, 4));
        clearInferences();
        setMode(next); setResult(null); setError(""); setSeasons({}); setEvents([]);
        if (next === "recent") { setEnd(currentDay); setStart(new Date(Date.parse(`${currentDay}T00:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10)); }
        else { setStart(`${currentYear - 1}-01-01`); setEnd(`${currentYear - 1}-12-31`); }
    };
    const applyWindow = (land: Selected, window: PhenologyWindow) => {
        // 识别边界缺失时使用首末观测日期作为可执行的代理窗口，结果区会明确提示这不是精确播种或收获日期。
        setSeasons(current => ({ ...current, [land.land_id]: {
            start_date: window.start_date || window.observed_start || "",
            end_date: window.end_date || window.observed_end || "",
            crop: current[land.land_id]?.crop ?? land.crop_type ?? "",
        } }));
    };
    const inferWindow = async (land: Selected) => {
        inferenceRequest.current?.abort();
        const controller = new AbortController();
        inferenceRequest.current = controller;
        setInferBusy(land.land_id);
        setInferences(current => ({ ...current, [land.land_id]: {} }));
        try {
            const data = await parcelInsightsApi.phenology(land.land_id, start, end, controller.signal);
            if (controller.signal.aborted) return;
            if ((data.land_id && data.land_id !== land.land_id) || (data.start_date && data.start_date !== start) || (data.end_date && data.end_date !== end)) {
                throw new Error(t("inferenceMismatch"));
            }
            // 优先填入唯一完整周期；只有一段不完整周期时也用首末观测日期补齐代理窗口，多个周期由用户点选。
            setInferences(current => ({ ...current, [land.land_id]: { data } }));
            const complete = data.windows.filter(window => window.start_date && window.end_date);
            if (complete.length === 1) applyWindow(land, complete[0]);
            else if (data.windows.length === 1) applyWindow(land, data.windows[0]);
        } catch (err) {
            if (!controller.signal.aborted) setInferences(current => ({ ...current, [land.land_id]: { error: err instanceof Error ? err.message : t("loadFailed") } }));
        } finally {
            if (inferenceRequest.current === controller) setInferBusy(null);
        }
    };
    const analyze = async () => {
        setError(""); setBusy(true);
        const ids = selected.map(item => item.land_id);
        const body: InsightsRequest = { land_ids: ids, start_date: start, end_date: end, mode,
            reference_year: reference ? Number(reference) : null, brand_name: brand, title, events,
            seasons: Object.fromEntries(Object.entries(seasons).filter(([key]) => ids.includes(key))) };
        try { setResult(await parcelInsightsApi.analyze(body)); setHistoryRevision(value => value + 1); }
        catch (err) { setError(err instanceof Error ? err.message : t("loadFailed")); }
        finally { setBusy(false); }
    };
    const openSnapshot = async (id: string) => {
        clearInferences();
        setBusy(true); setError("");
        try {
            const data = await parcelInsightsApi.get(id);
            const req = data.request;
            markSelectionManuallyChanged();
            setResult(data); setMode("historical"); setStart(req.start_date); setEnd(req.end_date); setReference(req.reference_year ? String(req.reference_year) : "");
            setTitle(req.title); setBrand(req.brand_name); setSeasons(req.seasons); setEvents(req.events);
            setSelected(data.items.map(item => ({ land_id: item.land_id, land_name: item.land_name, crop_type: item.crop })));
        } catch (err) { setError(err instanceof Error ? err.message : t("loadFailed")); }
        finally { setBusy(false); }
    };
    const download = async () => {
        if (!result?.snapshot_id) return;
        setDownloading(true); setError("");
        try { await parcelInsightsApi.download(result.snapshot_id); }
        catch (err) { setError(err instanceof Error ? err.message : t("downloadFailed")); }
        finally { setDownloading(false); }
    };
    const names = Object.fromEntries((result?.items ?? []).map(item => [item.land_id, item.land_name]));

    return <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-7">
        <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium tracking-widest text-primary">{t("eyebrow")}</p><h1 className="mt-2 text-2xl font-semibold">{t("title")}</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("description")}</p></div><Button variant="outline" onClick={() => setOpenHistory(value => !value)}>{t("savedReports")}</Button></header>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("analysisMode")}>
            <Button type="button" aria-pressed={mode === "historical"} disabled={busy || inferBusy !== null} variant={mode === "historical" ? "default" : "outline"} onClick={() => setAnalysisMode("historical")}>{t("historicalMode")}</Button>
            <Button type="button" aria-pressed={mode === "recent"} disabled={busy || inferBusy !== null} variant={mode === "recent" ? "default" : "outline"} onClick={() => setAnalysisMode("recent")}>{t("recentMode")}</Button>
        </div>
        {openHistory && <section className="rounded-xl border p-4"><h2 className="font-semibold">{t("savedReports")}</h2>{historyLoading ? <p role="status" aria-live="polite" className="py-3 text-sm">{t("loading")}</p> : historyError ? <Button variant="outline" onClick={() => setHistoryRevision(value => value + 1)}>{t("retry")}</Button> : <div className="mt-3 grid gap-2 md:grid-cols-2">{history?.items.map(item => <button type="button" disabled={busy} key={item.id} onClick={() => void openSnapshot(item.id)} className="rounded-lg border p-3 text-left text-sm hover:bg-muted"><span className="block font-medium">{item.request.title}</span><span className="text-xs text-muted-foreground">{item.request.start_date} ~ {item.request.end_date} · {item.request.land_ids.length} {t("lands")}</span></button>)}{!history?.items.length && <p className="text-sm text-muted-foreground">{t("noSaved")}</p>}</div>}<div className="mt-3 flex gap-2"><Button size="sm" variant="ghost" disabled={historyOffset === 0 || historyLoading} onClick={() => setHistoryOffset(value => value - 10)}>{t("previous")}</Button><Button size="sm" variant="ghost" disabled={!history || historyOffset + 10 >= history.total || historyLoading} onClick={() => setHistoryOffset(value => value + 10)}>{t("next")}</Button></div></section>}
        <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="rounded-xl border bg-background p-4"><h2 className="mb-3 font-semibold">{t("selectLands")} <span className="text-sm text-muted-foreground">{selected.length}/20</span></h2><p className="mb-3 text-xs text-muted-foreground">{t("selectionHint")}</p><label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" /></label>
                <div className="mt-3 max-h-64 space-y-1 overflow-y-auto xl:max-h-[440px]">{listLoading ? <p role="status" aria-live="polite" className="p-3 text-sm">{t("loading")}</p> : listError ? <Button onClick={() => setRetry(value => value + 1)} variant="outline">{t("retry")}</Button> : lands.length ? lands.map(land => <label key={land.land_id} className="flex cursor-pointer items-start gap-3 rounded-lg p-2.5 hover:bg-muted"><input type="checkbox" className="mt-1" checked={selected.some(item => item.land_id === land.land_id)} disabled={selected.length >= 20 && !selected.some(item => item.land_id === land.land_id)} onChange={() => toggleLand({ land_id: land.land_id, land_name: land.land_name || land.land_id, crop_type: land.crop_type })} /><span className="min-w-0 text-sm"><span className="block truncate font-medium">{land.land_name || land.land_id}</span><span className="block truncate text-xs text-muted-foreground">{land.crop_type || t("unknownCrop")} · {land.group_name || land.land_id}</span></span></label>) : <p className="p-3 text-sm text-muted-foreground">{t("noLands")}</p>}</div>
                <div className="mt-3 flex items-center justify-between"><Button size="sm" variant="ghost" disabled={!page || listLoading} onClick={() => setPage(value => value - 1)}>{t("previous")}</Button><span className="text-xs text-muted-foreground">{total}</span><Button size="sm" variant="ghost" disabled={(page + 1) * 30 >= total || listLoading} onClick={() => setPage(value => value + 1)}>{t("next")}</Button></div>
            </aside>
            <div className="min-w-0 space-y-4">
                <section className="rounded-xl border bg-background p-4 md:p-5">
                    <div className="mb-4 flex flex-wrap gap-2">{selected.map(land => <button type="button" key={land.land_id} onClick={() => toggleLand(land)} className="flex max-w-full items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary" aria-label={`${t("remove")} ${land.land_name}`}><span className="truncate">{land.land_name}</span><X className="h-3 w-3 shrink-0" aria-hidden="true" /></button>)}</div>
                    <div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1 text-xs">{t("start")}<Input type="date" value={start} min={earliestAllowedStart} max={end} aria-invalid={invalidPeriod} aria-describedby={invalidPeriod ? "parcel-insights-period-error" : undefined} onChange={e => { clearInferences(); setStart(e.target.value); }} /></label><label className="space-y-1 text-xs">{t("end")}<Input type="date" value={end} min={start} max={latestAllowedEnd} aria-invalid={invalidPeriod} aria-describedby={invalidPeriod ? "parcel-insights-period-error" : undefined} onChange={e => { clearInferences(); setEnd(e.target.value); }} /></label><label className="space-y-1 text-xs">{t("referenceYear")}<Input type="number" min="2015" max={Number(start.slice(0, 4)) - 1} value={reference} aria-invalid={invalidReference} aria-describedby={invalidReference ? "parcel-insights-reference-error" : undefined} placeholder={t("optional")} onChange={e => setReference(e.target.value)} /></label></div>
                    {(invalidPeriod || invalidReference) && <div className="space-y-1 text-xs text-destructive">{invalidPeriod && <p id="parcel-insights-period-error" role="alert">{t("periodInvalid")}</p>}{invalidReference && <p id="parcel-insights-reference-error" role="alert">{t("referenceYearInvalid")}</p>}</div>}
                    <p className="mt-3 text-xs text-muted-foreground">{mode === "historical" ? t("historicalHint") : t("recentHint")}</p>
                    <details className="mt-4 rounded-lg bg-muted/30 p-3">
                        <summary className="cursor-pointer text-sm font-medium">{t("seasonSettings")}</summary>
                        <p className="mt-2 text-xs text-muted-foreground">{t("seasonHint")}</p>
                        <div className="mt-3 space-y-4">{selected.map(land => <div key={land.land_id} className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-xs">
                                    <input type="checkbox" disabled={busy || inferBusy === land.land_id} checked={!!seasons[land.land_id]} onChange={e => setSeasons(current => {
                                        const next = { ...current };
                                        if (e.target.checked) next[land.land_id] = { start_date: start, end_date: end, crop: land.crop_type || "" };
                                        else delete next[land.land_id];
                                        return next;
                                    })} />{land.land_name} · {t("manualWindow")}
                                </label>
                                <Button type="button" size="sm" variant="ghost" aria-busy={inferBusy === land.land_id} disabled={busy || inferBusy !== null || !start || !end} onClick={() => void inferWindow(land)}>
                                    {inferBusy === land.land_id ? <Loader2 aria-hidden="true" className="mr-1 h-3 w-3 animate-spin" /> : <Sprout aria-hidden="true" className="mr-1 h-3 w-3" />}{t("inferAndReview")}
                                </Button>
                                {inferBusy === land.land_id && <span role="status" aria-live="polite" className="sr-only">{t("loading")}</span>}
                            </div>
                            {seasons[land.land_id] && <>
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <Input aria-label={`${land.land_name} ${t("start")}`} aria-invalid={isSeasonInvalid(seasons[land.land_id])} disabled={busy || inferBusy === land.land_id} type="date" min={start} max={seasons[land.land_id].end_date >= start && seasons[land.land_id].end_date <= end ? seasons[land.land_id].end_date : end} value={seasons[land.land_id].start_date} onChange={e => setSeasons(current => ({ ...current, [land.land_id]: { ...current[land.land_id], start_date: e.target.value } }))} />
                                    <Input aria-label={`${land.land_name} ${t("end")}`} aria-invalid={isSeasonInvalid(seasons[land.land_id])} disabled={busy || inferBusy === land.land_id} type="date" min={seasons[land.land_id].start_date >= start && seasons[land.land_id].start_date <= end ? seasons[land.land_id].start_date : start} max={end} value={seasons[land.land_id].end_date} onChange={e => setSeasons(current => ({ ...current, [land.land_id]: { ...current[land.land_id], end_date: e.target.value } }))} />
                                    <Input aria-label={`${land.land_name} ${t("crop")}`} maxLength={80} disabled={busy || inferBusy === land.land_id} placeholder={t("crop")} value={seasons[land.land_id].crop} onChange={e => setSeasons(current => ({ ...current, [land.land_id]: { ...current[land.land_id], crop: e.target.value } }))} />
                                </div>
                                {(!seasons[land.land_id].start_date || !seasons[land.land_id].end_date) && <p className="text-xs text-amber-700 dark:text-amber-400">{t("completeDatesHint")}</p>}
                                {seasons[land.land_id].start_date && seasons[land.land_id].end_date && isSeasonInvalid(seasons[land.land_id]) && <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">{t("seasonOutsideRange")}</p>}
                            </>}
                            {inferences[land.land_id]?.error && <p role="alert" className="text-xs text-destructive">{land.land_name} · {inferences[land.land_id].error}</p>}
                            {inferences[land.land_id]?.data && <PhenologyCandidates landName={land.land_name} data={inferences[land.land_id].data!} selected={seasons[land.land_id]} disabled={busy || inferBusy !== null} onSelect={window => applyWindow(land, window)} />}
                        </div>)}</div>
                    </details>
                    <details className="mt-3 rounded-lg bg-muted/30 p-3"><summary className="cursor-pointer text-sm font-medium">{t("serviceSettings")} ({events.length})</summary><p className="mt-2 text-xs text-muted-foreground">{t("serviceHint")}</p>{eventOutsideRange && <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t("eventOutsideRange")}</p>}{invalidEventDays && <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t("eventDaysInvalid")}</p>}<div className="mt-3 grid gap-2 sm:grid-cols-3"><label className="text-xs">{t("targetLand")}<select className={SELECT} value={event.land_id} onChange={e => setEvent(current => ({ ...current, land_id: e.target.value, control_land_id: null }))}><option value="">{t("select")}</option>{selected.map(land => <option key={land.land_id} value={land.land_id}>{land.land_name}</option>)}</select></label><label className="text-xs">{t("eventDate")}<Input type="date" min={start} max={end} value={event.date} onChange={e => setEvent(current => ({ ...current, date: e.target.value }))} /></label><label className="text-xs">{t("action")}<Input maxLength={100} value={event.action} onChange={e => setEvent(current => ({ ...current, action: e.target.value }))} placeholder={t("actionExample")} /></label><label className="text-xs">{t("controlLand")}<select className={SELECT} value={event.control_land_id || ""} onChange={e => setEvent(current => ({ ...current, control_land_id: e.target.value || null }))}><option value="">{t("none")}</option>{selected.filter(land => land.land_id !== event.land_id).map(land => <option key={land.land_id} value={land.land_id}>{land.land_name}</option>)}</select></label><label className="text-xs">{t("eventDays")}<Input type="number" min={7} max={60} step={1} aria-invalid={invalidEventDays} value={event.window_days} onChange={e => setEvent(current => ({ ...current, window_days: Number(e.target.value) }))} /></label><label className="text-xs">{t("eventNote")}<Input maxLength={1000} value={event.note} onChange={e => setEvent(current => ({ ...current, note: e.target.value }))} /></label></div><Button className="mt-3" size="sm" variant="outline" disabled={invalidEventDays || !selected.some(land => land.land_id === event.land_id) || !event.date || !event.action.trim() || events.length >= 30} onClick={() => { setEvents(current => [...current, { ...event }]); setEvent(current => ({ ...current, action: "", note: "" })); }}>{t("addEvent")}</Button><ul className="mt-2 space-y-2 text-xs">{events.map((item, index) => <li key={index} className="flex items-center justify-between gap-2"><span>{selected.find(land => land.land_id === item.land_id)?.land_name} · {item.date} · {item.action}</span><Button size="sm" variant="ghost" onClick={() => setEvents(current => current.filter((_, i) => i !== index))}>{t("remove")}</Button></li>)}</ul></details>
                    {mode === "historical" && <details className="mt-3 rounded-lg bg-muted/30 p-3"><summary className="cursor-pointer text-sm font-medium">{t("reportSettings")}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs">{t("reportTitle")}<Input maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="text-xs">{t("brand")}<Input maxLength={80} value={brand} onChange={e => setBrand(e.target.value)} /></label></div></details>}
                    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" aria-busy={busy} disabled={busy || inferBusy !== null || invalidPeriod || incompleteSeason || invalidSeasonRange || eventOutsideRange || invalidReference || !selected.length} onClick={() => void analyze()}>{busy && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}{mode === "historical" ? t("generate") : t("analyzeRecent")}</Button><span role="status" aria-live="polite" className="sr-only">{busy ? t("loading") : ""}</span><span role={incompleteSeason || invalidSeasonRange || eventOutsideRange ? "alert" : undefined} aria-live="polite" className="text-xs text-muted-foreground">{incompleteSeason ? t("completeDatesHint") : invalidSeasonRange ? t("seasonOutsideRange") : eventOutsideRange ? t("eventOutsideRange") : t("snapshotHint")}</span></div>
                </section>
                {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
                {result ? <section className="space-y-4" aria-label={t("results")}>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/5 p-4"><div><h2 className="font-semibold">{result.request.title}</h2><p className="mt-1 text-xs text-muted-foreground">{result.request.start_date} ~ {result.request.end_date} · {result.items.length} {t("lands")} · {result.snapshot_id ? t("savedSnapshot") : t("pageOnly")}</p></div>{result.snapshot_id && <Button variant="outline" disabled={downloading || busy} onClick={() => void download()}><Download className="mr-2 h-4 w-4" />{downloading ? t("loading") : t("download")}</Button>}</div>
                    <nav className="flex gap-1 overflow-x-auto border-b" aria-label={t("views")}>{(["compare", "checkup", "history", "progress", "service"] as View[]).map(key => <button type="button" key={key} aria-current={view === key ? "page" : undefined} onClick={() => setView(key)} className={`shrink-0 border-b-2 px-3 py-3 text-sm ${view === key ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}>{t(key)}</button>)}</nav>
                    <p className="text-xs leading-relaxed text-muted-foreground">{result.data_note}</p>
                    {view === "compare" && <><InsightsCurve series={result.items.slice(0, 4).map(item => ({ name: item.land_name, points: item.series }))} start={result.request.start_date} end={result.request.end_date} />{result.items.length > 4 && <p className="text-xs text-muted-foreground">{t("firstFour")}</p>}<p className="text-sm">{t("matchedCount", { count: result.comparison.count })} {result.comparison.note}</p>{!result.comparison.comparable_crop && <p className="text-xs text-amber-700 dark:text-amber-400">{t("differentCrops")}</p>}<div className="grid gap-4 md:grid-cols-2">{result.items.map(item => <article key={item.land_id} className="space-y-3 rounded-xl border p-4"><LandHeading item={item} /><InsightsSpatial item={item} /><dl className="grid grid-cols-2 gap-3 text-sm"><Stat label={t("matchedMean")} value={show(result.comparison.means[item.land_id])} /><Stat label={t("versusFirst")} value={show(result.comparison.differences[item.land_id])} /><Stat label={t("lowGreen")} value={item.spatial ? `${item.spatial.low_green_pct}%` : "—"} /><Stat label={t("uniformity")} value={show(item.spatial?.ndvi_stddev)} /></dl><p className="text-xs text-muted-foreground">{item.spatial?.note || t("noPixels")}</p></article>)}</div></>}
                    {view === "checkup" && result.items.map(item => <article className="space-y-4 rounded-xl border p-4" key={item.land_id}><LandHeading item={item} /><dl className="grid grid-cols-2 gap-4 md:grid-cols-4"><Stat label={t("validDates")} value={String(item.summary.count)} /><Stat label={t("meanNdvi")} value={show(item.summary.mean_ndvi)} /><Stat label={t("moisture")} value={show(item.summary.mean_ndmi)} /><Stat label={t("rainfall")} value={`${show(item.rainfall.mm, 1)} mm`} /></dl><p className="text-xs text-muted-foreground">{t("rainCoverage", { count: item.rainfall.observed_days, total: item.rainfall.period_days })}</p><SeasonWindows item={item} />{item.notes.map(note => <p key={note} className="rounded-lg bg-amber-500/5 p-3 text-sm">{note}</p>)}</article>)}
                    {view === "history" && result.items.map(item => <article key={item.land_id} className="space-y-3 rounded-xl border p-4"><LandHeading item={item} />{item.history ? <><InsightsCurve series={[{ name: t("selectedPeriod"), points: item.series }, { name: String(result.request.reference_year), points: item.history.series.map(point => { const original = new Date(`${point.date}T00:00:00Z`); const year = original.getUTCFullYear() + Number(result.request.start_date.slice(0, 4)) - result.request.reference_year!; const last = new Date(Date.UTC(year, original.getUTCMonth() + 1, 0)).getUTCDate(); return { ...point, date: `${year}-${point.date.slice(5, 7)}-${String(Math.min(original.getUTCDate(), last)).padStart(2, "0")}` }; }) }]} start={result.request.start_date} end={result.request.end_date} /><p className="text-sm">{t("matchedCount", { count: item.history.comparison.count })} · {t("selectedPeriod")} {show(item.history.comparison.means.selected)} / {t("referencePeriod")} {show(item.history.comparison.means.reference)}</p><p className="text-xs text-muted-foreground">{item.history.note}</p></> : <p className="text-sm text-muted-foreground">{t("chooseReference")}</p>}</article>)}
                    {view === "progress" && <><p className="text-xs text-muted-foreground">{t("progressHint")}</p><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{(["growth_signal", "harvest_signal", "needs_check", "unknown"] as const).map(key => <div className="rounded-xl border p-4" key={key}><p className="text-xs text-muted-foreground">{t(key)}</p><p className="mt-2 text-2xl font-semibold">{result.progress_counts[key] || 0}</p></div>)}</div>{result.items.map(item => <article key={item.land_id} className="space-y-3 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><LandHeading item={item} /><span className="rounded-full bg-muted px-3 py-1 text-xs">{t(item.progress)}</span></div><p className="text-xs text-muted-foreground">{t("lastObserved")} {item.summary.last_date || "—"}</p><SeasonWindows item={item} />{item.harvests.filter(harvest => harvest.status === "detected").map((harvest, index) => <p className="text-sm" key={index}>{t("harvestObserved")} {harvest.harvest_date} · {harvest.confidence === "low" ? t("lowConfidence") : t("verifyOnSite")}</p>)}</article>)}</>}
                    {view === "service" && <><p className="text-xs text-muted-foreground">{t("serviceHint")}</p>{!result.events.length && <p className="rounded-xl border p-6 text-sm text-muted-foreground">{t("noEvents")}</p>}{result.events.map((item, index) => <article key={index} className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">{names[item.land_id]} · {item.action}</h3><p className="text-xs text-muted-foreground">{item.date} · {t("daysEachSide", { days: item.window_days })}</p><dl className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label={t("before")} value={show(item.before.mean_ndvi)} /><Stat label={t("after")} value={show(item.after.mean_ndvi)} /><Stat label={t("observedChange")} value={show(item.change)} /><Stat label={t("relativeChange")} value={show(item.relative_change)} /></dl><p className="text-xs text-muted-foreground">{t("validDates")} {item.before.count} / {item.after.count}{item.control ? ` · ${t("controlLand")} ${names[item.control.land_id]} (${item.control.matched_before}/${item.control.matched_after})` : ""}</p>{item.note && <p className="text-sm">{item.note}</p>}<p className="text-xs text-muted-foreground">{item.note_on_method}</p></article>)}</>}
                </section> : <div className="rounded-xl border border-dashed p-10 text-center"><Sprout className="mx-auto h-8 w-8 text-primary/60" /><p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p></div>}
            </div>
        </div>
    </div>;
}

function LandHeading({ item }: { item: InsightLand }) {
    const t = useTranslations("parcelInsights");
    return <div><h3 className="font-semibold"><Link className="hover:underline" href={`/farms/fields/detail?fieldId=${encodeURIComponent(item.land_id)}`}>{item.land_name}</Link></h3><p className="mt-1 text-xs text-muted-foreground">{item.crop || t("unknownCrop")} · {show(item.area_mu, 1)} {t("mu")}</p></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
    return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium tabular-nums">{value}</dd></div>;
}
function SeasonWindows({ item }: { item: InsightLand }) {
    const t = useTranslations("parcelInsights");
    return <div className="space-y-2"><h4 className="text-sm font-medium">{item.season_source === "manual" ? t("manualWindow") : t("inferredWindow")}</h4>{item.effective_windows.map((window, i) => <div key={i} className="rounded-lg bg-primary/5 p-3 text-sm"><span>{window.start_date || t("startUnknown")} ~ {window.end_date || t("endUnknown")}</span><span className="ml-3 text-xs text-muted-foreground">{t("peak")} {window.peak_date || "—"} · {window.confidence === "user" ? t("userConfirmed") : window.confidence === "medium" ? t("mediumConfidence") : t("lowConfidence")}</span>{window.start_interval && <p className="mt-1 text-xs text-muted-foreground">{t("startInterval")} {window.start_interval.join(" ~ ")}</p>}{window.end_interval && <p className="mt-1 text-xs text-muted-foreground">{t("endInterval")} {window.end_interval.join(" ~ ")}</p>}</div>)}<p className="text-xs text-muted-foreground">{item.phenology.note}</p></div>;
}
