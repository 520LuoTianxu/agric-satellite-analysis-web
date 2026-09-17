"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, CalendarDays, ChartNoAxesCombined, FileText, MapPinned } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STEPS = [
    { key: "field", icon: MapPinned },
    { key: "date", icon: CalendarDays },
    { key: "growth", icon: ChartNoAxesCombined },
    { key: "report", icon: FileText },
] as const;

/** 首次使用展示四步入门；关闭后按账号记住选择，导航入口始终允许重新查看。 */
export function RemoteSensingOnboarding() {
    const t = useTranslations("remoteSensingOnboarding");
    const { session } = useAuth();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);
    const storageKey = session ? `agric:remote-sensing-guide:v1:${session.activeAccountRoleId}` : null;

    useEffect(() => {
        setStep(0);
        if (!storageKey) {
            setOpen(false);
            return;
        }
        try {
            setOpen(localStorage.getItem(storageKey) !== "seen");
        } catch {
            // 隐私模式禁用存储时仍可使用引导，不让帮助功能阻断页面。
            setOpen(true);
        }
    }, [storageKey]);

    function handleOpenChange(nextOpen: boolean) {
        if (nextOpen) setStep(0);
        if (!nextOpen && storageKey) {
            try {
                localStorage.setItem(storageKey, "seen");
            } catch {
                // 记忆失败只影响下次是否自动展示，不影响关闭或继续操作。
            }
        }
        setOpen(nextOpen);
    }

    const current = STEPS[step];
    const StepIcon = current.icon;
    const isLastStep = step === STEPS.length - 1;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1.5 px-2 text-xs" title={t("trigger")}>
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    <span>{t("trigger")}</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto rounded-xl p-5 sm:p-6">
                <DialogHeader className="pr-6 text-left">
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>
                <nav aria-label={t("stepsLabel")} className="grid grid-cols-4 gap-2">
                    {STEPS.map((item, index) => (
                        <button key={item.key} type="button" onClick={() => setStep(index)} aria-current={step === index ? "step" : undefined}
                            className={cn("flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", step === index && "border-primary/40 bg-primary/5 text-primary")}>
                            <span className={cn("flex h-6 w-6 items-center justify-center rounded-full bg-muted font-semibold", step === index && "bg-primary text-primary-foreground")}>{index + 1}</span>
                            <span>{t(`${item.key}.label`)}</span>
                        </button>
                    ))}
                </nav>
                <div aria-live="polite" aria-atomic="true" className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                        <span className="rounded-lg bg-primary/10 p-2.5 text-primary"><StepIcon className="h-6 w-6" aria-hidden="true" /></span>
                        <div>
                            <p className="mb-1 text-xs text-muted-foreground">{t("progress", { current: step + 1, total: STEPS.length })}</p>
                            <h3 className="text-base font-semibold">{t(`${current.key}.title`)}</h3>
                        </div>
                    </div>
                    <p className="text-sm leading-7">{t(`${current.key}.body`)}</p>
                    <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm leading-relaxed">{t(`${current.key}.tip`)}</p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{t("reopen")}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>{t("skip")}</Button>
                    <div className="flex flex-wrap items-center gap-2">
                        {step > 0 ? <Button type="button" variant="outline" size="sm" onClick={() => setStep(value => value - 1)}>{t("previous")}</Button> : null}
                        {isLastStep ? (
                            <>
                                <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>{t("finish")}</Button>
                                <Button asChild size="sm"><Link href="/farms" onClick={() => handleOpenChange(false)}>{t("start")}</Link></Button>
                            </>
                        ) : <Button type="button" size="sm" onClick={() => setStep(value => value + 1)}>{t("next")}</Button>}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
