"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    bootstrapSession,
    clearOrgAccessDenied,
    isOrgAccessDenied,
    loginFromXianghe,
    loginWithPassword,
    logout as logoutSession,
    OrgAccessDeniedError,
    readSession,
    switchTenant as switchTenantSession,
    type AuthSession,
} from "@/lib/auth";

export type OrgAccessStatus = "checking" | "allowed" | "denied";

interface AuthContextValue {
    hydrated: boolean;
    accessStatus: OrgAccessStatus;
    session: AuthSession | null;
    switching: boolean;
    login: (username: string, password: string) => Promise<void>;
    switchTenant: (accountRoleId: number) => Promise<void>;
    logout: () => void;
    continueWithAnotherAccount: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readXiangheHandoff() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (!params.has("xiangheBms")) return null;

    // 凭证只从片段读取一次，并在发请求前从浏览器地址栏移除。
    const token = params.get("xiangheBms") ?? "";
    const baseId = params.get("baseId") ?? "";
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    if (!window.location.pathname.replace(/\/+$/, "").endsWith("/farms/fields/detail")) return null;
    return { token, baseId };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [hydrated, setHydrated] = useState(false);
    const [accessStatus, setAccessStatus] = useState<OrgAccessStatus>("checking");
    const [session, setSession] = useState<AuthSession | null>(null);
    const [switching, setSwitching] = useState(false);
    const handoffRef = useRef<Promise<AuthSession> | null>(null);

    useEffect(() => {
        let cancelled = false;
        // 开发模式重新执行 effect 时复用同一次换登，避免片段已移除后提早跳到登录页。
        if (!handoffRef.current) {
            const handoff = readXiangheHandoff();
            if (handoff) handoffRef.current = loginFromXianghe(handoff.token, handoff.baseId);
        }
        const handoffLogin = handoffRef.current;
        (async () => {
            if (!handoffLogin && isOrgAccessDenied()) {
                if (!cancelled) {
                    setSession(null);
                    setAccessStatus("denied");
                    setHydrated(true);
                }
                return;
            }
            try {
                const next = await (handoffLogin ?? bootstrapSession());
                if (cancelled) return;
                if (handoffLogin) clearOrgAccessDenied();
                if (isOrgAccessDenied()) {
                    setSession(null);
                    setAccessStatus("denied");
                } else {
                    setSession(next);
                    setAccessStatus("allowed");
                }
            } catch (error) {
                if (cancelled) return;
                if (error instanceof OrgAccessDeniedError) {
                    setSession(null);
                    setAccessStatus("denied");
                } else {
                    if (handoffLogin) {
                        toast.error("乡合免登失败，请确认账号和基地后重试");
                    } else {
                        console.warn("bootstrapSession failed:", error);
                    }
                    // Fail closed: do not restore a cached session without a successful SSO org check.
                    setSession(null);
                    setAccessStatus("allowed");
                }
            } finally {
                if (!cancelled) setHydrated(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        try {
            const next = await loginWithPassword(username, password);
            clearOrgAccessDenied();
            setSession(next);
            setAccessStatus("allowed");
        } catch (error) {
            if (error instanceof OrgAccessDeniedError) {
                setSession(null);
                setAccessStatus("denied");
            }
            throw error;
        }
    }, []);

    const switchTenant = useCallback(async (accountRoleId: number) => {
        setSwitching(true);
        try {
            const next = await switchTenantSession(accountRoleId);
            clearOrgAccessDenied();
            setSession(next);
            setAccessStatus("allowed");
        } catch (error) {
            if (error instanceof OrgAccessDeniedError) {
                setSession(null);
                setAccessStatus("denied");
            }
            throw error;
        } finally {
            setSwitching(false);
        }
    }, []);

    const logout = useCallback(() => {
        logoutSession({ skipDdAutoLogin: true });
        setSession(null);
        setAccessStatus("allowed");
    }, []);

    const continueWithAnotherAccount = useCallback(() => {
        clearOrgAccessDenied();
        logoutSession({ skipDdAutoLogin: true });
        setSession(null);
        setAccessStatus("allowed");
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            hydrated,
            accessStatus,
            session,
            switching,
            login,
            switchTenant,
            logout,
            continueWithAnotherAccount,
        }),
        [hydrated, accessStatus, session, switching, login, switchTenant, logout, continueWithAnotherAccount],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return ctx;
}
