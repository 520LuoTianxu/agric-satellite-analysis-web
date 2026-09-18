/**
 * 乡合种植项目 / 地块接口。
 * 本地 next dev 经 /agric-api 反代到正式网关；测试静态构建开启直连时由浏览器直接访问正式网关。
 */
import { AuthApiError } from "@/lib/auth/types";
import { AUTH_KEYS, getItem } from "@/lib/auth/storage";
import { resolveGatewayUrl } from "@/lib/api-origin";

const AUTH_EXPIRED_CODES = new Set<string | number>([
    401,
    "403",
    "027003025",
    266,
    "026001001",
    "027004017",
    "027004006",
    "027004007",
    "027004008",
    "027004014",
]);

export const SIGN_STATUS_OPTIONS = [
    { value: "1", label: "待提交" },
    { value: "2", label: "审批中" },
    { value: "3", label: "待签约" },
    { value: "4", label: "已签约" },
    { value: "5", label: "已拒绝" },
] as const;

export const GROUP_STATUS_OPTIONS = [
    { value: "0", label: "启用" },
    { value: "1", label: "停用" },
] as const;

export const SIGN_STATUS_LABEL: Record<string, string> = Object.fromEntries(
    SIGN_STATUS_OPTIONS.map((item) => [item.value, item.label]),
);

export interface AgricEnvelope<T = unknown> {
    code?: number | string;
    state?: number | string;
    success?: boolean;
    msg?: string;
    message?: string;
    issue?: string;
    errorMsg?: string;
    data?: T;
    rows?: unknown[];
    total?: number;
    [key: string]: unknown;
}

export interface AgricDictItem {
    dictLabel?: string;
    dictValue?: string;
    cssClass?: string | null;
    remark?: string | null;
}

export type SatelliteTileRange = [number, number, number, number];

export interface SatelliteTileCoverage {
    /** map_new_data_range：管理端优先使用的 ghr 高清影像范围。 */
    ghr: Record<string, SatelliteTileRange[]>;
    /** map_new_data_area：山东更新影像范围。 */
    map2025Shandong: Record<string, SatelliteTileRange[]>;
}

export interface AgricGroup {
    groupId: number | string;
    groupName?: string;
    groupCode?: string;
    ownerName?: string;
    ownerPhone?: string;
    status?: number | string;
    signStatus?: number | string;
    signStatusName?: string;
    plantingType?: number | string;
    businessCategory?: string;
    groupArea?: number | string;
    effectiveArea?: number | string;
    confirmArea?: number | string;
    groupNum?: number | string;
    createTime?: string;
    remark?: string;
    [key: string]: unknown;
}

export interface AgricLand {
    landId: number | string;
    landName?: string;
    landArea?: number | string;
    cropName?: string;
    varietyName?: string;
    cropStatus?: string | number;
    cropStatusName?: string;
    soilPropertyName?: string;
    landTypeName?: string;
    ownerName?: string;
    wgsLandPath?: string;
    landPath?: string;
    [key: string]: unknown;
}

export interface AgricPage<T> {
    rows: T[];
    total: number;
}

export interface PlantingTypeOption {
    value: string;
    label: string;
}

export interface PlantingTypeDict {
    options: PlantingTypeOption[];
    labelByValue: Record<string, string>;
    categoriesByType: Record<string, PlantingTypeOption[]>;
}

export interface GroupListQuery {
    pageNum?: number;
    pageSize?: number;
    groupName?: string;
    groupCode?: string;
    ownerName?: string;
    ownerPhone?: string;
    status?: string;
    signStatus?: string;
    plantingType?: string;
    businessCategory?: string;
}

function agricHeaders(): Record<string, string> {
    const villageToken = getItem(AUTH_KEYS.agricAdminToken);
    const baseId = getItem(AUTH_KEYS.activeBaseId) || "-1";
    return {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json, text/plain, */*",
        "Source-Channel": "WEB",
        "Hr-Base-Id": baseId,
        ...(villageToken ? { Authorization: `Bearer ${villageToken.replace(/^Bearer\s+/i, "")}` } : {}),
    };
}

async function readBody(res: Response): Promise<AgricEnvelope> {
    const text = await res.text();
    if (!text) return {};
    try {
        return JSON.parse(text) as AgricEnvelope;
    } catch {
        throw new AuthApiError(text || res.statusText, res.status);
    }
}

function unwrapEnvelope<T>(body: AgricEnvelope<T>, fallbackMessage: string): T {
    const code = body.code ?? body.state ?? 200;
    const message =
        body.msg || body.message || body.issue || body.errorMsg || fallbackMessage;
    if (AUTH_EXPIRED_CODES.has(code) || AUTH_EXPIRED_CODES.has(String(code))) {
        throw new AuthApiError(message, code);
    }
    if (body.success === false) {
        throw new AuthApiError(message, code);
    }
    if (code !== 200 && code !== "200" && code !== 0 && code !== "0") {
        throw new AuthApiError(message, code);
    }
    return (body.data ?? body) as T;
}

async function agricRequest<T>(
    path: string,
    init: RequestInit = {},
    timeoutMs = 30000,
): Promise<{ body: AgricEnvelope<T>; data: T }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    if (init.signal) {
        if (init.signal.aborted) controller.abort();
        else init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
        const res = await fetch(resolveGatewayUrl(`/agric-api${path}`, "business"), {
            ...init,
            signal: controller.signal,
            headers: {
                ...agricHeaders(),
                ...(init.headers as Record<string, string> | undefined),
            },
        });
        const body = await readBody(res);
        if (!res.ok && body.code == null && body.state == null && body.success == null) {
            throw new AuthApiError(body.msg || body.message || res.statusText, res.status);
        }
        return { body: body as AgricEnvelope<T>, data: unwrapEnvelope<T>(body as AgricEnvelope<T>, "请求失败") };
    } catch (error) {
        if (error instanceof AuthApiError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new AuthApiError("请求超时，请稍后重试", "TIMEOUT");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function toQuery(params: Record<string, string | number | undefined | null>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `?${text}` : "";
}

function pageFrom(body: AgricEnvelope, fallbackRows: unknown[] = []): AgricPage<never> {
    const rows = Array.isArray(body.rows)
        ? body.rows
        : Array.isArray((body.data as { rows?: unknown[] } | undefined)?.rows)
            ? ((body.data as { rows: unknown[] }).rows)
            : Array.isArray(body.data)
                ? body.data
                : fallbackRows;
    const totalRaw = body.total ?? (body.data as { total?: number } | undefined)?.total ?? rows.length;
    return { rows: rows as never[], total: Number(totalRaw) || 0 };
}

export function formatMu(value: number | string | null | undefined, digits = 2): string {
    if (value === undefined || value === null || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(digits)} 亩`;
}

export function groupStatusLabel(status: number | string | null | undefined): string {
    if (status === 1 || status === "1") return "停用";
    if (status === 0 || status === "0") return "启用";
    return "—";
}

export function signStatusLabel(group: Pick<AgricGroup, "signStatus" | "signStatusName">): string {
    if (group.signStatusName) return String(group.signStatusName);
    if (group.signStatus == null || group.signStatus === "") return "—";
    return SIGN_STATUS_LABEL[String(group.signStatus)] || "—";
}

export function plantingTypeLabel(
    value: number | string | null | undefined,
    labelByValue: Record<string, string>,
): string {
    if (value == null || value === "") return "—";
    return labelByValue[String(value)] || "—";
}

export async function listPlantingGroups(query: GroupListQuery = {}): Promise<AgricPage<AgricGroup>> {
    const { body } = await agricRequest<AgricGroup[]>(
        `/agriculture/group/list${toQuery({
            pageNum: query.pageNum ?? 1,
            pageSize: query.pageSize ?? 20,
            groupName: query.groupName,
            groupCode: query.groupCode,
            ownerName: query.ownerName,
            ownerPhone: query.ownerPhone,
            status: query.status,
            signStatus: query.signStatus,
            plantingType: query.plantingType,
            businessCategory: query.businessCategory,
        })}`,
        { method: "POST", body: "{}" },
    );
    const page = pageFrom(body);
    return { rows: page.rows as AgricGroup[], total: page.total };
}

export async function getPlantingGroup(groupId: string | number): Promise<AgricGroup> {
    const { data, body } = await agricRequest<AgricGroup>(
        `/agriculture/group/detail${toQuery({ groupId })}`,
        { method: "GET" },
    );
    if (data && typeof data === "object" && ("groupId" in data || "groupName" in data)) {
        return data;
    }
    const nested = (body.data || data) as AgricGroup;
    return nested;
}

export async function listCropLands(params: {
    groupId: string | number;
    pageNum?: number;
    pageSize?: number;
    landName?: string;
}): Promise<AgricPage<AgricLand>> {
    const { body } = await agricRequest<AgricLand[]>(
        `/agriculture/land/cropLandList${toQuery({
            groupId: params.groupId,
            pageNum: params.pageNum ?? 1,
            pageSize: params.pageSize ?? 200,
            landName: params.landName,
        })}`,
        { method: "GET" },
    );
    const page = pageFrom(body);
    return { rows: page.rows as AgricLand[], total: page.total };
}

export async function listAllCropLands(groupId: string | number): Promise<AgricLand[]> {
    const pageSize = 200;
    const all: AgricLand[] = [];
    const seen = new Set<string>();
    let pageNum = 1;
    // 项目统计必须读取完整业务名单；接口截短或重复分页时明确失败，不能展示部分总数。
    while (true) {
        const page = await listCropLands({ groupId, pageNum, pageSize });
        const previousCount = all.length;
        for (const land of page.rows) {
            const id = String(land.landId);
            if (!seen.has(id)) {
                seen.add(id);
                all.push(land);
            }
        }
        if (all.length >= page.total) break;
        if (all.length === previousCount) {
            throw new Error("Incomplete project land list");
        }
        pageNum += 1;
    }
    return all;
}

export async function getPlantingTypeDict(): Promise<PlantingTypeDict> {
    const { data } = await agricRequest<AgricDictItem[]>(
        "/system/dict/data/type/land_manage_model",
        { method: "GET" },
    );
    const rows = Array.isArray(data) ? data : [];
    const baseId = getItem(AUTH_KEYS.activeBaseId) || "-1";
    const dictList = rows.filter(
        (item) => item.cssClass == null || (item.cssClass && String(item.cssClass).includes(String(baseId))),
    );

    const labelByValue: Record<string, string> = {};
    const categoriesByType: Record<string, PlantingTypeOption[]> = {};
    const options: PlantingTypeOption[] = [];

    for (const item of dictList) {
        const value = String(item.dictValue ?? "");
        const label = String(item.dictLabel ?? value);
        if (!value) continue;
        labelByValue[value] = label;
        options.push({ value, label });
        categoriesByType[value] = [];
        if (!item.remark) continue;
        try {
            const remarkData = JSON.parse(item.remark);
            const categories = Array.isArray(remarkData)
                ? (remarkData.find((entry: { enterpriseId?: string | number }) =>
                    String(entry.enterpriseId ?? "").includes(String(baseId)),
                )?.categories || [])
                : (remarkData.categories || []);
            categoriesByType[value] = (categories as { label?: string }[])
                .map((cat) => String(cat.label || ""))
                .filter(Boolean)
                .map((catLabel) => ({ value: catLabel, label: catLabel }));
        } catch {
            categoriesByType[value] = [];
        }
    }

    return { options, labelByValue, categoriesByType };
}

function parseSatelliteTileRanges(items: AgricDictItem[]): Record<string, SatelliteTileRange[]> {
    const ranges: Record<string, SatelliteTileRange[]> = {};
    for (const item of items) {
        const level = String(item.dictLabel ?? "").trim();
        if (!level || !item.dictValue) continue;
        try {
            const value = JSON.parse(item.dictValue) as unknown;
            if (!Array.isArray(value)) continue;
            const validRanges = value.filter((range): range is SatelliteTileRange =>
                Array.isArray(range) && range.length >= 4 && range.slice(0, 4).every((part) => Number.isFinite(Number(part))),
            ).map((range) => [
                Number(range[0]), Number(range[1]), Number(range[2]), Number(range[3]),
            ] as SatelliteTileRange);
            if (validRanges.length) ranges[level] = validRanges;
        } catch {
            // 单条字典配置损坏时忽略该级别，不能让整张地图停止加载。
        }
    }
    return ranges;
}

let satelliteTileCoveragePromise: Promise<SatelliteTileCoverage> | null = null;

/**
 * 读取 agric-admin 的卫星瓦片范围字典。
 * 管理端按 XYZ 范围选择 ghr / Map2025Shandong / uat，避免把“无卫星图”占位瓦片覆盖到高德底图上。
 */
export function getSatelliteTileCoverage(): Promise<SatelliteTileCoverage> {
    if (!satelliteTileCoveragePromise) {
        satelliteTileCoveragePromise = Promise.all([
            agricRequest<AgricDictItem[]>("/system/dict/data/type/map_new_data_range", { method: "GET" }),
            agricRequest<AgricDictItem[]>("/system/dict/data/type/map_new_data_area", { method: "GET" }),
        ]).then(([newData, map2025]) => ({
            ghr: parseSatelliteTileRanges(Array.isArray(newData.data) ? newData.data : []),
            map2025Shandong: parseSatelliteTileRanges(Array.isArray(map2025.data) ? map2025.data : []),
        }));
    }
    return satelliteTileCoveragePromise;
}
