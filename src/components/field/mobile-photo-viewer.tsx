"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { clampPan, pinchFrame, zoomAt, type PhotoFrame, type PinchStart } from "./photo-frame";

/**
 * 全屏查看卫星预览。双指缩放，放大后单指拖动，双击在原位放大或回到整张图。
 */
export function MobilePhotoViewer({
    src,
    alt,
    onClose,
}: {
    src: string;
    alt: string;
    onClose: () => void;
}) {
    const t = useTranslations("agriPanel");
    const tCommon = useTranslations("common");
    const frameRef = useRef<HTMLDivElement>(null);
    const photoRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<PhotoFrame>({ scale: 1, x: 0, y: 0 });
    const pointersRef = useRef(new Map<number, { x: number; y: number }>());
    const pinchRef = useRef<PinchStart | null>(null);
    const panRef = useRef<{ x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null);
    const lastTapRef = useRef(0);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    const paint = useCallback((frame: PhotoFrame) => {
        const node = photoRef.current;
        const viewport = frameRef.current?.getBoundingClientRect();
        const next = viewport
            ? clampPan(frame, viewport.width, viewport.height)
            : frame;
        viewRef.current = next;
        if (!node) return;
        node.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.scale})`;
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeRef.current();
        };
        const blockScroll = (event: TouchEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest("[data-photo-close]")) return;
            if (event.cancelable) event.preventDefault();
        };
        document.addEventListener("keydown", onKey);
        document.addEventListener("touchmove", blockScroll, { passive: false });
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("touchmove", blockScroll);
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    useEffect(() => {
        paint({ scale: 1, x: 0, y: 0 });
    }, [paint, src]);

    const midpoint = () => {
        const viewport = frameRef.current?.getBoundingClientRect();
        const points = [...pointersRef.current.values()];
        if (!viewport || points.length < 2) return null;
        const [a, b] = points;
        return {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            midX: (a.x + b.x) / 2 - viewport.left - viewport.width / 2,
            midY: (a.y + b.y) / 2 - viewport.top - viewport.height / 2,
        };
    };

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            className="fixed inset-0 z-[80] bg-black text-white"
        >
            <div
                ref={frameRef}
                className="absolute inset-0 z-0 touch-none"
                onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    if ((event.target as HTMLElement).closest("[data-photo-close]")) return;
                    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const pinch = midpoint();
                    if (pinch) {
                        pinchRef.current = { ...viewRef.current, ...pinch };
                        panRef.current = null;
                        return;
                    }
                    pinchRef.current = null;
                    panRef.current = {
                        x: event.clientX,
                        y: event.clientY,
                        originX: viewRef.current.x,
                        originY: viewRef.current.y,
                        moved: false,
                    };
                }}
                onPointerMove={(event) => {
                    if (!pointersRef.current.has(event.pointerId)) return;
                    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                    const pinchStart = pinchRef.current;
                    const pinch = midpoint();
                    if (pinchStart && pinch) {
                        paint(pinchFrame(pinchStart, pinch.midX, pinch.midY, pinch.dist));
                        return;
                    }
                    const pan = panRef.current;
                    if (!pan || viewRef.current.scale <= 1) return;
                    const dx = event.clientX - pan.x;
                    const dy = event.clientY - pan.y;
                    if (Math.hypot(dx, dy) > 4) pan.moved = true;
                    paint({ scale: viewRef.current.scale, x: pan.originX + dx, y: pan.originY + dy });
                }}
                onPointerUp={(event) => {
                    const pan = panRef.current;
                    const pinched = pinchRef.current != null;
                    pointersRef.current.delete(event.pointerId);
                    if (pointersRef.current.size >= 2) {
                        const pinch = midpoint();
                        if (pinch) pinchRef.current = { ...viewRef.current, ...pinch };
                        return;
                    }
                    pinchRef.current = null;
                    if (pointersRef.current.size === 1) {
                        const [left] = [...pointersRef.current.values()];
                        panRef.current = {
                            x: left.x,
                            y: left.y,
                            originX: viewRef.current.x,
                            originY: viewRef.current.y,
                            moved: true,
                        };
                        return;
                    }
                    panRef.current = null;
                    if (pinched || pan?.moved) return;
                    const now = performance.now();
                    if (now - lastTapRef.current > 280) {
                        lastTapRef.current = now;
                        return;
                    }
                    lastTapRef.current = 0;
                    const viewport = frameRef.current?.getBoundingClientRect();
                    if (!viewport) return;
                    const midX = event.clientX - viewport.left - viewport.width / 2;
                    const midY = event.clientY - viewport.top - viewport.height / 2;
                    const nextScale = viewRef.current.scale > 1.05 ? 1 : 2.5;
                    paint(zoomAt(midX, midY, viewRef.current, nextScale));
                }}
                onPointerCancel={(event) => {
                    pointersRef.current.delete(event.pointerId);
                    pinchRef.current = null;
                    panRef.current = null;
                }}
            >
                <div
                    ref={photoRef}
                    className="flex h-full w-full items-center justify-center will-change-transform"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt={alt}
                        draggable={false}
                        className="max-h-full max-w-full select-none object-contain"
                    />
                </div>
            </div>
            <button
                type="button"
                data-photo-close=""
                className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/20"
                style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
                aria-label={tCommon("close")}
                onClick={onClose}
            >
                <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <p
                className="sr-only"
            >
                {t("pinchHint")}
            </p>
        </div>,
        document.body,
    );
}
