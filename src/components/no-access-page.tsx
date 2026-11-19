"use client";

import React from "react";
import { Leaf, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/auth-provider";

export function NoAccessPage() {
    const t = useTranslations("auth");
    const tc = useTranslations("common");
    const router = useRouter();
    const { continueWithAnotherAccount } = useAuth();

    const handleOtherAccount = () => {
        continueWithAnotherAccount();
        router.replace("/login");
    };

    return (
        <main className="flex min-h-svh flex-col bg-surface-2 px-4 py-6 sm:px-6 lg:p-8">
            <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-border bg-primary-subtle text-primary">
                        <Leaf className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 space-y-1">
                        <p className="break-words text-sm font-semibold tracking-tight sm:text-lg">{tc("brandName")}</p>
                        <p className="text-xs text-muted-foreground">{t("platformLabel")}</p>
                    </div>
                </div>
                <ThemeToggle className="relative h-11 w-11 shrink-0 rounded-full border border-border bg-card" />
            </header>

            <div className="flex flex-1 items-center justify-center py-16">
                <div className="w-full max-w-md rounded-xl border border-border bg-card px-8 py-12 text-center shadow-sm">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground">
                        <ShieldOff className="h-7 w-7" aria-hidden="true" />
                    </div>
                    <h1 className="text-xl font-semibold tracking-tight">{t("accessDeniedTitle")}</h1>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("accessDeniedDesc")}</p>
                    <Button type="button" variant="outline" className="mt-8" onClick={handleOtherAccount}>
                        {t("useAnotherAccount")}
                    </Button>
                </div>
            </div>
        </main>
    );
}
