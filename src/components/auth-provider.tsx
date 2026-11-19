"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
    bootstrapSession,
    clearOrgAccessDenied,
    isOrgAccessDenied,
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [hydrated, setHydrated] = useState(false);
    const [accessStatus, setAccessStatus] = useState<OrgAccessStatus>("checking");
    const [session, setSession] = useState<AuthSession | null>(null);
    const [switching, setSwitching] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (isOrgAccessDenied()) {
                if (!cancelled) {
                    setSession(null);
                    setAccessStatus("denied");
                    setHydrated(true);
                }
                return;
            }
            try {
                const next = await bootstrapSession();
                if (cancelled) return;
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
                    console.warn("bootstrapSession failed:", error);
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
