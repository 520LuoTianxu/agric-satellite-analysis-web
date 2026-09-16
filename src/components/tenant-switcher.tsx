"use client";

import React, { useMemo, useState } from "react";
import { Check, ChevronsUpDown, LogOut, Search, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/confirm-dialog";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";

export function TenantSwitcher() {
    const t = useTranslations("auth");
    const ts = useTranslations("sidebar");
    const { session, switching, switchTenant, logout } = useAuth();
    const router = useRouter();
    const confirm = useConfirm();
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState("");

    const roles = useMemo(
        () => session?.jointLoginData.accountRoleList || [],
        [session],
    );
    const activeId = session?.activeAccountRoleId;
    const tenantName = session?.tenantName || t("noTenant");
    const displayName =
        session?.currentRole?.accountNickname
        || session?.currentRole?.accountMobile
        || session?.jointLoginData.vendorName
        || t("noTenant");

    const filtered = useMemo(() => {
        const text = keyword.trim().toLowerCase();
        if (!text) return roles;
        return roles.filter((role) => role.shopName?.toLowerCase().includes(text));
    }, [keyword, roles]);

    const handleSelect = async (accountRoleId: number) => {
        if (switching || accountRoleId === activeId) {
            setOpen(false);
            return;
        }
        setOpen(false);
        setKeyword("");
        try {
            await switchTenant(accountRoleId);
            window.location.reload();
        } catch (error) {
            console.error(error);
            toast.error(t("switchFailed"));
        }
    };

    const handleLogout = async () => {
        const ok = await confirm({
            title: t("logoutConfirmTitle"),
            description: t("logoutConfirmDesc"),
            confirmLabel: t("logoutConfirm"),
            cancelLabel: ts("cancel"),
            variant: "destructive",
        });
        if (!ok) return;
        logout();
        router.replace("/login");
    };

    return (
        <div className="flex items-center gap-0.5">
            {switching && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70">
                    <p className="text-sm text-muted-foreground">{t("switchingTenant")}</p>
                </div>
            )}

            {roles.length > 1 ? (
                <DropdownMenu
                    open={open}
                    onOpenChange={(next) => {
                        setOpen(next);
                        if (!next) setKeyword("");
                    }}
                >
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            className="h-9 max-w-[9.5rem] gap-1.5 px-2 sm:max-w-[14rem]"
                            title={tenantName}
                        >
                            <span className="min-w-0 flex-1 truncate text-left text-sm">
                                {tenantName}
                            </span>
                            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="bottom" align="end" className="w-64 p-2">
                        <div className="relative mb-2">
                            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={keyword}
                                onChange={(event) => setKeyword(event.target.value)}
                                onKeyDown={(event) => event.stopPropagation()}
                                placeholder={t("searchTenant")}
                                className="h-9 pl-8"
                            />
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            {filtered.length === 0 && (
                                <p className="px-2 py-3 text-xs text-muted-foreground">{t("noTenantMatch")}</p>
                            )}
                            {filtered.map((role) => {
                                const active = role.accountRoleId === activeId;
                                return (
                                    <button
                                        key={role.accountRoleId}
                                        type="button"
                                        className={cn(
                                            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                                            active && "bg-primary-subtle text-primary",
                                        )}
                                        onClick={() => handleSelect(role.accountRoleId)}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{role.shopName}</span>
                                        {active && <Check className="h-4 w-4 shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                <p
                    className="hidden max-w-[9.5rem] truncate px-2 text-sm sm:block sm:max-w-[14rem]"
                    title={tenantName}
                >
                    {tenantName}
                </p>
            )}

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="h-9 max-w-[8rem] gap-1.5 px-2"
                        title={displayName}
                    >
                        <User className="h-4 w-4 shrink-0" />
                        <span className="hidden min-w-0 truncate text-sm sm:inline">{displayName}</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end" className="w-48">
                    <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        {t("logoutConfirmTitle")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
