import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampPan, pinchFrame, zoomAt } from "./photo-frame.ts";

describe("photo frame", () => {
    it("keeps the pinch center still while scaling up", () => {
        const next = pinchFrame(
            { scale: 1, x: 0, y: 0, midX: 40, midY: -10, dist: 100 },
            40,
            -10,
            200,
        );
        assert.equal(next.scale, 2);
        assert.equal(next.x, 40 - 40 * 2);
        assert.equal(next.y, -10 - -10 * 2);
    });

    it("follows a moving pinch midpoint", () => {
        const next = pinchFrame(
            { scale: 1, x: 0, y: 0, midX: 40, midY: 0, dist: 80 },
            50,
            12,
            160,
        );
        assert.equal(next.scale, 2);
        assert.equal(next.x, 50 - 40 * 2);
        assert.equal(next.y, 12);
    });

    it("recenters when the pinch returns to the original size", () => {
        assert.deepEqual(
            pinchFrame({ scale: 2, x: -30, y: 12, midX: 10, midY: 4, dist: 180 }, 10, 4, 90),
            { scale: 1, x: 0, y: 0 },
        );
    });

    it("zooms around a tap and resets from the center", () => {
        const zoomed = zoomAt(20, -8, { scale: 1, x: 0, y: 0 }, 2.5);
        assert.equal(zoomed.scale, 2.5);
        assert.equal(zoomed.x, 20 - 20 * 2.5);
        assert.equal(zoomed.y, -8 - -8 * 2.5);
        assert.deepEqual(zoomAt(0, 0, zoomed, 1), { scale: 1, x: 0, y: 0 });
    });

    it("limits panning to the scaled viewport", () => {
        assert.deepEqual(clampPan({ scale: 1, x: 40, y: 20 }, 200, 100), { scale: 1, x: 0, y: 0 });
        assert.deepEqual(clampPan({ scale: 2, x: 400, y: -80 }, 200, 100), { scale: 2, x: 100, y: -50 });
    });
});
