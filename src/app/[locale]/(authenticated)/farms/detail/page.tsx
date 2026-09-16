"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { landsApi } from "@/lib/api";
import {
    getPlantingGroup,
    getPlantingTypeDict,
    listAllCropLands,
    formatMu,
    groupStatusLabel,
    signStatusLabel,
    plantingTypeLabel,
    type AgricGroup,
    type AgricLand,
} from "@/lib/agric";
import { landPathToPolygon } from "@/lib/land-path";
import { toast } from "sonner";
import {
    ArrowLeft,
    Map as MapIcon,
    MapPin,
    Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MAP_CHROME } from "@/lib/design-tokens";
import { useTranslations } from "next-intl";
import type { ProjectMapLand } from "@/components/project/project-lands-map";

const ProjectLandsMap = dynamic(() => import("@/components/project/project-lands-map"), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

interface DisplayLand {
    landId: string;
    landName: string;
    areaText: string;
    cropText: string;
    cropStatusName?: string;
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
    hasBoundary: boolean;
    hasRemoteSensing: boolean;
}

function cropTextOf(land: AgricLand): string {
    return [land.cropName, land.varietyName].filter(Boolean).join(" · ");
}

function FarmDetailPageContent() {
    const t = useTranslations("farmsPage");
    const tCreate = useTranslations("createFarm");
    const searchParams = useSearchParams();
    const router = useRouter();
    const groupId = searchParams.get("groupId") || "";

    const [group, setGroup] = useState<AgricGroup | null>(null);
    const [lands, setLands] = useState<DisplayLand[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLandId, setSelectedLandId] = useState<string | null>(null);
    const [landQuery, setLandQuery] = useState("");
    const [plantingLabels, setPlantingLabels] = useState<Record<string, string>>({});

    const loadData = useCallback(async () => {
        if (!groupId) {
            toast.error(t("missingId"));
            router.push("/farms");
            return;
        }

        setLoading(true);
        try {
            const [groupResult, agricLands, typeDict, satelliteRes] = await Promise.all([
                getPlantingGroup(groupId).catch(() => null),
                listAllCropLands(groupId),
                getPlantingTypeDict().catch(() => ({ options: [], labelByValue: {}, categoriesByType: {} })),
                landsApi.list({ group_id: groupId, limit: 500 }).catch(() => ({ items: [], total: 0, limit: 500, offset: 0 })),
            ]);
            setGroup(groupResult || { groupId, groupName: t("title") });
            setPlantingLabels(typeDict.labelByValue);

            const satelliteById = new Map(
                satelliteRes.items.map((item) => [String(item.land_id), item]),
            );

            setLands(agricLands.map((land) => {
                const landId = String(land.landId);
                const satellite = satelliteById.get(landId);
                const agricGeom = landPathToPolygon(land.wgsLandPath || land.landPath);
                const satelliteGeom = satellite?.boundary_geojson as GeoJSON.Polygon | GeoJSON.MultiPolygon | undefined;
                const geometry = agricGeom || satelliteGeom || null;
                return {
                    landId,
                    landName: land.landName || landId,
                    areaText: formatMu(land.landArea),
                    cropText: cropTextOf(land),
                    cropStatusName: land.cropStatusName,
                    geometry,
                    hasBoundary: Boolean(geometry),
                    hasRemoteSensing: Boolean(satellite),
                };
            }));
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || t("farmNotFound"));
            router.push("/farms");
        } finally {
            setLoading(false);
        }
    }, [groupId, router, t]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredLands = useMemo(() => {
        const q = landQuery.trim().toLowerCase();
        if (!q) return lands;
        return lands.filter((land) =>
            land.landName.toLowerCase().includes(q) || land.cropText.toLowerCase().includes(q),
        );
    }, [landQuery, lands]);

    const mapLands: ProjectMapLand[] = useMemo(
        () => lands.map((land) => ({
            landId: land.landId,
            landName: land.landName,
            areaText: land.areaText,
            cropText: land.cropText,
            geometry: land.geometry,
        })),
        [lands],
    );

    const openLandDetail = useCallback((landId: string) => {
        const href = `/farms/fields/detail?groupId=${encodeURIComponent(groupId)}&fieldId=${encodeURIComponent(landId)}`;
        window.location.assign(href);
    }, [groupId]);

    const handleSelectLand = useCallback((landId: string) => {
        const current = lands.find((land) => land.landId === landId);
        setSelectedLandId(landId);
        if (current && !current.hasBoundary) {
            toast.info(t("landUnmarked"));
        }
    }, [lands, t]);

    if (loading) {
        return (
            <div className="fixed inset-x-0 top-14 bottom-0 overflow-hidden">
                <Skeleton className="h-full w-full rounded-none" />
            </div>
        );
    }

    if (!group) return null;

    const area = group.effectiveArea ?? group.groupArea;
    const markedCount = lands.filter((land) => land.hasBoundary).length;

    return (
        <div className="fixed inset-x-0 top-14 bottom-0 overflow-hidden">
            <div className="absolute inset-0">
                <ProjectLandsMap
                    lands={mapLands}
                    selectedLandId={selectedLandId}
                    groupId={groupId}
                    onSelect={handleSelectLand}
                    onViewDetail={openLandDetail}
                />
            </div>

            <div className={cn("absolute top-4 left-4 z-20 flex max-w-[min(36rem,calc(100%-2rem))] items-start gap-2")}>
                <Link
                    href="/farms"
                    className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-3", MAP_CHROME)}
                >
                    <ArrowLeft className="h-4 w-4" />
                    {tCreate("backToFarms")}
                </Link>
                <div className={cn("min-w-0 rounded-lg px-4 py-2.5", MAP_CHROME)}>
                    <p className="truncate text-sm font-semibold">{group.groupName || groupId}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{t("landCountArea", { count: Number(group.groupNum) || lands.length, area: formatMu(area) })}</span>
                        <span>{t("markedCount", { count: markedCount })}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        <Badge variant="secondary">{groupStatusLabel(group.status)}</Badge>
                        {group.signStatus != null && group.signStatus !== "" && (
                            <Badge variant="outline">{signStatusLabel(group)}</Badge>
                        )}
                        {group.plantingType != null && group.plantingType !== "" && (
                            <Badge variant="outline">{plantingTypeLabel(group.plantingType, plantingLabels)}</Badge>
                        )}
                        {group.businessCategory && (
                            <Badge variant="outline">{group.businessCategory}</Badge>
                        )}
                    </div>
                </div>
            </div>

            <div className={cn(
                "absolute z-20 flex flex-col overflow-hidden rounded-lg",
                "bottom-4 left-4 right-4 h-48",
                "sm:bottom-auto sm:left-auto sm:top-4 sm:right-4 sm:h-[calc(100%-2rem)] sm:w-[min(20rem,calc(100%-2rem))]",
                MAP_CHROME,
            )}>
                <div className="border-b px-3 py-3">
                    <p className="text-sm font-semibold">{t("landsTitle", { count: lands.length })}</p>
                    <div className="relative mt-2">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            className="h-8 pl-8"
                            value={landQuery}
                            onChange={(e) => setLandQuery(e.target.value)}
                            placeholder={t("searchLands")}
                        />
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {filteredLands.length === 0 ? (
                        <div className="px-2 py-10 text-center">
                            <MapIcon className="mx-auto h-8 w-8 text-muted-foreground/40" />
                            <p className="mt-3 text-sm font-medium">{t("noFieldsTitle")}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{t("noProjectLandsDesc")}</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredLands.map((land) => {
                                const active = land.landId === selectedLandId;
                                return (
                                    <div
                                        key={land.landId}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleSelectLand(land.landId)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                handleSelectLand(land.landId);
                                            }
                                        }}
                                        className={cn(
                                            "flex w-full cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                                            active ? "bg-primary-subtle" : "hover:bg-accent",
                                        )}
                                    >
                                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle">
                                            <MapPin className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{land.landName}</p>
                                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                                {[land.areaText, land.cropText, land.cropStatusName].filter(Boolean).join(" · ")}
                                            </p>
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {!land.hasBoundary && (
                                                    <Badge variant="outline">{t("unmarked")}</Badge>
                                                )}
                                                {land.hasRemoteSensing && (
                                                    <Badge variant="secondary">{t("hasRemoteSensing")}</Badge>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 shrink-0 px-2 text-xs"
                                            asChild
                                        >
                                            <Link
                                                href={`/farms/fields/detail?groupId=${encodeURIComponent(groupId)}&fieldId=${encodeURIComponent(land.landId)}`}
                                                onClick={(event) => event.stopPropagation()}
                                            >
                                                {t("viewDetail")}
                                            </Link>
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function FarmDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen" />}>
            <FarmDetailPageContent />
        </Suspense>
    );
}
