import * as THREE from 'three';

/**
 * LiquidInteractionHandler
 * Implements the authentic pointer tracking from mofu-dev:
 * - Coordinates normalized to NDC [-1, 1] adjusted by displayScale (1.12)
 * - Lerps target with 0.7 damping factor for buttery smooth stroke continuation
 * - Emits diff vector used to inject physical force into fluid velocity field
 */
export class LiquidInteractionHandler {
    constructor(canvas, displayScale = 1.12) {
        this.canvas = canvas;
        this.displayScale = displayScale;

        this.target = new THREE.Vector2();
        this.coords = new THREE.Vector2();
        this.previous = new THREE.Vector2();
        this.diff = new THREE.Vector2();

        this.dragging = false;
        this.moved = false;

        this.pointerDown = this.pointerDown.bind(this);
        this.pointerMove = this.pointerMove.bind(this);
        this.pointerUp = this.pointerUp.bind(this);

        this.mount(canvas);
    }

    mount(canvas) {
        this.unmount();
        this.canvas = canvas;
        canvas.addEventListener('pointerdown', this.pointerDown);
        canvas.addEventListener('pointermove', this.pointerMove);
        canvas.addEventListener('pointerup', this.pointerUp);
        canvas.addEventListener('pointercancel', this.pointerUp);
        canvas.addEventListener('pointerleave', this.pointerUp);
    }

    setTarget(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.target.set(
            ((e.clientX - rect.left) / rect.width * 2 - 1) / this.displayScale,
            (-((e.clientY - rect.top) / rect.height * 2) + 1) / this.displayScale
        );
        if (!this.moved) {
            this.coords.copy(this.target);
            this.previous.copy(this.target);
            this.moved = true;
        }
    }

    pointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        this.dragging = true;
        try { this.canvas.setPointerCapture(e.pointerId); } catch {}
        this.setTarget(e);
        this.coords.copy(this.target);
        this.previous.copy(this.target);
        this.diff.set(0, 0);
    }

    pointerMove(e) {
        if (this.dragging) {
            this.setTarget(e);
        }
    }

    pointerUp(e) {
        this.dragging = false;
        try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
    }

    update() {
        this.coords.lerp(this.target, 0.7);
        this.diff.subVectors(this.coords, this.previous);
        this.previous.copy(this.coords);
        if (this.diff.lengthSq() < 1e-10) {
            this.diff.set(0, 0);
        }
    }

    reset() {
        this.dragging = false;
        this.moved = false;
        this.target.set(0, 0);
        this.coords.set(0, 0);
        this.previous.set(0, 0);
        this.diff.set(0, 0);
    }

    unmount() {
        if (!this.canvas) return;
        this.canvas.removeEventListener('pointerdown', this.pointerDown);
        this.canvas.removeEventListener('pointermove', this.pointerMove);
        this.canvas.removeEventListener('pointerup', this.pointerUp);
        this.canvas.removeEventListener('pointercancel', this.pointerUp);
        this.canvas.removeEventListener('pointerleave', this.pointerUp);
        this.canvas = null;
        this.reset();
    }
}
