"use client";

/**
 * PMTiles protocol registration for MapLibre GL JS.
 *
 * Per PRD: "MapLibre JS pmtiles protocol plugin reads tiles via HTTP range
 * requests directly from object storage - no tile server needed."
 *
 * Usage: Import and call once before creating any MapLibre map instances.
 * If NEXT_PUBLIC_PROTOMAPS_URL is set, maps will use the PMTiles basemap.
 * 默认卫星底图复刻农业管理端的 WGS84 图层；高德道路样式单独使用 GCJ-02。
 */

import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { Map as MapIcon, Mountain, Satellite, Moon, type LucideIcon } from "lucide-react";

let registered = false;
const ADMIN_SATELLITE_PROTOCOL = "agric-admin";
const getAdminSatelliteTileUrl = (folder: string) =>
    `${ADMIN_SATELLITE_PROTOCOL}://${folder}/{z}/{z}-{x}-{y}.png`;
const EMPTY_RASTER_TILE_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** Register the PMTiles protocol with MapLibre GL JS (idempotent). */
export function registerPMTilesProtocol(): void {
    if (registered) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    // 管理端高清影像需要按后端下发的 XYZ 范围选择目录，不能用单一 URL 模板覆盖所有区域。
    maplibregl.addProtocol(ADMIN_SATELLITE_PROTOCOL, adminSatelliteTileProtocol);
    registered = true;
}

function getAdminSatelliteBaseUrl(): string {
    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
    // 本地 Next 代理到业务图源，避免 map-info 服务拒绝 localhost 的跨域请求。
    if (process.env.NODE_ENV === "development") return `${basePath}/basemap-admin-satellite/`;
    return "https://map-info.cdfinance.com.cn/";
}

function getEmptyRasterTile(): ArrayBuffer {
    const binary = atob(EMPTY_RASTER_TILE_BASE64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

async function adminSatelliteTileProtocol(
    params: { url: string },
    abortController: AbortController,
): Promise<{ data: ArrayBuffer }> {
    const match = params.url.match(/^agric-admin:\/\/([^/]+)\/(\d+)\/\d+-(\d+)-(\d+)\.png$/);
    if (!match) throw new Error(`Invalid agric-admin satellite tile URL: ${params.url}`);

    const folder = decodeURIComponent(match[1]);
    const z = Number(match[2]);
    const x = Number(match[3]);
    const y = Number(match[4]);
    const response = await fetch(`${getAdminSatelliteBaseUrl()}${folder}/${z}/${z}-${x}-${y}.png`, {
        signal: abortController.signal,
    });
    // 对象存储对不存在瓦片可能返回 403 或 404；统一返回透明图，让下方影像层承接，不能让单块缺图移除整层高清影像。
    if (response.status === 403 || response.status === 404) return { data: getEmptyRasterTile() };
    if (!response.ok) throw new Error(`Admin satellite tile ${response.status}: ${response.url}`);
    return { data: await response.arrayBuffer() };
}

/** PMTiles basemap URL from environment, or null if not configured. */
export const PMTILES_BASEMAP_URL =
    typeof window !== "undefined"
        ? process.env.NEXT_PUBLIC_PROTOMAPS_URL || null
        : null;

/**
 * Returns a MapLibre style spec.
 *
 * 卫星底图沿用 agric-admin-front 的影像/标注图层来源。
 * Use `tryUpgradeToPMTiles(map)` after map creation to switch to
 * PMTiles vector tiles if the basemap file is available.
 */
export function getBasemapStyle(): maplibregl.StyleSpecification {
    return getSatelliteBasemapStyle();
}

/**
 * Returns the PMTiles vector basemap style, or null if not configured.
 */
export function getPMTilesStyle(): maplibregl.StyleSpecification | null {
    if (!PMTILES_BASEMAP_URL) return null;
    return {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
            protomaps: {
                type: "vector",
                url: `pmtiles://${PMTILES_BASEMAP_URL}`,
                attribution:
                    '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
            },
        },
        layers: [
            {
                id: "background",
                type: "background",
                paint: { "background-color": "#f8f4f0" },
            },
            {
                id: "earth",
                type: "fill",
                source: "protomaps",
                "source-layer": "earth",
                paint: { "fill-color": "#f0e9e1" },
            },
            {
                id: "water",
                type: "fill",
                source: "protomaps",
                "source-layer": "water",
                paint: { "fill-color": "#aad3df" },
            },
            {
                id: "landuse-park",
                type: "fill",
                source: "protomaps",
                "source-layer": "landuse",
                filter: ["in", "pmap:kind", "park", "nature_reserve", "forest"],
                paint: { "fill-color": "#c8facc", "fill-opacity": 0.5 },
            },
            {
                id: "landuse-farm",
                type: "fill",
                source: "protomaps",
                "source-layer": "landuse",
                filter: [
                    "in",
                    "pmap:kind",
                    "farmland",
                    "farm",
                    "orchard",
                    "vineyard",
                ],
                paint: { "fill-color": "#eef0d5", "fill-opacity": 0.6 },
            },
            {
                id: "roads-highway",
                type: "line",
                source: "protomaps",
                "source-layer": "roads",
                filter: ["in", "pmap:kind", "highway", "major_road"],
                paint: {
                    "line-color": "#ffb347",
                    "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 12, 2],
                },
            },
            {
                id: "roads-minor",
                type: "line",
                source: "protomaps",
                "source-layer": "roads",
                filter: ["in", "pmap:kind", "minor_road", "medium_road"],
                paint: {
                    "line-color": "#ddd",
                    "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 15, 1],
                },
                minzoom: 10,
            },
            {
                id: "buildings",
                type: "fill",
                source: "protomaps",
                "source-layer": "buildings",
                paint: { "fill-color": "#d9d0c9", "fill-opacity": 0.6 },
                minzoom: 13,
            },
            {
                id: "place-labels",
                type: "symbol",
                source: "protomaps",
                "source-layer": "places",
                layout: {
                    "text-field": ["get", "name"],
                    "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 10, 14],
                },
                paint: {
                    "text-color": "#333",
                    "text-halo-color": "#fff",
                    "text-halo-width": 1,
                },
            },
        ],
    };
}

/** Cache the availability check so we only probe once per page load. */
let pmtilesAvailable: boolean | null = null;

/**
 * Asynchronously check if the PMTiles basemap file exists, then upgrade
 * the map style from street raster to PMTiles vector tiles.
 *
 * Safe to call even if NEXT_PUBLIC_PROTOMAPS_URL is not set - it no-ops.
 */
export async function tryUpgradeToPMTiles(map: maplibregl.Map): Promise<void> {
    if (!PMTILES_BASEMAP_URL) return;

    // Only probe once per page load
    if (pmtilesAvailable === false) return;

    if (pmtilesAvailable === null) {
        try {
            const resp = await fetch(PMTILES_BASEMAP_URL, {
                method: "HEAD",
                cache: "no-store",
            });
            pmtilesAvailable = resp.ok;
        } catch {
            pmtilesAvailable = false;
        }
    }

    if (!pmtilesAvailable) {
        console.warn("[agric-satellite-analysis] PMTiles basemap not found at", PMTILES_BASEMAP_URL, "- keeping the current basemap");
        return;
    }

    const style = getPMTilesStyle();
    if (style && map.getCanvas()) {
        map.setStyle(style);
    }
}

/** OSM 底图仅作为高德瓦片不可用时的最终兜底。 */
function getOsmFallbackStyle(): maplibregl.StyleSpecification {
    return {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
            "osm": {
                type: "raster",
                tiles: [
                    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                ],
                tileSize: 256,
                maxzoom: 19,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
        },
        layers: [
            {
                id: "osm-layer",
                type: "raster",
                source: "osm",
                minzoom: 0,
            },
        ],
    };
}

/** 高德道路瓦片，作为地图样式切换中的街道底图。 */
const GAODE_ROAD_TILE_URLS = [
    "https://wprd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    "https://wprd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    "https://wprd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    "https://wprd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
];

export function getStreetBasemapStyle(): maplibregl.StyleSpecification {
    return {
        version: 8,
        sources: {
            "gaode-road": {
                type: "raster",
                tiles: GAODE_ROAD_TILE_URLS,
                tileSize: 256,
                maxzoom: 19,
                attribution: '<a href="https://www.amap.com">高德地图</a>',
            },
        },
        layers: [{ id: "gaode-road-layer", type: "raster", source: "gaode-road", minzoom: 0 }],
    };
}

export type MapStyleId = "street" | "terrain" | "satellite" | "dark";

/**
 * 判断当前底图是否要求 GCJ-02 坐标。
 * 农业管理端复刻的卫星图层和天地图图层按 WGS84 展示，只有高德道路瓦片
 * 使用 GCJ-02；统一由这个判断避免业务边界在错误的底图上重复偏移。
 */
export function usesGcj02Coordinates(styleId: MapStyleId): boolean {
    return styleId === "street";
}

const TIANDITU_KEY = process.env.NEXT_PUBLIC_TIANDITU_KEY || "9899a5939e2c1a52ccd5cc03977b1a75";
const TIANDITU_IMG_TILE_URL =
    `https://t2.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk=${encodeURIComponent(TIANDITU_KEY)}`;
const TIANDITU_LABEL_TILE_URL =
    `https://t2.tianditu.gov.cn/DataServer?T=cia_w&x={x}&y={y}&l={z}&tk=${encodeURIComponent(TIANDITU_KEY)}`;

/**
 * 复刻 agric-admin-front 的 OpenLayers 图层栈：天地图影像/标注承接基础层，
 * 16 级开始叠加 2025_WGS84_HIGH 高清影像，避免请求高德 17 级异常卫星瓦片。
 */
export function getSatelliteBasemapStyle(): maplibregl.StyleSpecification {
    return {
        version: 8,
        sources: {
            "tianditu-satellite": {
                type: "raster" as const,
                // 与参考项目 baseLayer 完全一致，18 级以下由天地图影像承接。
                tiles: [TIANDITU_IMG_TILE_URL],
                tileSize: 256,
                maxzoom: 18,
                attribution: '<a href="https://www.tianditu.gov.cn">天地图</a>',
            },
            "tianditu-label": {
                type: "raster" as const,
                // 参考项目 labelLayer 使用 cia_w，负责行政区、村镇和道路标注。
                tiles: [TIANDITU_LABEL_TILE_URL],
                tileSize: 256,
                maxzoom: 18,
                attribution: '<a href="https://www.tianditu.gov.cn">天地图</a>',
            },
            "agric-admin-2025": {
                type: "raster" as const,
                // 对应参考项目的 gaodeMineLayer，保留 18 级以上业务影像承接。
                tiles: [getAdminSatelliteTileUrl("2025_WGS84")],
                tileSize: 256,
                minzoom: 18,
                maxzoom: 19,
                attribution: '<a href="https://map-info.cdfinance.com.cn">农业影像服务</a>',
            },
            "agric-admin-high": {
                type: "raster" as const,
                // 对应参考项目的 mineHDLayer，使用统一高清影像避免瓦片批次混拼。
                tiles: [getAdminSatelliteTileUrl("2025_WGS84_HIGH")],
                tileSize: 256,
                minzoom: 16,
                maxzoom: 19,
                attribution: '<a href="https://map-info.cdfinance.com.cn">农业影像服务</a>',
            },
            "agric-admin-high-satellite": {
                type: "raster" as const,
                // 对应参考项目的 mineHDNoMarkLayer，作为最上层无标注高清影像。
                tiles: [getAdminSatelliteTileUrl("2025_WGS84_HIGH_Satellite")],
                tileSize: 256,
                minzoom: 16,
                maxzoom: 19,
                attribution: '<a href="https://map-info.cdfinance.com.cn">农业影像服务</a>',
            },
        },
        layers: [
            { id: "tianditu-satellite-layer", type: "raster", source: "tianditu-satellite", minzoom: 0, maxzoom: 18, paint: { "raster-fade-duration": 0 } },
            { id: "tianditu-label-layer", type: "raster", source: "tianditu-label", minzoom: 0, maxzoom: 18, paint: { "raster-fade-duration": 0 } },
            { id: "agric-admin-2025-layer", type: "raster", source: "agric-admin-2025", minzoom: 18, paint: { "raster-fade-duration": 0 } },
            { id: "agric-admin-high-layer", type: "raster", source: "agric-admin-high", minzoom: 16, paint: { "raster-fade-duration": 0 } },
            { id: "agric-admin-high-satellite-layer", type: "raster", source: "agric-admin-high-satellite", minzoom: 16, paint: { "raster-fade-duration": 0 } },
        ],
    };
}

export interface MapStyleOption {
    id: MapStyleId;
    label: string;
    icon: LucideIcon;
    style: maplibregl.StyleSpecification;
}

export const MAP_STYLES: MapStyleOption[] = [
    {
        id: "street",
        label: "Street",
        icon: MapIcon,
        style: getStreetBasemapStyle(),
    },
    {
        id: "terrain",
        label: "Terrain",
        icon: Mountain,
        style: {
            version: 8,
            glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
            sources: {
                topo: {
                    type: "raster",
                    tiles: [
                        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
                        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
                        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
                    ],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
                },
            },
            layers: [{ id: "topo-layer", type: "raster", source: "topo", minzoom: 0, maxzoom: 17 }],
        },
    },
    {
        id: "satellite",
        label: "Satellite",
        icon: Satellite,
        style: getSatelliteBasemapStyle(),
    },
    {
        id: "dark",
        label: "Dark",
        icon: Moon,
        style: {
            version: 8,
            glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
            sources: {
                carto: {
                    type: "raster",
                    tiles: [
                        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                    ],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://carto.com">CARTO</a>',
                },
            },
            layers: [{ id: "carto-layer", type: "raster", source: "carto", minzoom: 0, maxzoom: 19 }],
        },
    },
];

/**
 * 外部底图失败时仅替换底图资源，保留地块、绘制内容和分析叠加层。
 * 备用图源失败时不再重试切换，避免错误事件触发无限加载。
 */
export function installBasemapFallback(
    map: maplibregl.Map,
    onFallback?: (styleId: MapStyleId) => void,
): void {
    const sourceIds = new Set([
        "agric-admin-2025",
        "agric-admin-high",
        "agric-admin-high-satellite",
        "tianditu-satellite",
        "tianditu-label",
        "gaode-road",
        "topo",
        "carto",
        "protomaps",
    ]);
    let pending: ReturnType<typeof setTimeout> | undefined;
    const failedSources = new Map<string, unknown>();

    const handleError = (event: { error: Error; sourceId?: string }) => {
        if (event.error?.name === "AbortError") return;
        const sourceId = event.sourceId;
        if (!sourceId || !sourceIds.has(sourceId)) {
            // 注册 error 监听后 MapLibre 不再自动打印错误，业务图层错误仍需保留诊断信息。
            console.error(event.error);
            return;
        }
        const failedSource = map.getSource(sourceId);
        if (!failedSource) return;
        failedSources.set(sourceId, failedSource);
        if (pending !== undefined) return;

        // 脱离当前瓦片错误调用栈再移除资源，并合并同一批瓦片的失败通知。
        pending = setTimeout(() => {
            pending = undefined;
            // 等待期间用户可能已切换样式，不允许旧请求的失败覆盖新底图。
            const failedIds = new Set([...failedSources]
                .filter(([id, source]) => map.getSource(id) === source)
                .map(([id]) => id));
            failedSources.clear();
            if (!failedIds.size) return;
            const style = map.getStyle();
            const basemapLayers = style.layers.filter((layer) =>
                ("source" in layer && failedIds.has(layer.source)) ||
                (failedIds.has("protomaps") && layer.id === "background"),
            );
            for (const layer of basemapLayers.reverse()) map.removeLayer(layer.id);
            for (const id of failedIds) {
                if (map.getSource(id)) map.removeSource(id);
            }

            const fallback = getOsmFallbackStyle();
            if (!map.getSource("osm")) {
                map.addSource("osm", fallback.sources["osm"]);
            }
            if (!map.getLayer("osm-layer")) {
                // 备用底图必须位于业务图层下方，不能遮挡地块和热力图。
                const firstOverlay = map.getStyle().layers.find((layer) => layer.type !== "background");
                map.addLayer(fallback.layers[0], firstOverlay?.id);
            }
            const hasImagery = Boolean(
                map.getSource("agric-admin-2025") ||
                map.getSource("agric-admin-high") ||
                map.getSource("agric-admin-high-satellite") ||
                map.getSource("tianditu-satellite") ||
                map.getSource("gaode-road"),
            );
            console.warn("[agric-satellite-analysis] Basemap source unavailable; keeping available layers.", [...failedIds]);
            onFallback?.(hasImagery ? "satellite" : "street");
        }, 0);
    };

    map.on("error", handleError);
    map.once("remove", () => {
        if (pending !== undefined) clearTimeout(pending);
        failedSources.clear();
        map.off("error", handleError);
    });
}
