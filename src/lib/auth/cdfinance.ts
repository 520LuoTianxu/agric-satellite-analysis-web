import { readJointLoginData } from "./session";
import { AUTH_KEYS, getItem } from "./storage";

export interface CdfinanceCredentials {
    token: string | null;
    groupId: string | null;
    hrBaseId: string | null;
}

function firstText(...values: unknown[]): string | null {
    for (const value of values) {
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

function normalizeToken(value: unknown): string | null {
    const token = firstText(value);
    return token?.replace(/^Bearer\s+/i, "").trim() || null;
}

/**
 * 从当前登录态组装中和农信请求所需参数；凭证只在请求时读取和透传，
 * 不新增前端表单，也不把 token 写入后端配置或本地业务数据。
 */
export function resolveCdfinanceCredentials(
    landGroupId?: string | number | null,
): CdfinanceCredentials {
    const loginData = readJointLoginData();
    const baseSystem = loginData?.certifiedExternalSystems?.find(
        (system) => Number(system.systemType) === 2,
    );

    // agric-api/agriculture/* 要求 farm-admin token；villageToken 是另一套用户端凭证，不能混用。
    const token =
        normalizeToken(loginData?.agricToken) ||
        normalizeToken(getItem(AUTH_KEYS.farmAdminToken));
    const groupId = firstText(
        landGroupId,
        loginData?.groupId,
        loginData?.group_id,
    );
    const hrBaseId = firstText(
        getItem(AUTH_KEYS.activeBaseId),
        loginData?.hrBaseId,
        loginData?.hr_base_id,
        loginData?.baseId,
        loginData?.base_id,
        baseSystem?.systemId,
    );

    return { token, groupId, hrBaseId };
}
