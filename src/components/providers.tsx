"use client";

import { ThemeProvider } from "next-themes";
import React from "react";
import { AuthProvider } from "@/components/auth-provider";
import { OrgAccessGuard } from "@/components/org-access-guard";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            storageKey="agric-theme"
            disableTransitionOnChange
        >
            <AuthProvider>
                <OrgAccessGuard>{children}</OrgAccessGuard>
            </AuthProvider>
        </ThemeProvider>
    );
}
