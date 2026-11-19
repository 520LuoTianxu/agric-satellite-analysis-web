/**
 * Click-to-select a date on time-series charts.
 *
 * Tooltips often use ECharts axis trigger (wide vertical hover), but the
 * built-in `click` event only fires when the pointer hits a tiny series
 * symbol. These helpers pick the nearest plotted date by x-position when
 * the user clicks anywhere inside the plot grid.
 */

const ZR_HANDLER = "__agriNearestDateClick";

export type AxisClickChart = {
    containPixel(finder: { gridIndex?: number }, point: number[]): boolean;
    convertToPixel(finder: { xAxisIndex?: number }, value: string | number): unknown;
    getZr(): {
        on(event: string, handler: (e: { offsetX: number; offsetY: number }) => void): void;
        off(event: string, handler: (e: { offsetX: number; offsetY: number }) => void): void;
    };
    isDisposed?: () => boolean;
};

function pixelX(chart: AxisClickChart, date: string): number | null {
    try {
        const px = chart.convertToPixel({ xAxisIndex: 0 }, date);
        const x = Array.isArray(px) ? px[0] : px;
        return typeof x === "number" && Number.isFinite(x) ? x : null;
    } catch {
        return null;
    }
}

/** Nearest plotted date to a click, by x-pixel distance, if the click is in the grid. */
export function nearestDateAtChartClick(
    chart: AxisClickChart,
    offsetX: number,
    offsetY: number,
    dates: string[],
): string | null {
    if (!dates.length) return null;
    if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return null;
    try {
        if (!chart.containPixel({ gridIndex: 0 }, [offsetX, offsetY])) return null;
    } catch {
        return null;
    }
    let best: string | null = null;
    let bestDist = Infinity;
    for (const date of dates) {
        if (!date) continue;
        const x = pixelX(chart, date);
        if (x == null) continue;
        const dist = Math.abs(x - offsetX);
        if (dist < bestDist) {
            bestDist = dist;
            best = date;
        }
    }
    return best;
}

/**
 * Bind a zrender click handler that selects the nearest date.
 * Rebinding on the same instance replaces the previous handler.
 * Returns an unbind function.
 */
export function attachNearestDateClick(
    chart: AxisClickChart,
    getDates: () => string[],
    onSelect: (date: string) => void,
): () => void {
    const zr = chart.getZr();
    const prev = (zr as unknown as Record<string, unknown>)[ZR_HANDLER] as
        | ((e: { offsetX: number; offsetY: number }) => void)
        | undefined;
    if (prev) zr.off("click", prev);
    const handler = (event: { offsetX: number; offsetY: number }) => {
        if (chart.isDisposed?.()) return;
        const date = nearestDateAtChartClick(chart, event.offsetX, event.offsetY, getDates());
        if (date) onSelect(date);
    };
    (zr as unknown as Record<string, unknown>)[ZR_HANDLER] = handler;
    zr.on("click", handler);
    return () => {
        zr.off("click", handler);
        const bag = zr as unknown as Record<string, unknown>;
        if (bag[ZR_HANDLER] === handler) delete bag[ZR_HANDLER];
    };
}
