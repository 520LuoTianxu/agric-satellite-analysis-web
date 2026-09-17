export const TOUR_PREPARE_EVENT = "agric:tour-prepare";
// 步骤和目标定位方式发生变化后，使用新版本键避免旧引导状态阻断新流程。
export const TOUR_STORAGE_PREFIX = "agric:remote-sensing-guide:v3:";

export type TourPrepareDetail = {
    tab?: string;
    sidebar?: boolean;
    mobileList?: boolean;
};

export function prepareTourTarget(detail: TourPrepareDetail) {
    window.dispatchEvent(new CustomEvent<TourPrepareDetail>(TOUR_PREPARE_EVENT, { detail }));
}

export function queryTourTarget(selector: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(selector);
}

export function isTourTargetVisible(element: HTMLElement) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0
        && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

type WaitForTourTargetOptions = {
    timeoutMs?: number;
    prepare?: () => void;
    signal?: AbortSignal;
};

export async function waitForTourTarget(
    selectors: readonly string[],
    { timeoutMs = 8000, prepare, signal }: WaitForTourTargetOptions = {},
): Promise<HTMLElement | null> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
        let timer: number | null = null;
        let lastPrepareAt = 0;
        let settled = false;

        const finish = (element: HTMLElement | null) => {
            if (settled) return;
            settled = true;
            if (timer !== null) window.clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            resolve(element);
        };

        const onAbort = () => finish(null);

        const tick = () => {
            // 目标所在页面可能尚未完成挂载，因此需要重复发送准备意图；
            // 但不必每 120ms 触发一次跨组件状态更新，降低引导对页面渲染的干扰。
            if (prepare && Date.now() - lastPrepareAt >= 300) {
                lastPrepareAt = Date.now();
                prepare();
            }
            for (const selector of selectors) {
                const element = queryTourTarget(selector);
                if (element && isTourTargetVisible(element)) {
                    finish(element);
                    return;
                }
            }
            if (Date.now() >= deadline) {
                finish(null);
                return;
            }
            timer = window.setTimeout(tick, 120);
        };

        if (signal?.aborted) {
            finish(null);
            return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
        tick();
    });
}
