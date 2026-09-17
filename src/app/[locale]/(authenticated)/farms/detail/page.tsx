"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, AlertTriangle, ChevronRight, List, LocateFixed, Map as MapIcon, RefreshCw, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { projectsApi, type ProjectMonitoring, type ProjectRiskLevel } from "@/lib/api";
import { getPlantingGroup, getPlantingTypeDict, listAllCropLands, groupStatusLabel, signStatusLabel, plantingTypeLabel, type AgricGroup, type AgricLand } from "@/lib/agric";
import { EMPTY_PROJECT_FILTERS, RISK_CLASSES, filterProjectLands, mergeProjectLands, summarizeProjectLands, type ProjectFilters, type ProjectLand } from "@/lib/project-monitoring";
import { ruleLabel } from "@/lib/alert-rules";
import { cn } from "@/lib/utils";
import { MAP_CHROME } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectStatistics } from "@/components/project/project-statistics";
import { ProjectLandPanel, ProjectRiskBadge } from "@/components/project/project-land-panel";

const ProjectLandsMap = dynamic(() => import("@/components/project/project-lands-map"), {
    ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" />,
});
const RISK_LEVELS: ProjectRiskLevel[] = ["high", "medium", "low", "normal", "unknown"];
const SELECT_CLASS = "h-10 min-w-0 rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-8";

function FarmDetailPageContent() {
    const t = useTranslations("projectMonitoring");
    const tRules = useTranslations("alertRules");
    const searchParams = useSearchParams();
    const groupId = searchParams.get("groupId") || "";
    const [group, setGroup] = useState<AgricGroup | null>(null);
    const [businessLands, setBusinessLands] = useState<AgricLand[]>([]);
    const [monitoring, setMonitoring] = useState<ProjectMonitoring | null>(null);
    const [plantingLabels, setPlantingLabels] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const [freshnessDays, setFreshnessDays] = useState(14);
    const [filters, setFilters] = useState<ProjectFilters>(EMPTY_PROJECT_FILTERS);
    const [selectedLandId, setSelectedLandId] = useState<string | null>(null);
    const [mobileView, setMobileView] = useState<"map" | "list">("map");
    const [fitVersion, setFitVersion] = useState(0);
    const [listLimit, setListLimit] = useState(100);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadFailed(false);
        if (!groupId) { setLoading(false); setLoadFailed(true); return; }
        // 业务名单决定项目范围，必须完整加载；监测不可用时明确展示未知，不伪造零预警。
        Promise.allSettled([
            getPlantingGroup(groupId),
            listAllCropLands(groupId),
            projectsApi.monitoring(groupId, freshnessDays),
            getPlantingTypeDict(),
        ]).then(([groupResult, landResult, monitoringResult, dictResult]) => {
            if (cancelled) return;
            if (landResult.status === "rejected") {
                setLoadFailed(true);
                return;
            }
            setGroup(groupResult.status === "fulfilled" ? groupResult.value : { groupId });
            setBusinessLands(landResult.value);
            setMonitoring(monitoringResult.status === "fulfilled" ? monitoringResult.value : null);
            setPlantingLabels(dictResult.status === "fulfilled" ? dictResult.value.labelByValue : {});
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [groupId, refresh, freshnessDays]);

    useEffect(() => {
        setFilters(EMPTY_PROJECT_FILTERS);
        setSelectedLandId(null);
        setListLimit(100);
    }, [groupId]);

    const lands = useMemo(() => mergeProjectLands(businessLands, monitoring?.items ?? null), [businessLands, monitoring]);
    const filteredLands = useMemo(() => filterProjectLands(lands, filters), [lands, filters]);
    const stats = useMemo(() => summarizeProjectLands(filteredLands), [filteredLands]);
    const cropOptions = useMemo(() => Array.from(new Set(lands.map((land) => land.cropName).filter(Boolean))).sort(), [lands]);
    const plantingOptions = useMemo(() => Array.from(new Set(lands.map((land) => land.cropStatus).filter(Boolean))).sort(), [lands]);
    const selectedLand = filteredLands.find((land) => land.landId === selectedLandId) ?? null;
    const mappedCount = filteredLands.length - stats.unmarked;
    const updateFilters = useCallback((change: Partial<ProjectFilters>) => {
        setFilters((current) => ({ ...current, ...change }));
        setSelectedLandId(null);
        setListLimit(100);
    }, []);
    const resetFilters = () => { updateFilters(EMPTY_PROJECT_FILTERS); };
    const selectLand = useCallback((id: string) => { setSelectedLandId(id); }, []);

    useEffect(() => {
        if (!selectedLand) return;
        const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedLandId(null); };
        window.addEventListener("keydown", dismiss);
        return () => window.removeEventListener("keydown", dismiss);
    }, [selectedLand]);

    if (loading) return <div className="flex h-full flex-col gap-3 p-4" aria-label={t("loading")}>
        <Skeleton className="h-12" /><Skeleton className="h-24" /><Skeleton className="min-h-0 flex-1" />
    </div>;
    if (loadFailed || !group) return <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle className="h-8 w-8 text-warning" />
        <p className="text-sm">{groupId ? t("loadFailed") : t("missingProject")}</p>
        <div className="flex gap-2"><Button variant="outline" asChild><Link href="/farms">{t("back")}</Link></Button>
            {groupId && <Button onClick={() => setRefresh((value) => value + 1)}>{t("retry")}</Button>}</div>
    </div>;

    const renderLand = (land: ProjectLand) => {
        const firstAlert = land.monitoring?.alerts[0];
        return <button key={land.landId} type="button" onClick={() => selectLand(land.landId)}
            aria-pressed={land.landId === selectedLandId}
            className={cn("flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", land.landId === selectedLandId ? "border-primary bg-primary-subtle" : "bg-card hover:border-primary/40")}>
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                    <span className="break-words text-sm font-semibold">{land.landName}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">{[land.areaMu === null ? "—" : t("areaValue", { value: land.areaMu.toFixed(2) }), land.cropText, land.cropStatus].filter(Boolean).join(" · ")}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <ProjectRiskBadge land={land} />
                    {(land.monitoring?.open_alert_count ?? 0) > 0 && <span className="text-xs text-muted-foreground">{t("pendingShort", { count: land.monitoring!.open_alert_count })}</span>}
                </div>
                {firstAlert && <p className="truncate text-xs">{ruleLabel(firstAlert.rule_name, tRules)}</p>}
                <p className={cn("text-xs", land.dataStatus === "fresh" ? "text-muted-foreground" : "text-warning")}>{t("data." + land.dataStatus)} · {land.monitoring?.observation?.date ?? "—"}</p>
                {!land.geometry && <span className="text-xs text-muted-foreground">{t("unmarked")}</span>}
            </div>
        </button>;
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <Button variant="outline" size="icon" asChild><Link href="/farms" aria-label={t("back")}><ArrowLeft className="h-4 w-4" /></Link></Button>
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold">{group.groupName || groupId}</h1>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {group.ownerName && <span>{t("projectOwner", { name: group.ownerName })}</span>}
                            <span>{t("scope", { count: filteredLands.length, total: lands.length })}</span>
                            {monitoring && <span>{t("asOf", { date: monitoring.as_of })}</span>}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="hidden flex-wrap gap-1 xl:flex">
                        {group.status != null && <Badge variant="secondary">{groupStatusLabel(group.status)}</Badge>}
                        {group.signStatus != null && <Badge variant="outline">{signStatusLabel(group)}</Badge>}
                        {group.plantingType != null && <Badge variant="outline">{plantingTypeLabel(group.plantingType, plantingLabels)}</Badge>}
                        {group.businessCategory && <Badge variant="outline">{group.businessCategory}</Badge>}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        {t("freshness")}
                        <select className={SELECT_CLASS} value={freshnessDays} onChange={(event) => setFreshnessDays(Number(event.target.value))}>
                            {[7, 14, 30].map((days) => <option key={days} value={days}>{t("days", { days })}</option>)}
                        </select>
                    </label>
                    <Button variant="outline" size="sm" onClick={() => setRefresh((value) => value + 1)}><RefreshCw className="mr-2 h-4 w-4" />{t("refresh")}</Button>
                </div>
            </header>
            {!monitoring && <div role="alert" className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-subtle p-3 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" /><span>{t("monitoringUnavailable")}</span>
            </div>}
            <ProjectStatistics stats={stats} available={monitoring !== null} onFilter={updateFilters} />
            <div className="flex items-center justify-between border-y bg-background px-4 py-2 text-xs text-muted-foreground">
                <span>{t("scopeNote")}</span>
                <div className="flex gap-2 md:hidden">
                    <Button size="sm" variant={mobileView === "map" ? "secondary" : "ghost"} onClick={() => setMobileView("map")}><MapIcon className="mr-1 h-4 w-4" />{t("map")}</Button>
                    <Button size="sm" variant={mobileView === "list" ? "secondary" : "ghost"} onClick={() => setMobileView("list")}><List className="mr-1 h-4 w-4" />{t("list")}</Button>
                </div>
            </div>
            <div className="relative flex min-h-0 flex-1">
                <aside className={cn("w-full shrink-0 flex-col overflow-hidden border-r bg-background md:flex md:w-80", mobileView === "list" ? "flex" : "hidden")} aria-label={t("landList")}>
                    <div className="space-y-2 border-b p-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input className="h-9 pl-9" value={filters.query} onChange={(event) => updateFilters({ query: event.target.value })} placeholder={t("search")} aria-label={t("search")} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <select aria-label={t("filterRisk")} className={SELECT_CLASS} value={filters.risk} onChange={(event) => updateFilters({ risk: event.target.value as ProjectFilters["risk"], focus: "all" })}>
                                <option value="all">{t("allRisks")}</option>{RISK_LEVELS.map((risk) => <option key={risk} value={risk}>{t("risk." + risk)}</option>)}
                            </select>
                            <select aria-label={t("filterCrop")} className={SELECT_CLASS} value={filters.crop} onChange={(event) => updateFilters({ crop: event.target.value })}>
                                <option value="">{t("allCrops")}</option>{cropOptions.map((crop) => <option key={crop}>{crop}</option>)}
                            </select>
                            <select aria-label={t("filterData")} className={SELECT_CLASS} value={filters.data} onChange={(event) => updateFilters({ data: event.target.value as ProjectFilters["data"] })}>
                                <option value="all">{t("allData")}</option>{(["fresh", "stale", "low_quality", "missing", "unavailable"] as const).map((state) => <option key={state} value={state}>{t("data." + state)}</option>)}
                            </select>
                            <select aria-label={t("filterPlanting")} className={SELECT_CLASS} value={filters.planting} onChange={(event) => updateFilters({ planting: event.target.value })}>
                                <option value="">{t("allPlanting")}</option>{plantingOptions.map((state) => <option key={state}>{state}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <select aria-label={t("filterFocus")} className={cn(SELECT_CLASS, "max-w-full")} value={filters.focus} onChange={(event) => updateFilters({ focus: event.target.value as ProjectFilters["focus"] })}>
                                {(["all", "risk", "pending", "unmarked"] as const).map((focus) => <option key={focus} value={focus}>{t("focus." + focus)}</option>)}
                            </select>
                            <Button size="sm" variant="ghost" onClick={resetFilters}>{t("reset")}</Button>
                        </div>
                        <p className="text-xs text-muted-foreground" aria-live="polite">{t("listCount", { count: filteredLands.length })}</p>
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                        {filteredLands.slice(0, listLimit).map(renderLand)}
                        {filteredLands.length > listLimit && <Button className="w-full" variant="outline" onClick={() => setListLimit((value) => value + 100)}>{t("showMore")}</Button>}
                        {!filteredLands.length && <div className="space-y-3 py-8 text-center"><p className="text-sm text-muted-foreground">{t(lands.length ? "noMatches" : "noLands")}</p>{lands.length > 0 && <Button variant="outline" size="sm" onClick={resetFilters}>{t("reset")}</Button>}</div>}
                    </div>
                </aside>
                <div className={cn("relative min-w-0 flex-1", mobileView === "map" ? "block" : "hidden md:block")}>
                    <ProjectLandsMap lands={filteredLands} selectedLandId={selectedLand?.landId ?? null} onSelect={selectLand} fitVersion={fitVersion} />
                    <div className={cn("absolute right-3 top-3 z-10 flex items-center gap-2 rounded-lg px-3 py-2", MAP_CHROME)}>
                        <span className="text-xs">{t("mappedCount", { count: mappedCount })}</span>
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedLandId(null); setFitVersion((value) => value + 1); }}><LocateFixed className="mr-1 h-4 w-4" />{t("fitMap")}</Button>
                    </div>
                    {!mappedCount && <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6"><p className={cn("rounded-xl p-4 text-sm", MAP_CHROME)}>{t(filteredLands.length ? "noBoundaries" : lands.length ? "noMatches" : "noLands")}</p></div>}
                    <div className={cn("absolute bottom-8 left-3 right-3 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg p-3 md:right-auto", MAP_CHROME)} aria-label={t("legend")}>
                        {RISK_LEVELS.map((risk) => <button key={risk} type="button" onClick={() => updateFilters({ risk: filters.risk === risk ? "all" : risk, focus: "all" })} aria-pressed={filters.risk === risk}
                            className={cn("flex items-center gap-2 rounded-md text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", filters.risk === risk && "font-semibold")}>
                            <span className={cn("h-3 w-3 rounded-sm border-2", RISK_CLASSES[risk], risk === "unknown" ? "border-dashed border-current" : "border-current bg-current")} />
                            {t("risk." + risk)}
                        </button>)}
                    </div>
                </div>
                {selectedLand && <div className="fixed inset-2 z-50 md:absolute md:inset-y-2 md:left-auto md:right-4 md:z-30 md:w-[var(--panel-w)]">
                    <ProjectLandPanel land={selectedLand} groupId={groupId} freshnessDays={monitoring?.freshness_days ?? freshnessDays} onClose={() => setSelectedLandId(null)} />
                </div>}
            </div>
        </div>
    );
}

export default function FarmDetailPage() {
    return <Suspense fallback={<Skeleton className="h-full w-full" />}><FarmDetailPageContent /></Suspense>;
}
