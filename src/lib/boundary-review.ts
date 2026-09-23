import * as turf from "@turf/turf";
import type maplibregl from "maplibre-gl";

export interface BoundaryMapReview {
    status: "checked" | "unavailable";
    buildingCount: number;
    residentialOverlap: boolean;
}

/**
 * 检查已加载的 OSM PMTiles 建筑和居民区要素是否与地块相交。
 * 只把命中的矢量要素作为复核线索；没有要素不代表现场一定没有房屋。
 */
export function inspectBoundaryMap(
    map: maplibregl.Map,
    geometry: GeoJSON.Geometry,
): BoundaryMapReview {
    const unavailable: BoundaryMapReview = {
        status: "unavailable",
        buildingCount: 0,
        residentialOverlap: false,
    };
    const source = map.getSource("protomaps");
    if (
        !map.isStyleLoaded()
        || !source
        || source.type !== "vector"
        || !map.getLayer("buildings")
        || !map.isSourceLoaded("protomaps")
        || map.getZoom() < 13
    ) {
        return unavailable;
    }

    const boundary = {
        type: "Feature",
        properties: {},
        geometry,
    } as GeoJSON.Feature;
    const [west, south, east, north] = turf.bbox(boundary);
    const view = map.getBounds();
    if (
        west < view.getWest()
        || east > view.getEast()
        || south < view.getSouth()
        || north > view.getNorth()
    ) {
        return unavailable;
    }

    const intersectingBuildings = new Set<string>();
    for (const candidate of map.querySourceFeatures("protomaps", { sourceLayer: "buildings" })) {
        if (!candidate.geometry) continue;
        try {
            if (!turf.booleanIntersects(boundary, candidate as unknown as GeoJSON.Feature)) continue;
        } catch {
            continue;
        }
        const properties = candidate.properties ?? {};
        const identity = candidate.id ?? properties.osm_id ?? properties.id ?? JSON.stringify(candidate.geometry);
        intersectingBuildings.add(String(identity));
    }

    let residentialOverlap = false;
    for (const candidate of map.querySourceFeatures("protomaps", { sourceLayer: "landuse" })) {
        if (!candidate.geometry) continue;
        const properties = candidate.properties ?? {};
        const kind = String(properties["pmap:kind"] ?? properties.kind ?? "").toLowerCase();
        const landuse = String(properties.landuse ?? "").toLowerCase();
        if (kind !== "residential" && kind !== "residential_area" && landuse !== "residential") {
            continue;
        }
        try {
            if (turf.booleanIntersects(boundary, candidate as unknown as GeoJSON.Feature)) {
                residentialOverlap = true;
                break;
            }
        } catch {
            continue;
        }
    }

    return {
        status: "checked",
        buildingCount: intersectingBuildings.size,
        residentialOverlap,
    };
}
