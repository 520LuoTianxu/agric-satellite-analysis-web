/**
 * 折线图只在长按之后进入检视。短按、悬停和普通拖动都不改日期。
 * 长按成立后，手指左右移动才在已有观测日之间切换。
 */

export const CHART_SCRUB_HOLD_MS = 420;
export const CHART_SCRUB_CANCEL_PX = 8;

export function uniqueSortedDates(dates: Iterable<string>): string[] {
    return [...new Set([...dates].filter((date) => date.length > 0))].sort((a, b) => a.localeCompare(b));
}

/** 把生育期区间收束到轴上真实存在的观测日。没有观测则不画这段。 */
export function snapCategoryBand(dates: string[], start: string, end: string): [string, string] | null {
    const lo = start <= end ? start : end;
    const hi = start <= end ? end : start;
    const inside = dates.filter((date) => date >= lo && date <= hi);
    if (!inside.length) return null;
    return [inside[0]!, inside[inside.length - 1]!];
}

/** dataZoom 的百分比窗口对应的日期。起止颠倒时仍返回从早到晚的一段。 */
export function datesInPercentWindow(dates: string[], startPct: number, endPct: number): string[] {
    if (dates.length === 0) return [];
    const lo = Math.max(0, Math.min(100, Math.min(startPct, endPct)));
    const hi = Math.max(0, Math.min(100, Math.max(startPct, endPct)));
    if (dates.length === 1) return dates.slice();
    const from = Math.floor((lo / 100) * (dates.length - 1));
    const to = Math.ceil((hi / 100) * (dates.length - 1));
    return dates.slice(from, to + 1);
}

/**
 * 按住超过阈值且手指基本没动，才允许显示指标。
 * 普通点击时间不够；滑动一开始超过死区，就当成滚动而不是检视。
 */
export function scrubActivates(elapsedMs: number, distancePx: number): boolean {
    return elapsedMs >= CHART_SCRUB_HOLD_MS && distancePx <= CHART_SCRUB_CANCEL_PX;
}
