"use client";

import React, { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, FileText, Sprout, Wheat } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgriHeatmapImage } from "@/lib/agri-heatmap";
import type { ParcelAnalysisSection } from "@/lib/field-detail-tabs";

const LandReportTab = dynamic(() => import("./land-report-tab"), {
    ssr: false,
    loading: () => (
        <div className="space-y-3 px-3 pb-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24 w-full" />
        </div>
    ),
});

const SeasonGrowthReportTab = dynamic(() => import("./season-growth-report-tab"), {
    ssr: false,
    loading: () => (
        <div className="space-y-3 px-3 pb-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24 w-full" />
        </div>
    ),
});

const HarvestTab = dynamic(() => import("./harvest-tab"), {
    ssr: false,
    loading: () => (
        <div className="space-y-3 px-3 pb-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24 w-full" />
        </div>
    ),
});

interface ParcelAnalysisTabProps {
    landId: string;
    groupId?: string | number | null;
    cropType?: string | null;
    fieldGeom?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
    onCropBound?: (cropKey: string) => void;
    onMapOverlayChange?: (img: AgriHeatmapImage | null) => void;
    onHarvestSectionOpenChange?: (open: boolean) => void;
    focusSection?: ParcelAnalysisSection;
    onSectionFocusChange?: (section: ParcelAnalysisSection) => void;
    onShowEmergence?: () => void;
}

type OpenState = Record<ParcelAnalysisSection, boolean>;
type MountedState = Record<ParcelAnalysisSection, boolean>;

function initialOpenState(focusSection: ParcelAnalysisSection = "land-report"): OpenState {
    return {
        "land-report": focusSection === "land-report",
        "season-growth": focusSection === "season-growth",
        harvest: focusSection === "harvest",
    };
}

function toMountedState(open: OpenState): MountedState {
    return {
        "land-report": open["land-report"],
        "season-growth": open["season-growth"],
        harvest: open.harvest,
    };
}

function AnalysisSection({
    id,
    title,
    description,
    summary,
    icon,
    open,
    onToggle,
    mounted,
    children,
}: {
    id: ParcelAnalysisSection;
    title: string;
    description: string;
    summary?: string | null;
    icon: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    mounted: boolean;
    children: React.ReactNode;
}) {
    const headerId = `parcel-analysis-${id}-header`;
    const panelId = `parcel-analysis-${id}-panel`;

    return (
        <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
            <button
                type="button"
                id={headerId}
                aria-expanded={open}
                aria-controls={panelId}
                data-section={id}
                onClick={onToggle}
                className="flex w-full min-w-0 items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
            >
                <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
                    {icon}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold leading-5">{title}</span>
                        {summary ? (
                            <span className="max-w-[46%] shrink-0 truncate text-[11px] font-medium text-muted-foreground">
                                {summary}
                            </span>
                        ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                        {description}
                    </span>
                </span>
                <ChevronDown
                    className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                    )}
                    aria-hidden="true"
                />
            </button>
            {mounted ? (
                <div
                    id={panelId}
                    role="region"
                    aria-labelledby={headerId}
                    hidden={!open}
                    className={cn("border-t", !open && "hidden")}
                >
                    {children}
                </div>
            ) : null}
        </section>
    );
}

/**
 * 选地报告、生育期长势和收获放在同一页，用可展开卡片而不是二级页签。
 * 分区首次展开才挂载内容，收起后保持挂载以免丢失表单和重复打接口。
 */
export default function ParcelAnalysisTab({
    landId,
    groupId,
    cropType,
    fieldGeom,
    onCropBound,
    onMapOverlayChange,
    onHarvestSectionOpenChange,
    focusSection = "land-report",
    onSectionFocusChange,
    onShowEmergence,
}: ParcelAnalysisTabProps) {
    const t = useTranslations("fieldDetail");
    const landReportT = useTranslations("landReportTab");
    const seasonT = useTranslations("seasonGrowthReport");
    const harvestT = useTranslations("harvestTab");

    const [open, setOpen] = useState<OpenState>(() => initialOpenState(focusSection));
    const [mounted, setMounted] = useState<MountedState>(() => toMountedState(initialOpenState(focusSection)));
    const [summaries, setSummaries] = useState<Partial<Record<ParcelAnalysisSection, string | null>>>({});

    useEffect(() => {
        setOpen((prev) => (prev[focusSection] ? prev : { ...prev, [focusSection]: true }));
        setMounted((prev) => (prev[focusSection] ? prev : { ...prev, [focusSection]: true }));
    }, [focusSection]);

    useEffect(() => {
        onHarvestSectionOpenChange?.(open.harvest);
    }, [open.harvest, onHarvestSectionOpenChange]);

    const toggleSection = useCallback(
        (id: ParcelAnalysisSection) => {
            setOpen((prev) => {
                const nextOpen = !prev[id];
                if (nextOpen) onSectionFocusChange?.(id);
                return { ...prev, [id]: nextOpen };
            });
            setMounted((prev) => ({ ...prev, [id]: true }));
        },
        [onSectionFocusChange],
    );

    const setSectionSummary = useCallback((id: ParcelAnalysisSection, value: string | null) => {
        setSummaries((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
    }, []);

    return (
        <div className="space-y-3 p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("parcelAnalysisIntro")}
            </p>
            <AnalysisSection
                id="land-report"
                title={t("tabLandReport")}
                description={landReportT("description")}
                summary={summaries["land-report"]}
                icon={<FileText className="h-4 w-4" />}
                open={open["land-report"]}
                mounted={mounted["land-report"]}
                onToggle={() => toggleSection("land-report")}
            >
                <LandReportTab
                    landId={landId}
                    groupId={groupId}
                    cropType={cropType}
                    embedded
                    onCropBound={onCropBound}
                    onSummaryChange={(value) => setSectionSummary("land-report", value)}
                    onShowEmergence={onShowEmergence}
                />
            </AnalysisSection>
            <AnalysisSection
                id="season-growth"
                title={t.has("tabSeasonGrowth") ? t("tabSeasonGrowth") : seasonT("title")}
                description={seasonT("description")}
                summary={summaries["season-growth"]}
                icon={<Sprout className="h-4 w-4" />}
                open={open["season-growth"]}
                mounted={mounted["season-growth"]}
                onToggle={() => toggleSection("season-growth")}
            >
                <SeasonGrowthReportTab
                    landId={landId}
                    groupId={groupId}
                    embedded
                    onSummaryChange={(value) => setSectionSummary("season-growth", value)}
                />
            </AnalysisSection>
            <AnalysisSection
                id="harvest"
                title={t("tabHarvest")}
                description={harvestT("description")}
                summary={summaries.harvest}
                icon={<Wheat className="h-4 w-4" />}
                open={open.harvest}
                mounted={mounted.harvest}
                onToggle={() => toggleSection("harvest")}
            >
                <HarvestTab
                    landId={landId}
                    fieldGeom={fieldGeom}
                    embedded
                    onMapOverlayChange={onMapOverlayChange}
                    onSummaryChange={(value) => setSectionSummary("harvest", value)}
                />
            </AnalysisSection>
        </div>
    );
}
