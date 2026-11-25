"use client";

import React, { useMemo } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

/** 有观测的日期。只展示选中日期附近的一周，避免观测历史过长时挤满面板。 */
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
    const weekdayFormat = useMemo(
        () => new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }),
        [locale],
    );
    const visibleDates = useMemo(() => {
        const selectedIndex = activeDate ? dates.indexOf(activeDate) : -1;
        const centerIndex = selectedIndex >= 0 ? selectedIndex : dates.length - 1;
        const start = Math.max(0, Math.min(centerIndex - 3, dates.length - 7));
        return dates.slice(start, start + 7);
    }, [activeDate, dates]);

    if (dates.length === 0) return null;

    return (
        <div role="group" aria-label={label} className="mx-auto w-full max-w-[336px]">
            <div className="grid grid-cols-7 gap-1">
                {visibleDates.map((date) => {
                    const parsed = new Date(`${date}T00:00:00Z`);
                    return (
                        <span key={`${date}-weekday`} className="text-center text-[10px] font-medium leading-4 text-muted-foreground">
                            {weekdayFormat.format(parsed)}
                        </span>
                    );
                })}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {visibleDates.map((date) => {
                    const day = Number(date.slice(8, 10));
                    const active = date === activeDate;
                    return (
                        <button
                            key={date}
                            type="button"
                            data-obs-date={date}
                            aria-label={date}
                            aria-current={active ? "date" : undefined}
                            aria-pressed={active}
                            onClick={() => onSelect?.(date)}
                            className={cn(
                                "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors",
                                active
                                    ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                                    : "text-foreground hover:bg-muted",
                            )}
                        >
                            {Number.isFinite(day) ? day : date.slice(8)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
