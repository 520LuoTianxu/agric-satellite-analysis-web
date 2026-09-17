"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HOLE_PAD = 6;
const TOOLTIP_GAP = 14;
const VIEW_MARGIN = 12;
const TOOLTIP_WIDTH = 320;

type Placement = "bottom" | "top" | "right" | "left";

export function ProductTourOverlay({
    open,
    step,
    total,
    title,
    body,
    waiting,
    target,
    onNext,
    onPrev,
    onClose,
    nextLabel,
    prevLabel,
    skipLabel,
    finishLabel,
    waitingLabel,
}: {
    open: boolean;
    step: number;
    total: number;
    title: string;
    body: string;
    waiting?: boolean;
    target: HTMLElement | null;
    onNext: () => void;
    onPrev?: () => void;
    onClose: () => void;
    nextLabel: string;
    prevLabel: string;
    skipLabel: string;
    finishLabel: string;
    waitingLabel: string;
}) {
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [tooltipSize, setTooltipSize] = useState({ width: TOOLTIP_WIDTH, height: 180 });
    const [mounted, setMounted] = useState(false);
    const isLastStep = step >= total - 1;

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open || !target) {
            setRect(null);
            return;
        }
        const update = () => setRect(target.getBoundingClientRect());
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
        update();
        const frame = window.requestAnimationFrame(update);
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [open, target, step]);

    useLayoutEffect(() => {
        if (!open || !tooltipRef.current) return;
        const next = tooltipRef.current.getBoundingClientRect();
        setTooltipSize({ width: next.width, height: next.height });
    }, [open, title, body, waiting, step]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const hole = useMemo(() => {
        if (!rect) return null;
        const width = Math.max(24, rect.width + HOLE_PAD * 2);
        const height = Math.max(24, rect.height + HOLE_PAD * 2);
        return {
            top: Math.max(0, rect.top - HOLE_PAD),
            left: Math.max(0, rect.left - HOLE_PAD),
            width,
            height,
            radius: Math.min(12, Math.max(8, rect.height / 4)),
        };
    }, [rect]);

    const viewport = mounted
        ? { width: window.innerWidth, height: window.innerHeight }
        : { width: TOOLTIP_WIDTH, height: 640 };

    const placement = useMemo<Placement>(() => {
        if (!hole) return "bottom";
        const below = viewport.height - (hole.top + hole.height);
        const above = hole.top;
        const right = viewport.width - (hole.left + hole.width);
        const left = hole.left;
        const needH = tooltipSize.height + TOOLTIP_GAP + VIEW_MARGIN;
        const needW = tooltipSize.width + TOOLTIP_GAP + VIEW_MARGIN;
        if (below >= needH) return "bottom";
        if (above >= needH) return "top";
        if (right >= needW) return "right";
        if (left >= needW) return "left";
        return below >= above ? "bottom" : "top";
    }, [hole, tooltipSize, viewport.height, viewport.width]);

    const tooltipStyle = useMemo(() => {
        const width = Math.min(TOOLTIP_WIDTH, viewport.width - VIEW_MARGIN * 2);
        if (!hole) {
            return {
                top: Math.max(VIEW_MARGIN, (viewport.height - tooltipSize.height) / 2),
                left: Math.max(VIEW_MARGIN, (viewport.width - width) / 2),
                width,
            };
        }
        let top = hole.top + hole.height + TOOLTIP_GAP;
        let left = hole.left + hole.width / 2 - width / 2;
        if (placement === "top") top = hole.top - tooltipSize.height - TOOLTIP_GAP;
        if (placement === "right") {
            top = hole.top + hole.height / 2 - tooltipSize.height / 2;
            left = hole.left + hole.width + TOOLTIP_GAP;
        }
        if (placement === "left") {
            top = hole.top + hole.height / 2 - tooltipSize.height / 2;
            left = hole.left - width - TOOLTIP_GAP;
        }
        left = Math.min(viewport.width - width - VIEW_MARGIN, Math.max(VIEW_MARGIN, left));
        top = Math.min(viewport.height - tooltipSize.height - VIEW_MARGIN, Math.max(VIEW_MARGIN, top));
        return { top, left, width };
    }, [hole, placement, tooltipSize, viewport.height, viewport.width]);

    const arrowStyle = useMemo(() => {
        if (!hole) return null;
        const tooltipLeft = tooltipStyle.left;
        const tooltipTop = tooltipStyle.top;
        const holeCenterX = hole.left + hole.width / 2;
        const holeCenterY = hole.top + hole.height / 2;
        if (placement === "bottom" || placement === "top") {
            return {
                left: Math.min(tooltipStyle.width - 28, Math.max(16, holeCenterX - tooltipLeft - 8)),
                [placement === "bottom" ? "top" : "bottom"]: -8,
            };
        }
        return {
            top: Math.min(tooltipSize.height - 28, Math.max(16, holeCenterY - tooltipTop - 8)),
            [placement === "right" ? "left" : "right"]: -8,
        };
    }, [hole, placement, tooltipStyle, tooltipSize.height]);

    if (!open || !mounted) return null;

    return createPortal(
        <div className="pointer-events-none fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="product-tour-title">
            {hole ? (
                <>
                    <div aria-hidden="true" className="pointer-events-auto absolute inset-x-0 top-0 bg-slate-950/55" style={{ height: hole.top }} />
                    <div aria-hidden="true" className="pointer-events-auto absolute bg-slate-950/55" style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} />
                    <div aria-hidden="true" className="pointer-events-auto absolute bg-slate-950/55" style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
                    <div aria-hidden="true" className="pointer-events-auto absolute inset-x-0 bottom-0 bg-slate-950/55" style={{ top: hole.top + hole.height }} />
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute ring-2 ring-white shadow-[0_0_0_6px_hsl(var(--primary)/0.28)]"
                        style={{
                            top: hole.top,
                            left: hole.left,
                            width: hole.width,
                            height: hole.height,
                            borderRadius: hole.radius,
                        }}
                    />
                </>
            ) : (
                <div aria-hidden="true" className="pointer-events-auto absolute inset-0 bg-slate-950/55" />
            )}

            <div
                ref={tooltipRef}
                className="pointer-events-auto absolute rounded-xl bg-primary p-4 text-primary-foreground shadow-[0_16px_40px_-18px_rgba(15,23,42,0.55)]"
                style={tooltipStyle}
            >
                {arrowStyle ? (
                    <span
                        aria-hidden="true"
                        className={cn(
                            "absolute h-4 w-4 rotate-45 bg-primary",
                            placement === "bottom" && "-top-2",
                            placement === "top" && "-bottom-2",
                            placement === "right" && "-left-2",
                            placement === "left" && "-right-2",
                        )}
                        style={arrowStyle}
                    />
                ) : null}
                <div className="relative space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <h2 id="product-tour-title" className="text-base font-semibold leading-6">
                            {title}
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="cursor-pointer rounded-md p-1 text-primary-foreground/80 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
                            aria-label={skipLabel}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <p className="text-sm leading-6 text-primary-foreground/90">{waiting ? waitingLabel : body}</p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="cursor-pointer text-xs text-primary-foreground/75 underline-offset-2 transition-colors hover:text-primary-foreground hover:underline"
                                onClick={onClose}
                            >
                                {skipLabel}
                            </button>
                            <span className="text-xs tabular-nums text-primary-foreground/75">
                                ({step + 1}/{total})
                            </span>
                            {step > 0 && onPrev ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 cursor-pointer px-2 text-xs text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                                    onClick={onPrev}
                                >
                                    {prevLabel}
                                </Button>
                            ) : null}
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            className="h-8 cursor-pointer bg-primary-foreground px-3 text-xs text-primary hover:bg-primary-foreground/90"
                            onClick={onNext}
                        >
                            {isLastStep ? finishLabel : nextLabel}
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
