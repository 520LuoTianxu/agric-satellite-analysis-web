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
    { href: "/" as const, labelKey: "landReports" as const },
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
            <div className="grid grid-cols-2 items-center gap-2 px-3 py-2 md:h-14 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-5 md:py-0">
                <Link href="/" className="order-1 flex min-w-0 items-center gap-2">
                    <Leaf className="h-6 w-6 shrink-0 text-primary" />
                    <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
                        {tCommon("brandName")}
                    </span>
                </Link>

                <nav
                    aria-label={tCommon("brandName")}
                    className="order-3 col-span-2 inline-flex max-w-full items-center justify-self-center overflow-x-auto rounded-full bg-muted p-1 md:order-2 md:col-span-1"
                >
                    {NAV_ITEMS.map((item) => {
                        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                        const showBadge = item.labelKey === "alerts" && openAlertCount > 0;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "relative shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm",
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

                <div className="order-2 flex min-w-0 items-center justify-end gap-0.5 sm:gap-1 md:order-3">
                    <TenantSwitcher />
                    <ThemeToggle />
                    <LanguageSwitcher side="bottom" align="end" />
                </div>
            </div>
        </header>
    );
}
