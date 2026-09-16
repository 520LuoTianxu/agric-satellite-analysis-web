"use client";

import React, { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { alertsApi } from "@/lib/api";
import { Leaf } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    { href: "/overview" as const, labelKey: "overview" as const },
    { href: "/farms" as const, labelKey: "projects" as const },
    { href: "/alerts" as const, labelKey: "alerts" as const },
];

function isActive(pathname: string, href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
}

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
        <header className="relative z-30 flex h-14 shrink-0 items-center border-b border-border/80 bg-background/90 px-2 backdrop-blur-md sm:px-4">
            <Link
                href="/overview"
                className="relative z-10 hidden items-center gap-2 text-foreground sm:flex"
            >
                <Leaf className="h-6 w-6 shrink-0 text-primary" />
                <span className="truncate text-[15px] font-bold tracking-tight">
                    {tCommon("brandName")}
                </span>
            </Link>

            <nav
                aria-label={tCommon("brandName")}
                className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
            >
                <div className="flex items-center rounded-full bg-muted p-1">
                    {NAV_ITEMS.map((item) => {
                        const active = isActive(pathname, item.href);
                        const showBadge = item.labelKey === "alerts" && openAlertCount > 0;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "relative flex items-center justify-center rounded-full px-2.5 py-1.5 text-[13px] font-medium transition-colors sm:px-4 sm:text-sm",
                                    active
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {tNav(item.labelKey)}
                                {showBadge && (
                                    <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
                                        {openAlertCount > 99 ? "99+" : openAlertCount}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            </nav>

            <div className="relative z-10 ml-auto flex shrink-0 items-center">
                <ThemeToggle />
                <LanguageSwitcher side="bottom" align="end" />
            </div>
        </header>
    );
}
