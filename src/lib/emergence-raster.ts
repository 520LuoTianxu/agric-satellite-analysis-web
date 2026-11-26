/**
 * Paint the emergence map resource onto the same WebMercator film the
 * field page already uses. Colors come from increment or rise class.
 * Scene NDVI and the 0.30 reference are not inputs.
 */

import type { AgriHeatmapImage, AgriHeatmapLegend } from "@/lib/agri-heatmap";
import { rasterizePrecoloredLonLat } from "@/lib/agri-heatmap";
import {
    EMERGENCE_CLASS_STYLE,
    EMERGENCE_INCREMENT_GRADIENT,
    EMERGENCE_INCREMENT_RANGE,
    colorizeIncrement,
    colorizeRiseClass,
    type EmergenceMapLayer,
    type EmergenceMapView,
} from "@/lib/emergence";

function classCounts(layer: EmergenceMapLayer): { key: string; color: string; count?: number }[] {
    const tallies = new Map<string, number>();
    if (layer.class_counts) {
        for (const [key, count] of Object.entries(layer.class_counts)) {
            tallies.set(String(key), count);
        }
    } else {
        for (const pixel of layer.pixels) {
            if (pixel.rise_class == null) continue;
            const key = String(pixel.rise_class);
            tallies.set(key, (tallies.get(key) ?? 0) + 1);
        }
    }
    return [0, 1, 2, 3, 4].map((cls) => ({
        key: String(cls),
        color: EMERGENCE_CLASS_STYLE[cls]!.color,
        count: tallies.get(String(cls)),
    }));
}

export function rasterizeEmergenceLayer(
    layer: EmergenceMapLayer,
    view: EmergenceMapView,
    fieldGeom?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): AgriHeatmapImage | null {
    const samples: {
        lon: number;
        lat: number;
        value: number;
        rgba: [number, number, number, number];
        class?: string;
    }[] = [];

    for (const pixel of layer.pixels) {
        if (view === "class") {
            if (pixel.rise_class == null) continue;
            const rgba = colorizeRiseClass(pixel.rise_class);
            if (!rgba) continue;
            samples.push({
                lon: pixel.lon,
                lat: pixel.lat,
                value: pixel.increment ?? pixel.rise_class,
                rgba,
                class: String(pixel.rise_class),
            });
            continue;
        }
        if (pixel.increment == null) continue;
        samples.push({
            lon: pixel.lon,
            lat: pixel.lat,
            value: pixel.increment,
            rgba: colorizeIncrement(pixel.increment),
        });
    }

    const [min, max] = EMERGENCE_INCREMENT_RANGE;
    const legend: AgriHeatmapLegend = {
        kind: "emergence",
        label: view === "class" ? "持续抬升分组" : "相对本底增量",
        view,
        min,
        max,
        gradient: EMERGENCE_INCREMENT_GRADIENT,
        classes: classCounts(layer),
        incrementMedian: layer.increment_median,
    };

    return rasterizePrecoloredLonLat(samples, {
        index: "emergence",
        legend,
        fieldGeom,
    });
}
