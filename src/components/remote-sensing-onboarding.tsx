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
    // 第二步必须进入已有地块的项目，否则下一步无法引导用户选择地块。
    { key: "project", selectors: ["[data-tour='project-card'][data-tour-has-lands='true']"] },
    // 只定位真实地块按钮；列表容器不能代表“选择一块地”，也不能响应任意筛选点击。
    { key: "land", selectors: ["[data-tour='project-land']"], prepare: { mobileList: true } },
    { key: "ndvi", selectors: ["[data-tour='tab-ndvi']"], prepare: { tab: "ndvi", sidebar: true } },
    { key: "date", selectors: ["[data-tour='select-date']", "[data-tour='timeseries']"], prepare: { tab: "ndvi", sidebar: true } },
    { key: "growth", selectors: ["[data-tour='heatmap-modes']", "[data-tour='growth-index']"], prepare: { tab: "ndvi", sidebar: true } },
    { key: "report", selectors: ["[data-tour='tab-report']"], prepare: { tab: "land-report", sidebar: true } },
] as const;

type StepDef = (typeof STEPS)[number];
type ShowStepOptions = { skipNavigation?: boolean };

function getInternalRoute(pathname: string): string {
    if (typeof window === "undefined") return pathname;
    return `${pathname}${window.location.search}`;
}

function isCurrentRoute(pathname: string, href: string): boolean {
    const [hrefPath, hrefQuery] = href.split("?", 2);
    if (pathname !== hrefPath) return false;
    if (!hrefQuery) return true;
    return typeof window !== "undefined" && window.location.search === `?${hrefQuery}`;
}

/**
 * 首次使用以蒙版高亮真实操作点。
 * 通过步骤路径记录保证跨页前进、返回都可恢复，关闭后按账号记住状态。
 */
export function RemoteSensingOnboarding() {
    const t = useTranslations("remoteSensingOnboarding");
    const { session } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);
    const [target, setTarget] = useState<HTMLElement | null>(null);
    const [waiting, setWaiting] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const runIdRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const openRef = useRef(false);
    const pathnameRef = useRef(pathname);
    const routerRef = useRef(router);
    const routeByStepRef = useRef<Record<number, string>>({});
    const storageKey = session ? `${TOUR_STORAGE_PREFIX}${session.activeAccountRoleId}` : null;

    useEffect(() => {
        pathnameRef.current = pathname;
    }, [pathname]);

    useEffect(() => {
        // 路由对象可能随页面切换更新，但引导状态不能因此重新从第一步开始。
        routerRef.current = router;
    }, [router]);

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
        openRef.current = false;
        abortRef.current?.abort();
        abortRef.current = null;
        setOpen(false);
        setWaiting(false);
        setUnavailable(false);
        setTarget(null);
        markSeen();
    }, [markSeen]);

    const showStep = useCallback(async (index: number, destination?: string, options: ShowStepOptions = {}) => {
        if (index < 0) return;
        if (index >= STEPS.length) {
            closeTour();
            return;
        }
        const runId = ++runIdRef.current;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const def: StepDef = STEPS[index];
        setStep(index);
        setTarget(null);
        setWaiting(true);
        setUnavailable(false);
        if (!options.skipNavigation && destination && !isCurrentRoute(pathnameRef.current, destination)) {
            routerRef.current.push(destination);
        }
        const element = await waitForTourTarget(def.selectors, {
            timeoutMs: 8000,
            signal: controller.signal,
            prepare: () => {
                if ("prepare" in def && def.prepare) prepareTourTarget(def.prepare);
            },
        });
        if (runId !== runIdRef.current || controller.signal.aborted) return;
        setTarget(element);
        setWaiting(false);
        setUnavailable(!element);
    }, [closeTour]);

    useEffect(() => {
        abortRef.current?.abort();
        routeByStepRef.current = {};
        setStep(0);
        setTarget(null);
        setUnavailable(false);
        if (!storageKey) {
            setOpen(false);
            return;
        }
        try {
            const shouldAutoOpen = localStorage.getItem(storageKey) !== "seen";
            setOpen(shouldAutoOpen);
            if (shouldAutoOpen) {
                // 第一次自动展示就立即记为已触发，刷新或中途离开不会再次打断用户。
                localStorage.setItem(storageKey, "seen");
            }
        } catch {
            setOpen(true);
        }
    }, [storageKey]);

    useEffect(() => {
        openRef.current = open;
        if (!open) {
            abortRef.current?.abort();
            return;
        }
        // 保存打开引导时的页面，用户返回第一步时仍能回到原上下文。
        routeByStepRef.current = { 0: getInternalRoute(pathnameRef.current) };
        void showStep(0);
        return () => abortRef.current?.abort();
    }, [open, showStep]);

    const getStepHref = useCallback((index: number, sourceTarget?: HTMLElement | null) => {
        const directHref = sourceTarget?.getAttribute("data-tour-href");
        if (directHref) return directHref;
        const nestedHref = sourceTarget?.querySelector<HTMLElement>("[data-tour-href]")?.getAttribute("data-tour-href");
        if (nestedHref) return nestedHref;
        const def = STEPS[index];
        return "href" in def ? def.href : undefined;
    }, []);

    const moveToStep = useCallback((nextIndex: number, sourceStep: number, sourceTarget?: HTMLElement | null, options: ShowStepOptions = {}) => {
        if (!openRef.current) return;
        if (nextIndex >= STEPS.length) {
            closeTour();
            return;
        }
        const destination = getStepHref(sourceStep, sourceTarget) || getInternalRoute(pathnameRef.current);
        routeByStepRef.current[nextIndex] = destination;
        Object.keys(routeByStepRef.current).forEach((key) => {
            if (Number(key) > nextIndex) delete routeByStepRef.current[Number(key)];
        });
        void showStep(nextIndex, destination, options);
    }, [closeTour, getStepHref, showStep]);

    useEffect(() => {
        if (!open || !target) return;
        const targetStep = step;
        let handled = false;
        const advance = (event: MouseEvent) => {
            // 仅响应普通左键操作；新窗口打开、拖拽或组合键点击不应改变当前引导步骤。
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (handled) return;
            handled = true;
            const navigatesItself = Boolean(target.closest("a"));
            // 让 Link 先完成自身导航，再由控制器等待下一页目标出现，避免重复 push。
            window.setTimeout(() => moveToStep(targetStep + 1, targetStep, target, { skipNavigation: navigatesItself }), 0);
        };
        target.addEventListener("click", advance);
        return () => target.removeEventListener("click", advance);
    }, [open, target, step, moveToStep]);

    function startTour() {
        abortRef.current?.abort();
        runIdRef.current += 1;
        openRef.current = true;
        routeByStepRef.current = {};
        setStep(0);
        setTarget(null);
        setUnavailable(false);
        setOpen(true);
    }

    function handleOpenTrigger() {
        if (open) {
            closeTour();
            return;
        }
        startTour();
    }

    function handleNext() {
        moveToStep(step + 1, step, target);
    }

    function handlePrevious() {
        if (step <= 0) return;
        void showStep(step - 1, routeByStepRef.current[step - 1]);
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
                unavailable={unavailable}
                target={target}
                onNext={handleNext}
                onPrev={step > 0 ? handlePrevious : undefined}
                onClose={closeTour}
                nextLabel={t("next")}
                prevLabel={t("previous")}
                skipLabel={t("skip")}
                finishLabel={t("finish")}
                waitingLabel={t("waiting")}
                unavailableLabel={t("unavailable")}
                retryLabel={t("retry")}
                onRetry={() => void showStep(step, routeByStepRef.current[step])}
            />
        </>
    );
}
