"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { nearestDateByOffsetX, type AxisClickChart } from "./chart-date-click";
import { CHART_SCRUB_CANCEL_PX, CHART_SCRUB_HOLD_MS, scrubActivates } from "./chart-scrub";

type ScrubChart = AxisClickChart & {
    getDom(): HTMLElement;
};

function bindChartScrub(
    chart: ScrubChart,
    getDates: () => string[],
    handlers: {
        onFrame: (date: string, x: number) => void;
        onEnd: (date: string | null) => void;
    },
): () => void {
    const dom = chart.getDom();
    dom.style.touchAction = "pan-y";
    dom.querySelectorAll("canvas").forEach((canvas) => {
        canvas.style.touchAction = "pan-y";
    });
    let timer: number | null = null;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let distance = 0;
    let armed = false;
    let lastDate: string | null = null;

    const pointOf = (event: PointerEvent) => {
        const rect = dom.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const clearTimer = () => {
        if (timer == null) return;
        window.clearTimeout(timer);
        timer = null;
    };

    const update = (x: number) => {
        const date = nearestDateByOffsetX(chart, x, getDates());
        if (!date) return;
        lastDate = date;
        handlers.onFrame(date, x);
    };

    const finish = (commit: boolean) => {
        clearTimer();
        const date = commit ? lastDate : null;
        armed = false;
        lastDate = null;
        pointerId = null;
        distance = 0;
        dom.removeAttribute("data-chart-scrubbing");
        if (commit) handlers.onEnd(date);
    };

    const onDown = (event: PointerEvent) => {
        if (!event.isPrimary || event.button !== 0 || pointerId != null) return;
        const point = pointOf(event);
        try {
            if (!chart.containPixel({ gridIndex: 0 }, [point.x, point.y])) return;
        } catch {
            return;
        }
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        distance = 0;
        armed = false;
        lastDate = null;
        clearTimer();
        const origin = point;
        timer = window.setTimeout(() => {
            timer = null;
            if (pointerId == null || !scrubActivates(CHART_SCRUB_HOLD_MS, distance)) return;
            armed = true;
            dom.setAttribute("data-chart-scrubbing", "");
            try {
                dom.setPointerCapture(pointerId);
            } catch {
                /* 指针已经松开时忽略 */
            }
            update(origin.x);
        }, CHART_SCRUB_HOLD_MS);
    };

    const onMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        distance = Math.hypot(event.clientX - startX, event.clientY - startY);
        if (!armed) {
            if (distance > CHART_SCRUB_CANCEL_PX) finish(false);
            return;
        }
        if (event.cancelable) event.preventDefault();
        update(pointOf(event).x);
    };

    const onUp = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        const commit = armed;
        try {
            if (dom.hasPointerCapture(event.pointerId)) dom.releasePointerCapture(event.pointerId);
        } catch {
            /* ignore */
        }
        finish(commit);
    };

    const onTouchMove = (event: TouchEvent) => {
        if (!armed || !event.cancelable) return;
        event.preventDefault();
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
        finish(false);
        dom.removeEventListener("pointerdown", onDown);
        dom.removeEventListener("pointermove", onMove);
        dom.removeEventListener("pointerup", onUp);
        dom.removeEventListener("pointercancel", onUp);
        dom.removeEventListener("touchmove", onTouchMove);
    };
}

export function useChartScrub(getDates: () => string[], onCommit?: (date: string) => void) {
    const [activeDate, setActiveDate] = useState<string | null>(null);
    const [cursorX, setCursorX] = useState<number | null>(null);
    const getDatesRef = useRef(getDates);
    const commitRef = useRef(onCommit);
    const detachRef = useRef<(() => void) | null>(null);
    getDatesRef.current = getDates;
    commitRef.current = onCommit;

    const onChartReady = useCallback((chart: ScrubChart) => {
        detachRef.current?.();
        detachRef.current = bindChartScrub(chart, () => getDatesRef.current(), {
            onFrame(date, x) {
                setActiveDate(date);
                setCursorX(x);
            },
            onEnd(date) {
                setActiveDate(null);
                setCursorX(null);
                if (date) commitRef.current?.(date);
            },
        });
    }, []);

    useEffect(() => () => {
        detachRef.current?.();
        detachRef.current = null;
    }, []);

    return { activeDate, cursorX, onChartReady, scrubbing: activeDate != null };
}

export function ChartScrubReadout({
    active,
    hint,
    title,
    lines,
}: {
    active: boolean;
    hint: string;
    title?: string | null;
    lines?: string[];
}) {
    return (
        <div className="flex min-w-0 flex-1 flex-col justify-center">
            {active && title ? (
                <>
                    <p className="text-sm font-semibold leading-tight tabular-nums text-foreground">{title}</p>
                    {lines && lines.length > 0 ? (
                        <p className="truncate text-xs leading-snug text-muted-foreground">{lines.join(" · ")}</p>
                    ) : null}
                </>
            ) : (
                <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
            )}
        </div>
    );
}

export function ChartScrubCursor({ x, reach = 0 }: { x: number | null; reach?: number }) {
    if (x == null) return null;
    return (
        <div
            className="pointer-events-none absolute bottom-0 z-10 w-0.5 -translate-x-1/2 rounded-full bg-foreground/75"
            style={{ left: x, top: -reach }}
        >
            <span
                className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-foreground"
                style={{ top: reach }}
            />
        </div>
    );
}
