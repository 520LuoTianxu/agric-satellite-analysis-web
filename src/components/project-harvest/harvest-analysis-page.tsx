"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Search } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { listPlantingGroups, type AgricGroup } from "@/lib/agric";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HarvestAnalysisView } from "./harvest-analysis-view";

/** 可搜索的项目选择器（项目名 + groupId + 地块数），选择写入 URL ?groupId=。 */
export function ProjectSelector({ value, onChange }: { value: string; onChange: (groupId: string, group?: AgricGroup) => void }) {
    const t = useTranslations("harvestAnalysis");
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [rows, setRows] = useState<AgricGroup[]>([]);
    const [current, setCurrent] = useState<AgricGroup | null>(null);
    const [loading, setLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        const timer = setTimeout(() => {
            const q = query.trim();
            listPlantingGroups({ pageSize: 30, groupName: q && !/^\d+$/.test(q) ? q : undefined })
                .then((res) => {
                    if (cancelled) return;
                    let list = res.rows;
                    if (/^\d+$/.test(q)) list = [{ groupId: q, groupName: t("projectById", { id: q }) }, ...list.filter((g) => String(g.groupId).includes(q))];
                    setRows(list);
                })
                .catch(() => { if (!cancelled) setRows(/^\d+$/.test(q) ? [{ groupId: q }] : []); })
                .finally(() => { if (!cancelled) setLoading(false); });
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [open, query, t]);

    useEffect(() => {
        const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    const label = current && String(current.groupId) === value ? `${current.groupName ?? ""} · ${value}` : value ? `groupId ${value}` : t("selectProject");
    return <div ref={ref} className="relative w-80">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}
            className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-sm">
            <span className="truncate">{label}</span><ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        {open && <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 shadow-md">
            <div className="relative mb-2"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus className="h-8 pl-7 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchProject")} /></div>
            <ul role="listbox" className="max-h-72 overflow-y-auto text-sm">
                {loading && <li className="p-2 text-xs text-muted-foreground">{t("loading")}</li>}
                {!loading && !rows.length && <li className="p-2 text-xs text-muted-foreground">{t("noProjects")}</li>}
                {rows.map((g) => <li key={String(g.groupId)}>
                    <button type="button" role="option" aria-selected={String(g.groupId) === value}
                        className={cn("flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-muted", String(g.groupId) === value && "bg-muted")}
                        onClick={() => { setCurrent(g); setOpen(false); onChange(String(g.groupId), g); }}>
                        <span className="truncate">{g.groupName || String(g.groupId)}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">#{String(g.groupId)}{g.groupNum != null ? ` · ${t("parcelCount", { n: String(g.groupNum) })}` : ""}</span>
                    </button></li>)}
            </ul>
        </div>}
    </div>;
}

export function HarvestAnalysisPage() {
    const t = useTranslations("harvestAnalysis");
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const groupId = params.get("groupId") || "";
    return <div className="flex h-full min-h-0 flex-col overflow-y-auto">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <ProjectSelector value={groupId} onChange={(id) => router.replace(`${pathname}?groupId=${encodeURIComponent(id)}`)} />
            <span className="text-xs text-muted-foreground">{t("subtitle")}</span>
        </header>
        {groupId ? <HarvestAnalysisView key={groupId} groupId={groupId} />
            : <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">{t("pickProjectFirst")}</div>}
    </div>;
}
