"use client";

import React, { Suspense, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import maplibregl from "maplibre-gl";
import { landsApi, alertsApi, INDEX_CONFIG, ALL_INDEX_TYPES, monitoringApi } from "@/lib/api";
import CropSelect from "@/components/field/crop-select";
import type { LandParcel, RasterLayer, IndexType } from "@/lib/api";
import type { AgriHeatIndex, AgriHeatmapImage } from "@/lib/agri-heatmap";
import { AGRI_MODE_LABELS, AGRI_PRIMARY_MODES, canvasToObjectUrl, clipHeatmapImageToField, dataUrlToObjectUrl, heatmapImageHasContent, revokeHeatmapObjectUrl } from "@/lib/agri-heatmap";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    ArrowLeft,
    CloudSun,
    Edit2,
    Layers,
    Loader2,
    Save,
    Search,
    X,
    Bell,
    ClipboardList,
    Share2,
    PanelRight,
    PanelRightClose,
    Satellite,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { MAP_STYLES, type MapStyleId } from "@/lib/pmtiles";
import { tokenColor, MAP_CHROME } from "@/lib/design-tokens";
import { wgs84GeometryToGcj02, wgs84ToGcj02 } from "@/lib/coordinate-transform";
import { Skeleton } from "@/components/ui/skeleton";
import { TOUR_PREPARE_EVENT, type TourPrepareDetail } from "@/lib/product-tour";

const DrawMap = dynamic(() => import("@/components/map/draw-map"), {
    ssr: false,
    loading: () => (
        <Skeleton className="h-full w-full rounded-none" />
    ),
});

const BaseMap = dynamic(() => import("@/components/map/base-map"), {
    ssr: false,
    loading: () => (
        <Skeleton className="h-full w-full rounded-none" />
    ),
});

const NdviTab = dynamic(() => import("@/components/field/ndvi-tab"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
    ),
});

const MapStyleSwitcher = dynamic(() => import("@/components/map/map-style-switcher"), {
    ssr: false,
});

/** Satellite codes as stored by the pipeline, expanded for the reader. */
const SATELLITE_LABELS: Record<string, string> = { S2: "Sentinel-2 L2A" };

const DETAIL_PROJECT_LANDS_SOURCE = "detail-project-lands";
const DETAIL_PROJECT_LANDS_FILL = "detail-project-lands-fill";
const DETAIL_PROJECT_LANDS_LINE = "detail-project-lands-line";
const DETAIL_PROJECT_LAND_SELECTED_SOURCE = "detail-project-land-selected";
const DETAIL_PROJECT_LAND_SELECTED_FILL = "detail-project-land-selected-fill";
const DETAIL_PROJECT_LAND_SELECTED_LINE = "detail-project-land-selected-line";

const NdviLegend = dynamic(() => import("@/components/field/ndvi-legend"), {
    ssr: false,
});

const AgriHeatmapLegend = dynamic(() => import("@/components/field/agri-heatmap-legend"), {
    ssr: false,
});

const AlertsTab = dynamic(() => import("@/components/field/alerts-tab"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
    ),
});

const LandReportTab = dynamic(() => import("@/components/field/land-report-tab"), {
    ssr: false,
    loading: () => (
        <div className="p-4 space-y-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24 w-full" />
        </div>
    ),
});

const ScoutingTab = dynamic(() => import("@/components/field/scouting-tab"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
    ),
});

const ShareTab = dynamic(() => import("@/components/field/share-tab"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
    ),
});

const WeatherTab = dynamic(() => import("@/components/field/weather-tab"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
    ),
});

const SoilTab = dynamic(() => import("@/components/field/soil-tab"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
    ),
});

// 生育期长势独立成页签并按需加载，避免和选地报告、土壤页重复展示大表单。
const SeasonGrowthReportTab = dynamic(() => import("@/components/field/season-growth-report-tab"), {
    ssr: false,
    loading: () => (
        <div className="p-4 space-y-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24 w-full" />
        </div>
    ),
});

/* ── Index overlay helpers ───────────────────────────────────── */

function indexSourceId(indexType: IndexType) {
    return `${indexType.toLowerCase()}-tiles`;
}
function indexLayerId(indexType: IndexType) {
    return `${indexType.toLowerCase()}-raster`;
}

function removeIndexOverlay(map: maplibregl.Map, indexType: IndexType) {
    const layerId = indexLayerId(indexType);
    const sourceId = indexSourceId(indexType);
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function removeAllIndexOverlays(map: maplibregl.Map) {
    const types: IndexType[] = ["NDVI", "EVI", "SAVI", "NDWI"];
    for (const t of types) removeIndexOverlay(map, t);
}

function addIndexOverlay(map: maplibregl.Map, layer: RasterLayer, land: LandParcel, indexType: IndexType) {
    // Fake agri:// placeholder COGs 500 on TiTiler — never add as raster tiles.
    if (!layer.tile_url || !land.boundary_geojson) return;
    if ((layer.cog_uri || "").startsWith("agri://") || layer.tile_url.includes("agri://")) return;
    const sourceId = indexSourceId(indexType);
    const layerId = indexLayerId(indexType);
    const bounds = computeGeomBounds(land.boundary_geojson);
    if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
            type: "raster",
            tiles: [layer.tile_url],
            tileSize: 256,
            ...(bounds ? { bounds } : {}),
        });
    }
    if (!map.getLayer(layerId)) {
        map.addLayer(
            {
                id: layerId,
                type: "raster",
                source: sourceId,
                paint: { "raster-opacity": 0.75 },
                minzoom: 10,
                maxzoom: 18,
            },
            map.getLayer("field-outline") ? "field-outline" : undefined,
        );
    }
}

function computeGeomBounds(geom: GeoJSON.Geometry): [number, number, number, number] | undefined {
    const coords: number[][] = [];
    const extract = (g: any) => {
        if (g.type === "Polygon") g.coordinates[0].forEach((c: number[]) => coords.push(c));
        else if (g.type === "MultiPolygon")
            g.coordinates.forEach((poly: number[][][]) =>
                poly[0].forEach((c: number[]) => coords.push(c)),
            );
    };
    extract(geom);
    if (coords.length === 0) return undefined;
    let minLng = Infinity,
        minLat = Infinity,
        maxLng = -Infinity,
        maxLat = -Infinity;
    for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
    }
    return [minLng, minLat, maxLng, maxLat];
}

function projectLandFeatureCollection(
    lands: LandParcel[],
    selectedLandId: string,
    showAll: boolean,
): GeoJSON.FeatureCollection {
    return {
        type: "FeatureCollection",
        // 当前地块使用更醒目的独立边界图层，查看全部模式才绘制其他地块供直接点击切换。
        features: lands
            .filter((item) => showAll && item.land_id !== selectedLandId && item.boundary_geojson)
            .map((item) => ({
                type: "Feature",
                properties: { landId: item.land_id },
                // 地块边界入库为 WGS84，展示到高德底图前转换成 GCJ-02。
                geometry: wgs84GeometryToGcj02(item.boundary_geojson) as GeoJSON.Geometry,
            })),
    };
}

const PANEL_WIDTH_STORAGE_KEY = "openfarm.fieldPanelWidthPx";
const PANEL_WIDTH_DEFAULT_PX = 400; // 为图表和双列信息保留阅读宽度
const PANEL_WIDTH_MIN_PX = 288; // 18rem
const PANEL_WIDTH_MAX_PX = 640; // 40rem

function clampPanelWidthPx(px: number): number {
    const vwCap =
        typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.5) : PANEL_WIDTH_MAX_PX;
    const max = Math.max(PANEL_WIDTH_MIN_PX, Math.min(PANEL_WIDTH_MAX_PX, vwCap));
    return Math.round(Math.min(max, Math.max(PANEL_WIDTH_MIN_PX, px)));
}

/* ── Page ──────────────────────────────────────────────────── */

function FieldDetailPageContent() {
    const t = useTranslations("fieldDetail");
    const seasonGrowthT = useTranslations("seasonGrowthReport");
    // 兼容旧版静态消息产物：新短标题缺失时，回退到已存在的报告标题，避免显示翻译键名。
    const seasonGrowthTabLabel = t.has("tabSeasonGrowth")
        ? t("tabSeasonGrowth")
        : seasonGrowthT("title");
    const searchParams = useSearchParams();
    const router = useRouter();
    const farmId = searchParams.get("farmId") || "";
    const groupId = searchParams.get("groupId") || "";
    const landId = searchParams.get("fieldId") || "";
    const backHref = groupId
        ? `/farms/detail?groupId=${encodeURIComponent(groupId)}`
        : farmId
            ? `/farms/detail?farmId=${encodeURIComponent(farmId)}`
            : "/farms";

    const [land, setLand] = useState<LandParcel | null>(null);
    const [loading, setLoading] = useState(true);

    // Edit mode
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState("");
    const [editCropType, setEditCropType] = useState("");
    const [editSeason, setEditSeason] = useState("");
    const [editGroupId, setEditGroupId] = useState("");
    const [editGeom, setEditGeom] = useState<GeoJSON.Geometry | null>(null);
    const [saving, setSaving] = useState(false);

    // Map
    const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
    const [mapStyle, setMapStyle] = useState<MapStyleId>("satellite");
    // 地块详情需要优先展示分析内容，进入页面时默认展开右侧分析侧栏。
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [activeTab, setActiveTab] = useState("land-report");
    const [panelWidthPx, setPanelWidthPx] = useState(PANEL_WIDTH_DEFAULT_PX);
    const [isResizingPanel, setIsResizingPanel] = useState(false);
    const panelWidthRef = useRef(PANEL_WIDTH_DEFAULT_PX);

    // Index overlay
    const [indexLayer, setIndexLayer] = useState<RasterLayer | null>(null);
    const [agriHeatmap, setAgriHeatmap] = useState<AgriHeatmapImage | null>(null);
    const [agriHeatMode, setAgriHeatMode] = useState<AgriHeatIndex>("ndvi");
    const [activeIndexType, setActiveIndexType] = useState<IndexType>("NDVI");
    const indexLayerRef = useRef<RasterLayer | null>(null);
    const activeIndexTypeRef = useRef<IndexType>("NDVI");
    const landRef = useRef<LandParcel | null>(null);

    useEffect(() => {
        const onPrepare = (event: Event) => {
            const detail = (event as CustomEvent<TourPrepareDetail>).detail;
            if (detail?.sidebar) setSidebarOpen(true);
            if (detail?.tab) setActiveTab(detail.tab);
        };
        window.addEventListener(TOUR_PREPARE_EVENT, onPrepare);
        return () => window.removeEventListener(TOUR_PREPARE_EVENT, onPrepare);
    }, []);
    const agriHeatmapRef = useRef<AgriHeatmapImage | null>(null);
    /** blob: URL currently fed to MapLibre ImageSource — revoke on clear/replace. */
    const agriHeatmapBlobUrlRef = useRef<string | null>(null);
    /** Bump to cancel in-flight canvas.toBlob apply. */
    const agriHeatmapApplyGenRef = useRef(0);

    // Available index types (only indices with computed layers)
    const [availableTypes, setAvailableTypes] = useState<IndexType[]>([]);
    const [projectLands, setProjectLands] = useState<LandParcel[]>([]);
    const [projectLandsLoading, setProjectLandsLoading] = useState(false);
    const [showAllProjectLands, setShowAllProjectLands] = useState(false);
    const [projectLandQuery, setProjectLandQuery] = useState("");
    const [projectLandListOpen, setProjectLandListOpen] = useState(false);
    const [pendingProjectLandId, setPendingProjectLandId] = useState<string | null>(null);

    const pendingProjectLand = pendingProjectLandId
        ? projectLands.find((item) => item.land_id === pendingProjectLandId) ?? null
        : null;

    const filteredProjectLands = useMemo(() => {
        const query = projectLandQuery.trim().toLocaleLowerCase();
        if (!query) return projectLands;

        // 只按当前项目地块的名称和编号筛选，避免搜索框再次触发地图位置检索。
        return projectLands.filter((item) =>
            [item.land_name, item.land_id].some((value) =>
                String(value ?? "").toLocaleLowerCase().includes(query),
            ),
        );
    }, [projectLandQuery, projectLands]);

    // Keyboard shortcut: toggle sidebar with Cmd/Ctrl + .
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === ".") {
                e.preventDefault();
                setSidebarOpen((prev) => !prev);
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    // Restore persisted field panel width (px). Invalid/missing → 22rem default.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
            if (raw == null || raw === "") return;
            const n = Number(raw);
            if (!Number.isFinite(n) || n <= 0) return;
            const clamped = clampPanelWidthPx(n);
            panelWidthRef.current = clamped;
            setPanelWidthPx(clamped);
        } catch {
            /* ignore quota / private mode */
        }
    }, []);

    useEffect(() => {
        panelWidthRef.current = panelWidthPx;
    }, [panelWidthPx]);

    const persistPanelWidth = useCallback((px: number) => {
        try {
            localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(px));
        } catch {
            /* ignore */
        }
    }, []);

    const handlePanelResizeStart = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizingPanel(true);
            const startX = e.clientX;
            const startW = panelWidthRef.current;

            const onMove = (ev: MouseEvent) => {
                // Dragging the left edge: move left → wider panel
                const next = clampPanelWidthPx(startW + (startX - ev.clientX));
                panelWidthRef.current = next;
                setPanelWidthPx(next);
            };
            const onUp = () => {
                setIsResizingPanel(false);
                persistPanelWidth(panelWidthRef.current);
                document.body.style.removeProperty("cursor");
                document.body.style.removeProperty("user-select");
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
            };

            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
        },
        [persistPanelWidth],
    );

    const handlePanelResizeReset = useCallback(() => {
        panelWidthRef.current = PANEL_WIDTH_DEFAULT_PX;
        setPanelWidthPx(PANEL_WIDTH_DEFAULT_PX);
        persistPanelWidth(PANEL_WIDTH_DEFAULT_PX);
    }, [persistPanelWidth]);

    // Alerts
    const [openAlertCount, setOpenAlertCount] = useState(0);

    // Fetch alert count independently (so badge shows without opening alerts tab)
    useEffect(() => {
        if (!landId) return;
        let cancelled = false;
        alertsApi.listForLand(landId, 200).then((res) => {
            if (!cancelled) {
                setOpenAlertCount(res.items.filter((a) => a.status === "open").length);
            }
        }).catch(() => { });
        return () => { cancelled = true; };
    }, [landId]);

    // Fetch which index types have computed layers
    const refreshAvailableTypes = useCallback(() => {
        if (!landId) return;
        monitoringApi.layerTypes(landId).then((types) => {
            const upper = new Set(types.map((t) => t.toUpperCase() as IndexType));
            // 地图快捷切换只保留 NDVI 等当前需要的入口，EVI 仍可随任务计算但不在此处展示点击项。
            const sorted = ALL_INDEX_TYPES.filter((t) => t !== "EVI" && upper.has(t));
            setAvailableTypes(sorted);
        }).catch(() => { });
    }, [landId]);

    useEffect(() => {
        refreshAvailableTypes();
    }, [refreshAvailableTypes]);

    // Keep refs in sync for style.load handler
    useEffect(() => {
        indexLayerRef.current = indexLayer;
    }, [indexLayer]);
    useEffect(() => {
        activeIndexTypeRef.current = activeIndexType;
    }, [activeIndexType]);
    useEffect(() => {
        landRef.current = land;
    }, [land]);
    useEffect(() => {
        agriHeatmapRef.current = agriHeatmap;
    }, [agriHeatmap]);


    const loadField = useCallback(async () => {
        if (!landId) {
            toast.error(t("fieldNotFound"));
            router.push("/farms");
            return;
        }

        setLoading(true);
        setMapInstance(null);
        setProjectLands([]);
        setIndexLayer(null);
        setAgriHeatmap(null);
        setAvailableTypes([]);
        setActiveIndexType("NDVI");
        try {
            const f = await landsApi.get(landId);
            setLand(f);
            setEditName(f.land_name || f.land_id);
            setEditCropType(f.crop_type || "");
            setEditSeason(f.season || "");
            setEditGroupId(f.group_id || "");
            setEditGeom(f.boundary_geojson || f.geom);
        } catch {
            toast.error(t("fieldNotFound"));
            router.push(backHref);
        } finally {
            setLoading(false);
        }
    }, [landId, backHref, router, t]);

    useEffect(() => {
        loadField();
    }, [loadField]);

    useEffect(() => {
        if (!land || land.land_id !== landId) return;

        const scopeGroupId = groupId || land.group_id;
        const scopeFarmId = farmId || land.farm_id;
        let cancelled = false;
        setProjectLandsLoading(true);

        // 优先按项目 group_id 查询；没有项目组 ID 时再按 farm_id 查询，避免把其他项目地块混入地图。
        const loadProjectLands = async () => {
            if (!scopeFarmId && !scopeGroupId) {
                setProjectLands([land]);
                setProjectLandsLoading(false);
                return;
            }

            try {
                const scope = scopeGroupId
                    ? { group_id: scopeGroupId }
                    : { farm_id: scopeFarmId || undefined };
                const pageSize = 200;
                const items: LandParcel[] = [];
                let offset = 0;
                let total = 0;

                // 分页拉取完整项目地块，确保地图和选择框不只显示第一页。
                do {
                    const result = await landsApi.list({ ...scope, limit: pageSize, offset });
                    items.push(...result.items);
                    total = result.total;
                    if (!result.items.length) break;
                    offset += result.items.length;
                } while (items.length < total);

                if (cancelled) return;
                const byId = new Map<string, LandParcel>();
                byId.set(land.land_id, land);
                items.forEach((item) => byId.set(item.land_id, item));
                setProjectLands(Array.from(byId.values()));
            } catch {
                if (!cancelled) setProjectLands([land]);
            } finally {
                if (!cancelled) setProjectLandsLoading(false);
            }
        };

        void loadProjectLands();
        return () => {
            cancelled = true;
        };
    }, [land, landId, farmId, groupId]);

    const switchToLand = useCallback((nextLandId: string) => {
        if (!nextLandId || nextLandId === landId) return;
        const nextLand = projectLands.find((item) => item.land_id === nextLandId);
        const nextFarmId = nextLand?.farm_id || land?.farm_id || farmId;
        const nextGroupId = nextLand?.group_id || land?.group_id || groupId;
        const params = new URLSearchParams({ fieldId: nextLandId });
        if (nextFarmId) params.set("farmId", nextFarmId);
        if (nextGroupId) params.set("groupId", nextGroupId);

        // 切换完成后收起搜索结果，避免新地块页面仍保留旧的下拉状态。
        setPendingProjectLandId(null);
        setProjectLandListOpen(false);
        setProjectLandQuery("");

        // 复用同一详情页路由切换地块，侧边栏所有报告、土壤和气象数据会随 land_id 重新加载。
        router.push(`/farms/fields/detail?${params.toString()}`);
    }, [farmId, groupId, land, landId, projectLands, router]);

    const confirmProjectLandSwitch = useCallback(() => {
        if (!pendingProjectLandId) return;

        const nextLandId = pendingProjectLandId;
        // 地图点击先只产生待切换状态，确认后才改变路由，避免用户误触后侧边栏突然切换。
        setPendingProjectLandId(null);
        switchToLand(nextLandId);
    }, [pendingProjectLandId, switchToLand]);

    const cancelProjectLandSwitch = useCallback(() => {
        setPendingProjectLandId(null);
    }, []);

    const clearAgriHeatmapLayers = useCallback((map: maplibregl.Map) => {
        // Cancel any in-flight canvas.toBlob → ImageSource apply
        agriHeatmapApplyGenRef.current += 1;
        revokeHeatmapObjectUrl(agriHeatmapBlobUrlRef.current);
        agriHeatmapBlobUrlRef.current = null;
        const ids: [string, string][] = [
            ["agri-heatmap-raster", "agri-heatmap"],
            ["agri-heatmap-fill", "agri-heatmap-geojson"],
            ["agri-heatmap-circles", "agri-heatmap-points"],
        ];
        for (const [layerId, srcId] of ids) {
            try {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
            } catch { /* ignore */ }
            try {
                if (map.getSource(srcId)) map.removeSource(srcId);
            } catch { /* ignore */ }
        }
    }, []);

    /**
     * Draw agri 色膜: MapLibre image raster ONLY (canvas-filled cells → blob:/data: film).
     * Do NOT co-add GeoJSON fill — abutting polygons + outlines create white grid seams.
     * Image uses canvas.toBlob → createObjectURL when possible (CSP connect-src has blob:/data:).
     */
    const applyAgriHeatmapToMap = useCallback(
        (
            map: maplibregl.Map,
            hm: AgriHeatmapImage,
            fieldGeom: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined,
            beforeId?: string,
        ) => {
            const imgSrcId = "agri-heatmap";
            const imgLayerId = "agri-heatmap-raster";

            // Strip any leftover GeoJSON fill from older builds (white seams).
            try {
                if (map.getLayer("agri-heatmap-fill")) map.removeLayer("agri-heatmap-fill");
            } catch { /* ignore */ }
            try {
                if (map.getSource("agri-heatmap-geojson")) map.removeSource("agri-heatmap-geojson");
            } catch { /* ignore */ }

            // Continuous canvas color film (nearest). Prefer blob: object URL.
            const clippedImg = clipHeatmapImageToField(hm, fieldGeom);
            const addImageLayer = (url: string) => {
                try {
                    if (map.getLayer(imgLayerId)) map.removeLayer(imgLayerId);
                } catch { /* ignore */ }
                try {
                    if (map.getSource(imgSrcId)) map.removeSource(imgSrcId);
                } catch { /* ignore */ }
                map.addSource(imgSrcId, {
                    type: "image",
                    url,
                    // 色斑数据本身按 WGS84 生成，叠加到高德底图时同步转换四角。
                    coordinates: clippedImg.coordinates.map(([longitude, latitude]) =>
                        wgs84ToGcj02(longitude, latitude),
                    ) as AgriHeatmapImage["coordinates"],
                });
                const before =
                    beforeId && map.getLayer(beforeId) ? beforeId : undefined;
                map.addLayer(
                    {
                        id: imgLayerId,
                        type: "raster",
                        source: imgSrcId,
                        paint: {
                            "raster-opacity": 0.92,
                            "raster-resampling": "nearest",
                        },
                    },
                    before,
                );
            };

            if (heatmapImageHasContent(clippedImg) && clippedImg.dataUrl) {
                const dataUrl = clippedImg.dataUrl;
                const gen = ++agriHeatmapApplyGenRef.current;

                const commitUrl = (url: string) => {
                    if (gen !== agriHeatmapApplyGenRef.current) {
                        revokeHeatmapObjectUrl(url !== dataUrl ? url : null);
                        return;
                    }
                    try {
                        revokeHeatmapObjectUrl(agriHeatmapBlobUrlRef.current);
                        agriHeatmapBlobUrlRef.current = url.startsWith("blob:") ? url : null;
                        addImageLayer(url);
                    } catch (e) {
                        console.warn("[agri-heatmap] image overlay failed", e);
                        if (url !== dataUrl) {
                            try {
                                addImageLayer(dataUrl);
                            } catch (e2) {
                                console.warn("[agri-heatmap] image overlay failed", e2);
                            }
                        }
                    }
                };

                // Prefer canvas.toBlob → createObjectURL (MapLibre fetches via connect-src).
                const img = new Image();
                img.onload = () => {
                    if (gen !== agriHeatmapApplyGenRef.current) return;
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext("2d", { willReadFrequently: true });
                    if (!ctx || !canvas.width || !canvas.height) {
                        try {
                            commitUrl(dataUrlToObjectUrl(dataUrl));
                        } catch {
                            commitUrl(dataUrl);
                        }
                        return;
                    }
                    ctx.drawImage(img, 0, 0);
                    void canvasToObjectUrl(canvas)
                        .then((blobUrl) => commitUrl(blobUrl))
                        .catch(() => {
                            try {
                                commitUrl(dataUrlToObjectUrl(dataUrl));
                            } catch {
                                commitUrl(dataUrl);
                            }
                        });
                };
                img.onerror = () => {
                    if (gen !== agriHeatmapApplyGenRef.current) return;
                    try {
                        commitUrl(dataUrlToObjectUrl(dataUrl));
                    } catch (e) {
                        console.warn("[agri-heatmap] image overlay failed", e);
                        try {
                            commitUrl(dataUrl);
                        } catch (e2) {
                            console.warn("[agri-heatmap] image overlay failed", e2);
                        }
                    }
                };
                img.src = dataUrl;
            } else if (hm.pixelCount > 0) {
                const msg = "色斑有像素但色膜未生成（canvas/clip 失败）";
                console.warn("[agri-heatmap]", msg, {
                    index: hm.index,
                    pixelCount: hm.pixelCount,
                    fromLonLat: !!hm.fromLonLat,
                    geojsonN: hm.geojson?.features?.length ?? 0,
                    hasDataUrl: !!hm.dataUrl,
                    clippedHasContent: heatmapImageHasContent(clippedImg),
                });
                toast.message(msg, {
                    description: `${AGRI_MODE_LABELS[hm.index]} · ${hm.pixelCount} px`,
                });
            }
        },
        [],
    );

    // Add field polygon (and NDVI if active) to map.
    // When agri 色斑图 is active: field fill opacity 0; continuous image film sits above fill, below outline.
    const setupMapLayers = useCallback((map: maplibregl.Map) => {
        const f = landRef.current;
        const projectFeatures = projectLandFeatureCollection(
            projectLands,
            f?.land_id || "",
            showAllProjectLands,
        );
        const selectedProjectFeatures = projectLandFeatureCollection(
            pendingProjectLand ? [pendingProjectLand] : [],
            f?.land_id || "",
            Boolean(pendingProjectLand),
        );
        if (!f?.boundary_geojson && !projectFeatures.features.length && !selectedProjectFeatures.features.length) return;

        const hm = agriHeatmapRef.current;
        // Remove existing layers/source first to avoid stale state / wrong z-order
        try {
            clearAgriHeatmapLayers(map);
        } catch { /* ignore */ }
        if (map.getLayer(DETAIL_PROJECT_LANDS_LINE)) map.removeLayer(DETAIL_PROJECT_LANDS_LINE);
        if (map.getLayer(DETAIL_PROJECT_LANDS_FILL)) map.removeLayer(DETAIL_PROJECT_LANDS_FILL);
        if (map.getSource(DETAIL_PROJECT_LANDS_SOURCE)) map.removeSource(DETAIL_PROJECT_LANDS_SOURCE);
        if (map.getLayer(DETAIL_PROJECT_LAND_SELECTED_LINE)) map.removeLayer(DETAIL_PROJECT_LAND_SELECTED_LINE);
        if (map.getLayer(DETAIL_PROJECT_LAND_SELECTED_FILL)) map.removeLayer(DETAIL_PROJECT_LAND_SELECTED_FILL);
        if (map.getSource(DETAIL_PROJECT_LAND_SELECTED_SOURCE)) map.removeSource(DETAIL_PROJECT_LAND_SELECTED_SOURCE);
        if (map.getLayer("field-outline")) map.removeLayer("field-outline");
        if (map.getLayer("field-fill")) map.removeLayer("field-fill");
        if (map.getSource("field-polygon")) map.removeSource("field-polygon");

        if (projectFeatures.features.length) {
            map.addSource(DETAIL_PROJECT_LANDS_SOURCE, {
                type: "geojson",
                data: projectFeatures,
            });
            map.addLayer({
                id: DETAIL_PROJECT_LANDS_FILL,
                type: "fill",
                source: DETAIL_PROJECT_LANDS_SOURCE,
                paint: {
                    "fill-color": tokenColor("--map-field-stroke"),
                    "fill-opacity": 0.08,
                },
            });
            map.addLayer({
                id: DETAIL_PROJECT_LANDS_LINE,
                type: "line",
                source: DETAIL_PROJECT_LANDS_SOURCE,
                paint: {
                    "line-color": tokenColor("--muted-foreground"),
                    "line-width": 1.5,
                    "line-opacity": 0.85,
                    "line-dasharray": [2, 1.5],
                },
            });
        }

        if (selectedProjectFeatures.features.length) {
            map.addSource(DETAIL_PROJECT_LAND_SELECTED_SOURCE, {
                type: "geojson",
                data: selectedProjectFeatures,
            });
            // 待确认地块单独使用醒目的高亮边界，让用户知道点击后可以确认切换，但不改变当前侧边栏。
            map.addLayer({
                id: DETAIL_PROJECT_LAND_SELECTED_FILL,
                type: "fill",
                source: DETAIL_PROJECT_LAND_SELECTED_SOURCE,
                paint: {
                    "fill-color": tokenColor("--primary"),
                    "fill-opacity": 0.14,
                },
            });
            map.addLayer({
                id: DETAIL_PROJECT_LAND_SELECTED_LINE,
                type: "line",
                source: DETAIL_PROJECT_LAND_SELECTED_SOURCE,
                paint: {
                    "line-color": tokenColor("--primary"),
                    "line-width": 3,
                    "line-opacity": 1,
                },
            });
        }

        if (!f?.boundary_geojson) return;
        const displayFieldGeometry = wgs84GeometryToGcj02(f.boundary_geojson);
        if (!displayFieldGeometry) return;

        map.addSource("field-polygon", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: displayFieldGeometry },
        });
        // Transparent fill while heatmap is on — outline stays for boundary.
        map.addLayer({
            id: "field-fill",
            type: "fill",
            source: "field-polygon",
            paint: {
                "fill-color": tokenColor("--map-field-stroke"),
                "fill-opacity": hm ? 0 : 0.2,
            },
        });
        map.addLayer({
            id: "field-outline",
            type: "line",
            source: "field-polygon",
            paint: {
                "line-color": tokenColor("--map-field-stroke"),
                "line-width": 3.5,
                "line-opacity": 1,
            },
        });

        // Re-add index overlay if active
        const layer = indexLayerRef.current;
        if (layer?.tile_url) {
            addIndexOverlay(map, layer, f, activeIndexTypeRef.current);
        }

        if (hm) {
            const landGeom = f.boundary_geojson as GeoJSON.Polygon | GeoJSON.MultiPolygon;
            applyAgriHeatmapToMap(map, hm, landGeom, "field-outline");
        }
    }, [applyAgriHeatmapToMap, clearAgriHeatmapLayers, pendingProjectLand, projectLands, showAllProjectLands]);

    // 地块应位于可见地图中，右侧分析面板占用的区域不参与居中计算。
    const fitFieldInView = useCallback((map: maplibregl.Map) => {
        if (!land?.boundary_geojson) return;
        const bounds = new maplibregl.LngLatBounds();
        const displayGeometry = wgs84GeometryToGcj02(land.boundary_geojson);
        if (!displayGeometry) return;
        getAllCoords(displayGeometry).forEach(([lng, lat]) => bounds.extend([lng, lat]));
        if (bounds.isEmpty()) return;
        const width = map.getContainer().clientWidth;
        const height = map.getContainer().clientHeight;
        const mobile = window.matchMedia("(max-width: 639px)").matches;
        map.fitBounds(bounds, {
            padding: {
                top: 80,
                bottom: sidebarOpen && mobile ? Math.round(height * 0.52) + 28 : 48,
                left: 56,
                right: sidebarOpen && !mobile ? Math.min(panelWidthPx + 48, Math.round(width * 0.65)) : 40,
            },
            maxZoom: 17,
            duration: 0,
        });
    }, [land, sidebarOpen, panelWidthPx]);

    const fitProjectLandsInView = useCallback((map: maplibregl.Map) => {
        const bounds = new maplibregl.LngLatBounds();
        let hasCoordinates = false;
        projectLands.forEach((item) => {
            if (!item.boundary_geojson) return;
            const displayGeometry = wgs84GeometryToGcj02(item.boundary_geojson);
            if (!displayGeometry) return;
            getAllCoords(displayGeometry).forEach(([lng, lat]) => {
                bounds.extend([lng, lat]);
                hasCoordinates = true;
            });
        });
        if (!hasCoordinates) return;

        const width = map.getContainer().clientWidth;
        const height = map.getContainer().clientHeight;
        const mobile = window.matchMedia("(max-width: 639px)").matches;
        map.fitBounds(bounds, {
            padding: {
                top: 80,
                bottom: sidebarOpen && mobile ? Math.round(height * 0.52) + 28 : 48,
                left: 56,
                right: sidebarOpen && !mobile ? Math.min(panelWidthPx + 48, Math.round(width * 0.65)) : 40,
            },
            maxZoom: 16,
            duration: 0,
        });
    }, [panelWidthPx, projectLands, sidebarOpen]);

    const toggleProjectLandsView = useCallback(() => {
        const nextShowAll = !showAllProjectLands;
        setPendingProjectLandId(null);
        setShowAllProjectLands(nextShowAll);
        if (!mapInstance) return;

        // 切换显示范围时同步调整视野；侧边栏不参与该状态变化，所以仍保留当前地块数据。
        if (nextShowAll) {
            fitProjectLandsInView(mapInstance);
        } else {
            fitFieldInView(mapInstance);
        }
    }, [fitFieldInView, fitProjectLandsInView, mapInstance, showAllProjectLands]);

    // Callback from BaseMap when ready
    const handleMapReady = useCallback(
        (map: maplibregl.Map) => {
            setMapInstance(map);
            setupMapLayers(map);

            fitFieldInView(map);
        },
        [setupMapLayers, fitFieldInView],
    );

    // When field arrives after the map is already ready, draw/fit the boundary
    // (handleMapReady often runs with field still null — race with loadField).
    useEffect(() => {
        if (!mapInstance || !land?.boundary_geojson) return;
        if (!mapInstance.isStyleLoaded()) return;
        setupMapLayers(mapInstance);
        fitFieldInView(mapInstance);
        // 观察实际地图容器，导航侧栏切换与窗口缩放均能保持地块可见。
        const observer = new ResizeObserver(() => {
            mapInstance.resize();
            fitFieldInView(mapInstance);
        });
        observer.observe(mapInstance.getContainer());
        return () => observer.disconnect();
    }, [land, mapInstance, setupMapLayers, fitFieldInView]);

    useEffect(() => {
        const map = mapInstance;
        if (!map || !showAllProjectLands || !map.getLayer(DETAIL_PROJECT_LANDS_FILL)) return;

        const onClick = (event: maplibregl.MapMouseEvent) => {
            const features = map.queryRenderedFeatures(event.point, {
                layers: [DETAIL_PROJECT_LANDS_FILL],
            });
            const nextLandId = String(features[0]?.properties?.landId ?? "");
            if (nextLandId) setPendingProjectLandId(nextLandId);
        };
        const onEnter = () => {
            map.getCanvas().style.cursor = "pointer";
        };
        const onLeave = () => {
            map.getCanvas().style.cursor = "";
        };

        // 地图上的其他项目地块先进入待确认状态，确认后再复用详情路由切换，避免误触导致侧边栏突然变化。
        map.on("click", DETAIL_PROJECT_LANDS_FILL, onClick);
        map.on("mouseenter", DETAIL_PROJECT_LANDS_FILL, onEnter);
        map.on("mouseleave", DETAIL_PROJECT_LANDS_FILL, onLeave);
        return () => {
            map.off("click", DETAIL_PROJECT_LANDS_FILL, onClick);
            map.off("mouseenter", DETAIL_PROJECT_LANDS_FILL, onEnter);
            map.off("mouseleave", DETAIL_PROJECT_LANDS_FILL, onLeave);
        };
    }, [mapInstance, showAllProjectLands, setupMapLayers]);

    // Map style change - poll isStyleLoaded() to re-add layers reliably
    const handleStyleChange = useCallback(
        (styleId: MapStyleId) => {
            if (!mapInstance) return;
            const styleDef = MAP_STYLES.find((s) => s.id === styleId);
            if (!styleDef) return;

            mapInstance.setStyle(styleDef.style);
            setMapStyle(styleId);

            // Poll until the new style is loaded, then re-add our layers
            const poll = setInterval(() => {
                try {
                    if (mapInstance.isStyleLoaded()) {
                        clearInterval(poll);
                        setupMapLayers(mapInstance);
                    }
                } catch {
                    clearInterval(poll);
                }
            }, 50);

            // Safety: stop polling after 5s
            setTimeout(() => clearInterval(poll), 5000);
        },
        [mapInstance, setupMapLayers],
    );

    // Index tile overlay management
    useEffect(() => {
        const map = mapInstance;
        if (!map || !map.isStyleLoaded()) return;
        removeAllIndexOverlays(map);
        if (indexLayer?.tile_url && land) {
            addIndexOverlay(map, indexLayer, land, activeIndexType);
        }
    }, [indexLayer, land, mapInstance, activeIndexType]);

    // Agri 色斑图 — canvas image film ONLY (blob:/data:); never GeoJSON fill (white seams)
    useEffect(() => {
        const map = mapInstance;
        if (!map || !map.isStyleLoaded()) return;
        try {
            clearAgriHeatmapLayers(map);
        } catch { /* ignore */ }

        // Hide solid green fill whenever 色斑 is active so sparse pixels stay visible
        try {
            if (map.getLayer("field-fill")) {
                map.setPaintProperty("field-fill", "fill-opacity", agriHeatmap ? 0 : 0.2);
            }
        } catch { /* ignore */ }

        if (!agriHeatmap) return;

        const landGeom = landRef.current?.boundary_geojson as
            | GeoJSON.Polygon
            | GeoJSON.MultiPolygon
            | undefined;
        const beforeId = map.getLayer("field-outline") ? "field-outline" : undefined;
        applyAgriHeatmapToMap(map, agriHeatmap, landGeom, beforeId);

        return () => {
            try {
                clearAgriHeatmapLayers(map);
                if (map.getLayer("field-fill")) {
                    map.setPaintProperty("field-fill", "fill-opacity", 0.2);
                }
            } catch { /* ignore */ }
        };
    }, [agriHeatmap, mapInstance, land, applyAgriHeatmapToMap, clearAgriHeatmapLayers]);

    const handleShowLayer = useCallback((layer: RasterLayer | null, indexType: IndexType) => {
        setIndexLayer(layer);
        setActiveIndexType(indexType);
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const data: any = {};
            if (editName.trim() !== (land?.land_name || land?.land_id)) data.land_name = editName.trim();
            if (editCropType.trim() !== (land?.crop_type || ""))
                data.crop_type = editCropType.trim() || null;
            if (editSeason.trim() !== (land?.season || ""))
                data.season = editSeason.trim() || null;
            if (editGeom && JSON.stringify(editGeom) !== JSON.stringify(land?.boundary_geojson))
                data.boundary_geojson = editGeom;
            if (editGroupId.trim() !== (land?.group_id || ""))
                data.group_id = editGroupId.trim() || null;

            const updated = await landsApi.update(landId, data);
            setLand(updated);
            setEditing(false);
            toast.success(t("fieldUpdated"));
        } catch (err: any) {
            toast.error(err.detail || t("failedUpdate"));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="relative h-full w-full overflow-hidden">
                <Skeleton className="absolute inset-0 rounded-none" />
                <div className="absolute top-4 left-4 flex gap-2">
                    <Skeleton className="h-10 w-32 rounded-lg" />
                    <Skeleton className="h-10 w-28 rounded-lg" />
                </div>
                <Skeleton className="absolute top-4 right-4 bottom-4 w-[var(--panel-w)] rounded-xl" />
            </div>
        );
    }

    if (!land) return null;

    return (
        <div
            className="relative h-full w-full overflow-hidden"
            style={{ "--panel-w": `${panelWidthPx}px` } as React.CSSProperties}
        >
            {/* Full-screen map */}
            <div className="absolute inset-0">
                {editing ? (
                    <DrawMap
                        initialGeometry={land.boundary_geojson}
                        onGeometryChange={(g) => setEditGeom(g)}
                        onMapReady={(m) => setMapInstance(m)}
                        onBasemapFallback={setMapStyle}
                        basemapStyle={mapStyle}
                    />
                ) : (
                    <BaseMap onMapReady={handleMapReady} onBasemapFallback={setMapStyle} />
                )}
            </div>

            {/* Top-left: Back + Style Switcher + project land search */}
            <div className="absolute top-4 left-4 z-20 flex flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                    <Link
                        href={backHref as "/farms"}
                        className={cn("inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-3", MAP_CHROME)}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {t("backToFarm")}
                    </Link>
                    <MapStyleSwitcher currentStyle={mapStyle} onStyleChange={handleStyleChange} />
                    <div
                        className="relative"
                        onBlur={(event) => {
                            const nextFocused = event.relatedTarget as Node | null;
                            if (!nextFocused || !event.currentTarget.contains(nextFocused)) {
                                setProjectLandListOpen(false);
                            }
                        }}
                    >
                        <div className={cn("relative flex h-10 w-72 max-w-[calc(100vw-2rem)] items-center rounded-lg", MAP_CHROME)}>
                            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={projectLandQuery}
                                onChange={(event) => {
                                    setProjectLandQuery(event.target.value);
                                    setProjectLandListOpen(true);
                                }}
                                onFocus={() => setProjectLandListOpen(true)}
                                placeholder={t("searchProjectLand")}
                                aria-label={t("searchProjectLand")}
                                aria-expanded={projectLandListOpen}
                                className="h-10 border-0 bg-transparent pl-9 pr-9 text-[13px] shadow-none focus-visible:ring-0"
                            />
                            {projectLandQuery && (
                                <button
                                    type="button"
                                    className="absolute right-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                                    aria-label={t("clearSearch")}
                                    onClick={() => {
                                        setProjectLandQuery("");
                                        setProjectLandListOpen(false);
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {projectLandListOpen && projectLandsLoading && (
                            <div className={cn("absolute left-0 top-[calc(100%+0.5rem)] z-30 rounded-xl px-3 py-2 text-xs text-muted-foreground", MAP_CHROME)}>
                                {t("projectLandsLoading")}
                            </div>
                        )}

                        {projectLandListOpen && !projectLandsLoading && projectLands.length > 0 && (
                            <div className={cn("absolute left-0 top-[calc(100%+0.5rem)] z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl p-2", MAP_CHROME)}>
                                <p className="px-2 pb-1 text-xs font-medium text-foreground">
                                    {t("projectLandSelect")} · {projectLands.length}
                                </p>
                                <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                                    {filteredProjectLands.length > 0 ? filteredProjectLands.map((item) => {
                                        const selected = item.land_id === landId;
                                        return (
                                            <button
                                                key={item.land_id}
                                                type="button"
                                                onClick={() => switchToLand(item.land_id)}
                                                aria-current={selected ? "page" : undefined}
                                                className={cn(
                                                    "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                    selected
                                                        ? "bg-primary text-primary-foreground"
                                                        : "text-foreground hover:bg-surface-3",
                                                )}
                                            >
                                                <span className="block truncate font-medium">
                                                    {item.land_name?.trim() || item.land_id}
                                                </span>
                                                {item.land_name?.trim() && (
                                                    <span className="block truncate text-[10px] opacity-75">
                                                        {item.land_id}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    }) : (
                                        <p className="px-2 py-3 text-xs text-muted-foreground">
                                            {t("projectLandNoMatch")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("h-10 gap-1.5 px-3 text-[13px]", MAP_CHROME)}
                        onClick={toggleProjectLandsView}
                        disabled={!mapInstance || projectLandsLoading || projectLands.length < 2}
                        aria-label={t(showAllProjectLands ? "showSelectedProjectLand" : "showAllProjectLands")}
                        title={t(showAllProjectLands ? "showSelectedProjectLand" : "showAllProjectLands")}
                    >
                        <Layers className="h-4 w-4" />
                        <span>{t(showAllProjectLands ? "showSelectedProjectLand" : "showAllProjectLands")}</span>
                    </Button>
                </div>

            </div>

            {pendingProjectLand && (
                <div className="pointer-events-none absolute left-1/2 top-20 z-30 -translate-x-1/2">
                    <div
                        className={cn(
                            "pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg px-3 py-2 shadow-lg",
                            MAP_CHROME,
                        )}
                        role="status"
                        aria-live="polite"
                    >
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/15" />
                        <div className="min-w-0">
                            <p className="max-w-44 truncate text-xs font-medium text-foreground">
                                {pendingProjectLand.land_name?.trim() || pendingProjectLand.land_id}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                {t("projectLandSwitchHint")}
                            </p>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            className="h-7 shrink-0 px-2.5 text-xs"
                            onClick={confirmProjectLandSwitch}
                        >
                            {t("switchToProjectLand")}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-1.5 text-xs text-muted-foreground"
                            onClick={cancelProjectLandSwitch}
                        >
                            {t("cancelProjectLandSwitch")}
                        </Button>
                    </div>
                </div>
            )}

            {/* Index / agri 色斑 Legend - bottom-left */}
            {(agriHeatmap || indexLayer) && (
                <div className="absolute bottom-6 left-4 z-20 transition-opacity duration-200">
                    {agriHeatmap ? (
                        <AgriHeatmapLegend heatmap={agriHeatmap} />
                    ) : indexLayer ? (
                        <NdviLegend layer={indexLayer} indexType={activeIndexType} />
                    ) : null}
                </div>
            )}

            {/* Bottom-centre stack: index selector above, provenance below.
                One container so the two can never overlap, and both stay
                centred on the visible map rather than on the viewport. */}
            <div
                className="absolute bottom-6 z-20 flex max-w-[calc(100%-2rem)] flex-col items-center gap-2"
                style={{
                    left: sidebarOpen ? "calc(50% - var(--panel-w) / 2)" : "50%",
                    transform: "translateX(-50%)",
                }}
            >
                {activeTab === "ndvi" && (
                    <div data-tour="heatmap-modes" className={cn("flex gap-1 rounded-lg p-1", MAP_CHROME)}>
                        {AGRI_PRIMARY_MODES.map((mode) => (
                            <Button
                                key={mode}
                                variant={mode === agriHeatMode ? "default" : "ghost"}
                                size="sm"
                                onClick={() => setAgriHeatMode(mode)}
                                className="px-3 text-xs font-medium"
                                title={
                                    mode === "drought"
                                        ? "干旱 NDDI（Gu et al. 2007）"
                                        : mode === "flood"
                                          ? "洪涝 S1 VV/VH 阈值"
                                          : AGRI_MODE_LABELS[mode]
                                }
                            >
                                {AGRI_MODE_LABELS[mode]}
                            </Button>
                        ))}
                    </div>
                )}

                {activeTab === "ndvi" && availableTypes.length > 0 && (
                    <div className={cn("flex gap-1 rounded-lg p-1", MAP_CHROME)}>
                        {availableTypes.map((idx) => (
                            <Button
                                key={idx}
                                variant={idx === activeIndexType ? "default" : "ghost"}
                                size="sm"
                                onClick={() => { if (idx === activeIndexType) return; setIndexLayer(null); setActiveIndexType(idx); }}
                                className="px-3 text-xs font-medium"
                            >
                                {INDEX_CONFIG[idx].label}
                            </Button>
                        ))}
                    </div>
                )}

                {/* Satellite, date, cloud cover and colormap in one mono
                    line: the reproducibility claim, made visible where the
                    user is actually looking. */}
                {agriHeatmap && (
                    <div
                        className="max-w-full rounded-lg border border-border px-3.5 py-2"
                        style={{ background: "hsl(var(--map-scrim) / 0.82)" }}
                    >
                        <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                            <Satellite className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {[
                                agriHeatmap.index === "flood" ? "Sentinel-1" : "Sentinel-2",
                                AGRI_MODE_LABELS[agriHeatmap.index],
                                agriHeatmap.mean != null ? `均≈${agriHeatmap.mean.toFixed(2)}` : null,
                                `${agriHeatmap.pixelCount} px`,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                )}

                {!agriHeatmap && indexLayer && (
                    <div
                        className="max-w-full rounded-lg border border-border px-3.5 py-2"
                        style={{ background: "hsl(var(--map-scrim) / 0.82)" }}
                    >
                        <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                            <Satellite className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {[
                                SATELLITE_LABELS[indexLayer.satellite] ?? indexLayer.satellite,
                                indexLayer.date,
                                indexLayer.params_json?.cloud_cover != null
                                    ? t("cloudCover", { percent: Math.round(indexLayer.params_json.cloud_cover) })
                                    : null,
                                INDEX_CONFIG[activeIndexType].colormap,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                )}
            </div>

            {/* Sidebar toggle button - always visible */}
            <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={cn("absolute top-4 right-4 sm:right-[var(--toggle-right)] z-20 rounded-xl p-2.5 transition-all hover:bg-surface-3", MAP_CHROME)}
                style={{ "--toggle-right": sidebarOpen ? "calc(var(--panel-w) + 2rem)" : "1rem" } as React.CSSProperties}
                title={sidebarOpen ? "Hide panel (⌘.)" : "Show panel (⌘.)"}
            >
                {sidebarOpen ? (
                    <PanelRightClose className="h-4 w-4 text-foreground" />
                ) : (
                    <PanelRight className="h-4 w-4 text-foreground" />
                )}
            </button>

            {/* Floating tabbed sidebar - right */}
            <div
                className={cn(
                    "absolute right-4 bottom-4 z-10 h-[52%] w-[calc(100%-2rem)] sm:top-4 sm:h-auto sm:w-[var(--panel-w)] max-w-[calc(100%-2rem)]",
                    !isResizingPanel && "transition-transform duration-300 ease-in-out",
                    sidebarOpen ? "translate-x-0" : "translate-x-[calc(100%+1rem)]",
                )}
            >
                {/* Left-edge drag handle — always-visible short gray grip (centered) */}
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize panel"
                    title="Drag to resize · double-click resets to default"
                    onMouseDown={handlePanelResizeStart}
                    onDoubleClick={handlePanelResizeReset}
                    className="group/resize absolute left-0 top-0 bottom-0 z-20 hidden sm:flex w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center"
                >
                    <div
                        className={cn(
                            "pointer-events-none h-14 w-1 rounded-full bg-muted-foreground/50 shadow-sm",
                            "transition-colors group-hover/resize:bg-muted-foreground/75",
                            isResizingPanel && "bg-muted-foreground/85",
                        )}
                    />
                </div>
                <div className={cn("flex h-full flex-col overflow-hidden rounded-xl", MAP_CHROME)}>
                    <Tabs defaultValue="land-report" value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
                        {/* 页签保持紧凑单行，窄侧栏允许横向滚动，不挤占内容高度。 */}
                        <div className="flex min-w-0 shrink-0 items-center border-b bg-background/95">
                            <TabsList variant="underline" className="min-w-0 !w-auto flex-1 flex-nowrap gap-3 overflow-x-auto !border-b-0 px-3 py-1">
                            <TabsTrigger
                                value="land-report"
                                variant="underline"
                                className="shrink-0 pb-2 pt-2 text-[11px]"
                                data-tour="tab-report"
                            >
                                {t("tabLandReport")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="alerts"
                                variant="underline"
                                className="shrink-0 pb-2 pt-2 text-[11px]"
                            >
                                <span className="relative">
                                    {t("tabAlerts")}
                                    {openAlertCount > 0 && (
                                        <span className="absolute -top-1 -right-2 h-2 w-2 rounded-full bg-destructive" />
                                    )}
                                </span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="ndvi"
                                variant="underline"
                                className="shrink-0 pb-2 pt-2 text-[11px]"
                                data-tour="tab-ndvi"
                            >
                                {t("tabNdvi")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="weather"
                                variant="underline"
                                className="shrink-0 pb-2 pt-2 text-[11px]"
                                data-tour="tab-weather"
                            >
                                {t("tabWeather")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="soil"
                                variant="underline"
                                className="shrink-0 pb-2 pt-2 text-[11px]"
                            >
                                {t("tabSoil")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="season-growth"
                                variant="underline"
                                className="shrink-0 pb-2 pt-2 text-[11px]"
                            >
                                {seasonGrowthTabLabel}
                            </TabsTrigger>
                            </TabsList>
                            {/* 编辑收纳到页签栏右上角，避免操作按钮挤占报告内容区域。 */}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="mr-2 h-7 w-7 shrink-0"
                                aria-label={t("edit")}
                                title={t("edit")}
                                disabled={editing}
                                onClick={() => {
                                    setEditName(land.land_name || land.land_id);
                                    setEditCropType(land.crop_type || "");
                                    setEditSeason(land.season || "");
                                    setEditGroupId(land.group_id || "");
                                    setEditGeom(land.boundary_geojson);
                                    setEditing(true);
                                }}
                            >
                                <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                            {editing ? (
                                <div className="p-4">
                                    <h3 className="text-sm font-semibold mb-3">{t("editField")}</h3>
                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="edit-name" className="text-xs">
                                                {t("name")}
                                            </Label>
                                            <Input
                                                id="edit-name"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="h-9"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="edit-crop" className="text-xs">
                                                {t("cropType")}
                                            </Label>
                                            <CropSelect
                                                id="edit-crop"
                                                value={editCropType}
                                                onChange={setEditCropType}
                                                placeholder={t("cropType")}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="edit-season" className="text-xs">
                                                {t("season")}
                                            </Label>
                                            <Input
                                                id="edit-season"
                                                value={editSeason}
                                                onChange={(e) => setEditSeason(e.target.value)}
                                                className="h-9"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">地块 ID</Label>
                                            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono">
                                                {land.land_id}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                地块主键不可修改，所有遥感、土壤和气象数据均直接使用此 ID。
                                            </p>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="edit-cdfinance-group-id" className="text-xs">
                                                {t("cdfinanceGroupId")}
                                            </Label>
                                            <Input
                                                id="edit-cdfinance-group-id"
                                                value={editGroupId}
                                                onChange={(e) => setEditGroupId(e.target.value)}
                                                placeholder={t("placeholderCdfinanceGroupId")}
                                                className="h-9"
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {t("editHint")}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button
                                                className="flex-1 h-9"
                                                onClick={handleSave}
                                                disabled={saving}
                                            >
                                                {saving ? (
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                ) : (
                                                    <Save className="h-4 w-4 mr-2" />
                                                )}
                                                {t("save")}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="flex-1 h-9"
                                                onClick={() => setEditing(false)}
                                            >
                                                <X className="h-4 w-4 mr-2" /> {t("cancel")}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* 详情默认直接展示选地报告，基础字段信息不再占用侧栏空间；管理操作继续保留。 */}
                                    <TabsContent value="land-report" className="mt-0">
                                        <div className="space-y-3 p-3">
                                            <LandReportTab
                                                key={landId}
                                                landId={landId}
                                                groupId={land.group_id}
                                                cropType={land.crop_type}
                                                onCropBound={(key) => {
                                                    setLand((prev) => (prev ? { ...prev, crop_type: key } : prev));
                                                }}
                                            />
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value="ndvi"
                                        forceMount
                                        className="mt-0 p-3 data-[state=inactive]:hidden data-[state=inactive]:!hidden"
                                    >
                                        <NdviTab
                                            landId={landId}
                                            cropType={land.crop_type}
                                            areaHa={land.area_ha}
                                            onShowLayer={handleShowLayer}
                                            activeIndexOverride={activeIndexType}
                                            onActiveIndexChange={setActiveIndexType}
                                            onDataLoaded={refreshAvailableTypes}
                                            onAgriHeatmapChange={setAgriHeatmap}
                                            agriHeatMode={agriHeatMode}
                                            onAgriHeatModeChange={setAgriHeatMode}
                                            agriHeatmapEnabled={activeTab === "ndvi"}
                                        />
                                    </TabsContent>

                                    <TabsContent value="alerts" className="mt-0 p-3">
                                        <AlertsTab landId={landId} onOpenCountChange={setOpenAlertCount} />
                                    </TabsContent>

                                    <TabsContent value="scouting" className="mt-0">
                                        <ScoutingTab landId={landId} mapInstance={mapInstance} activeTab={activeTab} />
                                    </TabsContent>

                                    <TabsContent value="weather" className="mt-0 p-3">
                                        <WeatherTab landId={landId} />
                                    </TabsContent>

                                    <TabsContent value="soil" className="mt-0 p-3">
                                        <SoilTab landId={landId} groupId={land.group_id} mapInstance={mapInstance} activeTab={activeTab} />
                                    </TabsContent>

                                    <TabsContent value="season-growth" className="mt-0">
                                        <SeasonGrowthReportTab landId={landId} groupId={land.group_id} />
                                    </TabsContent>

                                    <TabsContent value="share" className="mt-0">
                                        <ShareTab landId={landId} />
                                    </TabsContent>
                                </>
                            )}
                        </div>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}

function getAllCoords(geom: GeoJSON.Geometry): number[][] {
    if (geom.type === "Point") return [geom.coordinates as number[]];
    if (geom.type === "Polygon") return (geom.coordinates as number[][][]).flat();
    if (geom.type === "MultiPolygon") return (geom.coordinates as number[][][][]).flat(2);
    return [];
}

export default function FieldDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen" />}>
            <FieldDetailPageContent />
        </Suspense>
    );
}
