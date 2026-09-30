"use client";

import React, { useRef, useEffect, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { useTranslations } from "next-intl";
import { tokenColor } from "@/lib/design-tokens";
import "maplibre-gl/dist/maplibre-gl.css";
import { registerPMTilesProtocol, getBasemapStyle, MAP_STYLES, tryUpgradeToPMTiles, installBasemapFallback, usesGcj02Coordinates, type MapStyleId } from "@/lib/pmtiles";
import { createTransformRequest, refreshMapToken } from "@/lib/map-auth";
import { wgs84ToGcj02 } from "@/lib/coordinate-transform";

export interface BaseMapProps {
    /** CSS class for the container div */
    className?: string;
    /** Initial center [lng, lat] */
    center?: [number, number];
    /** Initial zoom */
    zoom?: number;
    /** 样式就绪后通知业务层添加数据，不等待外部底图瓦片全部加载。 */
    onMapReady?: (map: maplibregl.Map) => void;
    /** 底图自动降级后同步界面中的图层选中状态。 */
    onBasemapFallback?: (styleId: MapStyleId) => void;
    /** 当前底图坐标系；高德道路图定位时需要把浏览器 WGS84 转成 GCJ-02。 */
    basemapStyle?: MapStyleId;
    /** If true, the map fills its parent container */
    fill?: boolean;
}

/**
 * Base MapLibre GL JS component.
 *
 * Per PRD: Uses PMTiles basemap from Aliyun OSS when NEXT_PUBLIC_PROTOMAPS_URL
 * is set. 默认使用与农业管理端一致的 WGS84 农业卫星图层；切换高德道路图时才使用 GCJ-02。
 */
export default function BaseMap({
    className = "",
    center = [78.9629, 20.5937], // India center
    zoom = 5,
    onMapReady,
    onBasemapFallback,
    basemapStyle = "satellite",
    fill = true,
}: BaseMapProps) {
    const t = useTranslations("mapControls");
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const basemapStyleRef = useRef<MapStyleId>(basemapStyle);

    useEffect(() => {
        basemapStyleRef.current = basemapStyle;
    }, [basemapStyle]);

    const onReadyCb = useCallback(
        (map: maplibregl.Map) => onMapReady?.(map),
        [onMapReady],
    );

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        // Suppress AbortError from MapLibre cancelling in-flight tile requests
        const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
            if (e.reason instanceof DOMException && e.reason.name === "AbortError") {
                e.preventDefault();
            }
        };
        window.addEventListener("unhandledrejection", handleUnhandledRejection);

        // Register PMTiles protocol (idempotent)
        registerPMTilesProtocol();

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: MAP_STYLES.find((item) => item.id === basemapStyle)?.style ?? getBasemapStyle(),
            center,
            zoom,
            // 与农业管理端保持一致，最高 20 级由业务高清瓦片承接，避免继续放大到高德占位层。
            maxZoom: 20,
            transformRequest: createTransformRequest(),
            attributionControl: {
                compact: true,
            },
        });

        installBasemapFallback(map, onBasemapFallback);

        // Refresh JWT for tile requests every 10 minutes
        const tokenRefresh = setInterval(() => refreshMapToken(), 10 * 60_000);

        map.addControl(new maplibregl.NavigationControl(), "top-left");

        // 自定义定位控件沿用浏览器定位能力，并用明确的定位 SVG 提升地图操作识别度。
        const geolocateCtrl = {
            _container: null as HTMLDivElement | null,
            _marker: null as maplibregl.Marker | null,
            onAdd() {
                const container = document.createElement("div");
                container.className = "maplibregl-ctrl maplibregl-ctrl-group";
                const btn = document.createElement("button");
                btn.type = "button";
                const locationLabel = t("myLocation");
                btn.title = locationLabel;
                btn.setAttribute("aria-label", locationLabel);
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>';
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (!navigator.geolocation) return;
                    btn.style.opacity = "0.5";
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            btn.style.opacity = "1";
                            const { longitude, latitude } = pos.coords;
                            const displayPosition = usesGcj02Coordinates(basemapStyleRef.current)
                                ? wgs84ToGcj02(longitude, latitude)
                                : [longitude, latitude] as [number, number];
                            map.flyTo({ center: displayPosition, zoom: 17, duration: 1500 });
                            if (this._marker) {
                                this._marker.setLngLat(displayPosition);
                            } else {
                                this._marker = new maplibregl.Marker({ color: tokenColor("--primary") })
                                    .setLngLat(displayPosition)
                                    .addTo(map);
                            }
                        },
                        () => { btn.style.opacity = "1"; },
                        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
                    );
                });
                container.appendChild(btn);
                this._container = container;
                return container;
            },
            onRemove() {
                if (this._marker) { this._marker.remove(); this._marker = null; }
                this._container?.remove();
            },
        };
        map.addControl(geolocateCtrl as any, "top-left");

        map.once("style.load", () => {
            // 样式就绪即可添加地块和定位；load 会等待所有外部瓦片，慢请求不能阻塞业务地图。
            onReadyCb(map);
            void tryUpgradeToPMTiles(map);
        });

        mapRef.current = map;

        return () => {
            window.removeEventListener("unhandledrejection", handleUnhandledRejection);
            clearInterval(tokenRefresh);
            map.remove();
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // mount once

    return (
        <div
            ref={containerRef}
            className={`${fill ? "w-full h-full" : ""} ${className}`}
        />
    );
}
