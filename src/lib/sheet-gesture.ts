/**
 * 手机端抽屉跟手：内容还能滚时先滚内容；滚到顶后继续下拉，或还没展开时上拉，
 * 都把位移交给整个弹出层。和苹果地图的抽屉一样，内部滚动条不会把收起手势吃掉。
 */

export type SheetGestureMode = "undecided" | "sheet" | "scroll" | "ignore";

export interface ScrollerSnap {
    scrollTop: number;
    maxScroll: number;
}

export interface SheetGestureInput {
    mode: SheetGestureMode;
    owned: boolean;
    totalX: number;
    totalY: number;
    /** 这一帧手指的纵向位移，向下为正。 */
    stepY: number;
    offset: number;
    minOffset: number;
    maxOffset: number;
    /** 从手指所在的内层滚到外层抽屉。 */
    scrollers: ScrollerSnap[];
}

export interface SheetGestureResult {
    mode: SheetGestureMode;
    owned: boolean;
    preventScroll: boolean;
    offset: number;
    scrollers: ScrollerSnap[];
}

const SLOP_PX = 10;

function cloneScrollers(scrollers: ScrollerSnap[]): ScrollerSnap[] {
    return scrollers.map((item) => ({ scrollTop: item.scrollTop, maxScroll: item.maxScroll }));
}

function applyOwned(input: SheetGestureInput, stepY: number): SheetGestureResult {
    const scrollers = cloneScrollers(input.scrollers);
    let offset = input.offset;

    if (stepY > 0) {
        let remain = stepY;
        for (const scroller of scrollers) {
            if (remain <= 0) break;
            const use = Math.min(Math.max(0, scroller.scrollTop), remain);
            scroller.scrollTop -= use;
            remain -= use;
        }
        if (remain > 0) offset = Math.min(input.maxOffset, offset + remain);
    } else if (stepY < 0) {
        const rise = Math.min(Math.max(0, offset - input.minOffset), -stepY);
        offset -= rise;
        let remain = -stepY - rise;
        for (const scroller of scrollers) {
            if (remain <= 0) break;
            const space = Math.max(0, scroller.maxScroll - scroller.scrollTop);
            const use = Math.min(space, remain);
            scroller.scrollTop += use;
            remain -= use;
        }
    }

    const sheetMoved = Math.abs(offset - input.offset) > 0.1;
    return {
        mode: sheetMoved ? "sheet" : "scroll",
        owned: true,
        preventScroll: true,
        offset,
        scrollers,
    };
}

export function reduceSheetGesture(input: SheetGestureInput): SheetGestureResult {
    const idle: SheetGestureResult = {
        mode: input.mode,
        owned: input.owned,
        preventScroll: false,
        offset: input.offset,
        scrollers: cloneScrollers(input.scrollers),
    };

    if (input.mode === "ignore") return { ...idle, mode: "ignore", owned: false };

    if (input.mode === "undecided") {
        if (Math.abs(input.totalX) < SLOP_PX && Math.abs(input.totalY) < SLOP_PX) return idle;
        if (Math.abs(input.totalX) > Math.abs(input.totalY)) {
            return { ...idle, mode: "ignore", owned: false };
        }
    }

    const pullingDown = (input.mode === "undecided" ? input.totalY : input.stepY) > 0;
    const atFull = input.offset <= input.minOffset + 0.5;
    const allAtTop = input.scrollers.every((item) => item.scrollTop <= 1);
    const wantsSheet = input.mode === "sheet"
        || input.owned
        || (!pullingDown && !atFull)
        || (pullingDown && allAtTop);

    if (!wantsSheet) return { ...idle, mode: "scroll", owned: false };
    // 刚越过死区时用累计位移追上手指，之后只吃这一帧，避免连跳。
    const delta = input.mode === "undecided" ? input.totalY : input.stepY;
    return applyOwned(input, delta);
}

function isScrollable(el: HTMLElement): boolean {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") return false;
    return el.scrollHeight > el.clientHeight + 2;
}

export function collectScrollers(target: EventTarget | null, root: HTMLElement): HTMLElement[] {
    const found: HTMLElement[] = [];
    let node: Node | null = target instanceof Node ? target : null;
    if (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
    while (node instanceof HTMLElement && node !== root) {
        if (isScrollable(node)) found.push(node);
        node = node.parentElement;
    }
    found.push(root);
    return found;
}

function measureScroller(el: HTMLElement): ScrollerSnap {
    if (!isScrollable(el)) return { scrollTop: 0, maxScroll: 0 };
    return {
        scrollTop: el.scrollTop,
        maxScroll: Math.max(0, el.scrollHeight - el.clientHeight),
    };
}

function findTouch(list: TouchList, id: number): Touch | null {
    for (let index = 0; index < list.length; index += 1) {
        if (list[index].identifier === id) return list[index];
    }
    return null;
}

export interface SheetDragEnd {
    offset: number;
    velocity: number;
    moved: boolean;
    /** 松手时内容还没滚到顶，抽屉应停在展开档，不要被下拉速度收起。 */
    contentScrolled: boolean;
}

export function bindSheetGesture(options: {
    root: HTMLElement;
    enabled: () => boolean;
    readOffset: () => number;
    minOffset: () => number;
    maxOffset: () => number;
    applyOffset: (offset: number) => void;
    onGestureStart?: () => void;
    onSettle: (end: SheetDragEnd) => void;
}): () => void {
    const { root } = options;
    let active: {
        id: number;
        startX: number;
        startY: number;
        lastY: number;
        lastT: number;
        velocity: number;
        mode: SheetGestureMode;
        owned: boolean;
        startOffset: number;
        moved: boolean;
        tookOver: boolean;
        scrollers: HTMLElement[];
    } | null = null;

    const onStart = (event: TouchEvent) => {
        if (!options.enabled() || event.touches.length !== 1) return;
        if (event.target instanceof Element && event.target.closest(".touch-none, [data-sheet-gesture-ignore]")) return;
        const touch = event.touches[0];
        const now = performance.now();
        active = {
            id: touch.identifier,
            startX: touch.clientX,
            startY: touch.clientY,
            lastY: touch.clientY,
            lastT: now,
            velocity: 0,
            mode: "undecided",
            owned: false,
            startOffset: options.readOffset(),
            moved: false,
            tookOver: false,
            scrollers: collectScrollers(event.target, root),
        };
    };

    const onMove = (event: TouchEvent) => {
        if (!active) return;
        const touch = findTouch(event.touches, active.id);
        if (!touch) return;
        const now = performance.now();
        const stepY = touch.clientY - active.lastY;
        active.velocity = stepY / Math.max(8, now - active.lastT);
        active.lastY = touch.clientY;
        active.lastT = now;

        const result = reduceSheetGesture({
            mode: active.mode,
            owned: active.owned,
            totalX: touch.clientX - active.startX,
            totalY: touch.clientY - active.startY,
            stepY,
            offset: options.readOffset(),
            minOffset: options.minOffset(),
            maxOffset: options.maxOffset(),
            scrollers: active.scrollers.map(measureScroller),
        });
        active.mode = result.mode;
        active.owned = result.owned;
        if (!result.preventScroll) {
            // 方向一旦像抽屉，就立刻拦住浏览器滚动。等越过死区再 preventDefault，
            // iOS 会把这次手势锁成内容滚动，后面就拉不动整层了。
            const totalY = touch.clientY - active.startY;
            const totalX = touch.clientX - active.startX;
            const vertical = Math.abs(totalY) > Math.abs(totalX);
            const atTop = active.scrollers.every((scroller) => measureScroller(scroller).scrollTop <= 1);
            const atFull = options.readOffset() <= options.minOffset() + 0.5;
            const claimSheet = active.mode !== "ignore" && vertical && ((totalY > 0 && atTop) || (totalY < 0 && !atFull));
            if (claimSheet) event.preventDefault();
            return;
        }

        if (!active.tookOver) {
            active.tookOver = true;
            active.startOffset = options.readOffset();
            options.onGestureStart?.();
        }
        event.preventDefault();
        result.scrollers.forEach((snap, index) => {
            const scroller = active?.scrollers[index];
            if (!scroller || Math.abs(scroller.scrollTop - snap.scrollTop) <= 0.5) return;
            scroller.scrollTop = snap.scrollTop;
        });
        if (Math.abs(result.offset - options.readOffset()) > 0.5) {
            options.applyOffset(result.offset);
            if (Math.abs(result.offset - active.startOffset) > 6) active.moved = true;
        }
    };

    const finish = (event: TouchEvent) => {
        if (!active) return;
        const touch = findTouch(event.changedTouches, active.id);
        if (!touch && event.type !== "touchcancel") return;
        const ended = active;
        active = null;
        if (!ended.tookOver) return;
        const contentScrolled = ended.scrollers.some((scroller) => scroller.scrollTop > 1);
        options.onSettle({
            offset: options.readOffset(),
            velocity: ended.velocity,
            moved: ended.moved,
            contentScrolled,
        });
        if (!ended.moved) return;
        const stopClick = (click: Event) => {
            if (!("isTrusted" in click) || click.isTrusted === false) return;
            click.preventDefault();
            click.stopPropagation();
            root.removeEventListener("click", stopClick, true);
        };
        root.addEventListener("click", stopClick, true);
        window.setTimeout(() => root.removeEventListener("click", stopClick, true), 500);
    };

    root.addEventListener("touchstart", onStart, { passive: true, capture: true });
    root.addEventListener("touchmove", onMove, { passive: false, capture: true });
    root.addEventListener("touchend", finish, true);
    root.addEventListener("touchcancel", finish, true);
    return () => {
        root.removeEventListener("touchstart", onStart, true);
        root.removeEventListener("touchmove", onMove, true);
        root.removeEventListener("touchend", finish, true);
        root.removeEventListener("touchcancel", finish, true);
    };
}
