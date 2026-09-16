import type { Metadata } from "next";
import { AppShell } from "./app-shell";
import { AuthGuard } from "@/components/auth-guard";

export const metadata: Metadata = {
    robots: { index: false, follow: false, nocache: true },
};

export default async function AuthenticatedLayout({
    children,
}: {
    children: React.ReactNode;
    params: { locale: string };
}) {
    return (
        <AuthGuard>
            <AppShell>{children}</AppShell>
        </AuthGuard>
    );
}
