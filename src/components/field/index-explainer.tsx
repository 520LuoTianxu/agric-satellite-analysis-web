"use client";

import { AgriIndexGlossary } from "@/components/field/agri-index-glossary";
import { getRemoteSensingKey, REMOTE_SENSING_GUIDE } from "@/lib/remote-sensing-guide";

/** 指标切换时就地解释含义，让第一次使用的人不必先打开帮助或理解缩写。 */
export function IndexExplainer({ index }: { index: string }) {
    const key = getRemoteSensingKey(index);
    const guide = REMOTE_SENSING_GUIDE[key];

    return (
        <section aria-label={`${key.toUpperCase()} 白话说明`} className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-foreground">{guide.title}</h3>
                <AgriIndexGlossary initialKey={key} />
            </div>
            <p>{guide.summary}</p>
            <p className="text-muted-foreground"><span className="font-medium text-foreground">怎么看：</span>{guide.reading}</p>
        </section>
    );
}
