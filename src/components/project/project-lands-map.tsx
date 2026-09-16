"use client";

import React, { useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import maplibregl from "maplibre-gl";
import { tokenColor } from "@/lib/design-tokens";
import { boundsFromGeometries } from "@/lib/land-path";
import { Skeleton } from "@/components/ui/skeleton";

const BaseMap = dynamic(() => import("@/components/map/base-map"), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

export interface ProjectMapLand {
    landId: string;
    landName: string;
    areaText: string;
    cropText: string;
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
}

interface ProjectLandsMapProps {
    lands: ProjectMapLand[];
    selectedLandId: string | null;
    groupId: string;
    onSelect: (landId: string) => void;
    onViewDetail: (landId: string) => void;
}

const SOURCE_ID = "project-lands";
const FILL_ID = "project-lands-fill";
const LINE_ID = "project-lands-line";
const SELECTED_FILL_ID = "project-lands-selected-fill";
const SELECTED_LINE_ID = "project-lands-selected-line";

function toFeatureCollection(lands: ProjectMapLand[]): GeoJSON.FeatureCollection {
    return {
        type: "FeatureCollection",
        features: lands
            .filter((land) => land.geometry)
            .map((land) => ({
                type: "Feature",
                properties: {
                    landId: land.landId,
                    landName: land.landName,
                    areaText: land.areaText,
                    cropText: land.cropText,
                },
                geometry: land.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
            })),
    };
}

function ensureLayers(map: maplibregl.Map) {
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });

    const fill = tokenColor("--primary", 0.28);
    const fillSelected = tokenColor("--primary", 0.5);
    const line = tokenColor("--primary");

    map.addLayer({
        id: FILL_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: { "fill-color": fill, "fill-opacity": 1 },
    });
    map.addLayer({
        id: LINE_ID,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": line, "line-width": 1.6 },
    });
    map.addLayer({
        id: SELECTED_FILL_ID,
        type: "fill",
        source: SOURCE_ID,
        filter: ["==", ["get", "landId"], ""],
        paint: { "fill-color": fillSelected, "fill-opacity": 1 },
    });
    map.addLayer({
        id: SELECTED_LINE_ID,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "landId"], ""],
        paint: { "line-color": "#fff", "line-width": 2.4 },
    });
}

export default function ProjectLandsMap({
    lands,
    selectedLandId,
    groupId,
    onSelect,
    onViewDetail,
}: ProjectLandsMapProps) {
    const mapRef = useRef<maplibregl.Map | null>(null);
    const popupRef = useRef<maplibregl.Popup | null>(null);
    const landsRef = useRef(lands);
    const onSelectRef = useRef(onSelect);
    const onViewDetailRef = useRef(onViewDetail);
    const fittedKeyRef = useRef("");

    useEffect(() => { landsRef.current = lands; }, [lands]);
    useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
    useEffect(() => { onViewDetailRef.current = onViewDetail; }, [onViewDetail]);

    const showPopup = useCallback((land: ProjectMapLand, lngLat: maplibregl.LngLatLike) => {
        const map = mapRef.current;
        if (!map) return;
        if (!popupRef.current) {
            popupRef.current = new maplibregl.Popup({
                closeButton: true,
                closeOnClick: false,
                maxWidth: "260px",
                offset: 8,
            });
        }
        const root = document.createElement("div");
        root.className = "space-y-1.5 p-0.5";
        const title = document.createElement("p");
        title.className = "text-sm font-semibold text-foreground";
        title.textContent = land.landName;
        const meta = document.createElement("p");
        meta.className = "text-xs text-muted-foreground";
        meta.textContent = [land.areaText, land.cropText].filter(Boolean).join(" · ");
        const button = document.createElement("a");
        button.href = `/farms/fields/detail/?groupId=${encodeURIComponent(groupId)}&fieldId=${encodeURIComponent(land.landId)}`;
        button.className = "mt-1 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground";
        button.textContent = "查看地块详情";
        root.append(title, meta, button);
        popupRef.current.setLngLat(lngLat).setDOMContent(root).addTo(map);
    }, [groupId]);

    const handleMapReady = useCallback((map: maplibregl.Map) => {
        mapRef.current = map;
        ensureLayers(map);
        const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        source?.setData(toFeatureCollection(landsRef.current));
        const bounds = boundsFromGeometries(landsRef.current.map((land) => land.geometry));
        if (bounds) {
            map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 0 });
            fittedKeyRef.current = landsRef.current.map((land) => land.landId).join(",");
        }

        const onEnter = () => { map.getCanvas().style.cursor = "pointer"; };
        const onLeave = () => { map.getCanvas().style.cursor = ""; };
        const onClick = (event: maplibregl.MapLayerMouseEvent) => {
            const landId = String(event.features?.[0]?.properties?.landId || "");
            if (!landId) return;
            onSelectRef.current(landId);
            const land = landsRef.current.find((item) => item.landId === landId);
            if (land) showPopup(land, event.lngLat);
        };

        map.on("mouseenter", FILL_ID, onEnter);
        map.on("mouseleave", FILL_ID, onLeave);
        map.on("click", FILL_ID, onClick);
    }, [showPopup]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map?.getSource(SOURCE_ID)) return;
        const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
        source.setData(toFeatureCollection(lands));

        const key = lands.map((land) => land.landId).join(",");
        if (key && key !== fittedKeyRef.current) {
            const bounds = boundsFromGeometries(lands.map((land) => land.geometry));
            if (bounds) {
                map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 700 });
                fittedKeyRef.current = key;
            }
        }
    }, [lands]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map?.getLayer(SELECTED_FILL_ID)) return;
        const filter: maplibregl.FilterSpecification = selectedLandId
            ? ["==", ["get", "landId"], selectedLandId]
            : ["==", ["get", "landId"], ""];
        map.setFilter(SELECTED_FILL_ID, filter);
        map.setFilter(SELECTED_LINE_ID, filter);

        if (!selectedLandId) {
            popupRef.current?.remove();
            return;
        }
        const land = lands.find((item) => item.landId === selectedLandId);
        if (!land?.geometry) {
            popupRef.current?.remove();
            return;
        }
        const bounds = boundsFromGeometries([land.geometry]);
        if (!bounds) return;
        map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 500 });
        const center: [number, number] = [
            (bounds[0][0] + bounds[1][0]) / 2,
            (bounds[0][1] + bounds[1][1]) / 2,
        ];
        showPopup(land, center);
    }, [selectedLandId, lands, showPopup]);

    useEffect(() => () => {
        popupRef.current?.remove();
        popupRef.current = null;
        mapRef.current = null;
    }, []);

    return (
        <BaseMap
            className="h-full w-full"
            center={[105.0, 35.0]}
            zoom={4}
            onMapReady={handleMapReady}
        />
    );
}
