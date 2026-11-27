"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type FieldTabSkeletonVariant = "growth" | "weather" | "soil" | "alerts" | "biweekly" | "conclusion" | "report" | "share";

export function FieldTabSkeleton({
    variant,
    className,
}: {
    variant: FieldTabSkeletonVariant;
    className?: string;
}) {
    const t = useTranslations("common");

    const conclusion = (
        <div className="space-y-2.5 rounded-xl bg-surface-2 p-3">
            <Skeleton className="mb-3 h-4 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-3/4" />
        </div>
    );

    return (
        <div role="status" data-field-skeleton={variant}
            className={cn("motion-reduce:[&_.animate-pulse]:animate-none", className)}>
            <span className="sr-only">{t("loadingContent")}</span>
            <div className="space-y-3" aria-hidden="true">
                {variant === "growth" && (
                    <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
                        <Skeleton className="mx-auto h-8 w-28 rounded-full" />
                        <div className="mx-auto grid max-w-72 grid-cols-7 place-items-center gap-1">
                            {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="size-6 rounded-full sm:size-7" />)}
                        </div>
                        <Skeleton className="mx-auto h-4 w-36" />
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-9 w-24" />
                            <Skeleton className="size-9 rounded-full" />
                        </div>
                        <Skeleton className="h-[236px] w-full rounded-lg" />
                    </div>
                )}
                {variant === "weather" && (
                    <>
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-8 w-44" />
                            <Skeleton className="h-9 w-16" />
                        </div>
                        <div className="space-y-4 rounded-2xl bg-surface-2 p-3">
                            <div className="grid grid-cols-3 gap-3">
                                {[0, 1, 2].map((i) => (
                                    <div key={i} className="flex flex-col items-center gap-2">
                                        <Skeleton className="h-3 w-3/4" />
                                        <Skeleton className="h-6 w-full max-w-20" />
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-4 gap-3">
                                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                            </div>
                        </div>
                        <Skeleton className="h-[212px] w-full rounded-2xl" />
                    </>
                )}
                {variant === "soil" && (
                    <>
                        <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="mx-auto aspect-square w-3/5 max-w-56 rounded-full" />
                            <Skeleton className="mx-auto h-3 w-4/5" />
                        </div>
                        <Skeleton className="h-24 w-full rounded-2xl" />
                    </>
                )}
                {variant === "alerts" && (
                    <>
                        <Skeleton className="h-6 w-24" />
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="space-y-2 rounded-xl bg-surface-2 p-3">
                                <div className="flex gap-2">
                                    <Skeleton className="h-4 w-10 rounded-full" />
                                    <Skeleton className="h-4 w-32" />
                                </div>
                                <Skeleton className="h-3 w-5/6" />
                            </div>
                        ))}
                    </>
                )}
                {variant === "biweekly" && (
                    <>
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-9 w-32" />
                        </div>
                        <div className="flex max-w-lg items-center gap-2">
                            <Skeleton className="h-9 flex-1" />
                            <Skeleton className="size-8 rounded-full" />
                            <Skeleton className="size-8 rounded-full" />
                        </div>
                        {conclusion}
                        <Skeleton className="h-20 w-full rounded-xl" />
                    </>
                )}
                {variant === "conclusion" && conclusion}
                {variant === "report" && (
                    <>
                        <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
                            <div className="flex items-center gap-3">
                                <Skeleton className="size-14 shrink-0 rounded-lg" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-3 w-3/4" />
                                </div>
                            </div>
                            <Skeleton className="mx-auto aspect-square w-1/2 max-w-40 rounded-full" />
                        </div>
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </>
                )}
                {variant === "share" && (
                    <>
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <Skeleton className="h-12 w-full rounded-xl" />
                    </>
                )}
            </div>
        </div>
    );
}
