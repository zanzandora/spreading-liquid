/**
 * LiquidInteractionHandler
 * Handles mouse and touch drag interactions on the canvas,
 * faithfully matching the fluid drag behavior in the video demo.
 * Uses sub-stepped interpolation to guarantee unbroken fluid strokes during fast drags.
 */
export class LiquidInteractionHandler {
    constructor(fluidSim, liquidSurface, canvasElement) {
        this.fluidSim = fluidSim;
        this.liquidSurface = liquidSurface;
        this.canvas = canvasElement;

        this.pointer = {
            x: 0.5,
            y: 0.5,
            prevX: 0.5,
            prevY: 0.5,
            isDown: false
        };

        this.splatRadius = 0.085; // Brush radius matching the video drag width
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
            // Only respond to primary button (left mouse or touch)
            if (e.button !== undefined && e.button !== 0) return;

            this.pointer.isDown = true;
            try { this.canvas.setPointerCapture(e.pointerId); } catch {}

            const pos = getNormalizedPos(e.clientX, e.clientY);
            this.pointer.x = pos.x;
            this.pointer.y = pos.y;
            this.pointer.prevX = pos.x;
            this.pointer.prevY = pos.y;
        });

        // Pointer Move (drag smear)
        this.canvas.addEventListener('pointermove', (e) => {
            const pos = getNormalizedPos(e.clientX, e.clientY);
            this.pointer.x = pos.x;
            this.pointer.y = pos.y;

            if (this.pointer.isDown) {
                const totalDx = this.pointer.x - this.pointer.prevX;
                const totalDy = this.pointer.y - this.pointer.prevY;
                const dist = Math.hypot(totalDx, totalDy);

                if (dist > 0.0004) {
                    // Interpolate steps along fast strokes to prevent gaps in the fluid trail
                    const stepDistance = this.splatRadius * 0.45;
                    const steps = Math.min(6, Math.max(1, Math.ceil(dist / stepDistance)));

                    const stepDx = totalDx / steps;
                    const stepDy = totalDy / steps;

                    for (let i = 1; i <= steps; i++) {
                        const t = i / steps;
                        const interpX = this.pointer.prevX + totalDx * t;
                        const interpY = this.pointer.prevY + totalDy * t;

                        this.fluidSim.addSplat(
                            interpX,
                            interpY,
                            stepDx,
                            stepDy,
                            this.splatRadius
                        );
                    }

                    this.pointer.prevX = this.pointer.x;
                    this.pointer.prevY = this.pointer.y;
                }
            } else {
                this.pointer.prevX = this.pointer.x;
                this.pointer.prevY = this.pointer.y;
            }
        });

        // Pointer Up / Cancel (drag end)
        const handlePointerUp = (e) => {
            this.pointer.isDown = false;
            try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
        };

        this.canvas.addEventListener('pointerup', handlePointerUp);
        this.canvas.addEventListener('pointercancel', handlePointerUp);
        window.addEventListener('blur', () => { this.pointer.isDown = false; });
    }
}
