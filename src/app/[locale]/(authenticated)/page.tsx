"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/auth-provider";
import { useTranslations } from "next-intl";

export default function HomePage() {
    const router = useRouter();
    const t = useTranslations("farmsPage");
    const { hydrated, session } = useAuth();

    useEffect(() => {
        // 首页不再承载选地分析报告；认证完成后统一进入项目遥感，避免与登录守卫竞争跳转。
        if (hydrated && session) {
            router.replace("/farms");
        }
    }, [hydrated, session, router]);

    return (
        <div className="flex justify-center p-12" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="sr-only">{t("loading")}</span>
        </div>
    );
}
