"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
    bootstrapSession,
    loginWithPassword,
    logout as logoutSession,
    readSession,
    switchTenant as switchTenantSession,
    type AuthSession,
} from "@/lib/auth";

interface AuthContextValue {
    hydrated: boolean;
    session: AuthSession | null;
    switching: boolean;
    login: (username: string, password: string) => Promise<void>;
    switchTenant: (accountRoleId: number) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [hydrated, setHydrated] = useState(false);
    const [session, setSession] = useState<AuthSession | null>(null);
    const [switching, setSwitching] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setSession(readSession());
        setHydrated(true);
        (async () => {
            try {
                const next = await bootstrapSession();
                if (!cancelled) setSession(next);
            } catch (error) {
                console.warn("bootstrapSession failed:", error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        const next = await loginWithPassword(username, password);
        setSession(next);
    }, []);

    const switchTenant = useCallback(async (accountRoleId: number) => {
        setSwitching(true);
        try {
            const next = await switchTenantSession(accountRoleId);
            setSession(next);
        } finally {
            setSwitching(false);
        }
    }, []);

    const logout = useCallback(() => {
        logoutSession({ skipDdAutoLogin: true });
        setSession(null);
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({ hydrated, session, switching, login, switchTenant, logout }),
        [hydrated, session, switching, login, switchTenant, logout],
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
