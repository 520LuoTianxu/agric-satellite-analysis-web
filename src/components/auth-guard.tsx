"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Leaf } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth-provider";
import { getXiangheLandSession, isXiangheLandPath } from "@/lib/auth/xianghe-land";

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { hydrated, accessStatus, session, xiangheLandStatus } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("auth");
    const landReady = xiangheLandStatus === "ready" && Boolean(getXiangheLandSession());
    const landUnavailable = xiangheLandStatus === "unavailable" && isXiangheLandPath(pathname);

    useEffect(() => {
        if (!hydrated || accessStatus === "checking") return;
        if (accessStatus === "denied") {
            router.replace("/no-access");
            return;
        }
        if (session || landReady || landUnavailable) return;
        const search = typeof window !== "undefined" ? window.location.search : "";
        const target = `${pathname}${search}`;
        const redirect = pathname && pathname !== "/login" ? target : "/";
        router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
    }, [hydrated, accessStatus, session, landReady, landUnavailable, pathname, router]);

    if (landUnavailable) {
        return (
            <div className="flex h-screen items-center justify-center bg-background px-6">
                <p role="alert" className="max-w-sm text-center text-sm text-muted-foreground">
                    {t("xiangheLandUnavailable")}
                </p>
            </div>
        );
    }

    if (!hydrated || accessStatus === "checking" || accessStatus === "denied" || (!session && !landReady)) {
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
