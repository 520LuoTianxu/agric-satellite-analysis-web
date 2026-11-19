import {
    AUTH_KEYS,
    clearAuthStorage,
    clearBmsToken,
    getActiveAccountRoleId,
    getBmsToken,
    getItem,
    getJson,
    setActiveAccountRoleId,
    setBmsToken,
    setItem,
    setJson,
    removeItem,
} from "./storage";
import {
    getJointV2InfoByBmsToken,
    getMachine,
    getMachineToken,
    listBaseinfo,
    loginJointV2,
    loginSso,
} from "./api";
import { AuthApiError, type AccountRole, type AuthSession, type JointLoginData, type JointV2LoginParams, type SsoLoginData } from "./types";
import { enforceOrgAccess, isOrgAccessDenied, OrgAccessDeniedError } from "./org-access";

const BMS_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export function readJointLoginData(): JointLoginData | null {
    return getJson<JointLoginData>(AUTH_KEYS.jointLoginData);
}

export function resolveCurrentRole(
    jointLoginData: JointLoginData | null,
    activeAccountRoleId = getActiveAccountRoleId(),
): AccountRole | null {
    const list = jointLoginData?.accountRoleList || [];
    if (activeAccountRoleId) {
        const matched = list.find((role) => role.accountRoleId === activeAccountRoleId);
        if (matched) return matched;
    }
    return list.find((role) => role.mainAccountFlag === 1) || list[0] || null;
}

export function resolveTenantName(
    jointLoginData: JointLoginData | null,
    activeAccountRoleId = getActiveAccountRoleId(),
): string {
    const role = resolveCurrentRole(jointLoginData, activeAccountRoleId);
    return role?.shopName || "未选择租户";
}

export function readSession(): AuthSession | null {
    const jointLoginData = readJointLoginData();
    if (!jointLoginData) return null;
    const activeAccountRoleId = getActiveAccountRoleId();
    return {
        jointLoginData,
        activeAccountRoleId,
        currentRole: resolveCurrentRole(jointLoginData, activeAccountRoleId),
        tenantName: resolveTenantName(jointLoginData, activeAccountRoleId),
    };
}

function ssoCredentials(jointLoginData: JointLoginData | null): string[] {
    const credentials = [
        jointLoginData?.bmsRefreshToken,
        getItem(AUTH_KEYS.bmsRefreshToken),
        jointLoginData?.access_token,
    ].filter((item): item is string => Boolean(item));
    return [...new Set(credentials)];
}

export function mergeSsoIntoJointLogin(
    jointLoginData: JointLoginData,
    ssoData: SsoLoginData,
): JointLoginData {
    return {
        ...jointLoginData,
        ...(ssoData.refreshToken ? { bmsRefreshToken: ssoData.refreshToken } : {}),
        ...(ssoData.branchVO !== undefined ? { branchVO: ssoData.branchVO } : {}),
    };
}

/**
 * Exchange the jointV2 credential for SSO profile data.
 * Fail closed: a network or API error must not skip the org check.
 */
export async function requireSsoLogin(jointLoginData: JointLoginData | null): Promise<SsoLoginData> {
    const credentials = ssoCredentials(jointLoginData);
    if (credentials.length === 0) {
        throw new AuthApiError("登录权限校验失败，请稍后重试", "SSO");
    }
    let lastError: unknown;
    for (const credential of credentials) {
        try {
            const ssoData = await loginSso(credential, { systemId: 11, channel: "joint" });
            const hasProfile = Boolean(
                ssoData?.token ||
                ssoData?.refreshToken ||
                ssoData?.branchVO ||
                ssoData?.account ||
                ssoData?.userId ||
                ssoData?.userName,
            );
            if (!hasProfile) {
                throw new AuthApiError("登录权限校验失败，请稍后重试", "SSO");
            }
            return ssoData;
        } catch (error) {
            lastError = error;
            console.warn("SSO login failed for a credential, trying next if any");
        }
    }
    if (lastError instanceof AuthApiError) throw lastError;
    throw new AuthApiError("登录权限校验失败，请稍后重试", "SSO");
}

/**
 * After jointV2 succeeds, call SSO, block disallowed orgs, then persist the session.
 */
export async function completeJointLogin(jointLoginData: JointLoginData): Promise<AuthSession> {
    enforceOrgAccess(jointLoginData);
    const ssoData = await requireSsoLogin(jointLoginData);
    enforceOrgAccess(ssoData, jointLoginData);
    return applyLoginAfter(mergeSsoIntoJointLogin(jointLoginData, ssoData), {
        bmsToken: ssoData.token,
    });
}

/**
 * Mirrors joint-venture-front `LoginAfter`: write the same localStorage keys
 * so the two apps can skip login on the same origin.
 */
export async function applyLoginAfter(
    jointLoginData: JointLoginData,
    options: { bmsToken?: string } = {},
): Promise<AuthSession> {
    const villageToken = jointLoginData.villageToken || "";
    const agricToken = jointLoginData.agricToken || "";

    setItem(AUTH_KEYS.agricAdminToken, villageToken);
    setItem(AUTH_KEYS.adminToken, villageToken);
    setItem(AUTH_KEYS.farmAdminToken, agricToken);
    setItem(AUTH_KEYS.sldToken, jointLoginData.access_token || "");
    setItem(AUTH_KEYS.erpToken, jointLoginData.erpToken || "");

    let activeAccountRoleId = getActiveAccountRoleId();
    if (!activeAccountRoleId) {
        activeAccountRoleId =
            jointLoginData.accountRoleList?.find((role) => role.mainAccountFlag === 1)
                ?.accountRoleId || 0;
        setActiveAccountRoleId(activeAccountRoleId);
    }

    setJson(AUTH_KEYS.jointLoginData, jointLoginData);
    if (jointLoginData.bmsRefreshToken) {
        setItem(AUTH_KEYS.bmsRefreshToken, jointLoginData.bmsRefreshToken);
    }
    clearBmsToken();
    if (options.bmsToken) {
        setBmsToken(options.bmsToken, BMS_TOKEN_TTL_MS);
    }

    try {
        await initMachineSystem();
    } catch (error) {
        if (error instanceof OrgAccessDeniedError) throw error;
        console.error(error);
    }

    try {
        await initBaseInfo();
    } catch (error) {
        console.error("InitBaseInfo failed:", error);
    }

    return readSession() as AuthSession;
}

export async function loginWithPassword(username: string, password: string): Promise<AuthSession> {
    const data = await loginJointV2({
        username: username.trim(),
        password,
    });
    return completeJointLogin(data);
}

export async function switchTenant(accountRoleId: number): Promise<AuthSession> {
    const jointLoginData = readJointLoginData();
    if (!jointLoginData?.refresh_token) {
        throw new Error("缺少 refresh_token，无法切换租户");
    }
    const accountRole = jointLoginData.accountRoleList?.find(
        (item) => item.accountRoleId === accountRoleId,
    );
    const payload: Record<string, unknown> = {
        grant_type: "refresh_token",
        refresh_token: jointLoginData.refresh_token,
        accountRoleId,
    };
    if (accountRole?.virtualMobile) {
        payload.username = accountRole.virtualMobile;
    }

    removeItem(AUTH_KEYS.machineLoginInfo);
    removeItem(AUTH_KEYS.machineryToken);
    removeItem(AUTH_KEYS.machineryMenu);

    const data = await loginJointV2(payload as JointV2LoginParams);
    setActiveAccountRoleId(accountRoleId);
    return completeJointLogin(data);
}

export async function loginEnjoypay(): Promise<void> {
    let enjoypayToken = getBmsToken();
    if (!enjoypayToken) {
        const jointLoginData = readJointLoginData();
        const uniqueCredentials = ssoCredentials(jointLoginData);
        for (const credential of uniqueCredentials) {
            try {
                const res = await loginSso(credential, { systemId: 11, channel: "joint" }, { silent: true });
                enforceOrgAccess(res, jointLoginData);
                enjoypayToken = res?.token || null;
                if (!enjoypayToken) continue;
                const newRefreshToken = res.refreshToken;
                if (newRefreshToken && jointLoginData) {
                    setItem(AUTH_KEYS.bmsRefreshToken, newRefreshToken);
                    setJson(AUTH_KEYS.jointLoginData, {
                        ...jointLoginData,
                        bmsRefreshToken: newRefreshToken,
                        branchVO: res.branchVO ?? jointLoginData.branchVO,
                    });
                }
                break;
            } catch (error) {
                if (error instanceof OrgAccessDeniedError) throw error;
                console.warn("LoginEnjoypay: refresh bmsToken failed", error);
            }
        }
    }
    if (!enjoypayToken) return;
    setBmsToken(enjoypayToken, BMS_TOKEN_TTL_MS);
}

async function initMachineSystem(): Promise<void> {
    await loginEnjoypay();
    const jointLoginData = readJointLoginData();
    if (!jointLoginData) return;

    const res1 = await getMachine({
        accountRoleId: getActiveAccountRoleId(),
        mobile: jointLoginData.vendorName,
        storeId: jointLoginData.storeId,
    });
    const machineId = res1?.machineId;
    if (machineId) {
        const loginMobile = jointLoginData.accountRoleList?.[0]?.accountUsername;
        const res2 = await getMachineToken({
            accountRoleId: getActiveAccountRoleId(),
            isStoreAdmin: jointLoginData.isStoreAdmin,
            loginMobile,
            sellerToken: jointLoginData.access_token,
            storeId: jointLoginData.storeId,
            vendorId: jointLoginData.vendorId,
            vendorName: jointLoginData.vendorName,
        });
        setJson(AUTH_KEYS.machineLoginInfo, res2);
        if (res2?.accessToken) {
            setItem(AUTH_KEYS.machineryToken, res2.accessToken);
        }
    }
    await getMachineMenus();
}

async function getMachineMenus(): Promise<void> {
    const isProduction =
        typeof window !== "undefined" &&
        window.location.hostname === "joint-venture.cdfinance.com.cn";
    const menus = {
        content: "农机服务",
        frontPath: isProduction
            ? "https://nongji-platform-admin.cdfinance.com.cn"
            : "https://nongji-platform-admin-test.cdfinance.com.cn",
        sort: 5,
    };
    setJson(AUTH_KEYS.machineryMenu, menus);
}

export async function initBaseInfo(): Promise<void> {
    const jointLoginData = readJointLoginData();
    const activeBaseId = Number(
        jointLoginData?.certifiedExternalSystems?.find((system) => system.systemType === 2)
            ?.systemId,
    );
    if (!activeBaseId) return;
    await listBaseinfo();
    setItem(AUTH_KEYS.activeBaseId, String(activeBaseId));
}

/**
 * Same-origin SSO: reuse joint-venture-front cache, or exchange a leftover
 * BMS token for jointV2 login data.
 */
export async function bootstrapSession(): Promise<AuthSession | null> {
    if (isOrgAccessDenied()) {
        return null;
    }

    if (readJointLoginData()) {
        const existing = readJointLoginData();
        enforceOrgAccess(existing);
        const ssoData = await requireSsoLogin(existing);
        enforceOrgAccess(ssoData, existing);
        const merged = mergeSsoIntoJointLogin(existing as JointLoginData, ssoData);
        setJson(AUTH_KEYS.jointLoginData, merged);
        if (merged.bmsRefreshToken) {
            setItem(AUTH_KEYS.bmsRefreshToken, merged.bmsRefreshToken);
        }
        if (ssoData.token) {
            setBmsToken(ssoData.token, BMS_TOKEN_TTL_MS);
        }
        try {
            await loginEnjoypay();
        } catch (error) {
            if (error instanceof OrgAccessDeniedError) throw error;
            console.warn("LoginEnjoypay failed:", error);
        }
        try {
            await initBaseInfo();
        } catch (error) {
            console.error("InitBaseInfo failed:", error);
        }
        return readSession();
    }

    const leftoverBmsToken = getBmsToken();
    if (!leftoverBmsToken) return null;
    try {
        const data = await getJointV2InfoByBmsToken(leftoverBmsToken);
        return await completeJointLogin(data);
    } catch (error) {
        if (error instanceof OrgAccessDeniedError) throw error;
        console.warn("getJointV2InfoByBmsToken failed:", error);
        return null;
    }
}

export function logout({ skipDdAutoLogin = true }: { skipDdAutoLogin?: boolean } = {}): void {
    clearAuthStorage({ skipDdAutoLogin });
}
