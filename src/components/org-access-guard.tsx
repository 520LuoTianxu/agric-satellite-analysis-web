"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Leaf } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth-provider";

function normalizePath(pathname: string): string {
    const trimmed = pathname.replace(/\/+$/, "");
    return trimmed || "/";
}

function isNoAccessPath(pathname: string): boolean {
    return normalizePath(pathname) === "/no-access";
}

/**
 * Global client-side gate: a blocked organization cannot open any other
 * route by typing, pasting, or refreshing a URL.
 */
export function OrgAccessGuard({ children }: { children: React.ReactNode }) {
    const { hydrated, accessStatus, session } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("auth");
    const onNoAccessPage = isNoAccessPath(pathname);

    useEffect(() => {
        if (!hydrated || accessStatus === "checking") return;
        if (accessStatus === "denied" && !onNoAccessPage) {
            router.replace("/no-access");
            return;
        }
        if (accessStatus !== "denied" && onNoAccessPage) {
            router.replace(session ? "/" : "/login");
        }
    }, [hydrated, accessStatus, onNoAccessPage, session, router]);

    const holdForCheck = !hydrated || accessStatus === "checking";
    const holdForRedirect =
        (accessStatus === "denied" && !onNoAccessPage) ||
        (hydrated && accessStatus !== "checking" && accessStatus !== "denied" && onNoAccessPage);

    if (holdForCheck || holdForRedirect) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Leaf className="h-7 w-7 text-primary" />
                    <p className="text-sm">{t("ssoChecking")}</p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
