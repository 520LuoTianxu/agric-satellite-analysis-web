"use client";

import { useTranslations } from "next-intl";
import { AgriIndexGlossary } from "@/components/field/agri-index-glossary";
import { getRemoteSensingKey } from "@/lib/remote-sensing-guide";

/** 指标切换时就地解释含义，让第一次使用的人不必先打开帮助或理解缩写。 */
export function IndexExplainer({ index }: { index: string }) {
    const t = useTranslations("agriPanel");
    const key = getRemoteSensingKey(index);
    const label = t(`indexLabels.${key}`);

    return (
        <section data-tour="growth-index" aria-label={t("indexGuideAria", { index: label })} className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-foreground">{label}</h3>
                <AgriIndexGlossary initialKey={key} />
            </div>
            <p>{t(`indexHints.${key}`)}</p>
            <p className="text-muted-foreground"><span className="font-medium text-foreground">{t("indexGuideHow")}：</span>{t(`indexGuideReadings.${key}`)}</p>
        </section>
    );
}
