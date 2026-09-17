"use client";

import React, { FormEvent, Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Eye, EyeOff, Leaf, Loader2, LockKeyhole, Satellite, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/auth-provider";
import { AuthApiError } from "@/lib/auth";
import illustrationManifest from "../../public/illustrations/login/oss-manifest.json";

// OSS 按展示尺寸压缩为 WebP，辅图保留透明通道，减少登录页首次加载的图片流量。
const LOGIN_ILLUSTRATIONS = {
    hero: `${illustrationManifest.files["satellite-fields-20260916.png"]}?x-oss-process=image/resize,w_1024/quality,q_85/format,webp`,
    accent: `${illustrationManifest.files["satellite-seedling-20260916.png"]}?x-oss-process=image/resize,w_160/format,webp`,
};

/** 登录状态检测期间保持表单轮廓，避免免登检查完成时页面布局突然跳动。 */
function LoginLoading() {
    const t = useTranslations("auth");

    return (
        <div className="flex w-full max-w-sm flex-col gap-8" role="status" aria-label={t("ssoChecking")}>
            <div className="space-y-3">
                <Skeleton className="h-10 w-40" />
                <Skeleton className="h-4 w-full" />
            </div>
            <div className="space-y-6">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
            </div>
            <p className="text-center text-sm text-muted-foreground">{t("ssoChecking")}</p>
        </div>
    );
}

// 登录后只跳转到站内页面，避免外部重定向和再次进入登录页造成循环。
function safeRedirect(value: string | null): string {
    if (!value) return "/";
    if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
        return "/";
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
    const [showPassword, setShowPassword] = useState(false);
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

    return (
        <main className="flex min-h-svh flex-col bg-surface-2 px-4 py-6 sm:px-6 lg:p-8">
            <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-border bg-primary-subtle text-primary">
                        <Leaf className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 space-y-1">
                        <p className="break-words text-sm font-semibold tracking-tight sm:text-lg">{tc("brandName")}</p>
                        <p className="text-xs text-muted-foreground">{t("platformLabel")}</p>
                    </div>
                </div>
                <ThemeToggle className="relative h-11 w-11 shrink-0 rounded-full border border-border bg-card" />
            </header>

            <div className="flex flex-1 items-center py-8 lg:py-10">
                <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-2">
                    {/* 品牌区始终使用深色主题，保证插图背景和文字对比度不受全站主题切换影响。 */}
                    <section className="dark relative isolate hidden min-h-[640px] overflow-hidden bg-surface-2 text-foreground lg:flex lg:flex-col lg:justify-between" aria-labelledby="login-hero-title">
                        <Image
                            src={LOGIN_ILLUSTRATIONS.hero}
                            alt=""
                            fill
                            sizes="(min-width: 1024px) 576px, 1px"
                            unoptimized
                            priority
                            className="pointer-events-none object-cover"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-background/30 to-background/90" />
                        <div className="relative z-10 space-y-6 p-10">
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/50 px-3 py-2 text-xs font-medium text-primary">
                                <Satellite className="h-4 w-4" aria-hidden="true" />
                                {t("heroBadge")}
                            </div>
                            <div className="space-y-4">
                                <h2 id="login-hero-title" className="text-[length:var(--text-display)] font-semibold leading-snug tracking-tight">
                                    <span className="block">{t("heroTitle1")}</span>
                                    <span className="block text-primary">{t("heroTitle2")}</span>
                                </h2>
                                <p className="max-w-sm text-sm leading-relaxed text-foreground/85">{t("heroDesc")}</p>
                            </div>
                        </div>
                        <div className="relative z-10 space-y-4 p-10 pt-0">
                            <div className="flex flex-wrap gap-2">
                                {["featureSensing", "featureEnvironment", "featureReports"].map((feature) => (
                                    <span key={feature} className="rounded-full border border-foreground/15 bg-background/60 px-3 py-2 text-xs text-foreground/85">
                                        {t(feature)}
                                    </span>
                                ))}
                            </div>
                            <p className="text-xs text-foreground/60">{t("illustrationCaption")}</p>
                        </div>
                    </section>

                    <section className="flex min-w-0 items-center justify-center px-6 py-10 sm:p-10 lg:p-12" aria-labelledby={hydrated && !session ? "login-title" : undefined}>
                        {!hydrated || session ? <LoginLoading /> : (
                            <div className="flex w-full max-w-sm flex-col gap-8">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                                            <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                                            {t("accountLogin")}
                                        </span>
                                        <Image
                                            src={LOGIN_ILLUSTRATIONS.accent}
                                            alt=""
                                            width={80}
                                            height={80}
                                            unoptimized
                                            className="h-20 w-20 object-contain"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <h1 id="login-title" className="text-2xl font-bold tracking-tight">{tc("welcomeBack")}</h1>
                                        <p className="text-sm leading-relaxed text-muted-foreground">{t("formDesc")}</p>
                                    </div>
                                </div>

                                <form className="space-y-6" onSubmit={handleSubmit} aria-busy={submitting}>
                                    <div className="space-y-2">
                                        <Label htmlFor="username">{t("username")}</Label>
                                        <div className="relative">
                                            <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                            <Input
                                                id="username"
                                                name="username"
                                                autoComplete="username"
                                                autoCapitalize="none"
                                                spellCheck={false}
                                                value={username}
                                                onChange={(event) => setUsername(event.target.value)}
                                                placeholder={t("usernamePlaceholder")}
                                                disabled={submitting}
                                                className="h-11 bg-surface-2 pl-10 text-base transition-colors focus-visible:bg-background sm:text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="password">{t("password")}</Label>
                                        <div className="relative">
                                            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                            <Input
                                                id="password"
                                                name="password"
                                                type={showPassword ? "text" : "password"}
                                                autoComplete="current-password"
                                                value={password}
                                                onChange={(event) => setPassword(event.target.value)}
                                                placeholder={t("passwordPlaceholder")}
                                                disabled={submitting}
                                                className="h-11 bg-surface-2 pl-10 pr-12 text-base transition-colors focus-visible:bg-background sm:text-sm"
                                            />
                                            {/* 显隐按钮只切换显示方式，不提交表单，也不改变原始密码值。 */}
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setShowPassword((visible) => !visible)}
                                                disabled={submitting}
                                                aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                                                aria-pressed={showPassword}
                                                aria-controls="password"
                                                className="absolute right-0 top-0 h-11 w-11 text-muted-foreground hover:text-foreground"
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                                            </Button>
                                        </div>
                                    </div>
                                    <Button type="submit" size="lg" className="w-full gap-2" disabled={submitting}>
                                        {submitting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                                        {t("submit")}
                                        {!submitting ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
                                        <span className="sr-only" role="status">{submitting ? t("submitting") : ""}</span>
                                    </Button>
                                </form>

                            </div>
                        )}
                    </section>
                </div>
            </div>

            <footer className="mx-auto w-full max-w-6xl text-center text-xs leading-relaxed text-muted-foreground">{t("footer")}</footer>
        </main>
    );
}

export function LoginPage() {
    return (
        <Suspense fallback={<div className="flex min-h-svh items-center justify-center bg-surface-2 p-6"><LoginLoading /></div>}>
            <LoginForm />
        </Suspense>
    );
}
