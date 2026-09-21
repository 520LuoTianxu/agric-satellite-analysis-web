"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sprout } from "lucide-react";
import { parcelInsightsApi, type Phenology, type PhenologyWindow } from "@/lib/parcel-insights";
import { Button } from "@/components/ui/button";

/** 展示可复核的候选窗口；开放边界只展示证据，不能补造一个季末日期。 */
export default function PhenologyPicker({ landId, onSelect, onLoaded }: {
    landId: string;
    onSelect: (window: PhenologyWindow) => void;
    onLoaded?: (value: Phenology) => void;
}) {
    const t = useTranslations("parcelInsights");
    const [data, setData] = useState<Phenology | null>(null);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);
    const [retry, setRetry] = useState(0);
    const loadedRef = useRef(onLoaded);
    useEffect(() => { loadedRef.current = onLoaded; }, [onLoaded]);
    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(false); setData(null);
        void parcelInsightsApi.phenology(landId).then(value => {
            if (cancelled) return;
            setData(value); loadedRef.current?.(value);
        }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [landId, retry]);
    return <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
        <p className="flex items-center gap-2 font-medium"><Sprout className="h-4 w-4" />{t("inferredWindow")}{loading && <Loader2 className="h-3 w-3 animate-spin" />}</p>
        {error ? <Button size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>{t("retry")}</Button> : data && <><p className="text-muted-foreground">{data.note}</p><div className="flex flex-wrap gap-2">{data.windows.map((window, index) => <Button key={index} size="sm" variant="outline" disabled={!window.start_date || !window.end_date} onClick={() => onSelect(window)}>{window.start_date || t("startUnknown")} ~ {window.end_date || t("endUnknown")}</Button>)}</div></>}
    </div>;
}
