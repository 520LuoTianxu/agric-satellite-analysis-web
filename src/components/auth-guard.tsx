"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Leaf } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth-provider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { hydrated, session } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("auth");

    useEffect(() => {
        if (!hydrated || session) return;
        const search = typeof window !== "undefined" ? window.location.search : "";
        const target = `${pathname}${search}`;
        const redirect = pathname && pathname !== "/login" ? target : "/";
        router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
    }, [hydrated, session, pathname, router]);

    if (!hydrated || !session) {
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
