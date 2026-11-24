"use client";

import React, { Suspense, useEffect, useState, useCallback, useRef } from "react";
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
import { formatAreaMu } from "@/lib/area";
import { toast } from "sonner";
import {
    ArrowLeft,
    Crosshair,
    Edit2,
    Loader2,
    Minus,
    PanelRight,
    PanelRightClose,
    Plus,
    Satellite,
    Save,
    Trash2,
    X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/confirm-dialog";
import { useTranslations } from "next-intl";
import { MAP_STYLES, type MapStyleId } from "@/lib/pmtiles";
import { tokenColor, MAP_CHROME } from "@/lib/design-tokens";
import { Skeleton } from "@/components/ui/skeleton";

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

const LocationSearch = dynamic(() => import("@/components/map/location-search"), {
    ssr: false,
});

const MapStyleSwitcher = dynamic(() => import("@/components/map/map-style-switcher"), {
    ssr: false,
});

/** Satellite codes as stored by the pipeline, expanded for the reader. */
const SATELLITE_LABELS: Record<string, string> = { S2: "Sentinel-2 L2A" };

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

type SheetSnap = "peek" | "half" | "full";

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
    const confirm = useConfirm();
    const searchParams = useSearchParams();
    const router = useRouter();
    const farmId = searchParams.get("farmId") || "";
    const landId = searchParams.get("fieldId") || "";

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
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [activeTab, setActiveTab] = useState("info");
    const [sheetSnap, setSheetSnap] = useState<SheetSnap>("half");
    const [dragTop, setDragTop] = useState<number | null>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const tabsListRef = useRef<HTMLDivElement>(null);
    const locateMarkerRef = useRef<maplibregl.Marker | null>(null);
    const sheetSnapRef = useRef<SheetSnap>("half");
    const dragRef = useRef<{
        pointerId: number;
        startY: number;
        startTop: number;
        moved: boolean;
        latestTop: number;
    } | null>(null);
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
    const agriHeatmapRef = useRef<AgriHeatmapImage | null>(null);
    /** blob: URL currently fed to MapLibre ImageSource — revoke on clear/replace. */
    const agriHeatmapBlobUrlRef = useRef<string | null>(null);
    /** Bump to cancel in-flight canvas.toBlob apply. */
    const agriHeatmapApplyGenRef = useRef(0);

    // Available index types (only indices with computed layers)
    const [availableTypes, setAvailableTypes] = useState<IndexType[]>([]);

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

    useEffect(() => {
        sheetSnapRef.current = sheetSnap;
    }, [sheetSnap]);

    useEffect(() => {
        const active = tabsListRef.current?.querySelector<HTMLElement>('[data-state="active"]');
        active?.scrollIntoView({ inline: "nearest", block: "nearest" });
    }, [activeTab]);

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
        agriHeatmapRef.current = agriHeatmap;
    }, [agriHeatmap]);


    const loadField = useCallback(async () => {
        if (!farmId || !landId) {
            toast.error(t("fieldNotFound"));
            router.push("/farms");
            return;
        }

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
            router.push(`/farms/detail?farmId=${encodeURIComponent(farmId)}`);
        } finally {
            setLoading(false);
        }
    }, [landId, farmId, router, t]);

    useEffect(() => {
        loadField();
    }, [loadField]);

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
                    coordinates: clippedImg.coordinates,
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
        if (!f?.boundary_geojson) return;

        const hm = agriHeatmapRef.current;
        // Remove existing layers/source first to avoid stale state / wrong z-order
        try {
            clearAgriHeatmapLayers(map);
        } catch { /* ignore */ }
        if (map.getLayer("field-outline")) map.removeLayer("field-outline");
        if (map.getLayer("field-fill")) map.removeLayer("field-fill");
        if (map.getSource("field-polygon")) map.removeSource("field-polygon");

        map.addSource("field-polygon", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: f.boundary_geojson },
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
    }, [applyAgriHeatmapToMap, clearAgriHeatmapLayers]);

    // 地块应位于可见地图中，右侧分析面板占用的区域不参与居中计算。
    const fitFieldInView = useCallback((map: maplibregl.Map) => {
        if (!land?.boundary_geojson) return;
        const bounds = new maplibregl.LngLatBounds();
        getAllCoords(land.boundary_geojson).forEach(([lng, lat]) => bounds.extend([lng, lat]));
        if (bounds.isEmpty()) return;
        const width = map.getContainer().clientWidth;
        const height = map.getContainer().clientHeight;
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        const snap = sheetSnapRef.current;
        const stageH = stageRef.current?.clientHeight ?? height;
        const mapTop = mobile ? 48 : 0;
        const sheetTopPx = !mobile
            ? 0
            : snap === "peek"
              ? stageH - 32
              : snap === "full"
                ? 48
                : Math.round(stageH * 0.42);
        const coveredBySheet = mobile ? Math.max(24, mapTop + height - sheetTopPx) : 48;
        map.fitBounds(bounds, {
            padding: {
                top: mobile ? 24 : 72,
                bottom: coveredBySheet + 12,
                left: 56,
                right: !mobile && sidebarOpen ? Math.min(panelWidthPx + 32, Math.round(width * 0.65)) : 48,
            },
            maxZoom: 17,
            duration: 0,
        });
    }, [land, sidebarOpen, panelWidthPx]);

    useEffect(() => {
        if (!mapInstance || !land?.boundary_geojson) return;
        if (!mapInstance.isStyleLoaded()) return;
        fitFieldInView(mapInstance);
    }, [sheetSnap, fitFieldInView, mapInstance, land]);

    const handleLocate = useCallback(() => {
        const map = mapInstance;
        if (!map || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((pos) => {
            const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];
            map.flyTo({ center: lngLat, zoom: 17, duration: 800 });
            if (locateMarkerRef.current) {
                locateMarkerRef.current.setLngLat(lngLat);
            } else {
                locateMarkerRef.current = new maplibregl.Marker({ color: tokenColor("--primary") })
                    .setLngLat(lngLat)
                    .addTo(map);
            }
        });
    }, [mapInstance]);

    const onSheetPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!window.matchMedia("(max-width: 767px)").matches) return;
        const stage = stageRef.current;
        const sheet = sheetRef.current;
        if (!stage || !sheet) return;
        const startTop = sheet.getBoundingClientRect().top - stage.getBoundingClientRect().top;
        dragRef.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startTop,
            moved: false,
            latestTop: startTop,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onSheetPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const stage = stageRef.current;
        if (!drag || !stage || event.pointerId !== drag.pointerId) return;
        const dy = event.clientY - drag.startY;
        if (Math.abs(dy) > 4) drag.moved = true;
        const next = Math.min(stage.clientHeight - 32, Math.max(48, drag.startTop + dy));
        drag.latestTop = next;
        setDragTop(next);
    };

    const onSheetPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || event.pointerId !== drag.pointerId) return;
        dragRef.current = null;
        const stage = stageRef.current;
        if (!stage) {
            setDragTop(null);
            return;
        }
        if (!drag.moved) {
            setSheetSnap((prev) => (prev === "half" ? "full" : "half"));
            setDragTop(null);
            return;
        }
        const height = stage.clientHeight;
        const points: [SheetSnap, number][] = [
            ["full", 48],
            ["half", Math.round(height * 0.42)],
            ["peek", height - 32],
        ];
        points.sort((a, b) => Math.abs(a[1] - drag.latestTop) - Math.abs(b[1] - drag.latestTop));
        setSheetSnap(points[0][0]);
        setDragTop(null);
    };

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

    // Location search
    const handleLocationSelect = useCallback(
        (lngLat: [number, number]) => {
            mapInstance?.flyTo({ center: lngLat, zoom: 16, duration: 1500 });
        },
        [mapInstance],
    );

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

    const handleDelete = async () => {
        const ok = await confirm({
            title: t("delete"),
            description: t("confirmDelete"),
            confirmLabel: t("delete"),
            variant: "destructive",
        });
        if (!ok) return;
        try {
            await landsApi.delete(landId);
            toast.success(t("fieldDeleted"));
            router.push(`/farms/detail?farmId=${encodeURIComponent(farmId)}`);
        } catch (err: any) {
            toast.error(err.detail || t("failedDelete"));
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

    const mapToolClass =
        "grid h-10 w-10 place-items-center rounded-xl border border-border/70 bg-background text-foreground shadow-[0_4px_14px_rgba(16,36,22,0.14)]";

    return (
        <div
            ref={stageRef}
            data-sheet={sheetSnap}
            className="field-stage relative h-full w-full overflow-hidden bg-background"
            style={{ "--panel-w": `${panelWidthPx}px` } as React.CSSProperties}
        >
            <header className="absolute inset-x-0 top-0 z-30 flex h-12 items-center border-b border-border/80 bg-background px-1 md:hidden">
                <Link
                    href={`/farms/detail?farmId=${encodeURIComponent(farmId)}`}
                    className="inline-flex h-10 items-center gap-0.5 px-1.5 text-sm font-medium text-foreground"
                >
                    <ArrowLeft className="h-5 w-5" />
                    {t("backShort")}
                </Link>
                <h1 className="pointer-events-none absolute left-16 right-16 truncate text-center text-base font-semibold">
                    {land.land_name || land.land_id}
                </h1>
                <LocationSearch anchor="end" className="ml-auto" onSelect={handleLocationSelect} />
            </header>

            {/* Full-screen map. On a phone it starts under the single header row. */}
            <div className="absolute inset-x-0 bottom-0 top-12 md:inset-0">
                {editing ? (
                    <DrawMap
                        initialGeometry={land.boundary_geojson}
                        onGeometryChange={(g) => setEditGeom(g)}
                        onMapReady={(m) => setMapInstance(m)}
                    />
                ) : (
                    <BaseMap onMapReady={handleMapReady} />
                )}
            </div>

            <div className={cn(
                "absolute left-3 top-[4.25rem] z-30 overflow-hidden rounded-xl border border-border/70 bg-background shadow-[0_4px_14px_rgba(16,36,22,0.14)] md:hidden",
                sheetSnap === "full" && "pointer-events-none opacity-0",
            )}>
                <button type="button" className="grid h-10 w-10 place-items-center border-b border-border/80" onClick={() => mapInstance?.zoomIn()} aria-label="放大">
                    <Plus className="h-4 w-4" />
                </button>
                <button type="button" className="grid h-10 w-10 place-items-center" onClick={() => mapInstance?.zoomOut()} aria-label="缩小">
                    <Minus className="h-4 w-4" />
                </button>
            </div>
            <div className={cn(
                "absolute right-3 top-[4.25rem] z-30 flex flex-col gap-2 md:hidden",
                sheetSnap === "full" && "pointer-events-none opacity-0",
            )}>
                <MapStyleSwitcher iconOnly currentStyle={mapStyle} onStyleChange={handleStyleChange} />
                <button type="button" className={mapToolClass} onClick={handleLocate} aria-label="定位">
                    <Crosshair className="h-4 w-4" />
                </button>
            </div>

            {/* Desktop: back, layers and search stay on the map. */}
            <div className="absolute left-4 top-4 z-20 hidden items-center gap-2 md:flex">
                <Link
                    href={`/farms/detail?farmId=${encodeURIComponent(farmId)}`}
                    className={cn("inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-3", MAP_CHROME)}
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t("backToFarm")}
                </Link>
                <MapStyleSwitcher currentStyle={mapStyle} onStyleChange={handleStyleChange} />
                <LocationSearch onSelect={handleLocationSelect} />
            </div>

            {/* Index / agri 色斑 Legend - bottom-left */}
            {(agriHeatmap || indexLayer) && (
                <div className={cn(
                    "absolute left-4 z-20 transition-opacity duration-200 md:bottom-6",
                    sheetSnap === "peek" && "max-md:bottom-16",
                    sheetSnap === "half" && "max-md:bottom-[calc(58%+12px)]",
                    sheetSnap === "full" && "max-md:pointer-events-none max-md:opacity-0",
                )}>
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
                className={cn(
                    "field-index-stack absolute z-20 flex max-w-[calc(100%-5.5rem)] flex-col items-center gap-2 md:bottom-6 md:max-w-[calc(100%-2rem)]",
                    sheetSnap === "peek" && "max-md:bottom-16",
                    sheetSnap === "half" && "max-md:bottom-[calc(58%+12px)]",
                    sheetSnap === "full" && "max-md:pointer-events-none max-md:opacity-0",
                )}
                style={{ "--index-left": sidebarOpen ? "calc(50% - var(--panel-w) / 2)" : "50%" } as React.CSSProperties}
            >
                {activeTab === "ndvi" && (
                    <div className={cn("flex gap-1 rounded-lg p-1", MAP_CHROME)}>
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
                className={cn("absolute top-4 right-4 z-30 hidden rounded-xl p-2.5 transition-all hover:bg-surface-3 md:right-[var(--toggle-right)] md:inline-flex", MAP_CHROME)}
                style={{ "--toggle-right": sidebarOpen ? "calc(var(--panel-w) + 0.75rem)" : "1rem" } as React.CSSProperties}
                title={sidebarOpen ? "Hide panel (⌘.)" : "Show panel (⌘.)"}
            >
                {sidebarOpen ? (
                    <PanelRightClose className="h-4 w-4 text-foreground" />
                ) : (
                    <PanelRight className="h-4 w-4 text-foreground" />
                )}
            </button>

            {/* Phone: edge-to-edge bottom sheet. Wide screens: full-height side panel. */}
            <div
                ref={sheetRef}
                className={cn(
                    "absolute z-20 flex flex-col overflow-hidden bg-background",
                    "max-md:inset-x-0 max-md:bottom-0 max-md:w-full max-md:rounded-t-[20px] max-md:shadow-[0_-10px_30px_rgba(16,32,22,0.14)]",
                    sheetSnap === "half" && "max-md:top-[42%]",
                    sheetSnap === "full" && "max-md:top-12",
                    sheetSnap === "peek" && "max-md:top-auto max-md:h-8",
                    "md:bottom-0 md:right-0 md:top-0 md:w-[var(--panel-w)] md:border-l md:border-border/80",
                    !sidebarOpen && "md:translate-x-full",
                    dragTop == null && !isResizingPanel && "transition-[top,transform] duration-300 ease-out",
                )}
                style={dragTop != null ? { top: dragTop, height: "auto" } : undefined}
            >
                <div
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="拖动面板"
                    className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing md:hidden"
                    onPointerDown={onSheetPointerDown}
                    onPointerMove={onSheetPointerMove}
                    onPointerUp={onSheetPointerUp}
                    onPointerCancel={onSheetPointerUp}
                >
                    <div className="h-1 w-9 rounded-full bg-muted-foreground/30" />
                </div>
                {/* Left-edge drag handle — always-visible short gray grip (centered) */}
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize panel"
                    title="Drag to resize · double-click resets to default"
                    onMouseDown={handlePanelResizeStart}
                    onDoubleClick={handlePanelResizeReset}
                    className="group/resize absolute bottom-0 left-0 top-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center md:flex"
                >
                    <div
                        className={cn(
                            "pointer-events-none h-14 w-1 rounded-full bg-muted-foreground/50 shadow-sm",
                            "transition-colors group-hover/resize:bg-muted-foreground/75",
                            isResizingPanel && "bg-muted-foreground/85",
                        )}
                    />
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <Tabs defaultValue="info" value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <TabsList ref={tabsListRef} variant="underline" className="flex h-11 shrink-0 flex-nowrap justify-start gap-1 overflow-x-auto border-border/70 bg-background px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            <TabsTrigger
                                value="info"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 pb-0 pt-0 text-sm font-medium text-muted-foreground data-[state=active]:text-primary"
                            >
                                {t("tabInfo")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="ndvi"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 pb-0 pt-0 text-sm font-medium text-muted-foreground data-[state=active]:text-primary"
                            >
                                {t("tabNdvi")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="weather"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 pb-0 pt-0 text-sm font-medium text-muted-foreground data-[state=active]:text-primary"
                            >
                                {t("tabWeather")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="soil"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 pb-0 pt-0 text-sm font-medium text-muted-foreground data-[state=active]:text-primary"
                            >
                                {t("tabSoil")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="alerts"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 pb-0 pt-0 text-sm font-medium text-muted-foreground data-[state=active]:text-primary"
                            >
                                <span className="relative">
                                    {t("tabAlerts")}
                                    {openAlertCount > 0 && (
                                        <span className="absolute -top-1 -right-2 h-2 w-2 rounded-full bg-destructive" />
                                    )}
                                </span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="land-report"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 pb-0 pt-0 text-sm font-medium text-muted-foreground data-[state=active]:text-primary"
                            >
                                {t("tabLandReport")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="scouting"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 pb-0 pt-0 text-sm font-medium text-muted-foreground data-[state=active]:text-primary"
                            >
                                {t("tabScouting")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="share"
                                variant="underline"
                                className="h-11 shrink-0 px-2.5 pb-0 pt-0 text-sm font-medium text-muted-foreground data-[state=active]:text-primary"
                            >
                                {t("tabShare")}
                            </TabsTrigger>
                        </TabsList>

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
                                    <TabsContent value="info" className="mt-0 space-y-4 p-4">
                                        <div className="space-y-1">
                                            <h2 className="text-lg font-semibold tracking-tight">{land.land_name || land.land_id}</h2>
                                            <p className="text-sm text-muted-foreground">
                                                {land.area_ha != null ? formatAreaMu(land.area_ha) : ""}
                                                {land.crop_type && land.crop_type !== "unknown" && ` · ${land.crop_type}`}
                                                {land.season && ` · ${land.season}`}
                                            </p>
                                        </div>

                                        <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                                            <InfoRow label={t("name")} value={land.land_name || land.land_id} />
                                            <InfoRow label={t("area")} value={formatAreaMu(land.area_ha)} />
                                            <InfoRow
                                                label={t("cropType")}
                                                value={land.crop_type && land.crop_type !== "unknown" ? land.crop_type : t("cropUnset")}
                                            />
                                            <InfoRow label={t("season")} value={land.season || "-"} />
                                            <InfoRow label={t("agriLandId")} value={land.land_id} />
                                            <InfoRow label={t("cdfinanceGroupId")} value={land.group_id || "-"} />
                                            <InfoRow label={t("tags")} value={land.tags_json?.join(", ") || "-"} />
                                            <InfoRow label={t("created")} value={new Date(land.created_at).toLocaleDateString()} />
                                            <InfoRow label={t("updated")} value={new Date(land.updated_at).toLocaleDateString()} />
                                        </dl>

                                        <div className="space-y-2">
                                            <Button
                                                variant="outline"
                                                className="h-11 w-full"
                                                onClick={() => {
                                                    setEditName(land.land_name || land.land_id);
                                                    setEditCropType(land.crop_type || "");
                                                    setEditSeason(land.season || "");
                                                    setEditGroupId(land.group_id || "");
                                                    setEditGeom(land.boundary_geojson);
                                                    setEditing(true);
                                                }}
                                            >
                                                <Edit2 className="mr-2 h-4 w-4" />
                                                {t("edit")}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="h-11 w-full text-destructive hover:text-destructive"
                                                onClick={handleDelete}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                {t("delete")}
                                            </Button>
                                            <p className="text-center text-xs text-muted-foreground">{t("confirmDelete")}</p>
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value="ndvi"
                                        forceMount
                                        className="mt-0 p-4 data-[state=inactive]:hidden data-[state=inactive]:!hidden"
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

                                    <TabsContent value="alerts" className="mt-0 p-4">
                                        <AlertsTab landId={landId} onOpenCountChange={setOpenAlertCount} />
                                    </TabsContent>

                                    <TabsContent value="land-report" className="mt-0">
                                        <LandReportTab
                                            landId={landId}
                                            cropType={land.crop_type}
                                            onCropBound={(key) => {
                                                setLand((prev) => (prev ? { ...prev, crop_type: key } : prev));
                                            }}
                                        />
                                    </TabsContent>

                                    <TabsContent value="scouting" className="mt-0">
                                        <ScoutingTab landId={landId} mapInstance={mapInstance} activeTab={activeTab} />
                                    </TabsContent>

                                    <TabsContent value="weather" className="mt-0 p-4">
                                        <WeatherTab landId={landId} />
                                    </TabsContent>

                                    <TabsContent value="soil" className="mt-0 p-4">
                                        <SoilTab landId={landId} mapInstance={mapInstance} activeTab={activeTab} />
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

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4 px-3 py-3">
            <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words text-right text-sm font-medium leading-snug">{value}</dd>
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
