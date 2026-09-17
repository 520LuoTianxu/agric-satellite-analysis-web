import { readJointLoginData } from "@/lib/auth/session";

/** 只读取当前登录返回的基地信息，避免租户切换失败时沿用旧 activeBaseId。 */
export function getAlertSession() {
    const login = readJointLoginData();
    const baseSystem = login?.certifiedExternalSystems?.find(
        (system) => Number(system.systemType) === 2,
    );
    const baseId = String(baseSystem?.systemId ?? login?.hrBaseId ?? login?.baseId ?? "").trim();
    const token = login?.agricToken?.replace(/^Bearer\s+/i, "").trim() || "";
    if (!token || !/^[1-9]\d{0,63}$/.test(baseId)) return null;
    return { baseId, token };
}

/** 数量只在展示时截断，接口与分页继续保留真实总数。 */
export function formatAlertCount(count: number): string {
    return count > 99 ? "99+" : String(count);
}
