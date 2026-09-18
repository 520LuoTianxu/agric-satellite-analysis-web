"use client";

/**
 * PMTiles protocol registration for MapLibre GL JS.
 *
 * Per PRD: "MapLibre JS pmtiles protocol plugin reads tiles via HTTP range
 * requests directly from object storage - no tile server needed."
 *
 * Usage: Import and call once before creating any MapLibre map instances.
 * If NEXT_PUBLIC_PROTOMAPS_URL is set, maps will use the PMTiles basemap.
 * 默认底图使用同一坐标系的高德卫星与道路标注瓦片。
 */

import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { Map as MapIcon, Mountain, Satellite, Moon, type LucideIcon } from "lucide-react";
import { getSatelliteTileCoverage, type SatelliteTileCoverage, type SatelliteTileRange } from "@/lib/agric";

let registered = false;
const ADMIN_SATELLITE_PROTOCOL = "agric-admin";
const ADMIN_SATELLITE_TILE_URL = `${ADMIN_SATELLITE_PROTOCOL}://{z}/{z}-{x}-{y}.png`;
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

let satelliteCoverageWarningShown = false;
let satelliteCoverage: Promise<SatelliteTileCoverage> | null = null;

function tileInRanges(z: number, x: number, y: number, ranges: Record<string, SatelliteTileRange[]> | undefined): boolean {
    return Boolean(ranges?.[String(z)]?.some(([minX, maxX, minY, maxY]) =>
        x >= minX && x <= maxX && y >= minY && y <= maxY,
    ));
}

function getAdminSatelliteFolder(z: number, x: number, y: number, coverage: SatelliteTileCoverage | null): string {
    if (coverage && tileInRanges(z, x, y, coverage.ghr)) return "ghr";
    if (coverage && tileInRanges(z, x, y, coverage.map2025Shandong)) return "Map2025Shandong";
    return "uat";
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
    const match = params.url.match(/^agric-admin:\/\/(\d+)\/\d+-(\d+)-(\d+)\.png$/);
    if (!match) throw new Error(`Invalid agric-admin satellite tile URL: ${params.url}`);

    const z = Number(match[1]);
    const x = Number(match[2]);
    const y = Number(match[3]);
    let coverage: SatelliteTileCoverage | null = null;
    try {
        if (!satelliteCoverage) satelliteCoverage = getSatelliteTileCoverage();
        coverage = await satelliteCoverage;
    } catch (error) {
        // 未登录、字典接口暂时不可用时仍保留 uat 兼容路径，底图不应因此整体白屏。
        if (!satelliteCoverageWarningShown) {
            satelliteCoverageWarningShown = true;
            console.warn("[agric-satellite-analysis] Satellite coverage dictionary unavailable; using uat tiles.", error);
        }
    }

    const folder = getAdminSatelliteFolder(z, x, y, coverage);
    const response = await fetch(`${getAdminSatelliteBaseUrl()}${folder}/${z}/${z}-${x}-${y}.png`, {
        signal: abortController.signal,
    });
    // 业务目录没有该瓦片时返回透明图，让下方高德底图继续可见，不能把整个高清图源判定为故障并移除。
    if (response.status === 404) return { data: getEmptyRasterTile() };
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
 * 高德底图沿用 agric-admin-front 中 AMap.TileLayer.Satellite 的视觉来源。
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

/** 参考 agric-admin-front 的 AMap.TileLayer.Satellite，使用同一坐标系的高德底图。 */
export function getSatelliteBasemapStyle(): maplibregl.StyleSpecification {
    return {
        version: 8,
        sources: {
            "gaode-satellite": {
                type: "raster" as const,
                // 与参考项目的 AMap.TileLayer.Satellite 使用同一高德卫星瓦片来源。
                tiles: [
                    "https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
                    "https://webst02.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
                    "https://webst03.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
                    "https://webst04.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
                ],
                tileSize: 256,
                maxzoom: 19,
                attribution: '<a href="https://www.amap.com">高德地图</a>',
            },
            "gaode-label": {
                type: "raster" as const,
                // 高德卫星瓦片只有影像；道路瓦片叠加后才会显示省市区县、村镇和兴趣点名称。
                tiles: GAODE_ROAD_TILE_URLS,
                tileSize: 256,
                maxzoom: 19,
                attribution: '<a href="https://www.amap.com">高德地图</a>',
            },
            "agric-admin-satellite": {
                type: "raster" as const,
                // 管理端同样使用 256 像素 XYZ 瓦片；协议处理器会按瓦片范围选择实际目录。
                tiles: [ADMIN_SATELLITE_TILE_URL],
                tileSize: 256,
                minzoom: 17,
                maxzoom: 20,
                attribution: '<a href="https://map-info.cdfinance.com.cn">农业影像服务</a>',
            },
        },
        layers: [
            { id: "gaode-satellite-layer", type: "raster", source: "gaode-satellite", minzoom: 0 },
            // 高清业务瓦片覆盖高德高层级占位区域，标注层继续放在最上方。
            { id: "agric-admin-satellite-layer", type: "raster", source: "agric-admin-satellite", minzoom: 17 },
            // 影像与标注都来自高德，坐标系一致后才能保证村镇名称与地块边界重合。
            { id: "gaode-label-layer", type: "raster", source: "gaode-label", minzoom: 0 },
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
    const sourceIds = new Set(["agric-admin-satellite", "gaode-satellite", "gaode-label", "gaode-road", "topo", "carto", "protomaps"]);
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
            const hasImagery = Boolean(map.getSource("agric-admin-satellite") || map.getSource("gaode-satellite") || map.getSource("gaode-label") || map.getSource("gaode-road"));
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
