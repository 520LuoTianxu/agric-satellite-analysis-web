import { AuthApiError, type JointLoginData, type JointV2LoginParams, type MachineLoginInfo } from "./types";
import { getBmsToken, getItem, AUTH_KEYS } from "./storage";

const SELLER_BASIC = "Basic c2VsbGVyOnNlbGxlcg==";

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

interface AuthEnvelope<T> {
    code?: number | string;
    state?: number | string;
    success?: boolean;
    msg?: string;
    message?: string;
    issue?: string;
    errorMsg?: string;
    data?: T;
    rows?: unknown[];
    [key: string]: unknown;
}

function jsonToFormData(payload: Record<string, unknown>): FormData {
    const formData = new FormData();
    for (const [key, value] of Object.entries(payload)) {
        if (value === undefined || value === null) continue;
        formData.append(key, String(value));
    }
    return formData;
}

function unwrapEnvelope<T>(body: AuthEnvelope<T>): T {
    const code = body.code ?? body.state ?? 200;
    const message =
        body.msg || body.message || body.issue || body.errorMsg || "请求失败";
    if (AUTH_EXPIRED_CODES.has(code) || AUTH_EXPIRED_CODES.has(String(code))) {
        throw new AuthApiError(message, code);
    }
    if (body.success === false) {
        throw new AuthApiError(message, code);
    }
    if (code !== 200 && code !== "200") {
        throw new AuthApiError(message, code);
    }
    return (body.data ?? body) as T;
}

async function readBody(res: Response): Promise<AuthEnvelope<unknown>> {
    const text = await res.text();
    if (!text) return {};
    try {
        return JSON.parse(text) as AuthEnvelope<unknown>;
    } catch {
        throw new AuthApiError(text || res.statusText, res.status);
    }
}

async function request<T>(
    url: string,
    init: RequestInit & { silent?: boolean } = {},
): Promise<T> {
    const { silent, headers, signal, ...rest } = init;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
        const res = await fetch(url, {
            ...rest,
            signal: controller.signal,
            headers: {
                "Source-Channel": "WEB",
                ...(silent ? { silentError: "true" } : {}),
                ...(headers as Record<string, string> | undefined),
            },
        });
        const body = await readBody(res);
        if (!res.ok && body.code == null && body.state == null && body.success == null) {
            throw new AuthApiError(body.msg || body.message || res.statusText, res.status);
        }
        return unwrapEnvelope<T>(body as AuthEnvelope<T>);
    } catch (error) {
        if (error instanceof AuthApiError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new AuthApiError("登录请求超时，请稍后重试", "TIMEOUT");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

/** POST /bapi/auth-service/oauth/login/jointV2 */
export function loginJointV2(params: JointV2LoginParams): Promise<JointLoginData> {
    return request<JointLoginData>("/bapi/auth-service/oauth/login/jointV2", {
        method: "POST",
        headers: {
            Authorization: SELLER_BASIC,
        },
        body: jsonToFormData(params as Record<string, unknown>),
    });
}

/** POST /bapi/auth-service/oauth/login/bmstoken/jointV2 */
export function getJointV2InfoByBmsToken(bmsToken: string): Promise<JointLoginData> {
    const query = new URLSearchParams({ bmsToken });
    return request<JointLoginData>(
        `/bapi/auth-service/oauth/login/bmstoken/jointV2?${query.toString()}`,
        {
            method: "POST",
            headers: {
                Authorization: SELLER_BASIC,
            },
        },
    );
}

export interface RefreshTokenResult {
    token?: string;
    refreshToken?: string;
    branchVO?: Record<string, unknown> | null;
}

/** POST /bapi/auth-service/oauth/login/sso */
export function refreshBmsToken(
    saveRefreshToken: string,
    params: { systemId: number; channel: string } = { systemId: 11, channel: "joint" },
    { silent = false }: { silent?: boolean } = {},
): Promise<RefreshTokenResult> {
    const query = new URLSearchParams({
        systemId: String(params.systemId),
        channel: params.channel,
    });
    return request<RefreshTokenResult>(
        `/bapi/auth-service/oauth/login/sso?${query.toString()}`,
        {
            method: "POST",
            silent,
            headers: {
                Cfpamfrt: saveRefreshToken,
            },
        },
    );
}

function bmsAuthHeaders(): Record<string, string> {
    const token = getBmsToken();
    return token ? { Authorization: token } : {};
}

export function getMachine(data: {
    accountRoleId: number;
    mobile?: string;
    storeId?: string | number;
}): Promise<{ machineId?: string | number } | null> {
    return request<{ machineId?: string | number } | null>(
        "/bapi/auth-service/oauth/access/id/machine",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                ...bmsAuthHeaders(),
            },
            body: JSON.stringify(data),
        },
    );
}

export function getMachineToken(data: Record<string, unknown>): Promise<MachineLoginInfo> {
    return request<MachineLoginInfo>("/bapi/auth-service/oauth/access/token/machine", {
        method: "POST",
        headers: {
            "Content-Type": "application/json;charset=UTF-8",
            ...bmsAuthHeaders(),
        },
        body: JSON.stringify(data),
    });
}

export interface BaseInfoRow {
    baseId?: number;
    baseName?: string;
    [key: string]: unknown;
}

export async function listBaseinfo(): Promise<BaseInfoRow[]> {
    const villageToken = getItem(AUTH_KEYS.agricAdminToken);
    const body = await request<{ rows?: BaseInfoRow[] } | BaseInfoRow[]>(
        "/agric-api/agriculture/baseinfo/list",
        {
            method: "GET",
            headers: {
                ...(villageToken
                    ? { Authorization: `Bearer ${villageToken}` }
                    : {}),
                "Hr-Base-Id": "-1",
            },
        },
    );
    if (Array.isArray(body)) return body;
    return Array.isArray(body.rows) ? body.rows : [];
}
