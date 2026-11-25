export interface PhotoFrame {
    scale: number;
    x: number;
    y: number;
}

export interface PinchStart extends PhotoFrame {
    /** 双指中点相对视口中心的偏移。 */
    midX: number;
    midY: number;
    dist: number;
}

const MIN_SCALE = 1;

/** 变换原点在视口中心，让双指中点下的画面保持不动。 */
export function pinchFrame(
    start: PinchStart,
    midX: number,
    midY: number,
    dist: number,
    maxScale = 4,
): PhotoFrame {
    const safeDist = start.dist > 0 ? start.dist : 1;
    const scale = Math.min(maxScale, Math.max(MIN_SCALE, start.scale * (dist / safeDist)));
    if (scale <= MIN_SCALE + 0.001) return { scale: MIN_SCALE, x: 0, y: 0 };
    const worldX = (start.midX - start.x) / start.scale;
    const worldY = (start.midY - start.y) / start.scale;
    return {
        scale,
        x: midX - worldX * scale,
        y: midY - worldY * scale,
    };
}

/** 以视口中心为原点，把某个点放大到目标倍数。 */
export function zoomAt(
    midX: number,
    midY: number,
    from: PhotoFrame,
    toScale: number,
    maxScale = 4,
): PhotoFrame {
    const scale = Math.min(maxScale, Math.max(MIN_SCALE, toScale));
    if (scale <= MIN_SCALE + 0.001) return { scale: MIN_SCALE, x: 0, y: 0 };
    const worldX = (midX - from.x) / from.scale;
    const worldY = (midY - from.y) / from.scale;
    return {
        scale,
        x: midX - worldX * scale,
        y: midY - worldY * scale,
    };
}

/** 放大后允许拖动，但画面中心不离开视口。 */
export function clampPan(
    frame: PhotoFrame,
    width: number,
    height: number,
): PhotoFrame {
    if (frame.scale <= MIN_SCALE + 0.001) return { scale: MIN_SCALE, x: 0, y: 0 };
    const limitX = (Math.max(0, width) * (frame.scale - 1)) / 2;
    const limitY = (Math.max(0, height) * (frame.scale - 1)) / 2;
    return {
        scale: frame.scale,
        x: Math.min(limitX, Math.max(-limitX, frame.x)),
        y: Math.min(limitY, Math.max(-limitY, frame.y)),
    };
}
