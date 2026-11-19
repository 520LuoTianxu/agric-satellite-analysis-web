import type { AuthSession } from "./types";

/** Frontend allowlist for hidden ops / analysis menus. */
export const PRIVILEGED_PHONES = ["18390205173", "13138866911", "19118960778"] as const;

export const PRIVILEGED_NAV_ITEMS = [
    { href: "/insights" as const, labelKey: "parcelInsights" as const },
    { href: "/harvest-report" as const, labelKey: "harvestReport" as const },
    { href: "/harvest-analysis" as const, labelKey: "harvestAnalysis" as const },
    { href: "/admin/ops" as const, labelKey: "operations" as const },
] as const;

const PHONE_KEY = /mobile|phone|tel|username/i;

/** Keep digits and fold +86 / 0086 prefixes into an 11-digit mainland mobile. */
export function normalizePhone(value?: string | null): string {
    if (!value) return "";
    let digits = String(value).replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("86") && digits.length >= 13) digits = digits.slice(2);
    if (digits.length > 11 && digits.slice(-11).startsWith("1")) {
        return digits.slice(-11);
    }
    return digits;
}

function collectPhoneLikeValues(value: unknown, into: string[]): void {
    if (value == null) return;
    if (typeof value === "string" || typeof value === "number") {
        const text = String(value).trim();
        if (text) into.push(text);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) collectPhoneLikeValues(item, into);
        return;
    }
    if (typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
            if (PHONE_KEY.test(key)) collectPhoneLikeValues(nested, into);
        }
    }
}

function sessionPhoneCandidates(session: AuthSession | null): string[] {
    if (!session) return [];
    const found: string[] = [];
    const { currentRole, jointLoginData } = session;
    if (currentRole) {
        collectPhoneLikeValues(currentRole, found);
    }
    collectPhoneLikeValues(jointLoginData.vendorName, found);
    collectPhoneLikeValues(jointLoginData.accountRoleList, found);
    return found;
}

/** True when the logged-in user's phone matches the allowlist. Hidden if missing. */
export function canAccessPrivilegedMenus(session: AuthSession | null): boolean {
    if (!session) return false;
    const allowed = new Set<string>(PRIVILEGED_PHONES);
    return sessionPhoneCandidates(session).some((value) => allowed.has(normalizePhone(value)));
}
