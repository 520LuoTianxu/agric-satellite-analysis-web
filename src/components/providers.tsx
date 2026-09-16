"use client";

import { ThemeProvider } from "next-themes";
import React from "react";
import { AuthProvider } from "@/components/auth-provider";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            storageKey="agric-theme"
            disableTransitionOnChange
        >
            <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
    );
}
