"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import maplibregl from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { tokenColor } from "@/lib/design-tokens";
import { boundsFromGeometries } from "@/lib/land-path";
import { RISK_TOKENS, type ProjectLand } from "@/lib/project-monitoring";
import { Skeleton } from "@/components/ui/skeleton";

const BaseMap = dynamic(() => import("@/components/map/base-map"), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

interface ProjectLandsMapProps {
    lands: ProjectLand[];
    selectedLandId: string | null;
    onSelect: (landId: string) => void;
    fitVersion: number;
}

const SOURCE = "project-lands";
const FILL = "project-lands-fill";
const LINE = "project-lands-line";
const UNKNOWN_LINE = "project-lands-unknown-line";
const SELECTED_LINE = "project-lands-selected-line";

function featureCollection(lands: ProjectLand[]): GeoJSON.FeatureCollection {
    const colors = Object.fromEntries(Object.entries(RISK_TOKENS).map(([risk, token]) => [risk, tokenColor(token)]));
    return {
        type: "FeatureCollection",
        features: lands.filter((land) => land.geometry).map((land) => ({
            type: "Feature",
            properties: { landId: land.landId, risk: land.riskLevel, color: colors[land.riskLevel] },
            geometry: land.geometry!,
        })),
    };
}

function ensureLayers(map: maplibregl.Map) {
    if (map.getSource(SOURCE)) return;
    map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: FILL, type: "fill", source: SOURCE,
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.22 } });
    map.addLayer({ id: LINE, type: "line", source: SOURCE,
        filter: ["!=", ["get", "risk"], "unknown"],
        paint: { "line-color": ["get", "color"], "line-width": 2 } });
    map.addLayer({ id: UNKNOWN_LINE, type: "line", source: SOURCE,
        filter: ["==", ["get", "risk"], "unknown"],
        paint: { "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [2, 2] } });
    // 选中状态只加外描边，保留风险填色与边界，避免严重地块选中后失去红色含义。
    map.addLayer({ id: SELECTED_LINE, type: "line", source: SOURCE,
        filter: ["==", ["get", "landId"], ""],
        paint: { "line-color": tokenColor("--foreground"), "line-width": 2, "line-gap-width": 5 } });
}

export default function ProjectLandsMap({ lands, selectedLandId, onSelect, fitVersion }: ProjectLandsMapProps) {
    const t = useTranslations("projectMonitoring");
    const { resolvedTheme } = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const popupRef = useRef<maplibregl.Popup | null>(null);
    const landsRef = useRef(lands);
    const selectedRef = useRef(selectedLandId);
    const onSelectRef = useRef(onSelect);
    const translationRef = useRef(t);
    const landById = useMemo(() => new Map(lands.map((land) => [land.landId, land])), [lands]);
    const landByIdRef = useRef(landById);
    useEffect(() => { landsRef.current = lands; landByIdRef.current = landById; }, [lands, landById]);
    useEffect(() => { selectedRef.current = selectedLandId; }, [selectedLandId]);
    useEffect(() => { onSelectRef.current = onSelect; translationRef.current = t; }, [onSelect, t]);

    const fitLands = useCallback((map: maplibregl.Map, items: ProjectLand[], selected = false) => {
        if (!containerRef.current?.clientWidth || !containerRef.current.clientHeight) return;
        const bounds = boundsFromGeometries(items.map((land) => land.geometry));
        if (!bounds) return;
        const wide = window.matchMedia("(min-width: 768px)").matches;
        map.fitBounds(bounds, {
            padding: { top: 56, bottom: 72, left: 56, right: selected && wide ? 400 : 56 },
            maxZoom: selected ? 17 : 16,
            duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450,
        });
    }, []);

    const syncMap = useCallback((map: maplibregl.Map) => {
        ensureLayers(map);
        (map.getSource(SOURCE) as maplibregl.GeoJSONSource).setData(featureCollection(landsRef.current));
        map.setFilter(SELECTED_LINE, ["==", ["get", "landId"], selectedRef.current ?? ""]);
        map.setPaintProperty(SELECTED_LINE, "line-color", tokenColor("--foreground"));
    }, []);

    const handleReady = useCallback((map: maplibregl.Map) => {
        mapRef.current = map;
        syncMap(map);
        const selected = landsRef.current.find((land) => land.landId === selectedRef.current);
        fitLands(map, selected ? [selected] : landsRef.current, Boolean(selected));
        popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: 12, maxWidth: "280px" });
        map.on("mousemove", FILL, (event) => {
            map.getCanvas().style.cursor = "pointer";
            const land = landByIdRef.current.get(String(event.features?.[0]?.properties?.landId ?? ""));
            if (!land) return;
            const translate = translationRef.current;
            const root = document.createElement("div");
            root.className = "space-y-1 p-2 text-xs";
            const name = document.createElement("p");
            name.className = "font-semibold";
            name.textContent = land.landName;
            const metadata = document.createElement("p");
            metadata.textContent = [land.cropText, land.areaMu === null ? "—" : translate("areaValue", { value: land.areaMu.toFixed(2) })].filter(Boolean).join(" · ");
            const status = document.createElement("p");
            status.textContent = translate("risk." + land.riskLevel) + " · " + translate("data." + land.dataStatus);
            const date = document.createElement("p");
            date.textContent = translate("observedAt", { date: land.monitoring?.observation?.date ?? "—" });
            root.append(name, metadata, status, date);
            popupRef.current?.setLngLat(event.lngLat).setDOMContent(root).addTo(map);
        });
        map.on("mouseleave", FILL, () => {
            map.getCanvas().style.cursor = "";
            popupRef.current?.remove();
        });
        map.on("click", FILL, (event) => {
            const id = String(event.features?.[0]?.properties?.landId ?? "");
            if (id) onSelectRef.current(id);
            popupRef.current?.remove();
        });
        map.on("style.load", () => syncMap(map));
    }, [fitLands, syncMap]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map?.getSource(SOURCE)) return;
        syncMap(map);
        popupRef.current?.remove();
        const selected = selectedLandId ? landById.get(selectedLandId) : null;
        fitLands(map, selected ? [selected] : lands, Boolean(selected));
    }, [lands, landById, selectedLandId, fitVersion, fitLands, syncMap, resolvedTheme]);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        // 移动端切换地图/列表、侧栏改变尺寸后同步画布，避免地块位置偏移。
        const observer = new ResizeObserver(() => {
            const map = mapRef.current;
            if (!map || !element.clientWidth || !element.clientHeight) return;
            map.resize();
            const selected = landsRef.current.find((land) => land.landId === selectedRef.current);
            fitLands(map, selected ? [selected] : landsRef.current, Boolean(selected));
        });
        observer.observe(element);
        return () => { observer.disconnect(); popupRef.current?.remove(); };
    }, [fitLands]);

    return <div ref={containerRef} className="h-full w-full"><BaseMap center={[105, 35]} zoom={4} onMapReady={handleReady} /></div>;
}
