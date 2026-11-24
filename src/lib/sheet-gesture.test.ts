import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reduceSheetGesture, type SheetGestureInput } from "./sheet-gesture.ts";

function input(overrides: Partial<SheetGestureInput> = {}): SheetGestureInput {
    return {
        mode: "undecided",
        owned: false,
        totalX: 0,
        totalY: 0,
        stepY: 0,
        offset: 320,
        minOffset: 0,
        maxOffset: 700,
        scrollers: [{ scrollTop: 0, maxScroll: 400 }],
        ...overrides,
    };
}

describe("reduceSheetGesture", () => {
    it("keeps a small movement undecided so taps still click", () => {
        const result = reduceSheetGesture(input({ totalX: 4, totalY: 6, stepY: 6 }));
        assert.equal(result.mode, "undecided");
        assert.equal(result.preventScroll, false);
        assert.equal(result.offset, 320);
    });

    it("lets a horizontal swipe scroll chips instead of the sheet", () => {
        const result = reduceSheetGesture(input({ totalX: 24, totalY: 6, stepY: 2 }));
        assert.equal(result.mode, "ignore");
        assert.equal(result.preventScroll, false);
    });

    it("pulls the sheet down once the content is already at the top", () => {
        const result = reduceSheetGesture(input({ totalY: 18, stepY: 12 }));
        assert.equal(result.mode, "sheet");
        assert.equal(result.preventScroll, true);
        assert.equal(result.offset, 338);
        assert.equal(result.scrollers[0].scrollTop, 0);
    });

    it("scrolls inner content before collapsing when it is not at the top", () => {
        const result = reduceSheetGesture(input({
            totalY: 16,
            stepY: 16,
            scrollers: [{ scrollTop: 40, maxScroll: 400 }],
        }));
        assert.equal(result.mode, "scroll");
        assert.equal(result.preventScroll, false);
        assert.equal(result.offset, 320);
        assert.equal(result.scrollers[0].scrollTop, 40);
    });

    it("hands the rest of a downward drag to the sheet after the content hits the top", () => {
        const result = reduceSheetGesture(input({
            mode: "scroll",
            totalY: 30,
            stepY: 12,
            scrollers: [{ scrollTop: 0, maxScroll: 400 }],
        }));
        assert.equal(result.preventScroll, true);
        assert.equal(result.offset, 332);
    });

    it("expands the sheet upward before scrolling the content", () => {
        const result = reduceSheetGesture(input({
            totalY: -20,
            stepY: -20,
            scrollers: [{ scrollTop: 0, maxScroll: 400 }],
        }));
        assert.equal(result.mode, "sheet");
        assert.equal(result.offset, 300);
        assert.equal(result.scrollers[0].scrollTop, 0);
    });

    it("scrolls the content only after the sheet is fully expanded", () => {
        const result = reduceSheetGesture(input({
            mode: "sheet",
            owned: true,
            offset: 0,
            stepY: -24,
            scrollers: [{ scrollTop: 10, maxScroll: 400 }],
        }));
        assert.equal(result.offset, 0);
        assert.equal(result.scrollers[0].scrollTop, 34);
        assert.equal(result.mode, "scroll");
        assert.equal(result.owned, true);
    });

    it("returns a downward drag to the content first, then the sheet", () => {
        const result = reduceSheetGesture(input({
            mode: "sheet",
            owned: true,
            offset: 80,
            stepY: 30,
            scrollers: [{ scrollTop: 12, maxScroll: 400 }],
        }));
        assert.equal(result.scrollers[0].scrollTop, 0);
        assert.equal(result.offset, 98);
        assert.equal(result.mode, "sheet");
    });
});
