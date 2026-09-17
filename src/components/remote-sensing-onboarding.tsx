"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/auth-provider";
import { ProductTourOverlay } from "@/components/product-tour";
import { Button } from "@/components/ui/button";
import { prepareTourTarget, TOUR_STORAGE_PREFIX, waitForTourTarget } from "@/lib/product-tour";

const STEPS = [
    { key: "nav", selectors: ["[data-tour='nav-farms']"], href: "/farms" },
    { key: "project", selectors: ["[data-tour='project-card']"] },
    { key: "land", selectors: ["[data-tour='project-land']", "[data-tour='project-lands']"], prepare: { mobileList: true } },
    { key: "ndvi", selectors: ["[data-tour='tab-ndvi']"], prepare: { tab: "ndvi", sidebar: true } },
    { key: "date", selectors: ["[data-tour='select-date']", "[data-tour='timeseries']"], prepare: { tab: "ndvi", sidebar: true } },
    { key: "growth", selectors: ["[data-tour='heatmap-modes']", "[data-tour='growth-index']"], prepare: { tab: "ndvi", sidebar: true } },
    { key: "report", selectors: ["[data-tour='tab-report']"], prepare: { tab: "land-report", sidebar: true } },
] as const;

type StepDef = (typeof STEPS)[number];

/** 首次使用以蒙版高亮真实操作点；关闭后按账号记住，导航入口始终允许重新查看。 */
export function RemoteSensingOnboarding() {
    const t = useTranslations("remoteSensingOnboarding");
    const { session } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);
    const [target, setTarget] = useState<HTMLElement | null>(null);
    const [waiting, setWaiting] = useState(false);
    const runIdRef = useRef(0);
    const storageKey = session ? `${TOUR_STORAGE_PREFIX}${session.activeAccountRoleId}` : null;

    const markSeen = useCallback(() => {
        if (!storageKey) return;
        try {
            localStorage.setItem(storageKey, "seen");
        } catch {
            // 记忆失败只影响下次是否自动展示，不影响关闭或继续操作。
        }
    }, [storageKey]);

    const closeTour = useCallback(() => {
        runIdRef.current += 1;
        setOpen(false);
        setWaiting(false);
        setTarget(null);
        markSeen();
    }, [markSeen]);

    const showStep = useCallback(async (index: number) => {
        if (index < 0) return;
        if (index >= STEPS.length) {
            closeTour();
            return;
        }
        const runId = ++runIdRef.current;
        const def: StepDef = STEPS[index];
        setStep(index);
        setWaiting(true);
        const element = await waitForTourTarget(def.selectors, 8000, () => {
            if ("prepare" in def && def.prepare) prepareTourTarget(def.prepare);
        });
        if (runId !== runIdRef.current) return;
        if (!element) {
            await showStep(index + 1);
            return;
        }
        setTarget(element);
        setWaiting(false);
    }, [closeTour]);

    useEffect(() => {
        setStep(0);
        setTarget(null);
        if (!storageKey) {
            setOpen(false);
            return;
        }
        try {
            setOpen(localStorage.getItem(storageKey) !== "seen");
        } catch {
            setOpen(true);
        }
    }, [storageKey]);

    useEffect(() => {
        if (open) void showStep(0);
        // 只在打开引导时从第一步开始，避免步骤切换时重置。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open || !target) return;
        const advance = () => {
            const href = target.getAttribute("data-tour-href") || ("href" in STEPS[step] ? STEPS[step].href : undefined);
            const navigatesItself = Boolean(target.closest("a"));
            if (href && !navigatesItself) router.push(href);
            window.setTimeout(() => {
                void showStep(step + 1);
            }, 240);
        };
        target.addEventListener("click", advance);
        return () => target.removeEventListener("click", advance);
    }, [open, target, step, showStep, router]);

    function startTour() {
        setStep(0);
        setTarget(null);
        setOpen(true);
        if (pathname !== "/farms" && !pathname.startsWith("/farms/")) {
            router.push("/farms");
        }
    }

    function handleOpenTrigger() {
        if (open) {
            closeTour();
            return;
        }
        startTour();
    }

    function handleNext() {
        if (step >= STEPS.length - 1) {
            closeTour();
            return;
        }
        const href = target?.getAttribute("data-tour-href") || ("href" in STEPS[step] ? STEPS[step].href : undefined);
        if (href) router.push(href);
        void showStep(step + 1);
    }

    const current = STEPS[step] ?? STEPS[0];

    return (
        <>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 cursor-pointer gap-1.5 px-2 text-xs"
                title={t("trigger")}
                onClick={handleOpenTrigger}
            >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                <span>{t("trigger")}</span>
            </Button>
            <ProductTourOverlay
                open={open}
                step={step}
                total={STEPS.length}
                title={t(`${current.key}.title`)}
                body={t(`${current.key}.body`)}
                waiting={waiting}
                target={target}
                onNext={handleNext}
                onPrev={step > 0 ? () => void showStep(step - 1) : undefined}
                onClose={closeTour}
                nextLabel={t("next")}
                prevLabel={t("previous")}
                skipLabel={t("skip")}
                finishLabel={t("finish")}
                waitingLabel={t("waiting")}
            />
        </>
    );
}
