"use client";

import React, { Suspense, useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from "react";
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
    Crosshair,
    Edit2,
    Layers,
    Loader2,
    Save,
    Search,
    X,
    PanelRight,
    PanelRightClose,
    Satellite,
    MoreHorizontal,
    Check,
    AlertTriangle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";
import { MAP_STYLES, usesGcj02Coordinates, type MapStyleId } from "@/lib/pmtiles";
import { tokenColor, MAP_CHROME } from "@/lib/design-tokens";
import { wgs84GeometryToGcj02, wgs84ToGcj02 } from "@/lib/coordinate-transform";
import { Skeleton } from "@/components/ui/skeleton";
import { TOUR_PREPARE_EVENT, type TourPrepareDetail } from "@/lib/product-tour";
import { bindSheetGesture } from "@/lib/sheet-gesture";
import {
    formatLandAreaMu,
    isOversizedLand,
    resolveLandAreaMu,
} from "@/lib/land-schedule-filter";
import {
    FIELD_DETAIL_DEFAULT_TAB,
    applyFieldDetailTabParams,
    resolveFieldDetailTab,
    resolveParcelAnalysisSection,
    shouldShowHarvestMapOverlay,
    type ParcelAnalysisSection,
} from "@/lib/field-detail-tabs";

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

/** 地图图层入口使用业务名称，内部指标编码仍保持 NDVI。 */
function getIndexDisplayLabel(indexType: IndexType): string {
    return indexType === "NDVI" ? "长势分析" : INDEX_CONFIG[indexType].label;
}

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

// 种植双周报：走现有登录态与 /satellite-api，与其他地块接口同一套网关。
const BiweeklyTab = dynamic(() => import("@/components/biweekly/biweekly-tab"));

// 选地报告、生育期长势、收获放在「选地报告」页签，首次进入再加载。
const ParcelAnalysisTab = dynamic(() => import("@/components/field/parcel-analysis-tab"), {
    ssr: false,
    loading: () => (
        <div className="p-3 space-y-3">
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
    styleId: MapStyleId,
): GeoJSON.FeatureCollection {
    return {
        type: "FeatureCollection",
        // 当前地块使用更醒目的独立边界图层，查看全部模式才绘制其他地块供直接点击切换。
        features: lands
            .filter((item) => showAll && item.land_id !== selectedLandId && item.boundary_geojson)
            .map((item) => ({
                type: "Feature",
                properties: { landId: item.land_id },
                // 农业卫星图按 WGS84 展示，只有切换到高德道路图才转换成 GCJ-02。
                geometry: usesGcj02Coordinates(styleId)
                    ? wgs84GeometryToGcj02(item.boundary_geojson) as GeoJSON.Geometry
                    : item.boundary_geojson,
            })),
    };
}

const PANEL_WIDTH_STORAGE_KEY = "openfarm.fieldPanelWidthPx";
const PANEL_WIDTH_DEFAULT_PX = 400; // 为图表和双列信息保留阅读宽度
const PANEL_WIDTH_MIN_PX = 288; // 18rem
const PANEL_WIDTH_MAX_PX = 640; // 40rem
const SHEET_PEEK_PX = 44;
const SHEET_FULL_TOP_PX = 0;
const SHEET_FLICK_PX_PER_MS = 0.55;

function clampPanelWidthPx(px: number): number {
    const vwCap =
        typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.5) : PANEL_WIDTH_MAX_PX;
    const max = Math.max(PANEL_WIDTH_MIN_PX, Math.min(PANEL_WIDTH_MAX_PX, vwCap));
    return Math.round(Math.min(max, Math.max(PANEL_WIDTH_MIN_PX, px)));
}

/* ── Page ──────────────────────────────────────────────────── */

function FieldDetailPageContent() {
    const t = useTranslations("fieldDetail");
    const agriPanelT = useTranslations("agriPanel");
    const searchParams = useSearchParams();
    const router = useRouter();
    const farmId = searchParams.get("farmId") || "";
    const groupId = searchParams.get("groupId") || "";
    const landId = searchParams.get("fieldId") || "";
    const initialTab = resolveFieldDetailTab(searchParams.get("tab"));
    const initialParcelSection = resolveParcelAnalysisSection(
        searchParams.get("tab"),
        searchParams.get("section"),
    );
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
    // 供地图图层、视野计算和遥感色膜读取当前底图坐标系，避免状态更新时闭包拿到旧值。
    const mapStyleRef = useRef<MapStyleId>("satellite");
    // 地块详情需要优先展示分析内容，进入页面时默认展开右侧分析侧栏，并打开长势分析。
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("half");
    const sheetSnapRef = useRef<"peek" | "half" | "full">("half");
    const stageRef = useRef<HTMLDivElement>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const sheetScrollRef = useRef<HTMLDivElement>(null);
    const mapToolsRef = useRef<HTMLDivElement>(null);
    const sheetDragRef = useRef<{
        pointerId: number;
        origin: "handle" | "bar";
        startX: number;
        startY: number;
        startTop: number;
        lastY: number;
        lastT: number;
        velocity: number;
        moved: boolean;
        active: boolean;
    } | null>(null);
    const sheetDragGeneration = useRef(0);
    const sheetSettleTimerRef = useRef<number | null>(null);
    const sheetSettleCleanupRef = useRef<(() => void) | null>(null);
    const sheetStyleLockRef = useRef(false);
    const sheetSuppressClickRef = useRef(false);
    const locateMarkerRef = useRef<maplibregl.Marker | null>(null);
    sheetSnapRef.current = sheetSnap;
    const [activeTab, setActiveTab] = useState(initialTab);
    const [parcelSection, setParcelSection] = useState<ParcelAnalysisSection>(initialParcelSection);
    const [harvestSectionOpen, setHarvestSectionOpen] = useState(initialParcelSection === "harvest");
    const [parcelAnalysisVisited, setParcelAnalysisVisited] = useState(initialTab === "parcel-analysis");
    const [panelWidthPx, setPanelWidthPx] = useState(PANEL_WIDTH_DEFAULT_PX);
    const [panelWidthMaxPx, setPanelWidthMaxPx] = useState(PANEL_WIDTH_MAX_PX);
    const [isResizingPanel, setIsResizingPanel] = useState(false);
    const panelWidthRef = useRef(PANEL_WIDTH_DEFAULT_PX);
    const panelResizeCleanupRef = useRef<(() => void) | null>(null);

    // Index overlay
    const [indexLayer, setIndexLayer] = useState<RasterLayer | null>(null);
    const [agriHeatmap, setAgriHeatmap] = useState<AgriHeatmapImage | null>(null);
    // 收获页签的逐像元状态色膜单独存放：NDVI 面板在后台切换日期时会清空 agriHeatmap，不能互相覆盖。
    const [harvestHeatmap, setHarvestHeatmap] = useState<AgriHeatmapImage | null>(null);
    const shownHeatmap = shouldShowHarvestMapOverlay(activeTab, harvestSectionOpen)
        ? harvestHeatmap
        : agriHeatmap;
    const [agriHeatMode, setAgriHeatMode] = useState<AgriHeatIndex>("ndvi");
    const [activeIndexType, setActiveIndexType] = useState<IndexType>("NDVI");
    const indexLayerRef = useRef<RasterLayer | null>(null);
    const activeIndexTypeRef = useRef<IndexType>("NDVI");
    const landRef = useRef<LandParcel | null>(null);

    useEffect(() => {
        const onPrepare = (event: Event) => {
            const detail = (event as CustomEvent<TourPrepareDetail>).detail;
            if (detail?.sidebar) setSidebarOpen(true);
            if (detail?.tab) {
                const nextTab = resolveFieldDetailTab(detail.tab);
                setActiveTab(nextTab);
                if (nextTab === "parcel-analysis") {
                    setParcelAnalysisVisited(true);
                    setParcelSection(resolveParcelAnalysisSection(detail.tab, null));
                }
            }
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
        const syncPanelWidthToViewport = () => {
            const maxWidth = clampPanelWidthPx(PANEL_WIDTH_MAX_PX);
            setPanelWidthMaxPx(maxWidth);
            const width = clampPanelWidthPx(panelWidthRef.current);
            panelWidthRef.current = width;
            setPanelWidthPx(width);
        };
        syncPanelWidthToViewport();
        window.addEventListener("resize", syncPanelWidthToViewport);
        return () => window.removeEventListener("resize", syncPanelWidthToViewport);
    }, []);

    useEffect(() => {
        panelWidthRef.current = panelWidthPx;
    }, [panelWidthPx]);

    useEffect(
        () => () => {
            panelResizeCleanupRef.current?.();
        },
        [],
    );

    const persistPanelWidth = useCallback((px: number) => {
        try {
            localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(px));
        } catch {
            /* ignore */
        }
    }, []);

    const handlePanelResizeStart = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
            panelResizeCleanupRef.current?.();
            e.preventDefault();
            e.stopPropagation();
            setIsResizingPanel(true);
            const pointerId = e.pointerId;
            const startX = e.clientX;
            const startW = panelWidthRef.current;
            const previousCursor = document.body.style.cursor;
            const previousUserSelect = document.body.style.userSelect;
            let cleanup = () => {};

            const onMove = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                // 左侧分隔条向左移动会扩展右侧分析面板，同时兼容鼠标和触控笔/触屏。
                const next = clampPanelWidthPx(startW + (startX - ev.clientX));
                panelWidthRef.current = next;
                setPanelWidthPx(next);
            };
            const onUp = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                setIsResizingPanel(false);
                persistPanelWidth(panelWidthRef.current);
                cleanup();
            };
            cleanup = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onUp);
                document.body.style.cursor = previousCursor;
                document.body.style.userSelect = previousUserSelect;
                if (panelResizeCleanupRef.current === cleanup) {
                    panelResizeCleanupRef.current = null;
                }
            };

            panelResizeCleanupRef.current = cleanup;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onUp);
        },
        [persistPanelWidth],
    );

    const handlePanelResizeReset = useCallback(() => {
        panelWidthRef.current = PANEL_WIDTH_DEFAULT_PX;
        setPanelWidthPx(PANEL_WIDTH_DEFAULT_PX);
        persistPanelWidth(PANEL_WIDTH_DEFAULT_PX);
    }, [persistPanelWidth]);

    const handlePanelResizeKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            const step = event.shiftKey ? 64 : 24;
            let nextWidth: number;
            if (event.key === "ArrowLeft") {
                // 分隔条向左移动会扩展右侧分析面板。
                nextWidth = panelWidthRef.current + step;
            } else if (event.key === "ArrowRight") {
                nextWidth = panelWidthRef.current - step;
            } else if (event.key === "Home") {
                nextWidth = PANEL_WIDTH_MIN_PX;
            } else if (event.key === "End") {
                nextWidth = clampPanelWidthPx(PANEL_WIDTH_MAX_PX);
            } else if (event.key === "Enter" || event.key === " ") {
                nextWidth = PANEL_WIDTH_DEFAULT_PX;
            } else {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            const width = clampPanelWidthPx(nextWidth);
            panelWidthRef.current = width;
            setPanelWidthPx(width);
            persistPanelWidth(width);
        },
        [persistPanelWidth],
    );

    // Alerts
    const [openAlertCount, setOpenAlertCount] = useState(0);

    // 打开地块时先按最新卫星观测补算预警，再取数量，保证页签角标和预警列表一致。
    useEffect(() => {
        if (!landId) return;
        let cancelled = false;
        const refreshAlerts = async () => {
            // 补算失败时仍读取已有预警，避免短时故障让页面显示为零。
            await alertsApi.evaluateForLand(landId).catch(() => undefined);
            try {
                const res = await alertsApi.listForLand(landId, 200);
                if (!cancelled) {
                    setOpenAlertCount(res.items.filter((a) => a.status === "open").length);
                }
            } catch {
                // 保留静默行为，避免预警服务暂时不可用时阻断地块页面。
            }
        };
        void refreshAlerts();
        return () => { cancelled = true; };
    }, [landId]);

    // Fetch which index types have computed layers
    const refreshAvailableTypes = useCallback(() => {
        if (!landId) return;
        monitoringApi.layerTypes(landId).then((types) => {
            const upper = new Set(types.map((t) => t.toUpperCase() as IndexType));
            // EVI 仍保留在可用图层列表，渲染时放入扩展菜单，避免用户失去已有数据查看能力。
            const sorted = ALL_INDEX_TYPES.filter((t) => upper.has(t));
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
        agriHeatmapRef.current = shownHeatmap;
    }, [shownHeatmap]);


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
        setHarvestHeatmap(null);
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

    const syncFieldDetailTabUrl = useCallback((tab: string, section: ParcelAnalysisSection) => {
        const url = new URL(window.location.href);
        applyFieldDetailTabParams(url.searchParams, tab, section);
        const next = `${url.pathname}${url.search}${url.hash}`;
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (next !== current) window.history.replaceState(null, "", next);
    }, []);

    const handleActiveTabChange = useCallback((nextRaw: string) => {
        const next = resolveFieldDetailTab(nextRaw);
        setActiveTab(next);
        if (next === "parcel-analysis") {
            setParcelAnalysisVisited(true);
            if (nextRaw === "land-report" || nextRaw === "season-growth" || nextRaw === "harvest") {
                setParcelSection(nextRaw);
                syncFieldDetailTabUrl(next, nextRaw);
                return;
            }
        }
        syncFieldDetailTabUrl(next, parcelSection);
    }, [parcelSection, syncFieldDetailTabUrl]);

    const handleParcelSectionFocus = useCallback((section: ParcelAnalysisSection) => {
        setParcelSection(section);
        syncFieldDetailTabUrl("parcel-analysis", section);
    }, [syncFieldDetailTabUrl]);

    const switchToLand = useCallback((nextLandId: string) => {
        if (!nextLandId || nextLandId === landId) return;
        const nextLand = projectLands.find((item) => item.land_id === nextLandId);
        const nextFarmId = nextLand?.farm_id || land?.farm_id || farmId;
        const nextGroupId = nextLand?.group_id || land?.group_id || groupId;
        const params = new URLSearchParams({ fieldId: nextLandId });
        if (nextFarmId) params.set("farmId", nextFarmId);
        if (nextGroupId) params.set("groupId", nextGroupId);
        const current = new URL(window.location.href);
        const currentTab = current.searchParams.get("tab");
        const currentSection = current.searchParams.get("section");
        if (currentTab) params.set("tab", currentTab);
        if (currentSection) params.set("section", currentSection);

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
                    // 色斑数据本身按 WGS84 生成，仅在高德道路底图上转换四角。
                    coordinates: clippedImg.coordinates.map(([longitude, latitude]) =>
                        usesGcj02Coordinates(mapStyleRef.current)
                            ? wgs84ToGcj02(longitude, latitude)
                            : [longitude, latitude],
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
            mapStyleRef.current,
        );
        const selectedProjectFeatures = projectLandFeatureCollection(
            pendingProjectLand ? [pendingProjectLand] : [],
            f?.land_id || "",
            Boolean(pendingProjectLand),
            mapStyleRef.current,
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
        const displayFieldGeometry = usesGcj02Coordinates(mapStyleRef.current)
            ? wgs84GeometryToGcj02(f.boundary_geojson)
            : f.boundary_geojson;
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
        const displayGeometry = usesGcj02Coordinates(mapStyleRef.current)
            ? wgs84GeometryToGcj02(land.boundary_geojson)
            : land.boundary_geojson;
        if (!displayGeometry) return;
        getAllCoords(displayGeometry).forEach(([lng, lat]) => bounds.extend([lng, lat]));
        if (bounds.isEmpty()) return;
        const width = map.getContainer().clientWidth;
        const height = map.getContainer().clientHeight;
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        const stageHeight = stageRef.current?.clientHeight ?? height;
        const snap = sheetSnapRef.current;
        const sheetTop = !mobile
            ? 0
            : snap === "peek"
                ? stageHeight - SHEET_PEEK_PX
                : snap === "full"
                    ? SHEET_FULL_TOP_PX
                    : Math.round(stageHeight * 0.42);
        const covered = mobile ? Math.max(16, height - sheetTop) : 0;
        map.fitBounds(bounds, {
            padding: {
                top: mobile ? 16 : 80,
                bottom: mobile ? covered + 12 : 48,
                left: mobile ? 48 : 56,
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
            const displayGeometry = usesGcj02Coordinates(mapStyleRef.current)
                ? wgs84GeometryToGcj02(item.boundary_geojson)
                : item.boundary_geojson;
            if (!displayGeometry) return;
            getAllCoords(displayGeometry).forEach(([lng, lat]) => {
                bounds.extend([lng, lat]);
                hasCoordinates = true;
            });
        });
        if (!hasCoordinates) return;

        const width = map.getContainer().clientWidth;
        const height = map.getContainer().clientHeight;
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        const stageHeight = stageRef.current?.clientHeight ?? height;
        const snap = sheetSnapRef.current;
        const sheetTop = !mobile
            ? 0
            : snap === "peek"
                ? stageHeight - SHEET_PEEK_PX
                : snap === "full"
                    ? SHEET_FULL_TOP_PX
                    : Math.round(stageHeight * 0.42);
        const covered = mobile ? Math.max(16, height - sheetTop) : 0;
        map.fitBounds(bounds, {
            padding: {
                top: mobile ? 16 : 80,
                bottom: mobile ? covered + 12 : 48,
                left: mobile ? 48 : 56,
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
    }, [land, mapInstance, setupMapLayers, fitFieldInView, sheetSnap]);

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

            mapStyleRef.current = styleId;
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
        if (!map) return;
        const syncHeatmap = () => {
            try {
                clearAgriHeatmapLayers(map);
            } catch { /* ignore */ }

            // 显示色斑时隐藏纯绿色填充，保留地块边界和稀疏像元的可见性。
            try {
                if (map.getLayer("field-fill")) {
                    map.setPaintProperty("field-fill", "fill-opacity", shownHeatmap ? 0 : 0.2);
                }
            } catch { /* ignore */ }

            if (!shownHeatmap) return;

            const landGeom = landRef.current?.boundary_geojson as
                | GeoJSON.Polygon
                | GeoJSON.MultiPolygon
                | undefined;
            const beforeId = map.getLayer("field-outline") ? "field-outline" : undefined;
            applyAgriHeatmapToMap(map, shownHeatmap, landGeom, beforeId);
        };

        // getStyle 在样式就绪后即有值；isStyleLoaded 还等待底图瓦片，会漏掉首次已准备好的色膜。
        // 切换底图期间自动等样式就绪后补绘，不能依赖用户再切换一次日期来触发 effect。
        if (map.getStyle()) syncHeatmap();
        else map.once("style.load", syncHeatmap);

        return () => {
            // 日期、地块或显隐状态变化后取消旧回调，避免新样式加载时覆盖成旧日期的色膜。
            map.off("style.load", syncHeatmap);
            try {
                clearAgriHeatmapLayers(map);
                if (map.getLayer("field-fill")) {
                    map.setPaintProperty("field-fill", "fill-opacity", 0.2);
                }
            } catch { /* ignore */ }
        };
    }, [shownHeatmap, mapInstance, land, applyAgriHeatmapToMap, clearAgriHeatmapLayers]);

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

    useEffect(() => () => {
        locateMarkerRef.current?.remove();
        sheetSettleCleanupRef.current?.();
    }, []);

    const clearMapToolsStyle = () => {
        const tools = mapToolsRef.current;
        if (!tools) return;
        tools.style.transition = "";
        tools.style.top = "";
        tools.style.opacity = "";
        tools.style.pointerEvents = "";
    };

    const placeMapTools = (sheetTop: number, transition: string) => {
        const tools = mapToolsRef.current;
        if (!tools || window.matchMedia("(min-width: 768px)").matches) return;
        const next = sheetTop - (tools.offsetHeight || 96) - 12;
        tools.style.transition = transition;
        if (next < 12) {
            tools.style.top = "12px";
            tools.style.opacity = "0";
            tools.style.pointerEvents = "none";
            return;
        }
        tools.style.top = `${next}px`;
        tools.style.opacity = "1";
        tools.style.pointerEvents = "";
    };

    useLayoutEffect(() => {
        if (!sheetStyleLockRef.current) return;
        sheetStyleLockRef.current = false;
        const sheet = sheetRef.current;
        if (!sheet) return;
        delete sheet.dataset.dragging;
        sheet.style.transition = "";
        sheet.style.top = "";
        clearMapToolsStyle();
    }, [sheetSnap]);

    const locateMe = () => {
        if (!mapInstance || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((position) => {
            const raw: [number, number] = [position.coords.longitude, position.coords.latitude];
            const center = usesGcj02Coordinates(mapStyleRef.current)
                ? wgs84ToGcj02(raw[0], raw[1])
                : raw;
            mapInstance.flyTo({ center, zoom: Math.max(mapInstance.getZoom(), 15) });
            locateMarkerRef.current?.remove();
            locateMarkerRef.current = new maplibregl.Marker({ color: "#16a34a" })
                .setLngLat(center)
                .addTo(mapInstance);
        });
    };

    const snapSheet = (top: number, height: number) => {
        const stops = [
            { snap: "full" as const, top: SHEET_FULL_TOP_PX },
            { snap: "half" as const, top: height * 0.42 },
            { snap: "peek" as const, top: height - SHEET_PEEK_PX },
        ];
        return stops.reduce((best, item) => (
            Math.abs(item.top - top) < Math.abs(best.top - top) ? item : best
        )).snap;
    };

    const readSheetTop = () => {
        const stage = stageRef.current;
        const sheet = sheetRef.current;
        if (!stage || !sheet) return null;
        return sheet.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    };

    const settleSheet = (snap: "peek" | "half" | "full") => {
        const sheet = sheetRef.current;
        const stage = stageRef.current;
        if (!sheet || !stage) {
            setSheetSnap(snap);
            return;
        }
        const generation = ++sheetDragGeneration.current;
        const height = stage.clientHeight;
        const target = snap === "full"
            ? SHEET_FULL_TOP_PX
            : snap === "half"
                ? height * 0.42
                : height - SHEET_PEEK_PX;
        const sheetTransition = "top 280ms cubic-bezier(0.22, 1, 0.36, 1)";
        sheet.dataset.dragging = "true";
        sheet.style.transition = sheetTransition;
        sheet.style.top = `${target}px`;
        placeMapTools(target, sheetTransition);
        let settled = false;
        const finish = () => {
            sheet.removeEventListener("transitionend", onEnd);
            if (sheetSettleTimerRef.current != null) {
                window.clearTimeout(sheetSettleTimerRef.current);
                sheetSettleTimerRef.current = null;
            }
            if (sheetSettleCleanupRef.current === cleanup) sheetSettleCleanupRef.current = null;
            if (settled || generation !== sheetDragGeneration.current) return;
            settled = true;
            if (sheetSnapRef.current === snap) {
                delete sheet.dataset.dragging;
                sheet.style.transition = "";
                sheet.style.top = "";
                clearMapToolsStyle();
                return;
            }
            // 等档位 class 写进 DOM 后再清掉内联 top，避免松手时闪回旧位置。
            sheetStyleLockRef.current = true;
            setSheetSnap(snap);
        };
        const onEnd = (event: TransitionEvent) => {
            if (event.propertyName !== "top") return;
            finish();
        };
        const cleanup = () => {
            sheet.removeEventListener("transitionend", onEnd);
            if (sheetSettleTimerRef.current != null) {
                window.clearTimeout(sheetSettleTimerRef.current);
                sheetSettleTimerRef.current = null;
            }
        };
        sheetSettleCleanupRef.current = cleanup;
        sheet.addEventListener("transitionend", onEnd);
        sheetSettleTimerRef.current = window.setTimeout(finish, 340);
    };

    const beginSheetDrag = (
        event: React.PointerEvent<HTMLElement>,
        origin: "handle" | "bar",
        active: boolean,
    ) => {
        if (window.matchMedia("(min-width: 768px)").matches) return;
        const startTop = readSheetTop();
        const sheet = sheetRef.current;
        if (startTop == null || !sheet) return;
        sheetSettleCleanupRef.current?.();
        sheetSettleCleanupRef.current = null;
        sheetDragGeneration.current += 1;
        const now = performance.now();
        sheetDragRef.current = {
            pointerId: event.pointerId,
            origin,
            startX: event.clientX,
            startY: event.clientY,
            startTop,
            lastY: event.clientY,
            lastT: now,
            velocity: 0,
            moved: false,
            active,
        };
        if (!active) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        sheet.dataset.dragging = "true";
        sheet.style.transition = "none";
        sheet.style.top = `${startTop}px`;
        placeMapTools(startTop, "none");
    };

    const onSheetPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        beginSheetDrag(event, "handle", true);
    };

    const onSheetBarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        beginSheetDrag(event, "bar", false);
    };

    const onSheetPointerMove = (event: React.PointerEvent<HTMLElement>) => {
        const drag = sheetDragRef.current;
        const stage = stageRef.current;
        const sheet = sheetRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !stage || !sheet) return;
        const dy = event.clientY - drag.startY;
        const dx = event.clientX - drag.startX;
        const now = performance.now();
        drag.velocity = (event.clientY - drag.lastY) / Math.max(8, now - drag.lastT);
        drag.lastY = event.clientY;
        drag.lastT = now;
        if (!drag.active) {
            if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
            if (Math.abs(dx) > Math.abs(dy)) {
                sheetDragRef.current = null;
                return;
            }
            drag.active = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            sheet.dataset.dragging = "true";
            sheet.style.transition = "none";
        }
        if (Math.abs(dy) > 6) drag.moved = true;
        const next = Math.min(
            stage.clientHeight - SHEET_PEEK_PX,
            Math.max(SHEET_FULL_TOP_PX, drag.startTop + dy),
        );
        sheet.style.top = `${next}px`;
        placeMapTools(next, "none");
    };

    const finishSheetDrag = (event: React.PointerEvent<HTMLElement>) => {
        const drag = sheetDragRef.current;
        const stage = stageRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !stage) return;
        sheetDragRef.current = null;
        if (!drag.active) return;
        const dy = event.clientY - drag.startY;
        const top = Math.min(
            stage.clientHeight - SHEET_PEEK_PX,
            Math.max(SHEET_FULL_TOP_PX, drag.startTop + dy),
        );
        if (drag.origin === "bar" && drag.moved) sheetSuppressClickRef.current = true;
        if (!drag.moved) {
            if (drag.origin === "handle") {
                const current = sheetSnapRef.current;
                settleSheet(current === "peek" ? "half" : current === "half" ? "full" : "half");
            }
            return;
        }
        const order = ["peek", "half", "full"] as const;
        const index = order.indexOf(sheetSnapRef.current);
        const snap = drag.velocity <= -SHEET_FLICK_PX_PER_MS
            ? order[Math.min(order.length - 1, index + 1)]
            : drag.velocity >= SHEET_FLICK_PX_PER_MS
                ? order[Math.max(0, index - 1)]
                : snapSheet(top, stage.clientHeight);
        settleSheet(snap);
    };

    const onSheetBarClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!sheetSuppressClickRef.current) return;
        sheetSuppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
    };

    // 内容区的下拉在滚到顶之后继续带动整层抽屉，上拉则先把抽屉展开再滚内容。
    useEffect(() => {
        const root = sheetScrollRef.current;
        if (!root) return;
        return bindSheetGesture({
            root,
            enabled: () => window.matchMedia("(max-width: 767px)").matches,
            readOffset: () => readSheetTop() ?? 0,
            minOffset: () => SHEET_FULL_TOP_PX,
            maxOffset: () => (stageRef.current?.clientHeight ?? window.innerHeight) - SHEET_PEEK_PX,
            applyOffset: (offset) => {
                const sheet = sheetRef.current;
                if (!sheet) return;
                sheet.dataset.dragging = "true";
                sheet.style.transition = "none";
                sheet.style.top = `${offset}px`;
                placeMapTools(offset, "none");
            },
            onGestureStart: () => {
                sheetSettleCleanupRef.current?.();
                sheetSettleCleanupRef.current = null;
                sheetDragGeneration.current += 1;
            },
            onSettle: ({ offset, velocity, moved, contentScrolled }) => {
                const sheet = sheetRef.current;
                const stage = stageRef.current;
                if (!moved || !stage) {
                    if (sheet?.dataset.dragging === "true") {
                        delete sheet.dataset.dragging;
                        sheet.style.transition = "";
                        sheet.style.top = "";
                        clearMapToolsStyle();
                    }
                    return;
                }
                const top = Math.min(
                    stage.clientHeight - SHEET_PEEK_PX,
                    Math.max(SHEET_FULL_TOP_PX, offset),
                );
                if (contentScrolled && top <= SHEET_FULL_TOP_PX + 24) {
                    settleSheet("full");
                    return;
                }
                const order = ["peek", "half", "full"] as const;
                const index = order.indexOf(sheetSnapRef.current);
                const snap = velocity <= -SHEET_FLICK_PX_PER_MS
                    ? order[Math.min(order.length - 1, index + 1)]
                    : velocity >= SHEET_FLICK_PX_PER_MS
                        ? order[Math.max(0, index - 1)]
                        : snapSheet(top, stage.clientHeight);
                settleSheet(snap);
            },
        });
        // 抽屉节点随地块一起挂上；手势内部只读 ref，不跟随每次渲染重绑。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [land?.land_id]);

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

    const landAreaMu = resolveLandAreaMu(land.land_area_mu, land.area_ha);
    const oversizedLand = isOversizedLand(landAreaMu);

    const mapToolButton = "field-map-tool";

    return (
        <div
            ref={stageRef}
            data-sheet={sheetSnap}
            className="field-page relative h-full w-full overflow-hidden"
            style={{ "--panel-w": `${panelWidthPx}px` } as React.CSSProperties}
        >
            {/* Full-screen map */}
            <div className="field-stage absolute inset-0" data-sheet={sheetSnap}>
                {editing ? (
                    <DrawMap
                        initialGeometry={land.boundary_geojson}
                        onGeometryChange={(g) => setEditGeom(g)}
                        onMapReady={(m) => setMapInstance(m)}
                        onBasemapFallback={setMapStyle}
                        basemapStyle={mapStyle}
                    />
                ) : (
                    <BaseMap
                        onMapReady={handleMapReady}
                        onBasemapFallback={setMapStyle}
                        basemapStyle={mapStyle}
                    />
                )}
            </div>

            <div
                ref={mapToolsRef}
                className={cn(
                    "field-map-tools absolute right-3 z-30 flex w-11 flex-col gap-2 transition-[top,opacity] duration-300 ease-out md:hidden",
                    sheetSnap === "full" && "pointer-events-none opacity-0",
                )}
            >
                <MapStyleSwitcher iconOnly currentStyle={mapStyle} onStyleChange={handleStyleChange} />
                <button type="button" className={mapToolButton} aria-label={t("locateMe")} onClick={locateMe}>
                    <Crosshair className="h-5 w-5" />
                </button>
            </div>

            {/* Top-left: Back + Style Switcher + project land search */}
            <div className="absolute z-20 hidden flex-col items-start gap-2 md:left-4 md:top-4 md:flex">
                <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:flex-row md:items-center">
                    <Link
                        href={backHref as "/farms"}
                        className={cn("hidden h-10 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-3 md:inline-flex", MAP_CHROME)}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {t("backToFarm")}
                    </Link>
                    <MapStyleSwitcher className="hidden md:block" currentStyle={mapStyle} onStyleChange={handleStyleChange} />
                    <div
                        className="relative"
                        onBlur={(event) => {
                            const nextFocused = event.relatedTarget as Node | null;
                            if (!nextFocused || !event.currentTarget.contains(nextFocused)) {
                                setProjectLandListOpen(false);
                            }
                        }}
                    >
                        <div className={cn("relative flex h-10 w-full items-center rounded-lg md:w-72", MAP_CHROME)}>
                            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>

                        {projectLandListOpen && projectLandsLoading && (
                            <div className={cn("absolute left-0 top-[calc(100%+0.5rem)] z-30 rounded-xl px-3 py-2 text-xs text-muted-foreground", MAP_CHROME)}>
                                {t("projectLandsLoading")}
                            </div>
                        )}

                        {projectLandListOpen && !projectLandsLoading && projectLands.length > 0 && (
                            <div className={cn("absolute left-0 top-[calc(100%+0.5rem)] z-30 w-full rounded-xl p-2 md:w-72", MAP_CHROME)}>
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
                                                    "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [content-visibility:auto] [contain-intrinsic-size:2.5rem]",
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
                        <Layers className="h-4 w-4" aria-hidden="true" />
                        <span>{t(showAllProjectLands ? "showSelectedProjectLand" : "showAllProjectLands")}</span>
                    </Button>
                </div>

            </div>

            {pendingProjectLand && (
                <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 md:top-20">
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

            {/* 手机端卫星图固定在地图左上角，不跟抽屉走。 */}
            {shownHeatmap && (
                <div
                    className={cn(
                        "absolute left-3 top-3 z-30 md:hidden",
                        sheetSnap === "full" && "pointer-events-none opacity-0",
                    )}
                >
                    <AgriHeatmapLegend heatmap={shownHeatmap} variant="thumb" />
                </div>
            )}

            {/* Index / agri 色斑 Legend - desktop bottom-left */}
            {(shownHeatmap || indexLayer) && (
                <div className="absolute bottom-6 left-4 z-20 hidden transition-opacity duration-200 md:block">
                    {shownHeatmap ? (
                        <AgriHeatmapLegend heatmap={shownHeatmap} variant="legend" />
                    ) : indexLayer ? (
                        <div className="hidden md:block">
                            <NdviLegend layer={indexLayer} indexType={activeIndexType} />
                        </div>
                    ) : null}
                </div>
            )}

            {/* Bottom-centre stack: index selector above, provenance below.
                One container so the two can never overlap, and both stay
                centred on the visible map rather than on the viewport. */}
            <div
                className={cn(
                    "field-index-stack absolute z-20 hidden max-w-[calc(100%-5rem)] flex-col items-center gap-2 md:bottom-6 md:flex",
                    sheetSnap === "half" && "max-md:bottom-[calc(58%+12px)]",
                    sheetSnap === "peek" && "max-md:bottom-16",
                    sheetSnap === "full" && "max-md:hidden",
                )}
                style={{
                    "--index-left": sidebarOpen ? "calc(50% - var(--panel-w) / 2)" : "50%",
                } as React.CSSProperties}
            >
                {activeTab === "ndvi" && (
                    <div data-tour="heatmap-modes" className={cn("flex max-w-full flex-wrap justify-center gap-1 rounded-lg p-1", MAP_CHROME)}>
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
                    <div className={cn("flex max-w-full flex-wrap justify-center gap-1 rounded-lg p-1", MAP_CHROME)}>
                        {availableTypes.filter((idx) => idx !== "EVI").map((idx) => (
                            <Button
                                key={idx}
                                variant={idx === activeIndexType ? "default" : "ghost"}
                                size="sm"
                                onClick={() => { if (idx === activeIndexType) return; setIndexLayer(null); setActiveIndexType(idx); }}
                                className="px-3 text-xs font-medium"
                            >
                                {getIndexDisplayLabel(idx)}
                            </Button>
                        ))}
                        {availableTypes.includes("EVI") && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant={activeIndexType === "EVI" ? "secondary" : "ghost"}
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        title={agriPanelT("moreIndices")}
                                        aria-label={agriPanelT("moreIndices")}
                                    >
                                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[8rem]">
                                    <DropdownMenuItem
                                        onSelect={() => {
                                            setIndexLayer(null);
                                            setActiveIndexType("EVI");
                                        }}
                                        className="gap-2 text-xs"
                                    >
                                        <span className="flex-1">{INDEX_CONFIG.EVI.label}</span>
                                        {activeIndexType === "EVI" ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                )}

                {/* Satellite, date, cloud cover and colormap in one mono
                    line: the reproducibility claim, made visible where the
                    user is actually looking. */}
                {shownHeatmap && (
                    <div
                        className="max-w-full rounded-lg border border-border px-3.5 py-2"
                        style={{ background: "hsl(var(--map-scrim) / 0.82)" }}
                    >
                        <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                            <Satellite className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {[
                                shownHeatmap.index === "flood" ? "Sentinel-1" : "Sentinel-2",
                                AGRI_MODE_LABELS[shownHeatmap.index],
                                shownHeatmap.mean != null ? `均≈${shownHeatmap.mean.toFixed(2)}` : null,
                                `${shownHeatmap.pixelCount} px`,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                )}

                {!shownHeatmap && indexLayer && (
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
                className={cn("absolute top-4 right-4 z-20 hidden rounded-xl p-2.5 transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:right-[var(--toggle-right)] md:block", MAP_CHROME)}
                style={{ "--toggle-right": sidebarOpen ? "calc(var(--panel-w) + 2rem)" : "1rem" } as React.CSSProperties}
                aria-label={t(sidebarOpen ? "hidePanel" : "showPanel")}
                aria-expanded={sidebarOpen}
                aria-controls="field-detail-analysis-panel"
                title={t(sidebarOpen ? "hidePanel" : "showPanel")}
            >
                {sidebarOpen ? (
                    <PanelRightClose className="h-4 w-4 text-foreground" aria-hidden="true" />
                ) : (
                    <PanelRight className="h-4 w-4 text-foreground" aria-hidden="true" />
                )}
            </button>

            {/* Floating tabbed sidebar - right */}
            <div
                id="field-detail-analysis-panel"
                ref={sheetRef}
                inert={!sidebarOpen ? true : undefined}
                className={cn(
                    "field-sheet absolute z-20 flex flex-col overflow-hidden bg-background",
                    "max-md:inset-x-0 max-md:bottom-0 max-md:w-full max-md:rounded-t-[20px] max-md:shadow-[0_-8px_24px_rgba(0,0,0,0.18)]",
                    sheetSnap === "half" && "max-md:top-[42%]",
                    sheetSnap === "full" && "max-md:top-0",
                    sheetSnap === "peek" && "max-md:top-auto max-md:h-11",
                    "md:bottom-4 md:right-4 md:top-4 md:h-auto md:w-[var(--panel-w)] md:max-w-[calc(100%-2rem)]",
                    !isResizingPanel && "transition-[top,height,transform] duration-300 ease-out",
                    !sidebarOpen && "md:translate-x-[calc(100%+1rem)]",
                )}
            >
                <button
                    type="button"
                    className="flex h-11 w-full shrink-0 touch-none items-center justify-center md:hidden"
                    aria-label={t("sheetHandle")}
                    onPointerDown={onSheetPointerDown}
                    onPointerMove={onSheetPointerMove}
                    onPointerUp={finishSheetDrag}
                    onPointerCancel={finishSheetDrag}
                >
                    <span className="h-1 w-8 rounded-full bg-muted-foreground/50" />
                </button>
                {/* Left-edge drag handle — always-visible short gray grip (centered) */}
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t("resizePanel")}
                    aria-valuemin={PANEL_WIDTH_MIN_PX}
                    aria-valuemax={panelWidthMaxPx}
                    aria-valuenow={panelWidthPx}
                    aria-controls="field-detail-analysis-panel"
                    aria-describedby="field-detail-panel-resize-hint"
                    tabIndex={0}
                    title={t("resizePanelHint")}
                    onPointerDown={handlePanelResizeStart}
                    onKeyDown={handlePanelResizeKeyDown}
                    onDoubleClick={handlePanelResizeReset}
                    className="group/resize absolute bottom-0 left-0 top-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:flex"
                >
                    <div
                        className={cn(
                            "pointer-events-none h-14 w-1 rounded-full bg-muted-foreground/50 shadow-sm",
                            "transition-colors group-hover/resize:bg-muted-foreground/75",
                            isResizingPanel && "bg-muted-foreground/85",
                        )}
                    />
                </div>
                <span id="field-detail-panel-resize-hint" className="sr-only">
                    {t("resizePanelHint")}
                </span>
                <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden md:rounded-xl", MAP_CHROME)}>
                    <Tabs defaultValue={FIELD_DETAIL_DEFAULT_TAB} value={activeTab} onValueChange={handleActiveTabChange} className="flex flex-col flex-1 overflow-hidden">
                        {/* 页签保持紧凑单行，窄侧栏允许横向滚动，不挤占内容高度。 */}
                        <div
                            className="flex min-w-0 shrink-0 touch-pan-x items-center border-b bg-background/95 md:touch-auto"
                            onPointerDown={onSheetBarPointerDown}
                            onPointerMove={onSheetPointerMove}
                            onPointerUpCapture={(event) => {
                                const drag = sheetDragRef.current;
                                const moved = Boolean(
                                    drag &&
                                    drag.pointerId === event.pointerId &&
                                    drag.origin === "bar" &&
                                    drag.moved,
                                );
                                finishSheetDrag(event);
                                if (!moved) return;
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                            onPointerCancel={finishSheetDrag}
                            onClickCapture={onSheetBarClickCapture}
                        >
                            <TabsList variant="underline" className="h-11 min-w-0 !w-auto flex-1 flex-nowrap items-end gap-1 overflow-x-auto !border-b-0 px-2 [scrollbar-width:none]">
                            <TabsTrigger
                                value="ndvi"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 py-0 text-sm text-muted-foreground data-[state=active]:text-primary"
                                data-tour="tab-ndvi"
                            >
                                {t("tabNdvi")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="weather"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 py-0 text-sm text-muted-foreground data-[state=active]:text-primary"
                                data-tour="tab-weather"
                            >
                                {t("tabWeather")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="soil"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 py-0 text-sm text-muted-foreground data-[state=active]:text-primary"
                            >
                                {t("tabSoil")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="alerts"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 py-0 text-sm text-muted-foreground data-[state=active]:text-primary"
                            >
                                <span className="relative">
                                    {t("tabAlerts")}
                                    {openAlertCount > 0 && (
                                        <span className="absolute -top-1 -right-2 h-2 w-2 rounded-full bg-destructive" />
                                    )}
                                </span>
                            </TabsTrigger>
                            <TabsTrigger value="biweekly" variant="underline" className="h-11 shrink-0 px-2.5 py-0 text-sm text-muted-foreground data-[state=active]:text-primary">
                                {t("tabBiweekly")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="parcel-analysis"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 py-0 text-sm text-muted-foreground data-[state=active]:text-primary"
                                data-tour="tab-report"
                            >
                                {t("tabParcelAnalysis")}
                            </TabsTrigger>
                            </TabsList>
                            {/* 编辑收纳到页签栏右上角，避免操作按钮挤占报告内容区域。 */}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="mr-2 hidden h-7 w-7 shrink-0 md:inline-flex"
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

                        {oversizedLand && (
                            <div
                                role="alert"
                                className="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-xs text-warning"
                            >
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>
                                    {t("oversizedLandWarning", {
                                        area: formatLandAreaMu(landAreaMu),
                                    })}
                                </span>
                            </div>
                        )}

                        <div
                            ref={sheetScrollRef}
                            className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable] max-md:overscroll-y-none"
                        >
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
                                    {/* 默认打开长势分析；选地条件、生育期长势和收获放在「选地报告」。 */}
                                    <TabsContent
                                        value="ndvi"
                                        forceMount
                                        className="mt-0 p-3 data-[state=inactive]:hidden data-[state=inactive]:!hidden"
                                    >
                                        <NdviTab
                                            landId={landId}
                                            cropType={land.crop_type}
                                            areaHa={land.area_ha}
                                            landAreaMu={land.land_area_mu}
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
                                        <WeatherTab landId={landId} landAreaMu={land.land_area_mu} areaHa={land.area_ha} />
                                    </TabsContent>

                                    <TabsContent value="soil" className="mt-0 p-3">
                                        <SoilTab landId={landId} landAreaMu={land.land_area_mu} areaHa={land.area_ha} groupId={land.group_id} mapInstance={mapInstance} activeTab={activeTab} />
                                    </TabsContent>

                                    {(activeTab === "parcel-analysis" || parcelAnalysisVisited) && (
                                    <TabsContent
                                        value="parcel-analysis"
                                        forceMount
                                        className="mt-0 data-[state=inactive]:hidden data-[state=inactive]:!hidden"
                                    >
                                        <ParcelAnalysisTab
                                            key={landId}
                                            landId={landId}
                                            groupId={land.group_id}
                                            cropType={land.crop_type}
                                            fieldGeom={
                                                land.boundary_geojson as
                                                    | GeoJSON.Polygon
                                                    | GeoJSON.MultiPolygon
                                                    | undefined
                                            }
                                            focusSection={parcelSection}
                                            onCropBound={(key) => {
                                                setLand((prev) => (prev ? { ...prev, crop_type: key } : prev));
                                            }}
                                            onMapOverlayChange={setHarvestHeatmap}
                                            onHarvestSectionOpenChange={setHarvestSectionOpen}
                                            onSectionFocusChange={handleParcelSectionFocus}
                                        />
                                    </TabsContent>
                                    )}

                                    <TabsContent value="biweekly" className="mt-0 min-w-0 p-0">
                                        <BiweeklyTab landId={landId} cropType={land.crop_type} />
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
