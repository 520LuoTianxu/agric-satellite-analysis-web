"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * 有观测的日期。点一下就选中这一天，并更新下面的指标。
 */
export function ObservationDateRail({
    dates,
    activeDate,
    label,
    onSelect,
}: {
    dates: string[];
    activeDate: string | null;
    label: string;
    onSelect?: (date: string) => void;
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
            className="flex overflow-x-auto [scrollbar-width:none] touch-pan-x"
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
                    <div key={date} role="listitem" className="flex w-10 shrink-0 justify-center">
                        <button
                            type="button"
                            data-obs-date={date}
                            aria-current={active ? "date" : undefined}
                            aria-pressed={active}
                            onClick={() => onSelect?.(date)}
                            className="flex w-full flex-col items-center bg-transparent p-0"
                        >
                            <span className="flex h-3.5 items-end text-[11px] font-medium leading-none text-muted-foreground">
                                {caption}
                            </span>
                            <span
                                className={cn(
                                    "mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums",
                                    active
                                        ? "bg-primary font-semibold text-primary-foreground"
                                        : "text-foreground",
                                )}
                            >
                                {Number.isFinite(day) ? day : date.slice(8)}
                            </span>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
