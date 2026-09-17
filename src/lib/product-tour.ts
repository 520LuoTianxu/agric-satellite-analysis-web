export const TOUR_PREPARE_EVENT = "agric:tour-prepare";
export const TOUR_STORAGE_PREFIX = "agric:remote-sensing-guide:v2:";

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

export async function waitForTourTarget(
    selectors: readonly string[],
    timeoutMs = 8000,
    prepare?: () => void,
): Promise<HTMLElement | null> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
        const tick = () => {
            prepare?.();
            for (const selector of selectors) {
                const element = queryTourTarget(selector);
                if (element && isTourTargetVisible(element)) {
                    resolve(element);
                    return;
                }
            }
            if (Date.now() >= deadline) {
                resolve(null);
                return;
            }
            window.setTimeout(tick, 120);
        };
        tick();
    });
}
