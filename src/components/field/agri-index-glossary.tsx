"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleHelp } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    getRemoteSensingKey,
    REMOTE_SENSING_KEYS,
    type RemoteSensingKey,
} from "@/lib/remote-sensing-guide";

export type GlossaryKey = RemoteSensingKey;

/** Public OSS base for glossary plates (uploaded via scripts/upload_to_oss.py). */
const GLOSSARY_ASSET_BASE = (
    process.env.NEXT_PUBLIC_GLOSSARY_ASSET_BASE ||
    "https://agric-dev.oss-cn-beijing.aliyuncs.com/web/glossary"
).replace(/\/$/, "");

function glossaryAsset(fileName: string): string {
    return `${GLOSSARY_ASSET_BASE}/${fileName}`;
}

// 保留已有专业配图作为补充；白话说明不依赖图片加载成功。
const GLOSSARY_IMAGES: Partial<Record<GlossaryKey, string>> = {
    sentinel2: "sentinel-s2.png",
    sentinel1: "sentinel-s1.png",
    ndvi: "ndvi-20260915.png",
    evi: "evi.png",
    drought: "drought.png",
    flood: "flood.png",
    vv: "vv-20260915.png",
    vh: "vh-20260915.png",
    ndmi: "ndmi.png",
    ndre: "ndre.png",
    // 历史资源的 CIRE 与 MNDWI 图片内容对调，按实际语义关联。
    cire: "mndwi.png",
    mndwi: "cire.png",
};

const GLOSSARY_ENTRIES = REMOTE_SENSING_KEYS.map((key) => ({
    key: key as GlossaryKey,
}));
const GLOSSARY_TERM_KEYS = ["scene", "cloud", "decloud", "heatmap", "mean", "season"] as const;

export interface AgriIndexGlossaryProps {
    /** Current panel series — used as default selected topic when dialog opens */
    initialKey?: string | null;
    /** Optional class on the trigger button */
    triggerClassName?: string;
    /** Show text label「指标说明」next to icon (default: icon + short label on sm+) */
    showLabel?: boolean;
}

export function AgriIndexGlossary({
    initialKey = null,
    triggerClassName,
    showLabel = true,
}: AgriIndexGlossaryProps) {
    const t = useTranslations("agriPanel");
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<GlossaryKey>(() =>
        getRemoteSensingKey(initialKey),
    );

    const entryTitle = t(`indexLabels.${selected}`);
    const entryName = t(`indexGuideNames.${selected}`);
    const imageFile = GLOSSARY_IMAGES[selected];

    function handleOpenChange(nextOpen: boolean) {
        // 每次打开都从当前指标开始，避免上次浏览的条目与当前图层不一致。
        if (nextOpen) setSelected(getRemoteSensingKey(initialKey));
        setOpen(nextOpen);
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn(
                        "h-7 shrink-0 gap-1 px-2 text-xs border-primary/30 text-primary hover:bg-primary/10",
                        showLabel ? "sm:px-2.5" : "w-7 p-0",
                        triggerClassName,
                    )}
                    title={t("indexGuideButton")}
                    aria-label={t("indexGuideButton")}
                >
                    <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                    {showLabel ? <span>{t("indexGuideButton")}</span> : null}
                </Button>
            </DialogTrigger>
            <DialogContent
                className={cn(
                    "flex max-h-[min(90vh,52rem)] w-[min(96vw,64rem)] max-w-[min(96vw,64rem)] flex-col gap-0 overflow-hidden p-0",
                    "sm:rounded-lg",
                )}
            >
                <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 pr-12 text-left">
                    <DialogTitle className="text-base">{t("indexGuideDialogTitle")}</DialogTitle>
                    <DialogDescription className="text-xs leading-relaxed">
                        {t("indexGuideDialogDescription")}
                    </DialogDescription>
                </DialogHeader>

                {/* Mobile: topic select */}
                <div className="shrink-0 border-b px-3 py-2 md:hidden">
                    <Select
                        value={selected}
                        onValueChange={(v) => setSelected(v as GlossaryKey)}
                    >
                        <SelectTrigger className="h-8 w-full text-xs" aria-label={t("indexGuideSelectEntry")}>
                            <SelectValue placeholder={t("indexGuideSelectEntry")} />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            {GLOSSARY_ENTRIES.map((e) => (
                                <SelectItem key={e.key} value={e.key} className="text-xs">
                                    {t(`indexLabels.${e.key}`)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                    {/* Desktop left nav */}
                    <nav
                        className="hidden w-44 shrink-0 overflow-y-auto border-r bg-muted/30 py-2 md:block lg:w-52"
                        aria-label={t("indexGuideNavLabel")}
                    >
                        {GLOSSARY_ENTRIES.map((e) => {
                            const active = e.key === selected;
                            return (
                                <button
                                    key={e.key}
                                    type="button"
                                    onClick={() => setSelected(e.key)}
                                    aria-current={active ? "true" : undefined}
                                    className={cn(
                                        "flex w-full px-3 py-1.5 text-left text-[11px] leading-snug transition-colors",
                                        active
                                            ? "bg-primary/10 font-medium text-primary"
                                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                    )}
                                >
                                    {t(`indexLabels.${e.key}`)}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Detail pane */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                        <div className="space-y-3">
                            <div>
                                <h3 className="text-sm font-semibold tracking-tight">
                                    {entryTitle}
                                </h3>
                                <p className="mt-1 text-xs text-muted-foreground">{entryName}</p>
                            </div>
                            <div className={cn("grid gap-4", imageFile && "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]")}>
                                <div className="min-w-0 space-y-3">
                                    <dl className="space-y-4 text-sm leading-relaxed">
                                        {[
                                            [t("indexGuideWhat"), t(`indexHints.${selected}`)],
                                            [t("indexGuideHow"), t(`indexGuideReadings.${selected}`)],
                                            [t("indexGuideNextStep"), t(`indexGuideActions.${selected}`)],
                                        ].map(([label, text]) => (
                                            <div key={label}>
                                                <dt className="mb-1 font-semibold text-primary">{label}</dt>
                                                <dd className="text-foreground/90">{text}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                    <details className="rounded-lg border bg-muted/20 p-3">
                                        <summary className="cursor-pointer text-xs font-medium">{t("indexGuideTermsSummary")}</summary>
                                        <dl className="mt-3 space-y-3 text-xs leading-relaxed">
                                            {GLOSSARY_TERM_KEYS.map((termKey) => (
                                                <div key={termKey}>
                                                    <dt className="font-medium">{t(`indexGuideTerms.${termKey}.label`)}</dt>
                                                    <dd className="mt-1 text-muted-foreground">{t(`indexGuideTerms.${termKey}.description`)}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </details>
                                </div>
                                {imageFile ? (
                                    // 专业图与说明并排展示，桌面端滚动文字时保持图片在视野内。
                                    <figure key={selected} className="rounded-lg border bg-muted/20 p-3 lg:sticky lg:top-0 lg:self-start">
                                    <figcaption className="text-xs font-medium">{t("indexGuideFigureCaption")}</figcaption>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={glossaryAsset(imageFile)}
                                            alt={t("indexGuideFigureAlt", { name: entryName })}
                                            loading="lazy"
                                            className="mx-auto mt-3 max-h-[min(65vh,36rem)] w-full object-contain"
                                        />
                                    </figure>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default AgriIndexGlossary;
