"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { agriApi, type OverviewHistoryItem, type OverviewLevel } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function OverviewHistory({ level, code, name, to, selected, onSelect }: {
    level: OverviewLevel; code?: string; name?: string; to: string;
    selected?: string; onSelect: (day: string) => void;
}) {
    const t = useTranslations("overviewPage");
    const [items, setItems] = useState<OverviewHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    // 以日期本身做UTC日历运算，避免浏览器时区和夏令时改变历史查询范围。
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 30);
    const from = end.toISOString().slice(0, 10);
    const dates = Array.from({ length: 31 }, (_, i) => {
        const day = new Date(end);
        day.setUTCDate(day.getUTCDate() + i);
        return day.toISOString().slice(0, 10);
    });

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        setItems([]);
        agriApi.overviewHistory({ level, code, name, from, to }).then((result) => {
            if (!cancelled) setItems(result.items);
        }).catch(() => { if (!cancelled) setFailed(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [level, code, name, from, to, retry]);

    const byDate = new Map(items.map((item) => [item.as_of_date, item]));
    const option = {
        grid: { left: 34, right: 12, top: 30, bottom: 24 },
        tooltip: { trigger: "axis" },
        legend: { data: [t("drought"), t("flood")], textStyle: { fontSize: 10 } },
        xAxis: { type: "category", data: dates, axisLabel: { formatter: (value: string) => value.slice(5), fontSize: 9 } },
        yAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 9 } },
        // 未保存的日期保留断点；补零会错误表示该日没有灾情。
        series: [
            { name: t("drought"), type: "line", connectNulls: false, data: dates.map((day) => byDate.get(day)?.drought_alert ?? null), itemStyle: { color: "#f97316" } },
            { name: t("flood"), type: "line", connectNulls: false, data: dates.map((day) => byDate.get(day)?.flood_alert ?? null), itemStyle: { color: "#3b82f6" } },
        ],
    };

    return <Card>
        <CardHeader className="px-2 py-1.5"><CardTitle className="text-xs font-medium">{t("historyTrend")}</CardTitle></CardHeader>
        <CardContent className="px-2 pb-2 text-[11px]">
            {loading ? <p>{t("loading")}</p> : failed ? <div role="alert"><p>{t("loadFailed")}</p><Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>{t("retry")}</Button></div> : items.length === 0 ? <p className="text-muted-foreground">{t("noSnapshots")}</p> : <>
                <ReactECharts option={option} style={{ height: 160 }} onEvents={{ click: (event: { dataIndex: number }) => { const day = dates[event.dataIndex]; if (day) onSelect(day); } }} />
                <div className="overflow-x-auto"><table className="w-full text-right tabular-nums">
                    <thead><tr className="text-muted-foreground"><th className="text-left">{t("snapshotDate")}</th><th>{t("drought")}</th><th>{t("flood")}</th><th>{t("unknown")}</th></tr></thead>
                    <tbody>{[...items].reverse().slice(0, 7).map((item) => <tr key={item.as_of_date} className={item.as_of_date === selected ? "bg-primary/10" : ""}>
                        <td className="text-left"><button className="py-1 text-primary hover:underline" type="button" onClick={() => onSelect(item.as_of_date)}>{item.as_of_date}{item.data_status === "partial" ? " *" : ""}</button></td>
                        <td>{item.drought_alert}</td><td>{item.flood_alert}</td><td>{item.drought_unknown} / {item.flood_unknown}</td>
                    </tr>)}</tbody>
                </table></div>
            </>}
            <p className="mt-1 text-muted-foreground">{t("historyHint")}</p>
        </CardContent>
    </Card>;
}
