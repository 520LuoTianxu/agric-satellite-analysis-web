"use client";

import React, { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Leaf } from "lucide-react";
import { alertsApi } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    { href: "/overview" as const, labelKey: "overview" as const },
    { href: "/farms" as const, labelKey: "projectRemoteSensing" as const },
    { href: "/alerts" as const, labelKey: "alerts" as const },
];

export function TopNav() {
    const pathname = usePathname();
    const tNav = useTranslations("nav");
    const tCommon = useTranslations("common");
    const [openAlertCount, setOpenAlertCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        alertsApi
            .list({ status: "open", limit: 1 })
            .then((res) => {
                if (!cancelled) setOpenAlertCount(res.total);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <header className="sticky top-0 z-40 shrink-0 border-b border-border/80 bg-background/95 backdrop-blur-md">
            <div className="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 sm:px-5">
                <Link href="/overview" className="flex min-w-0 items-center gap-2">
                    <Leaf className="h-6 w-6 shrink-0 text-primary" />
                    <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
                        {tCommon("brandName")}
                    </span>
                </Link>

                <nav
                    aria-label={tCommon("brandName")}
                    className="inline-flex items-center rounded-full bg-muted p-1"
                >
                    {NAV_ITEMS.map((item) => {
                        const active = pathname.startsWith(item.href);
                        const showBadge = item.labelKey === "alerts" && openAlertCount > 0;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm",
                                    active
                                        ? "bg-background text-primary shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {tNav(item.labelKey)}
                                {showBadge && (
                                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                                        {openAlertCount > 99 ? "99+" : openAlertCount}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                    <TenantSwitcher />
                    <ThemeToggle />
                    <LanguageSwitcher side="bottom" align="end" />
                </div>
            </div>
        </header>
    );
}
