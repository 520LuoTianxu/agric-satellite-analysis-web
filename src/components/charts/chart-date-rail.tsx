"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * 只列出有观测的日期。它是时间刻度，不是选择器：点按不会切换日期。
 */
export function ObservationDateRail({
    dates,
    activeDate,
    label,
}: {
    dates: string[];
    activeDate: string | null;
    label: string;
}) {
    const locale = useLocale();
    const railRef = useRef<HTMLDivElement>(null);
    const monthFormat = useMemo(
        () => new Intl.DateTimeFormat(locale, { month: "short" }),
        [locale],
    );

    useEffect(() => {
        const rail = railRef.current;
        if (!rail || !activeDate) return;
        const item = rail.querySelector<HTMLElement>(`[data-obs-date="${activeDate}"]`);
        if (!item) return;
        const left = item.offsetLeft - rail.clientWidth / 2 + item.clientWidth / 2;
        rail.scrollTo({ left: Math.max(0, left), behavior: "auto" });
    }, [activeDate, dates]);

    if (dates.length === 0) return null;

    return (
        <div
            ref={railRef}
            role="list"
            aria-label={label}
            className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] touch-pan-x"
        >
            {dates.map((date, index) => {
                const prev = dates[index - 1];
                const year = date.slice(0, 4);
                const month = date.slice(5, 7);
                const day = Number(date.slice(8, 10));
                const showYear = !prev || prev.slice(0, 4) !== year;
                const showMonth = showYear || !prev || prev.slice(5, 7) !== month;
                const monthDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
                const caption = showYear
                    ? year
                    : showMonth && Number.isFinite(monthDate.getTime())
                        ? monthFormat.format(monthDate)
                        : "";
                const active = date === activeDate;
                return (
                    <div
                        key={date}
                        role="listitem"
                        data-obs-date={date}
                        aria-current={active ? "date" : undefined}
                        className="flex w-11 shrink-0 flex-col items-center"
                    >
                        <span className="flex h-4 items-end text-[11px] font-medium leading-none text-muted-foreground">
                            {caption}
                        </span>
                        <span
                            className={cn(
                                "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums",
                                active
                                    ? "bg-foreground font-semibold text-background"
                                    : "text-foreground",
                            )}
                        >
                            {Number.isFinite(day) ? day : date.slice(8)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
