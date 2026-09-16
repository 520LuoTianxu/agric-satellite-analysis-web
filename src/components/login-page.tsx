"use client";

import React, { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Leaf } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth-provider";
import { AuthApiError } from "@/lib/auth";

function safeRedirect(value: string | null): string {
    if (!value) return "/overview";
    if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
        return "/overview";
    }
    return value;
}

function LoginForm() {
    const t = useTranslations("auth");
    const tc = useTranslations("common");
    const router = useRouter();
    const searchParams = useSearchParams();
    const { hydrated, session, login } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (hydrated && session) {
            router.replace(safeRedirect(searchParams.get("redirect")));
        }
    }, [hydrated, session, router, searchParams]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!username.trim()) {
            toast.error(t("requiredUsername"));
            return;
        }
        if (!password) {
            toast.error(t("requiredPassword"));
            return;
        }
        setSubmitting(true);
        try {
            await login(username, password);
            router.replace(safeRedirect(searchParams.get("redirect")));
        } catch (error) {
            const message = error instanceof AuthApiError || error instanceof Error
                ? error.message
                : t("failed");
            toast.error(message || t("failed"));
        } finally {
            setSubmitting(false);
        }
    };

    if (!hydrated || session) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Leaf className="h-7 w-7 text-primary" />
                    <p className="text-sm">{t("ssoChecking")}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
            <Card className="w-full max-w-md shadow-md">
                <CardHeader className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Leaf className="h-7 w-7 text-primary" />
                        <span className="text-lg font-bold tracking-tight">{tc("brandName")}</span>
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">{t("title")}</CardTitle>
                    <p className="text-sm text-muted-foreground">{t("desc")}</p>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="space-y-2">
                            <Label htmlFor="username">{t("username")}</Label>
                            <Input
                                id="username"
                                autoComplete="username"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                placeholder={t("usernamePlaceholder")}
                                disabled={submitting}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">{t("password")}</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder={t("passwordPlaceholder")}
                                disabled={submitting}
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={submitting}>
                            {submitting ? t("submitting") : t("submit")}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

export function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}
