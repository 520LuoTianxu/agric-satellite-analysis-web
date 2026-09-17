import { readJointLoginData } from "@/lib/auth/session";

/** 只读取当前登录返回的基地信息，避免租户切换失败时沿用旧 activeBaseId。 */
export function getAlertSession() {
    const login = readJointLoginData();
    const baseSystem = login?.certifiedExternalSystems?.find(
        (system) => Number(system.systemType) === 2,
    );
    const baseId = String(baseSystem?.systemId ?? login?.hrBaseId ?? login?.baseId ?? "").trim();
    // 个人已读固定使用账号列表第一项的 accountId，不取角色 ID，也不依赖农业 token。
    const accountId = String(login?.accountRoleList?.[0]?.accountId ?? "").trim();
    if (!/^[1-9]\d{0,63}$/.test(baseId) || !/^[1-9]\d{0,127}$/.test(accountId)) return null;
    return { baseId, accountId };
}

/** 数量只在展示时截断，接口与分页继续保留真实总数。 */
export function formatAlertCount(count: number): string {
    return count > 99 ? "99+" : String(count);
}
