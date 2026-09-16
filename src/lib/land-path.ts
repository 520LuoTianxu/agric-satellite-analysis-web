/** Convert agric `wgsLandPath` / `landPath` (`lng,lat|lng,lat|...`) to GeoJSON. */

function closeRing(ring: [number, number][]): [number, number][] {
    if (ring.length < 3) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        return [...ring, first];
    }
    return ring;
}

export function landPathToPolygon(path: string | null | undefined): GeoJSON.Polygon | null {
    if (!path || !path.trim()) return null;
    const ring = path
        .split("|")
        .map((pair) => pair.split(",").map(Number))
        .filter((pair): pair is [number, number] =>
            pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]),
        );
    if (ring.length < 3) return null;
    return {
        type: "Polygon",
        coordinates: [closeRing(ring)],
    };
}

export function boundsFromGeometry(geometry: GeoJSON.Geometry): [[number, number], [number, number]] | null {
    const coords: [number, number][] = [];
    const walk = (value: unknown) => {
        if (!Array.isArray(value)) return;
        if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
            coords.push([value[0], value[1]]);
            return;
        }
        value.forEach(walk);
    };
    walk((geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
    if (!coords.length) return null;
    let minLng = coords[0][0];
    let minLat = coords[0][1];
    let maxLng = coords[0][0];
    let maxLat = coords[0][1];
    for (const [lng, lat] of coords) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
    }
    return [[minLng, minLat], [maxLng, maxLat]];
}

export function boundsFromGeometries(
    geometries: Array<GeoJSON.Geometry | null | undefined>,
): [[number, number], [number, number]] | null {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    let found = false;
    for (const geometry of geometries) {
        if (!geometry) continue;
        const bounds = boundsFromGeometry(geometry);
        if (!bounds) continue;
        found = true;
        minLng = Math.min(minLng, bounds[0][0]);
        minLat = Math.min(minLat, bounds[0][1]);
        maxLng = Math.max(maxLng, bounds[1][0]);
        maxLat = Math.max(maxLat, bounds[1][1]);
    }
    if (!found) return null;
    return [[minLng, minLat], [maxLng, maxLat]];
}
