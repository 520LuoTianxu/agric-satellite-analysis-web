"use client";

import React, { useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import maplibregl from "maplibre-gl";
import type { ProjectHarvestLayers } from "@/lib/api";
import { boundsFromGeometries } from "@/lib/land-path";
import { Skeleton } from "@/components/ui/skeleton";

const BaseMap = dynamic(() => import("@/components/map/base-map"), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

export type HarvestMapMode = "tier" | "rgb" | "outline";

interface Props {
    /** 去重后地块（后端 WGS84，不做 GCJ02 转换）。 */
    parcels: GeoJSON.FeatureCollection | null;
    layers: ProjectHarvestLayers["items"];
    mode: HarvestMapMode;
    opacity: number;
    selectedLandId: string | null;
    onSelect: (landId: string | null) => void;
    popupText: (props: Record<string, unknown>) => string[];
}

const SRC = "ph-parcels";
const FILL = "ph-parcels-fill";
const LINE_ON = "ph-parcels-line-active";
const LINE_OFF = "ph-parcels-line-inactive";
const SEL = "ph-parcels-selected";
const IMG_PREFIX = "ph-img-";

function geomsOf(fc: GeoJSON.FeatureCollection | null, landId?: string | null) {
    if (!fc) return [];
    return fc.features
        .filter((f) => !landId || String(f.properties?.land_id) === landId)
        .map((f) => f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
}

export default function ProjectHarvestMap({ parcels, layers, mode, opacity, selectedLandId, onSelect, popupText }: Props) {
    const mapRef = useRef<maplibregl.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgIdsRef = useRef<string[]>([]);
    const parcelsRef = useRef(parcels);
    const layersRef = useRef(layers);
    const stateRef = useRef({ mode, opacity, selectedLandId });
    const onSelectRef = useRef(onSelect);
    const popupTextRef = useRef(popupText);
    const fittedRef = useRef(false);
    const popupRef = useRef<maplibregl.Popup | null>(null);
    useEffect(() => { onSelectRef.current = onSelect; popupTextRef.current = popupText; }, [onSelect, popupText]);

    const fit = useCallback((map: maplibregl.Map, landId?: string | null) => {
        const b = boundsFromGeometries(geomsOf(parcelsRef.current, landId));
        if (!b || !containerRef.current?.clientWidth) return;
        map.fitBounds(b, { padding: 40, maxZoom: landId ? 16 : 15, duration: 0 });
    }, []);

    const syncImages = useCallback((map: maplibregl.Map) => {
        for (const id of imgIdsRef.current) {
            if (map.getLayer(id)) map.removeLayer(id);
            if (map.getSource(id)) map.removeSource(id);
        }
        imgIdsRef.current = [];
        const { mode: m, opacity: o } = stateRef.current;
        if (m === "outline") return;
        const before = map.getLayer(FILL) ? FILL : undefined;
        layersRef.current.forEach((it, i) => {
            if (!it.available || !it.url || !it.coordinates) return;
            const id = `${IMG_PREFIX}${i}`;
            map.addSource(id, { type: "image", url: it.url, coordinates: it.coordinates as [[number, number], [number, number], [number, number], [number, number]] });
            map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": o, "raster-resampling": "nearest", "raster-fade-duration": 0 } }, before);
            imgIdsRef.current.push(id);
        });
    }, []);

    const syncParcels = useCallback((map: maplibregl.Map) => {
        const data = parcelsRef.current ?? { type: "FeatureCollection", features: [] };
        const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
        if (src) { src.setData(data); }
        else {
            map.addSource(SRC, { type: "geojson", data });
            map.addLayer({ id: FILL, type: "fill", source: SRC, paint: { "fill-color": "#ffffff", "fill-opacity": 0.01 } });
            // 启用(1) 实线、停用(0) 虚线；描边用白色 + 深色外描，在卫星底图与色膜上都清晰。
            map.addLayer({ id: LINE_ON, type: "line", source: SRC, filter: ["==", ["get", "land_status"], "1"],
                paint: { "line-color": "#ffffff", "line-width": 1.2 } });
            map.addLayer({ id: LINE_OFF, type: "line", source: SRC, filter: ["!=", ["get", "land_status"], "1"],
                paint: { "line-color": "#ffffff", "line-width": 1.2, "line-dasharray": [2, 1.5] } });
            map.addLayer({ id: SEL, type: "line", source: SRC, filter: ["==", ["get", "land_id"], ""],
                paint: { "line-color": "#00e5ff", "line-width": 3 } });
        }
        map.setFilter(SEL, ["==", ["get", "land_id"], stateRef.current.selectedLandId ?? ""]);
    }, []);

    const handleReady = useCallback((map: maplibregl.Map) => {
        mapRef.current = map;
        syncParcels(map);
        syncImages(map);
        if (parcelsRef.current?.features.length) { fit(map); fittedRef.current = true; }
        popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "300px" });
        map.on("click", FILL, (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const id = String(f.properties?.land_id ?? "");
            onSelectRef.current(id || null);
            const root = document.createElement("div");
            root.className = "space-y-0.5 p-1 text-xs";
            popupTextRef.current(f.properties as Record<string, unknown>).forEach((line, i) => {
                const p = document.createElement("p");
                if (i === 0) p.className = "font-semibold";
                p.textContent = line;
                root.appendChild(p);
            });
            popupRef.current?.setLngLat(e.lngLat).setDOMContent(root).addTo(map);
        });
        map.on("mouseenter", FILL, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", FILL, () => { map.getCanvas().style.cursor = ""; });
        map.on("style.load", () => { syncParcels(map); syncImages(map); });
    }, [fit, syncImages, syncParcels]);

    useEffect(() => {
        parcelsRef.current = parcels;
        const map = mapRef.current;
        if (!map) return;
        syncParcels(map);
        if (!fittedRef.current && parcels?.features.length) { fit(map); fittedRef.current = true; }
    }, [parcels, fit, syncParcels]);

    useEffect(() => {
        layersRef.current = layers;
        stateRef.current = { ...stateRef.current, mode };
        if (mapRef.current) syncImages(mapRef.current);
    }, [layers, mode, syncImages]);

    useEffect(() => {
        stateRef.current = { ...stateRef.current, opacity };
        const map = mapRef.current;
        if (!map) return;
        for (const id of imgIdsRef.current) if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", opacity);
    }, [opacity]);

    useEffect(() => {
        stateRef.current = { ...stateRef.current, selectedLandId };
        const map = mapRef.current;
        if (!map?.getLayer(SEL)) return;
        map.setFilter(SEL, ["==", ["get", "land_id"], selectedLandId ?? ""]);
        if (selectedLandId) fit(map, selectedLandId);
    }, [selectedLandId, fit]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ob = new ResizeObserver(() => mapRef.current?.resize());
        ob.observe(el);
        return () => { ob.disconnect(); popupRef.current?.remove(); };
    }, []);

    return <div ref={containerRef} className="h-full w-full"><BaseMap center={[115, 33.4]} zoom={10} onMapReady={handleReady} /></div>;
}
