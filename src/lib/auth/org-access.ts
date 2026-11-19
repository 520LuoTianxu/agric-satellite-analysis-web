import { clearAuthStorage } from "./storage";

/** Organization name that is not allowed to use this system. */
export const BLOCKED_ORG_NAME = "AI业务中心";

/** Survives token cleanup so a blocked user cannot refresh into the app. */
export const ORG_ACCESS_DENIED_KEY = "agricOrgAccessDenied";

export class OrgAccessDeniedError extends Error {
    constructor(message = "当前组织无法使用本系统，请联系管理员开权限后才可以访问") {
        super(message);
        this.name = "OrgAccessDeniedError";
    }
}

function canUseStorage(): boolean {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function pushOrgName(into: string[], value: unknown): void {
    if (typeof value !== "string") return;
    const name = value.trim();
    if (name) into.push(name);
}

/**
 * Collect orgName values from an SSO / joint-login payload.
 * The SSO contract exposes `data.branchVO.orgName`; also check nearby
 * orgName fields the same payload may include.
 */
export function collectOrgNames(...sources: unknown[]): string[] {
    const names: string[] = [];
    for (const source of sources) {
        if (!source || typeof source !== "object") continue;
        const record = source as Record<string, unknown>;
        pushOrgName(names, record.orgName);
        pushOrgName(names, record.hrOrgName);
        if (record.branchVO && typeof record.branchVO === "object") {
            const branch = record.branchVO as Record<string, unknown>;
            pushOrgName(names, branch.orgName);
            pushOrgName(names, branch.hrOrgName);
        }
        if (record.orgBuVO && typeof record.orgBuVO === "object") {
            const bu = record.orgBuVO as Record<string, unknown>;
            pushOrgName(names, bu.orgName);
            pushOrgName(names, bu.hrOrgName);
        }
    }
    return names;
}

export function isBlockedOrganization(...sources: unknown[]): boolean {
    return collectOrgNames(...sources).some((name) => name === BLOCKED_ORG_NAME);
}

export function isOrgAccessDenied(): boolean {
    if (!canUseStorage()) return false;
    try {
        return window.localStorage.getItem(ORG_ACCESS_DENIED_KEY) === "1";
    } catch {
        return false;
    }
}

export function setOrgAccessDenied(): void {
    if (!canUseStorage()) return;
    window.localStorage.setItem(ORG_ACCESS_DENIED_KEY, "1");
}

export function clearOrgAccessDenied(): void {
    if (!canUseStorage()) return;
    window.localStorage.removeItem(ORG_ACCESS_DENIED_KEY);
}

/** Drop any usable session and remember the deny so route guards stay closed. */
export function denyOrgAccess(): void {
    clearAuthStorage({ skipDdAutoLogin: true });
    setOrgAccessDenied();
}

export function enforceOrgAccess(...sources: unknown[]): void {
    if (isBlockedOrganization(...sources)) {
        denyOrgAccess();
        throw new OrgAccessDeniedError();
    }
}
