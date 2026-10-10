"use client";

import React from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAlertSummary } from "@/hooks/use-alert-summary";
import { formatAlertCount } from "@/lib/alert-session";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { RemoteSensingOnboarding } from "@/components/remote-sensing-onboarding";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    { href: "/insights" as const, labelKey: "parcelInsights" as const },
    { href: "/overview" as const, labelKey: "overview" as const },
    { href: "/farms" as const, labelKey: "projectRemoteSensing" as const },
    { href: "/harvest-report" as const, labelKey: "harvestReport" as const },
    { href: "/alerts" as const, labelKey: "alerts" as const },
    // 管理端任务入口需要让管理员能从主导航直接进入，而不是只能手动拼接地址。
    { href: "/admin/ops" as const, labelKey: "operations" as const },
];

/** 左上角品牌图标使用 OSS 公共资源，避免静态站点重复打包图片文件。 */
const BRAND_ICON_URL = "https://agric-dev.oss-cn-beijing.aliyuncs.com/web/branding/icon.png";

export function TopNav() {
    const pathname = usePathname();
    const tNav = useTranslations("nav");
    const tCommon = useTranslations("common");
    const { data: summary } = useAlertSummary();
    const unreadAlertCount = summary?.unread_total ?? 0;

    return (
        <header className="sticky top-0 z-40 shrink-0 border-b border-border/80 bg-background/95 backdrop-blur-md">
            <div className="grid grid-cols-2 items-center gap-2 px-3 py-2 md:h-14 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-5 md:py-0">
                <Link href="/" className="order-1 flex min-w-0 items-center gap-2">
                    <Image
                        src={BRAND_ICON_URL}
                        alt=""
                        width={24}
                        height={24}
                        unoptimized
                        aria-hidden="true"
                        className="h-6 w-6 shrink-0 object-contain"
                    />
                    <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
                        {tCommon("brandName")}
                    </span>
                </Link>

                <nav
                    aria-label={tCommon("brandName")}
                    className="order-3 col-span-2 inline-flex max-w-full items-center justify-self-center overflow-x-auto rounded-full bg-muted p-1 md:order-2 md:col-span-1"
                >
                    {NAV_ITEMS.map((item) => {
                        const active = pathname.startsWith(item.href);
                        const showBadge = item.labelKey === "alerts" && unreadAlertCount > 0;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                data-tour={item.href === "/farms" ? "nav-farms" : undefined}
                                className={cn(
                                    "relative inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm",
                                    active
                                        ? "bg-background text-primary shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {tNav(item.labelKey)}
                                {showBadge && (
                                    <span className="ml-1 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
                                        {formatAlertCount(unreadAlertCount)}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="order-2 flex min-w-0 items-center justify-end gap-0.5 sm:gap-1 md:order-3">
                    <RemoteSensingOnboarding />
                    <TenantSwitcher />
                    <ThemeToggle />
                    <LanguageSwitcher side="bottom" align="end" />
                </div>
            </div>
        </header>
    );
}
