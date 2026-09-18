/**
 * 中国地图常用坐标转换工具。
 *
 * 数据库中的地块边界统一保存 WGS84；高德底图使用 GCJ-02，只有在地图
 * 展示或编辑时转换，避免把偏移后的坐标写回业务数据。
 */

const PI = Math.PI;
const AXIS = 6378245.0;
const EE = 0.00669342162296594323;

type CoordinateTransform = (longitude: number, latitude: number) => [number, number];

function isOutsideChina(longitude: number, latitude: number): boolean {
    return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(x: number, y: number): number {
    let value = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    value += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    value += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    value += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return value;
}

function transformLongitude(x: number, y: number): number {
    let value = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    value += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    value += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    value += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return value;
}

/** WGS84 转高德使用的 GCJ-02；中国境外坐标保持不变。 */
export function wgs84ToGcj02(longitude: number, latitude: number): [number, number] {
    if (isOutsideChina(longitude, latitude)) return [longitude, latitude];

    const deltaLatitude = transformLatitude(longitude - 105.0, latitude - 35.0);
    const deltaLongitude = transformLongitude(longitude - 105.0, latitude - 35.0);
    const radiansLatitude = latitude / 180.0 * PI;
    const magic = 1 - EE * Math.sin(radiansLatitude) ** 2;
    const sqrtMagic = Math.sqrt(magic);
    const latitudeOffset = deltaLatitude * 180.0 / ((AXIS * (1 - EE)) / (magic * sqrtMagic) * PI);
    const longitudeOffset = deltaLongitude * 180.0 / (AXIS / sqrtMagic * Math.cos(radiansLatitude) * PI);
    return [longitude + longitudeOffset, latitude + latitudeOffset];
}

/** GCJ-02 近似反算 WGS84；编辑提交前使用，误差通常小于米级。 */
export function gcj02ToWgs84(longitude: number, latitude: number): [number, number] {
    if (isOutsideChina(longitude, latitude)) return [longitude, latitude];

    let estimate: [number, number] = [longitude, latitude];
    // 迭代反算比直接减一次偏移更稳定，避免地块边界保存后逐次漂移。
    for (let index = 0; index < 3; index += 1) {
        const converted = wgs84ToGcj02(estimate[0], estimate[1]);
        estimate = [
            estimate[0] - (converted[0] - longitude),
            estimate[1] - (converted[1] - latitude),
        ];
    }
    return estimate;
}

function transformCoordinates(value: unknown, transform: CoordinateTransform): unknown {
    if (!Array.isArray(value)) return value;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
        const [longitude, latitude] = transform(value[0], value[1]);
        return [longitude, latitude, ...value.slice(2)];
    }
    return value.map((item) => transformCoordinates(item, transform));
}

function transformGeometry(geometry: GeoJSON.Geometry | null | undefined, transform: CoordinateTransform): GeoJSON.Geometry | null {
    if (!geometry) return null;
    if (geometry.type === "GeometryCollection") {
        return {
            ...geometry,
            geometries: geometry.geometries.map((item) => transformGeometry(item, transform) as GeoJSON.Geometry),
        };
    }
    const coordinateGeometry = geometry as Exclude<GeoJSON.Geometry, GeoJSON.GeometryCollection>;
    return {
        ...coordinateGeometry,
        coordinates: transformCoordinates(coordinateGeometry.coordinates, transform),
    } as GeoJSON.Geometry;
}

/** 将业务侧的 WGS84 GeoJSON 转成高德底图可直接叠加的 GCJ-02 GeoJSON。 */
export function wgs84GeometryToGcj02(geometry: GeoJSON.Geometry | null | undefined): GeoJSON.Geometry | null {
    return transformGeometry(geometry, wgs84ToGcj02);
}

/** 将地图编辑得到的 GCJ-02 GeoJSON 转回数据库统一保存的 WGS84。 */
export function gcj02GeometryToWgs84(geometry: GeoJSON.Geometry | null | undefined): GeoJSON.Geometry | null {
    return transformGeometry(geometry, gcj02ToWgs84);
}
