import { haToMu } from "@/lib/area";

/** 与后端自动任务保持一致：超过 5000 亩的地块不允许触发拉取。 */
export const MAX_SCHEDULE_LAND_AREA_MU = 5_000;

export function resolveLandAreaMu(
    landAreaMu: number | null | undefined,
    areaHa: number | null | undefined,
): number | null {
    if (landAreaMu != null && Number.isFinite(Number(landAreaMu))) {
        return Number(landAreaMu);
    }
    if (areaHa != null && Number.isFinite(Number(areaHa))) {
        return haToMu(Number(areaHa));
    }
    return null;
}

export function isOversizedLand(areaMu: number | null | undefined): boolean {
    return areaMu != null && Number.isFinite(Number(areaMu)) && Number(areaMu) > MAX_SCHEDULE_LAND_AREA_MU;
}

export function formatLandAreaMu(areaMu: number | null | undefined): string {
    if (areaMu == null || !Number.isFinite(Number(areaMu))) return "—";
    return Math.round(Number(areaMu)).toLocaleString();
}
