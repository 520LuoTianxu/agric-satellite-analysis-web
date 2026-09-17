"use client";

/**
 * PMTiles protocol registration for MapLibre GL JS.
 *
 * Per PRD: "MapLibre JS pmtiles protocol plugin reads tiles via HTTP range
 * requests directly from object storage - no tile server needed."
 *
 * Usage: Import and call once before creating any MapLibre map instances.
 * If NEXT_PUBLIC_PROTOMAPS_URL is set, maps will use the PMTiles basemap.
 * 默认底图复用农业管理端的 WGS84 高清卫星瓦片，低级别可配置天地图影像。
 */

import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { Map as MapIcon, Mountain, Satellite, Moon, type LucideIcon } from "lucide-react";

let registered = false;

/** Register the PMTiles protocol with MapLibre GL JS (idempotent). */
export function registerPMTilesProtocol(): void {
    if (registered) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    registered = true;
}

/** PMTiles basemap URL from environment, or null if not configured. */
export const PMTILES_BASEMAP_URL =
    typeof window !== "undefined"
        ? process.env.NEXT_PUBLIC_PROTOMAPS_URL || null
        : null;

/**
 * Returns a MapLibre style spec.
 *
 * 复用农业管理端已校正为 WGS84 的卫星瓦片，避免高德 GCJ-02 与地块数据偏移。
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

/** OSM 街道底图在影像未配置或加载失败时承接地图显示。 */
export function getStreetBasemapStyle(): maplibregl.StyleSpecification {
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

export type MapStyleId = "street" | "terrain" | "satellite" | "dark";

/**
 * 参考 agric-admin-front 的 GroupDetailMap，复用无标注的高清卫星瓦片。
 * 此数据集仅提供 16–19 级：更高层级复用 19 级，低层级优先显示天地图影像，避免请求不存在的瓦片。
 * 保留 WGS84 / Web Mercator，与地块轮廓、遥感栅格和绘制结果使用同一坐标体系。
 */
export function getSatelliteBasemapStyle(): maplibregl.StyleSpecification {
    const street = getStreetBasemapStyle();
    const tiandituKey = process.env.NEXT_PUBLIC_TIANDITU_KEY;
    // OSS 只允许业务域名跨域；本地开发通过固定目标的 Next 代理读取同一批瓦片。
    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
    const tileUrl = process.env.NEXT_PUBLIC_SATELLITE_TILE_URL ||
        (process.env.NODE_ENV === "development"
            ? `${basePath}/basemap-satellite/{z}/{z}-{x}-{y}.png`
            : "https://cfpamf-map-info.oss-cn-beijing.aliyuncs.com/2025_WGS84_HIGH_Satellite/{z}/{z}-{x}-{y}.png");
    return {
        ...street,
        sources: {
            ...street.sources,
            // 沿用管理端低级别影像，浏览器 Key 由部署环境提供，不复制到源码。
            ...(tiandituKey ? {
                tianditu: {
                    type: "raster" as const,
                    tiles: [`https://t2.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk=${encodeURIComponent(tiandituKey)}`],
                    tileSize: 256,
                    minzoom: 1,
                    maxzoom: 18,
                    attribution: '<a href="https://www.tianditu.gov.cn">天地图</a>',
                },
            } : {}),
            "farm-satellite": {
                type: "raster",
                tiles: [tileUrl],
                tileSize: 256,
                minzoom: 16,
                maxzoom: 19,
                attribution: '<a href="https://map-info.cdfinance.com.cn">乡合数农影像服务</a>',
            },
        },
        layers: [
            ...street.layers,
            ...(tiandituKey ? [{ id: "tianditu-layer", type: "raster" as const, source: "tianditu" }] : []),
            // MapLibre 以 512 像素定义视图层级，视图 15 级对应本数据集的 256 像素瓦片 16 级。
            { id: "farm-satellite-layer", type: "raster", source: "farm-satellite", minzoom: 15 },
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
    const sourceIds = new Set(["farm-satellite", "tianditu", "topo", "carto", "protomaps"]);
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
            // 高清影像仅覆盖已维护区域，缺图时保留正常的天地图影像，不应一并清空。
            for (const id of failedIds) {
                if (map.getSource(id)) map.removeSource(id);
            }

            const fallback = getStreetBasemapStyle();
            if (!map.getSource("osm")) {
                map.addSource("osm", fallback.sources["osm"]);
            }
            if (!map.getLayer("osm-layer")) {
                // 备用底图必须位于业务图层下方，不能遮挡地块和热力图。
                const firstOverlay = map.getStyle().layers.find((layer) => layer.type !== "background");
                map.addLayer(fallback.layers[0], firstOverlay?.id);
            }
            const hasImagery = Boolean(map.getSource("farm-satellite") || map.getSource("tianditu"));
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
