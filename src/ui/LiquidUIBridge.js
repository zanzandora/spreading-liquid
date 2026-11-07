/**
 * LiquidInteractionHandler
 * Handles mouse and touch drag interactions on the canvas,
 * feeding continuous stroke segments to the 2.5D viscoplastic smear shader.
 */
export class LiquidInteractionHandler {
    constructor(liquidSurface, canvasElement) {
        this.liquidSurface = liquidSurface;
        this.canvas = canvasElement;

        this.currPos = { x: 0.5, y: 0.5 };
        this.prevPos = { x: 0.5, y: 0.5 };
        this.isDown = false;

        this.bindEvents();
    }

    bindEvents() {
        const getNormalizedPos = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: Math.max(0.0, Math.min(1.0, (clientX - rect.left) / rect.width)),
                // Flip Y because WebGL UV origin (0, 0) is at bottom-left
                y: Math.max(0.0, Math.min(1.0, 1.0 - (clientY - rect.top) / rect.height))
            };
        };

        // Pointer Down (drag start)
        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;

            this.isDown = true;
            try { this.canvas.setPointerCapture(e.pointerId); } catch {}

            const pos = getNormalizedPos(e.clientX, e.clientY);
            this.currPos.x = pos.x;
            this.currPos.y = pos.y;
            this.prevPos.x = pos.x;
            this.prevPos.y = pos.y;
        });

        // Pointer Move (drag smear)
        this.canvas.addEventListener('pointermove', (e) => {
            const pos = getNormalizedPos(e.clientX, e.clientY);
            this.currPos.x = pos.x;
            this.currPos.y = pos.y;

            if (this.isDown) {
                const dx = this.currPos.x - this.prevPos.x;
                const dy = this.currPos.y - this.prevPos.y;
                const dist = Math.hypot(dx, dy);

                if (dist > 0.0003) {
                    this.liquidSurface.stepSmear(this.currPos, this.prevPos, true);
                    this.prevPos.x = this.currPos.x;
                    this.prevPos.y = this.currPos.y;
                }
            } else {
                this.prevPos.x = this.currPos.x;
                this.prevPos.y = this.currPos.y;
            }
        });

        // Pointer Up / Cancel (drag end)
        const handlePointerUp = (e) => {
            this.isDown = false;
            try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
        };

        this.canvas.addEventListener('pointerup', handlePointerUp);
        this.canvas.addEventListener('pointercancel', handlePointerUp);
        window.addEventListener('blur', () => { this.isDown = false; });
    }
}
