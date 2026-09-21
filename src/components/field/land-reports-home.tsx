"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { FileText, Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, assessmentApi, landsApi, type LandParcel } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 30;
const LandReportTab = dynamic(() => import("./land-report-tab"), {
    ssr: false,
    loading: () => <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>,
});

/** 首页以地块侧栏选择报告，URL 保存选择以支持刷新和生成完成后的跳转。 */
export default function LandReportsHome() {
    const t = useTranslations("landReportsHome");
    const tInsights = useTranslations("parcelInsights");
    const router = useRouter();
    const params = useSearchParams();
    const requestedId = params.get("fieldId") || "";
    const [lands, setLands] = useState<LandParcel[]>([]);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState(false);
    const [latestId, setLatestId] = useState("");
    const [defaultLoading, setDefaultLoading] = useState(!requestedId);
    const [land, setLand] = useState<LandParcel | null>(null);
    const [landLoading, setLandLoading] = useState(false);
    const [landError, setLandError] = useState(false);
    const [retry, setRetry] = useState(0);
    const selectedId = requestedId || latestId || (!defaultLoading ? lands[0]?.land_id || "" : "");

    useEffect(() => {
        const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setListError(false);
        void landsApi.list({ q: query, limit: PAGE_SIZE, offset: page * PAGE_SIZE }).then(result => {
            if (!cancelled) { setLands(result.items); setTotal(result.total); }
        }).catch(() => {
            if (!cancelled) setListError(true);
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [query, page, retry]);

    useEffect(() => {
        if (requestedId) { setDefaultLoading(false); return; }
        let cancelled = false;
        setDefaultLoading(true);
        // 首页优先打开最近成功的报告；没有报告时选择地块并展示生成入口。
        void assessmentApi.latestReportMeta().then(job => {
            if (!cancelled) setLatestId(job.land_id || "");
        }).catch(error => {
            if (!cancelled && !(error instanceof ApiError && error.status === 404)) setLandError(true);
        }).finally(() => { if (!cancelled) setDefaultLoading(false); });
        return () => { cancelled = true; };
    }, [requestedId, retry]);

    useEffect(() => {
        if (!selectedId) { setLand(null); return; }
        let cancelled = false;
        setLand(null);
        setLandLoading(true);
        setLandError(false);
        // 单独获取选中地块，保证搜索分页之外的最近报告和直达链接仍可显示。
        void landsApi.get(selectedId).then(result => { if (!cancelled) setLand(result); })
            .catch(() => { if (!cancelled) setLandError(true); })
            .finally(() => { if (!cancelled) setLandLoading(false); });
        return () => { cancelled = true; };
    }, [selectedId, retry]);

    return (
        <div className="flex min-h-full flex-col md:h-full md:flex-row">
            <aside aria-label={t("selectLand")} className="flex shrink-0 flex-col border-b bg-background md:w-72 md:border-b-0 md:border-r">
                <div className="space-y-3 p-4">
                    <h1 className="flex items-center gap-2 text-base font-semibold"><FileText className="h-5 w-5 text-primary" />{t("title")}</h1>
                    <Input aria-label={t("search")} placeholder={t("search")} value={search} onChange={event => setSearch(event.target.value)} />
                </div>
                <div className="max-h-56 flex-1 overflow-y-auto px-2 md:max-h-none">
                    {loading ? <div role="status" className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : listError ? (
                        <div role="alert" className="p-3 text-sm space-y-2"><p>{t("loadFailed")}</p><Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>{t("retry")}</Button></div>
                    ) : lands.length ? lands.map(item => (
                        <button key={item.land_id} type="button" aria-pressed={selectedId === item.land_id}
                            onClick={() => router.replace(`/?fieldId=${encodeURIComponent(item.land_id)}`, { scroll: false })}
                            className={cn("mb-1 w-full rounded-lg p-3 text-left text-sm transition-colors hover:bg-muted", selectedId === item.land_id && "bg-primary/10 text-primary")}>
                            <span className="block truncate font-medium">{item.land_name || item.land_id}</span>
                            <span className="block truncate text-xs text-muted-foreground">{item.group_name || item.land_id}</span>
                        </button>
                    )) : <p className="p-3 text-sm text-muted-foreground">{t("noLands")}</p>}
                </div>
                <div className="flex items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
                    <Button size="sm" variant="ghost" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>{t("previous")}</Button>
                    <span>{t("total", { total })}</span>
                    <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE_SIZE >= total || loading} onClick={() => setPage(value => value + 1)}>{t("next")}</Button>
                </div>
            </aside>
            <div className="min-w-0 flex-1 overflow-y-auto">
                {defaultLoading || landLoading ? <div role="status" className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin" /></div> : landError ? (
                    <div role="alert" className="p-8 space-y-3"><p>{t("loadFailed")}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>{t("retry")}</Button></div>
                ) : land && land.land_id === selectedId ? (
                    <div className="mx-auto max-w-5xl">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background p-4">
                            <div><h2 className="font-semibold">{land.land_name || land.land_id}</h2><p className="text-xs text-muted-foreground">{land.group_name}</p></div>
                            <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" asChild><Link href={`/insights?fieldId=${encodeURIComponent(land.land_id)}`}>{tInsights("title")}</Link></Button><Button variant="outline" size="sm" asChild><Link href={`/farms/fields/detail?fieldId=${encodeURIComponent(land.land_id)}&farmId=${encodeURIComponent(land.farm_id || "")}&groupId=${encodeURIComponent(land.group_id || "")}`}>{t("viewLand")}</Link></Button></div>
                        </div>
                        <LandReportTab key={land.land_id} landId={land.land_id} groupId={land.group_id} cropType={land.crop_type}
                            onCropBound={key => setLand(previous => previous ? { ...previous, crop_type: key } : previous)} />
                    </div>
                ) : <div className="p-12 text-center text-sm text-muted-foreground">{t("selectHint")}</div>}
            </div>
        </div>
    );
}
