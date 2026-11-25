/** 把长按时的大数字限制在容器里，避免滑到左右边缘时被裁掉。 */
export function clampScrubLabelX(x: number, width: number, half = 40): number {
    if (!Number.isFinite(x)) return 0;
    if (!Number.isFinite(width) || width <= 0) return x;
    const edge = Math.min(Math.max(half, 0), width / 2);
    return Math.min(width - edge, Math.max(edge, x));
}

/** 主指标用短数字，雷达用 1 位小数，光学指标用 2 位。 */
export function formatIndexValue(value: number, sar: boolean): string {
    return value.toFixed(sar ? 1 : 2);
}

function observationDate(date: string): Date | null {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return parsed;
}

/** 选中日期写成「2026年11月25日星期三」这种和日历连在一起的句子。 */
export function formatObservationDate(date: string, locale: string): string {
    const parsed = observationDate(date);
    if (!parsed) return date;
    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
    }).format(parsed);
}

/** 等级图上用的短日期，避免一整句把圆环挤开。 */
export function formatObservationDay(date: string, locale: string): string {
    const parsed = observationDate(date);
    if (!parsed) return date;
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(parsed);
}

export function companionLines(
    readings: { key: string; value: number | null | undefined }[],
    mainKey: string,
    digits: number,
    labelOf: (key: string) => string,
): { label: string; value: string }[] {
    const lines: { label: string; value: string }[] = [];
    for (const reading of readings) {
        if (reading.key === mainKey) continue;
        if (typeof reading.value !== "number" || !Number.isFinite(reading.value)) continue;
        lines.push({ label: labelOf(reading.key), value: reading.value.toFixed(digits) });
    }
    return lines;
}
