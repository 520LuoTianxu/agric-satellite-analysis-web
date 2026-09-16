"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
    listPlantingGroups,
    getPlantingTypeDict,
    formatMu,
    groupStatusLabel,
    signStatusLabel,
    plantingTypeLabel,
    GROUP_STATUS_OPTIONS,
    SIGN_STATUS_OPTIONS,
    type AgricGroup,
    type PlantingTypeDict,
} from "@/lib/agric";
import {
    FolderKanban,
    ChevronRight,
    ChevronLeft,
    Search,
    RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
const ALL = "__all__";
const CONTROL_CLASS = "h-8 px-2.5 text-xs focus-visible:ring-1 focus-visible:ring-offset-0";

interface Filters {
    groupName: string;
    groupCode: string;
    ownerName: string;
    ownerPhone: string;
    status: string;
    signStatus: string;
    plantingType: string;
    businessCategory: string;
}

const EMPTY_FILTERS: Filters = {
    groupName: "",
    groupCode: "",
    ownerName: "",
    ownerPhone: "",
    status: "",
    signStatus: "",
    plantingType: "",
    businessCategory: "",
};

function CompactField({
    label,
    className,
    children,
}: {
    label: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <label className={cn("min-w-[6rem] flex-1", className)}>
            <span className="sr-only">{label}</span>
            {children}
        </label>
    );
}

function OptionalSelect({
    value,
    onChange,
    placeholder,
    options,
    disabled,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    options: { value: string; label: string }[];
    disabled?: boolean;
}) {
    return (
        <Select
            value={value || ALL}
            onValueChange={(next) => onChange(next === ALL ? "" : next)}
            disabled={disabled}
        >
            <SelectTrigger className={cn(CONTROL_CLASS, "focus:ring-1 focus:ring-offset-0")}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{placeholder}</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export default function FarmsListPage() {
    const t = useTranslations("farmsPage");
    const [groups, setGroups] = useState<AgricGroup[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [pageNum, setPageNum] = useState(1);
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
    const [dict, setDict] = useState<PlantingTypeDict>({
        options: [],
        labelByValue: {},
        categoriesByType: {},
    });

    const draftCategoryOptions = useMemo(
        () => (filters.plantingType ? dict.categoriesByType[filters.plantingType] || [] : []),
        [filters.plantingType, dict.categoriesByType],
    );

    useEffect(() => {
        let cancelled = false;
        getPlantingTypeDict()
            .then((next) => {
                if (!cancelled) setDict(next);
            })
            .catch((err) => {
                console.error(err);
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await listPlantingGroups({
                    pageNum,
                    pageSize: PAGE_SIZE,
                    groupName: applied.groupName.trim() || undefined,
                    groupCode: applied.groupCode.trim() || undefined,
                    ownerName: applied.ownerName.trim() || undefined,
                    ownerPhone: applied.ownerPhone.trim() || undefined,
                    status: applied.status || undefined,
                    signStatus: applied.signStatus || undefined,
                    plantingType: applied.plantingType || undefined,
                    businessCategory: applied.businessCategory || undefined,
                });
                if (!cancelled) {
                    setGroups(res.rows);
                    setTotal(res.total);
                }
            } catch (err: any) {
                console.error(err);
                if (!cancelled) {
                    setGroups([]);
                    setTotal(0);
                    toast.error(err?.message || t("failedLoadGroups"));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [pageNum, applied, t]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const canPrev = pageNum > 1;
    const canNext = pageNum < totalPages;
    const from = total === 0 ? 0 : (pageNum - 1) * PAGE_SIZE + 1;
    const to = Math.min(pageNum * PAGE_SIZE, total);

    const handleSearch = () => {
        setPageNum(1);
        setApplied({
            ...filters,
            businessCategory: filters.plantingType ? filters.businessCategory : "",
        });
    };

    const handleReset = () => {
        setFilters(EMPTY_FILTERS);
        setApplied(EMPTY_FILTERS);
        setPageNum(1);
    };

    const projectGridClass = "grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3";

    return (
        <div className="mx-auto max-w-7xl px-5 py-5">
            <div className="mb-4 flex items-baseline gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
                <p className="text-sm text-muted-foreground">{t("subtitle", { count: total })}</p>
            </div>

            <form
                className="mb-4 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto rounded-lg border bg-card px-2.5 py-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    handleSearch();
                }}
            >
                <CompactField label={t("filterGroupName")}>
                    <Input
                        className={CONTROL_CLASS}
                        value={filters.groupName}
                        onChange={(e) => setFilters((prev) => ({ ...prev, groupName: e.target.value }))}
                        placeholder={t("filterGroupName")}
                    />
                </CompactField>
                <CompactField label={t("filterGroupCode")}>
                    <Input
                        className={CONTROL_CLASS}
                        value={filters.groupCode}
                        onChange={(e) => setFilters((prev) => ({ ...prev, groupCode: e.target.value }))}
                        placeholder={t("filterGroupCode")}
                    />
                </CompactField>
                <CompactField label={t("filterOwnerName")}>
                    <Input
                        className={CONTROL_CLASS}
                        value={filters.ownerName}
                        onChange={(e) => setFilters((prev) => ({ ...prev, ownerName: e.target.value }))}
                        placeholder={t("filterOwnerName")}
                    />
                </CompactField>
                <CompactField label={t("filterOwnerPhone")}>
                    <Input
                        className={CONTROL_CLASS}
                        value={filters.ownerPhone}
                        onChange={(e) => setFilters((prev) => ({ ...prev, ownerPhone: e.target.value }))}
                        placeholder={t("filterOwnerPhone")}
                    />
                </CompactField>
                <CompactField label={t("filterStatus")} className="min-w-[5.5rem] max-w-[8rem] flex-none">
                    <OptionalSelect
                        value={filters.status}
                        onChange={(status) => setFilters((prev) => ({ ...prev, status }))}
                        placeholder={t("filterStatus")}
                        options={GROUP_STATUS_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                    />
                </CompactField>
                <CompactField label={t("filterSignStatus")} className="min-w-[5.5rem] max-w-[8rem] flex-none">
                    <OptionalSelect
                        value={filters.signStatus}
                        onChange={(signStatus) => setFilters((prev) => ({ ...prev, signStatus }))}
                        placeholder={t("filterSignStatus")}
                        options={SIGN_STATUS_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                    />
                </CompactField>
                <CompactField label={t("filterPlantingType")} className="min-w-[5.5rem] max-w-[8rem] flex-none">
                    <OptionalSelect
                        value={filters.plantingType}
                        onChange={(plantingType) =>
                            setFilters((prev) => ({ ...prev, plantingType, businessCategory: "" }))
                        }
                        placeholder={t("filterPlantingType")}
                        options={dict.options}
                    />
                </CompactField>
                <CompactField label={t("filterBusinessCategory")} className="min-w-[6rem] max-w-[8.5rem] flex-none">
                    <OptionalSelect
                        value={filters.businessCategory}
                        onChange={(businessCategory) => setFilters((prev) => ({ ...prev, businessCategory }))}
                        placeholder={t("filterBusinessCategory")}
                        options={draftCategoryOptions}
                        disabled={!filters.plantingType}
                    />
                </CompactField>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <Button type="button" variant="outline" size="sm" className="h-8 px-2.5" onClick={handleReset}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        {t("reset")}
                    </Button>
                    <Button type="submit" size="sm" className="h-8 px-2.5">
                        <Search className="mr-1 h-3.5 w-3.5" />
                        {t("search")}
                    </Button>
                </div>
            </form>

            {loading ? (
                <div className={projectGridClass}>
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-[148px] rounded-lg" />
                    ))}
                </div>
            ) : groups.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="p-12 text-center">
                        <FolderKanban className="mx-auto h-10 w-10 text-muted-foreground/40" />
                        <p className="mt-3 text-sm font-medium">{t("noFarmsTitle")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{t("noGroupsDesc")}</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className={projectGridClass}>
                        {groups.map((group) => {
                            const groupId = String(group.groupId);
                            const area = group.effectiveArea ?? group.groupArea;
                            const name = group.groupName || groupId;
                            const ownerLine = [group.ownerName, group.groupCode].filter(Boolean).join(" · ");
                            return (
                                <Link
                                    key={groupId}
                                    href={`/farms/detail?groupId=${encodeURIComponent(groupId)}`}
                                    className="group min-w-0"
                                >
                                    <Card className="h-full transition-all hover:border-primary/30 hover:shadow-sm">
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle">
                                                    <FolderKanban className="h-4 w-4 text-primary" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start gap-2">
                                                        <h3
                                                            className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-snug"
                                                            title={name}
                                                        >
                                                            {name}
                                                        </h3>
                                                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                                                    </div>
                                                    <p className="mt-1.5 text-xs text-muted-foreground">
                                                        {t("landCountArea", {
                                                            count: Number(group.groupNum) || 0,
                                                            area: formatMu(area),
                                                        })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                <Badge variant="secondary" className="px-2 py-0 text-xs font-medium">
                                                    {groupStatusLabel(group.status)}
                                                </Badge>
                                                {group.signStatus != null && group.signStatus !== "" && (
                                                    <Badge variant="outline" className="px-2 py-0 text-xs font-medium">
                                                        {signStatusLabel(group)}
                                                    </Badge>
                                                )}
                                                {group.plantingType != null && group.plantingType !== "" && (
                                                    <Badge variant="outline" className="px-2 py-0 text-xs font-medium">
                                                        {plantingTypeLabel(group.plantingType, dict.labelByValue)}
                                                    </Badge>
                                                )}
                                                {group.businessCategory && (
                                                    <Badge variant="outline" className="px-2 py-0 text-xs font-medium">
                                                        {group.businessCategory}
                                                    </Badge>
                                                )}
                                            </div>
                                            {ownerLine ? (
                                                <p className="mt-2 truncate text-xs text-muted-foreground/80" title={ownerLine}>
                                                    {ownerLine}
                                                </p>
                                            ) : null}
                                        </CardContent>
                                    </Card>
                                </Link>
                            );
                        })}
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-4">
                        <p className="text-sm text-muted-foreground tabular-nums">
                            {t("pageInfo", { page: pageNum, totalPages, from, to, total })}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                disabled={!canPrev}
                                onClick={() => setPageNum((n) => Math.max(1, n - 1))}
                            >
                                <ChevronLeft className="mr-1 h-4 w-4" />
                                {t("prev")}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                disabled={!canNext}
                                onClick={() => setPageNum((n) => n + 1)}
                            >
                                {t("next")}
                                <ChevronRight className="ml-1 h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
