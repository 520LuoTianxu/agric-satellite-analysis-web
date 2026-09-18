import type { AgricLand } from "@/lib/agric";
import type { ProjectDataStatus, ProjectLandMonitoring, ProjectRiskLevel } from "@/lib/api";
import { wgs84GeometryToGcj02 } from "@/lib/coordinate-transform";
import { boundsFromGeometry, landPathToPolygon } from "@/lib/land-path";

export type DataState = ProjectDataStatus | "unavailable";
export type ProjectFocus = "all" | "risk" | "pending" | "unmarked";

export interface ProjectLand {
    landId: string;
    landName: string;
    areaMu: number | null;
    cropName: string;
    cropText: string;
    cropStatus: string;
    ownerName: string;
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
    riskLevel: ProjectRiskLevel;
    dataStatus: DataState;
    monitoring: ProjectLandMonitoring | null;
}

export interface ProjectFilters {
    query: string;
    risk: ProjectRiskLevel | "all";
    crop: string;
    data: DataState | "all";
    planting: string;
    focus: ProjectFocus;
}

export const EMPTY_PROJECT_FILTERS: ProjectFilters = {
    query: "", risk: "all", crop: "", data: "all", planting: "", focus: "all",
};

export const RISK_ORDER: Record<ProjectRiskLevel, number> = {
    high: 0, medium: 1, low: 2, unknown: 3, normal: 4,
};

export const RISK_TOKENS: Record<ProjectRiskLevel, string> = {
    high: "--sev-high", medium: "--sev-medium", low: "--sev-low",
    normal: "--success", unknown: "--muted-foreground",
};

export const RISK_CLASSES: Record<ProjectRiskLevel, string> = {
    high: "text-sev-high", medium: "text-sev-medium", low: "text-sev-low",
    normal: "text-success", unknown: "text-muted-foreground",
};

function areaNumber(value: unknown): number | null {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

function polygon(value: GeoJSON.Geometry | null | undefined): ProjectLand["geometry"] {
    if (!value || (value.type !== "Polygon" && value.type !== "MultiPolygon")) return null;
    const polygons = value.type === "Polygon" ? [value.coordinates] : value.coordinates;
    // 错误边界不能送入地图使整层渲染失败；仍在列表中作为未标绘地块展示。
    if (!Array.isArray(polygons) || !polygons.length || polygons.some((rings) =>
        !Array.isArray(rings) || !rings.length || rings.some((ring) =>
            !Array.isArray(ring) || ring.length < 4 || ring.some((point) =>
                !Array.isArray(point) || point.length < 2
                || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
                || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90,
            ) || ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1],
        ),
    )) return null;
    const bounds = boundsFromGeometry(value);
    if (!bounds || !bounds.flat().every(Number.isFinite)
        || bounds[0][0] === bounds[1][0] || bounds[0][1] === bounds[1][1]) return null;
    return value;
}

/** 当前业务名单决定项目归属；遥感库只补充监测与边界，避免计入已移出项目的地块。 */
export function mergeProjectLands(
    businessLands: AgricLand[],
    monitoring: ProjectLandMonitoring[] | null,
): ProjectLand[] {
    const byId = new Map(monitoring?.map((item) => [item.land_id, item]));
    const uniqueLands = new Map(businessLands.map((land) => [String(land.landId), land]));
    return Array.from(uniqueLands, ([landId, land]) => {
        const satellite = byId.get(landId) ?? null;
        const cropName = land.cropName || satellite?.crop_type || "";
        // 高德底图是 GCJ-02；wgsLandPath 是数据库统一保存的 WGS84，只在展示层转换。
        // 旧接口仅返回 landPath 时沿用参考管理端的高德坐标，不重复转换。
        const businessGeometry = land.wgsLandPath
            ? wgs84GeometryToGcj02(landPathToPolygon(land.wgsLandPath))
            : landPathToPolygon(land.landPath);
        const monitoringGeometry = wgs84GeometryToGcj02(satellite?.boundary_geojson);
        return {
            landId,
            landName: land.landName || satellite?.land_name || landId,
            areaMu: areaNumber(land.landArea) ?? areaNumber(satellite?.area_mu),
            cropName,
            cropText: [cropName, land.varietyName].filter(Boolean).join(" · "),
            cropStatus: land.cropStatusName || "",
            ownerName: land.ownerName || "",
            geometry: polygon(businessGeometry) || polygon(monitoringGeometry),
            riskLevel: satellite?.risk_level ?? "unknown",
            dataStatus: monitoring === null ? "unavailable" : satellite?.data_status ?? "missing",
            monitoring: satellite,
        };
    });
}

export function hasProjectRisk(land: ProjectLand): boolean {
    return land.riskLevel === "high" || land.riskLevel === "medium" || land.riskLevel === "low";
}

/** 卡片、列表与地图共用同一集合，筛选与去重口径不能各算一套。 */
export function filterProjectLands(lands: ProjectLand[], filters: ProjectFilters): ProjectLand[] {
    const query = filters.query.trim().toLocaleLowerCase();
    return lands.filter((land) => {
        if (query && ![land.landName, land.landId, land.cropText, land.ownerName]
            .some((value) => value.toLocaleLowerCase().includes(query))) return false;
        if (filters.risk !== "all" && land.riskLevel !== filters.risk) return false;
        if (filters.crop && land.cropName !== filters.crop) return false;
        if (filters.planting && land.cropStatus !== filters.planting) return false;
        if (filters.data !== "all" && land.dataStatus !== filters.data) return false;
        if (filters.focus === "risk" && !hasProjectRisk(land)) return false;
        if (filters.focus === "pending" && !land.monitoring?.open_alert_count) return false;
        if (filters.focus === "unmarked" && land.geometry) return false;
        return true;
    }).sort((a, b) =>
        RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel]
        || (b.monitoring?.open_alert_count ?? 0) - (a.monitoring?.open_alert_count ?? 0)
        || (b.areaMu ?? 0) - (a.areaMu ?? 0)
        || a.landId.localeCompare(b.landId),
    );
}

export function summarizeProjectLands(lands: ProjectLand[]) {
    let areaMu = 0, missingArea = 0, unmarked = 0, freshCount = 0, freshAreaMu = 0;
    let riskCount = 0, riskAreaMu = 0, riskMissingArea = 0, openAlerts = 0, openHigh = 0;
    const risks: Record<ProjectRiskLevel, number> = { high: 0, medium: 0, low: 0, normal: 0, unknown: 0 };
    for (const land of lands) {
        if (land.areaMu === null) missingArea += 1;
        areaMu += land.areaMu ?? 0;
        if (!land.geometry) unmarked += 1;
        if (land.dataStatus === "fresh") {
            freshCount += 1;
            freshAreaMu += land.areaMu ?? 0;
        }
        risks[land.riskLevel] += 1;
        if (hasProjectRisk(land)) {
            riskCount += 1;
            riskAreaMu += land.areaMu ?? 0;
            if (land.areaMu === null) riskMissingArea += 1;
        }
        openAlerts += land.monitoring?.open_alert_count ?? 0;
        openHigh += land.monitoring?.open_high_count ?? 0;
    }
    // 面积缺失或分母为零时不制造覆盖百分比；数量口径仍可完整展示。
    const areaComplete = missingArea === 0 && areaMu > 0;
    return {
        count: lands.length, areaMu, missingArea, unmarked, freshCount, freshAreaMu,
        coverage: areaComplete ? freshAreaMu / areaMu * 100 : null,
        riskCount, riskAreaMu, riskMissingArea,
        riskAreaPercent: areaComplete ? riskAreaMu / areaMu * 100 : null,
        openAlerts, openHigh, risks,
    };
}
