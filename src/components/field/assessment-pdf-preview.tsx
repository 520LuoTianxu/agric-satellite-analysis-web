"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { assessmentApi } from "@/lib/api";
import { Button } from "@/components/ui/button";

/** 将已有 PDF 按页渲染到侧栏，保留原报告的中文、图表和版式。 */
function ReportPage({ pdf, pageNumber }: { pdf: PDFDocumentProxy; pageNumber: number }) {
    const t = useTranslations("reportPreview");
    const container = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [width, setWidth] = useState(0);
    const [visible, setVisible] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        const element = container.current;
        if (!element) return;
        // 只渲染视口附近的页面，避免长报告同时占用大量画布内存。
        const intersection = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
            rootMargin: "400px",
        });
        const resize = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
        intersection.observe(element);
        resize.observe(element);
        return () => { intersection.disconnect(); resize.disconnect(); };
    }, []);

    useEffect(() => {
        const target = canvas.current;
        if (!visible || !width || !target) return;
        let cancelled = false;
        let render: RenderTask | undefined;
        setError(false);
        void (async () => {
            try {
                const page = await pdf.getPage(pageNumber);
                if (cancelled) return;
                const context = target.getContext("2d");
                if (!context) throw new Error("Canvas unavailable");
                // CSS 宽度适配拖拽侧栏，像素倍率保证高分屏的中文和图表清晰。
                const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
                const ratio = Math.min(window.devicePixelRatio || 1, 2);
                target.width = Math.floor(viewport.width * ratio);
                target.height = Math.floor(viewport.height * ratio);
                target.style.height = `${viewport.height}px`;
                render = page.render({ canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
                await render.promise;
            } catch {
                if (!cancelled) setError(true);
            }
        })();
        return () => {
            cancelled = true;
            render?.cancel();
            // 离开视口或改变尺寸后释放像素缓冲；CSS 高度继续占位，避免滚动跳动。
            target.width = 0;
            target.height = 0;
        };
    }, [pdf, pageNumber, width, visible]);

    return (
        <div ref={container} className="space-y-1">
            <p className="text-center text-[11px] text-muted-foreground">{t("page", { page: pageNumber, total: pdf.numPages })}</p>
            {error && <p role="alert" className="text-xs text-destructive">{t("pageFailed")}</p>}
            <canvas ref={canvas} role="img" aria-label={t("page", { page: pageNumber, total: pdf.numPages })}
                className="w-full rounded border bg-white" style={{ minHeight: width ? width * 1.4 : 300 }} />
        </div>
    );
}

export default function AssessmentPdfPreview({ landId, jobId }: { landId: string; jobId: string }) {
    const t = useTranslations("reportPreview");
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        let task: PDFDocumentLoadingTask | undefined;
        const abort = new AbortController();
        setPdf(null);
        setError(false);
        void (async () => {
            try {
                // 渲染器按需加载；worker、中文字体映射随静态站点发布，不依赖外部 CDN。
                const [renderer, data] = await Promise.all([
                    import("pdfjs-dist/legacy/build/pdf.mjs"),
                    assessmentApi.latestPdf(landId, abort.signal),
                ]);
                if (cancelled) return;
                const assets = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/pdfjs/`;
                renderer.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
                task = renderer.getDocument({ data, cMapUrl: `${assets}cmaps/`, cMapPacked: true,
                    standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/` });
                const document = await task.promise;
                if (!cancelled) setPdf(document);
            } catch {
                if (!cancelled) setError(true);
            }
        })();
        // 切换地块时取消下载并释放 worker，防止旧报告覆盖当前选择。
        return () => { cancelled = true; abort.abort(); void task?.destroy(); };
    }, [landId, jobId, attempt]);

    return (
        <section aria-label={t("title")} className="space-y-3">
            <h4 className="text-sm font-semibold">{t("title")}</h4>
            {error ? (
                <div role="alert" className="rounded border p-4 text-sm space-y-2">
                    <p>{t("failed")}</p>
                    <Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>{t("retry")}</Button>
                </div>
            ) : pdf ? (
                Array.from({ length: pdf.numPages }, (_, index) => <ReportPage key={`${jobId}-${index}`} pdf={pdf} pageNumber={index + 1} />)
            ) : (
                <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />{t("loading")}
                </div>
            )}
        </section>
    );
}
