"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { MAP_STYLES, type MapStyleId } from "@/lib/pmtiles";

const STYLE_LABEL_KEYS = new Set([
    "styleStreet",
    "styleTerrain",
    "styleSatellite",
    "styleDark",
]);
import { Layers, X } from "lucide-react";
import { MAP_CHROME } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

function StyleThumb({ id }: { id: MapStyleId }) {
    if (id === "satellite") {
        return (
            <svg viewBox="0 0 80 64" className="h-full w-full" aria-hidden="true">
                <rect width="80" height="64" fill="#2f6a34" />
                <path d="M0 18 H34 V0 H52 V28 H80 V46 H40 V64 H18 V40 H0 Z" fill="#3f8a3d" />
                <path d="M0 34 H80" stroke="#c4b48a" strokeWidth="5" />
                <path d="M46 0 V64" stroke="#d8c7a2" strokeWidth="4" />
                <rect x="8" y="42" width="16" height="12" fill="#24562c" />
                <rect x="58" y="8" width="14" height="12" fill="#5c8f45" />
            </svg>
        );
    }
    if (id === "terrain") {
        return (
            <svg viewBox="0 0 80 64" className="h-full w-full" aria-hidden="true">
                <rect width="80" height="64" fill="#d5e2b8" />
                <path d="M0 46 C18 40 24 50 40 44 C58 37 64 48 80 40 V64 H0 Z" fill="#b7c98a" />
                <path d="M0 28 C16 22 28 34 46 26 C60 20 68 30 80 24" fill="none" stroke="#8ea56a" strokeWidth="1.4" />
                <path d="M0 18 C20 12 30 22 48 14 C62 8 70 18 80 12" fill="none" stroke="#c3a36a" strokeWidth="1.4" />
                <circle cx="58" cy="18" r="7" fill="#e4d2a4" />
            </svg>
        );
    }
    if (id === "dark") {
        return (
            <svg viewBox="0 0 80 64" className="h-full w-full" aria-hidden="true">
                <rect width="80" height="64" fill="#1c1c1e" />
                <path d="M0 22 H80" stroke="#3a3a3c" strokeWidth="6" />
                <path d="M24 0 V64" stroke="#48484a" strokeWidth="5" />
                <path d="M0 46 C24 40 36 52 80 44" stroke="#8e8e93" strokeWidth="2" fill="none" />
                <circle cx="52" cy="14" r="5" fill="#2c2c2e" stroke="#636366" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 80 64" className="h-full w-full" aria-hidden="true">
            <rect width="80" height="64" fill="#e7eef3" />
            <path d="M0 40 C18 36 28 48 48 42 C62 38 70 28 80 24" stroke="#f6d56a" strokeWidth="6" fill="none" />
            <path d="M22 0 V64" stroke="#ffffff" strokeWidth="6" />
            <path d="M0 16 H80" stroke="#ffffff" strokeWidth="5" />
            <circle cx="16" cy="14" r="7" fill="#b7d7a8" />
            <rect x="50" y="6" width="16" height="12" rx="2" fill="#d5dee6" />
        </svg>
    );
}

interface MapStyleSwitcherProps {
    currentStyle: MapStyleId;
    onStyleChange: (styleId: MapStyleId) => void;
    className?: string;
    iconOnly?: boolean;
}

/**
 * Floating map style switcher - click-to-toggle dropdown.
 * Closes on outside click or after selecting a style.
 */
export default function MapStyleSwitcher({
    currentStyle,
    onStyleChange,
    className = "",
    iconOnly = false,
}: MapStyleSwitcherProps) {
    const t = useTranslations("mapControls");

    /** Style ids are stable; the label in pmtiles.ts is only a fallback. */
    const styleLabel = (style?: { id: MapStyleId; label: string }) => {
        if (!style) return t("mapLayers");
        const key = `style${style.id.charAt(0).toUpperCase()}${style.id.slice(1)}`;
        return STYLE_LABEL_KEYS.has(key) ? t(key) : style.label;
    };
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    const handleClickOutside = useCallback((e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
            setOpen(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open, handleClickOutside]);

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Toggle button */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={cn(
                    iconOnly
                        ? "field-map-tool"
                        : cn("flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-3", MAP_CHROME),
                )}
                title={t("mapLayers")}
                aria-label={t("mapLayers")}
            >
                <Layers className="h-4 w-4" />
                {!iconOnly && (
                    <span className="hidden sm:inline">
                        {styleLabel(MAP_STYLES.find((s) => s.id === currentStyle))}
                    </span>
                )}
            </button>

            {/* Expanded panel */}
            {open && (
                <div
                    role="dialog"
                    aria-label={t("mapMode")}
                    className={cn(
                        "absolute z-40 rounded-3xl border border-black/5 bg-background/95 p-3 shadow-xl backdrop-blur-md",
                        iconOnly ? "bottom-full right-0 mb-3" : "left-0 top-full mt-2",
                    )}
                    style={{ width: iconOnly ? "calc(100vw - 1.5rem)" : "22rem" }}
                >
                    <div className="relative mb-3 flex h-7 items-center justify-center">
                        <p className="text-[15px] font-semibold tracking-tight">{t("mapMode")}</p>
                        <button
                            type="button"
                            className="absolute right-0 grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground"
                            aria-label={t("closeMapMode")}
                            onClick={() => setOpen(false)}
                        >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {MAP_STYLES.map((style) => {
                            const selected = currentStyle === style.id;
                            const label = styleLabel(style);
                            return (
                                <button
                                    key={style.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => {
                                        onStyleChange(style.id);
                                        setOpen(false);
                                    }}
                                    className="flex min-w-0 flex-col items-center gap-1.5"
                                >
                                    <span
                                        className="block aspect-square w-full overflow-hidden rounded-xl border-2"
                                        style={{ borderColor: selected ? "#0A84FF" : "transparent" }}
                                    >
                                        <StyleThumb id={style.id} />
                                    </span>
                                    <span
                                        className={cn("max-w-full truncate text-[11px] leading-none", selected && "font-semibold")}
                                        style={{ color: selected ? "#0A84FF" : undefined }}
                                    >
                                        {label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
