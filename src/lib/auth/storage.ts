/**
 * Browser cache keys written by joint-venture-front LoginAfter / logout.
 * Both apps share the same origin, so these keys are the SSO contract.
 */

export const AUTH_KEYS = {
    jointLoginData: "jointLoginData",
    adminToken: "Admin-Token",
    agricAdminToken: "app_agric_Admin-Token",
    farmAdminToken: "app_farm_Admin-Token",
    sldToken: "sld_token",
    erpToken: "erpToken",
    activeAccountRoleId: "activeAccountRoleId",
    bmsRefreshToken: "bmsRefreshToken",
    bmsToken: "bmsToken",
    accessToken: "accessToken",
    machineryToken: "machineryToken",
    machineLoginInfo: "machineLoginInfo",
    machineryMenu: "machineryMenu",
    activeBaseId: "activeBaseId",
    userInfo: "userInfo",
    bmsUserInfo: "bmsUserInfo",
    defaultPwd: "defaultPwd",
} as const;

export const SKIP_DD_AUTO_LOGIN_KEY = "SKIP_DD_AUTO_LOGIN";

/** vue-ls namespace used by joint-venture-front (`joint_` + `bmsToken`). */
const LS_NAMESPACE = "joint_";
const LS_BMS_TOKEN_KEY = `${LS_NAMESPACE}bmsToken`;

const AUTH_KEY_VALUES = Object.values(AUTH_KEYS);

function canUseStorage(): boolean {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getItem(key: string): string | null {
    if (!canUseStorage()) return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function setItem(key: string, value: string): void {
    if (!canUseStorage()) return;
    window.localStorage.setItem(key, value);
}

export function removeItem(key: string): void {
    if (!canUseStorage()) return;
    window.localStorage.removeItem(key);
}

export function getJson<T>(key: string): T | null {
    const raw = getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function setJson(key: string, value: unknown): void {
    setItem(key, JSON.stringify(value));
}

/** Compatible with vue-ls `{ value, expire }` records. */
export function getLsItem<T = string>(name: string): T | null {
    const raw = getItem(`${LS_NAMESPACE}${name}`);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw) as { value?: T; expire?: number | null };
        if (data.expire != null && data.expire < Date.now()) {
            removeItem(`${LS_NAMESPACE}${name}`);
            return null;
        }
        return (data.value ?? null) as T | null;
    } catch {
        return null;
    }
}

export function setLsItem(name: string, value: unknown, expireMs?: number): void {
    setJson(`${LS_NAMESPACE}${name}`, {
        value,
        expire: expireMs != null ? Date.now() + expireMs : null,
    });
}

export function removeLsItem(name: string): void {
    removeItem(`${LS_NAMESPACE}${name}`);
}

export function getBmsToken(): string | null {
    return getLsItem<string>("bmsToken") || getItem(AUTH_KEYS.bmsToken);
}

export function setBmsToken(token: string, expireMs = 2 * 60 * 60 * 1000): void {
    setLsItem("bmsToken", token, expireMs);
    setItem(AUTH_KEYS.bmsToken, token);
    setItem(AUTH_KEYS.accessToken, token);
}

export function clearBmsToken(): void {
    removeLsItem("bmsToken");
    removeItem(AUTH_KEYS.bmsToken);
}

export function hasJointLogin(): boolean {
    return Boolean(getItem(AUTH_KEYS.jointLoginData));
}

export function getActiveAccountRoleId(): number {
    return Number(getItem(AUTH_KEYS.activeAccountRoleId) || 0) || 0;
}

export function setActiveAccountRoleId(accountRoleId: number): void {
    setItem(AUTH_KEYS.activeAccountRoleId, String(Number(accountRoleId) || 0));
}

export function clearAuthStorage({ skipDdAutoLogin = false }: { skipDdAutoLogin?: boolean } = {}): void {
    if (!canUseStorage()) return;
    for (const key of AUTH_KEY_VALUES) {
        window.localStorage.removeItem(key);
    }
    window.localStorage.removeItem(LS_BMS_TOKEN_KEY);
    try {
        window.sessionStorage.clear();
        if (skipDdAutoLogin) {
            window.sessionStorage.setItem(SKIP_DD_AUTO_LOGIN_KEY, "1");
        }
    } catch {
        /* ignore */
    }
}
