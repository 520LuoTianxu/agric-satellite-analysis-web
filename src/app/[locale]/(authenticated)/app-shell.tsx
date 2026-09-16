"use client";

import React from "react";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { TopNav } from "@/components/top-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
    return (
        <ConfirmDialogProvider>
            <div className="flex h-screen flex-col overflow-hidden">
                <TopNav />
                <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-surface-2">
                    {children}
                </main>
            </div>
        </ConfirmDialogProvider>
    );
}
