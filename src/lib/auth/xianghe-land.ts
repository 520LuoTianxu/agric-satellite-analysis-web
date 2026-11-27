const SESSION_KEY = "agric.xiangheLand";
const ID_PATTERN = /^[1-9]\d{0,63}$/;

export interface XiangheLandSession {
    token: string;
    baseId: string;
    landId: string;
    groupId: string;
}

let verifiedSession: XiangheLandSession | null = null;

export function isXiangheLandPath(pathname: string): boolean {
    return pathname.replace(/\/+$/, "").endsWith("/farms/fields/detail");
}

function matchesLand(session: XiangheLandSession): boolean {
    if (!isXiangheLandPath(window.location.pathname)) return false;
    const query = new URLSearchParams(window.location.search);
    return (query.get("fieldId") ?? "") === session.landId &&
        (query.get("groupId") ?? "") === session.groupId;
}

/** 新链接优先于页面缓存。浏览器在请求发出前清除地址栏里的农业凭证。 */
export function readXiangheLandEntry(): { session: XiangheLandSession | null } | null {
    if (!isXiangheLandPath(window.location.pathname)) return null;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const fromLink = fragment.has("Admin-Token");
    if (fromLink) {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
        clearXiangheLandSession();
    }
    if (!fromLink && fragment.has("xiangheBms")) return null;

    const query = new URLSearchParams(window.location.search);
    let candidate: Partial<XiangheLandSession> | null;
    if (fromLink) {
        candidate = {
            token: fragment.get("Admin-Token") ?? "",
            baseId: fragment.get("baseId") ?? "",
            landId: query.get("fieldId") ?? "",
            groupId: query.get("groupId") ?? "",
        };
    } else {
        try {
            candidate = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "null");
        } catch {
            return null;
        }
    }
    if (!candidate) return null;

    const { baseId, landId, groupId } = candidate;
    const token = typeof candidate.token === "string" ? candidate.token.trim().replace(/^Bearer\s+/i, "") : "";
    if (!token || typeof baseId !== "string" || typeof landId !== "string" || typeof groupId !== "string" ||
        !ID_PATTERN.test(baseId) ||
        !ID_PATTERN.test(landId) || (groupId && !ID_PATTERN.test(groupId))) {
        return fromLink ? { session: null } : null;
    }
    const session = { token, baseId, landId, groupId };
    return matchesLand(session) ? { session } : null;
}

/** 仅供已由农业接口确认可访问的地块详情使用，不覆盖联营站点的共享登录缓存。 */
export function saveXiangheLandSession(session: XiangheLandSession): void {
    verifiedSession = session;
    try {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
        // WebView 禁用存储时，当前页面仍可使用已校验的凭证。
    }
}

export function clearXiangheLandSession(): void {
    verifiedSession = null;
    try {
        window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
        // 当前页的凭证已清除。
    }
}

export function getXiangheLandSession(): XiangheLandSession | null {
    return typeof window !== "undefined" && verifiedSession && matchesLand(verifiedSession)
        ? verifiedSession
        : null;
}

export function xiangheLandHeaders(session: XiangheLandSession): Record<string, string> {
    return { Authorization: `Bearer ${session.token}`, "Hr-Base-Id": session.baseId };
}
