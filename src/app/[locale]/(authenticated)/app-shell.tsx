"use client";

import React from "react";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { TopNav } from "@/components/top-nav";
import { useTranslations } from "next-intl";

export function AppShell({ children }: { children: React.ReactNode }) {
    const t = useTranslations("appShell");
    return (
        <ConfirmDialogProvider>
            <div className="flex h-screen flex-col overflow-hidden">
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-foreground focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {t("skipToMain")}
                </a>
                <TopNav />
                <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto bg-surface-2">
                    {children}
                </main>
            </div>
        </ConfirmDialogProvider>
    );
}
