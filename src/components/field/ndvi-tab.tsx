"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import {
    monitoringApi,
    weatherApi,
    type RasterLayer,
    type LandStat,
    type IndexType,
    type WeatherDaily,
    INDEX_CONFIG,
} from "@/lib/api";
import { IndexExplainer } from "@/components/field/index-explainer";
import {
    Eye,
    EyeOff,
    CloudRain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const NdviChart = dynamic(() => import("@/components/charts/ndvi-chart"), {
    ssr: false,
    loading: () => (
        <div className="flex flex-col items-center justify-center h-[200px] gap-2">
            <Skeleton className="h-[160px] w-full rounded-md" />
        </div>
    ),
});

const AgriTimeseriesPanel = dynamic(() => import("@/components/field/agri-timeseries-panel"), {
    ssr: false,
});

/* ── Props ────────────────────────────────────────────────────── */

interface NdviTabProps {
    landId: string;
    /** Canonical parcel crop_type for season calendar / grade shares */
    cropType?: string | null;
    /** Parcel area (ha) — NDVI donut center shows 亩 */
    areaHa?: number | null;
    /** Source land area in 亩; used to block oversized data pulls. */
    landAreaMu?: number | null;
    /** Called when a tile layer should be shown on the map */
    onShowLayer?: (layer: RasterLayer | null, indexType: IndexType) => void;
    /** Called when the active index changes - parent renders the selector */
    onActiveIndexChange?: (index: IndexType) => void;
    /** Externally controlled active index (from parent floating selector) */
    activeIndexOverride?: IndexType;
    /** Called after data loads so parent can refresh available index types */
    onDataLoaded?: () => void;
    /** Agri pixel_data 色斑图 → parent map overlay */
    onAgriHeatmapChange?: (heatmap: import("@/lib/agri-heatmap").AgriHeatmapImage | null) => void;
    /** Controlled agri 色斑 mode (NDVI/EVI/干旱/洪涝) from map-bottom chips */
    agriHeatMode?: import("@/lib/agri-heatmap").AgriHeatIndex;
    onAgriHeatModeChange?: (mode: import("@/lib/agri-heatmap").AgriHeatIndex) => void;
    /** When false (left 指数 tab), clear overlay; when true again, reload */
    agriHeatmapEnabled?: boolean;
}

export default function NdviTab({ landId, cropType, areaHa = null, landAreaMu = null, onShowLayer, onActiveIndexChange, activeIndexOverride, onDataLoaded, onAgriHeatmapChange, agriHeatMode, onAgriHeatModeChange, agriHeatmapEnabled = true }: NdviTabProps) {
    const tMon = useTranslations("monitoring");
    // ── Index selector ───────────────────────────────
    const [activeIndex, setActiveIndex] = useState<IndexType>("NDVI");
    const config = INDEX_CONFIG[activeIndex];

    // ── Data ─────────────────────────────────────────
    const [layers, setLayers] = useState<RasterLayer[]>([]);
    const [stats, setStats] = useState<LandStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    // ── Selected date ────────────────────────────────
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [layerVisible, setLayerVisible] = useState(true);

    // ── Weather overlay ──────────────────────────────
    const [showWeatherOverlay, setShowWeatherOverlay] = useState(false);
    const [weatherData, setWeatherData] = useState<WeatherDaily[]>([]);

    const loadGenRef = useRef(0); // prevents stale fetch results
    const loadRequestRef = useRef<AbortController | null>(null);

    // ── Load layers + stats for active index ─────────
    // 监测表和 parcel_scene_products 都属于同一地块主表的下游数据，统一按 land_id 读取。
    const loadData = useCallback(async () => {
        const gen = ++loadGenRef.current;
        loadRequestRef.current?.abort();
        const controller = new AbortController();
        loadRequestRef.current = controller;
        setLoading(true);
        setLoadError(false);
        // 新地块或指标开始加载时先清空旧结果，防止地图短暂显示与当前选择不一致的数据。
        setLayers([]);
        setStats([]);
        setSelectedDate(null);
        onShowLayer?.(null, activeIndex);
        onAgriHeatmapChange?.(null);
        try {
            const [layersRes, statsRes] = await Promise.all([
                monitoringApi.layers(landId, activeIndex, 50, { signal: controller.signal }),
                monitoringApi.stats(landId, activeIndex, 200, { signal: controller.signal }),
            ]);
            if (gen !== loadGenRef.current) return; // stale - discard
            // 旧监控表中的 agri:// 占位 COG 会污染 TiTiler；不暴露其瓦片地址。
            // 遥感主链路仍直接读取同一 land_id 的 parcel_scene_products。
            const sanitized = layersRes.items.map((layer) => {
                const cog = layer.cog_uri || "";
                if (cog.startsWith("agri://")) {
                    return { ...layer, tile_url: null };
                }
                return layer;
            });
            setLayers(sanitized);
            setStats(statsRes.items);
            onDataLoaded?.();
            // Auto-select latest date
            if (sanitized.length > 0) {
                setSelectedDate(sanitized[sanitized.length - 1].date);
            } else {
                setSelectedDate(null);
            }
        } catch {
            if (!controller.signal.aborted && gen === loadGenRef.current) setLoadError(true);
        } finally {
            if (gen === loadGenRef.current) {
                if (loadRequestRef.current === controller) loadRequestRef.current = null;
                setLoading(false);
            }
        }
    }, [landId, activeIndex, onDataLoaded, onShowLayer, onAgriHeatmapChange]);

    useEffect(() => {
        loadData();
        return () => {
            // 地块或指标变化、组件卸载时终止旧请求，避免继续占用连接并污染当前加载状态。
            loadGenRef.current += 1;
            loadRequestRef.current?.abort();
            loadRequestRef.current = null;
        };
    }, [loadData]);

    // ── Fetch weather data when overlay is toggled on ──
    useEffect(() => {
        if (!showWeatherOverlay || stats.length === 0) {
            setWeatherData([]);
            return;
        }
        const controller = new AbortController();
        setWeatherData([]);
        const dates = stats.map((s) => s.date).sort();
        const start = dates[0];
        const end = dates[dates.length - 1];
        weatherApi
            .get(landId, start, end, false, { signal: controller.signal })
            .then((res) => setWeatherData(res.data))
            .catch(() => {
                if (!controller.signal.aborted) setWeatherData([]);
            });
        // 地块或日期窗口变化时取消旧查询，避免过期天气覆盖当前叠加层。
        return () => controller.abort();
    }, [showWeatherOverlay, landId, stats]);

    // ── Show layer on map when selectedDate or visibility changes ──
    useEffect(() => {
        if (!onShowLayer) return;
        if (!layerVisible || !selectedDate) {
            onShowLayer(null, activeIndex);
            return;
        }
        const layer = layers.find((l) => l.date === selectedDate);
        if (layer?.cog_uri?.startsWith("agri://") || !layer?.tile_url) {
            onShowLayer(null, activeIndex);
            return;
        }
        onShowLayer(layer, activeIndex);
    }, [selectedDate, layerVisible, layers, onShowLayer, activeIndex]);

    // ── Date select from chart ───────────────────────
    const handleChartDateSelect = (date: string) => {
        setSelectedDate(date);
        setLayerVisible(true);
    };

    // ── Switch active index ──────────────────────────
    const handleIndexChange = (idx: IndexType) => {
        if (idx === activeIndex) return;
        // Clear data immediately to prevent stale overlay
        setLayers([]);
        setStats([]);
        setSelectedDate(null);
        setActiveIndex(idx);
        onActiveIndexChange?.(idx);
    };

    // Sync when parent overrides active index
    useEffect(() => {
        if (activeIndexOverride && activeIndexOverride !== activeIndex) {
            setLayers([]);
            setStats([]);
            setSelectedDate(null);
            setActiveIndex(activeIndexOverride);
        }
    }, [activeIndexOverride]); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) {
        return (
            <div className="space-y-4 py-4">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-[200px] w-full rounded-lg" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-full rounded" />
                    <Skeleton className="h-8 w-full rounded" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {loadError && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                    <span>{tMon("dataLoadFailed")}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadData()}>
                        {tMon("retry")}
                    </Button>
                </div>
            )}

            {/* ── Canonical S1/S2 scene products ── */}
            <AgriTimeseriesPanel
                landId={landId}
                cropType={cropType}
                areaHa={areaHa}
                landAreaMu={landAreaMu}
                hasMonitoringData={layers.length > 0 || stats.length > 0}
                onHeatmapChange={onAgriHeatmapChange}
                mode={agriHeatMode}
                onModeChange={onAgriHeatModeChange}
                enabled={agriHeatmapEnabled}
            />

            {/* ── Section: Chart for this canonical land ─────────────────────────── */}
            {(layers.length > 0 || stats.length > 0) && (
            <Card>
                <CardHeader className="pb-2 pt-3 px-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xs font-semibold">{tMon("timeSeries", { index: config.label })}</CardTitle>
                        <Button
                            variant={showWeatherOverlay ? "secondary" : "ghost"}
                            size="sm"
                            className="gap-1 px-2 text-xs"
                            onClick={() => setShowWeatherOverlay(!showWeatherOverlay)}
                            title={showWeatherOverlay ? tMon("hideWeatherOverlay") : tMon("showWeatherOverlay")}
                        >
                            <CloudRain className="h-3 w-3" aria-hidden="true" />
                            {tMon("weatherOverlay")}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0 space-y-3">
                    <IndexExplainer index={activeIndex} />
                    <NdviChart
                        stats={stats}
                        selectedDate={selectedDate}
                        onDateSelect={handleChartDateSelect}
                        height={showWeatherOverlay ? 240 : 200}
                        indexType={activeIndex}
                        weatherData={weatherData}
                        showWeatherOverlay={showWeatherOverlay}
                    />
                </CardContent>
            </Card>
            )}

            {/* ── Section: Layer Selector ───────────────── */}
            {layers.length > 0 && (
                <Card>
                    <CardHeader className="pb-2 pt-3 px-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-xs font-semibold">
                                {config.label} Layers
                                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 tabular-nums">
                                    {layers.length}
                                </Badge>
                            </CardTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLayerVisible(!layerVisible)}
                                className="h-9 w-9 p-0"
                                title={layerVisible ? tMon("hideOverlay", { index: config.label }) : tMon("showOverlay", { index: config.label })}
                                aria-label={layerVisible ? tMon("hideOverlay", { index: config.label }) : tMon("showOverlay", { index: config.label })}
                            >
                                {layerVisible ? (
                                    <Eye className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                                )}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                            {layers.map((layer) => {
                                const isSelected = layer.date === selectedDate;
                                const stat = stats.find((s) => s.date === layer.date);
                                return (
                                    <Button
                                        key={layer.id}
                                        variant={isSelected ? "default" : "outline"}
                                        onClick={() => {
                                            setSelectedDate(layer.date);
                                            setLayerVisible(true);
                                        }}
                                        className={cn(
                                            "w-full justify-between h-auto py-1.5 px-2 text-xs",
                                            isSelected
                                                ? "bg-primary-subtle border-primary-border text-primary hover:bg-primary-subtle"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        <div className="flex flex-col items-start">
                                            <span className="font-medium">{layer.date}</span>
                                            <span className="text-muted-foreground text-[10px]">
                                                {layer.satellite}
                                                {activeIndex === "SAVI" && layer.params_json?.savi_l != null && (
                                                    <> · L={layer.params_json.savi_l}</>
                                                )}
                                            </span>
                                        </div>
                                        {stat?.mean != null && (
                                            <Badge
                                                variant={stat.mean < config.threshold ? "destructive" : "default"}
                                                className={cn(
                                                    "font-mono tabular-nums text-[10px] px-1.5",
                                                    stat.mean >= config.threshold && "bg-primary hover:bg-primary/90",
                                                )}
                                            >
                                                {stat.mean.toFixed(3)}
                                            </Badge>
                                        )}
                                    </Button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

        </div>
    );
}
