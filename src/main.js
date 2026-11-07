import * as THREE from 'three';
import { LiquidSurface } from './simulation/LiquidSurface.js';
import { LiquidInteractionHandler } from './ui/LiquidUIBridge.js';

class SpreadingLiquidApp {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.initRenderer();
        this.initSimulations();
        this.initInteraction();
        this.initControls();
        this.bindEvents();

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const width = this.container.clientWidth || 520;
        const height = this.container.clientHeight || 520;
        this.renderer.setSize(width, height);
        this.renderer.autoClear = false;
        this.container.appendChild(this.renderer.domElement);
    }

    initSimulations() {
        // 2.5D Viscoplastic Paste Smearing (Local Heightfield Deformation)
        this.liquidSurface = new LiquidSurface(this.renderer, {
            resolution: 512,
            dropRadius: 0.165,
            brushRadius: 0.082,
            normalScale: 0.45
        });

        this.onResize();
    }

    initInteraction() {
        this.interaction = new LiquidInteractionHandler(
            this.liquidSurface,
            this.renderer.domElement
        );
    }

    initControls() {
        // Reset Button restores the initial hemispherical droplet
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.liquidSurface.resetToInitialDrop();
            });
        }
    }

    bindEvents() {
        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        const width = this.container.clientWidth || 520;
        const height = this.container.clientHeight || 520;
        this.renderer.setSize(width, height);
        this.liquidSurface.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(this.animate);

        // Render shaded 2.5D liquid surface to screen
        this.renderer.clear();
        this.liquidSurface.renderToScreen();
    }
}

// Bootstrap on DOM ready
window.addEventListener('DOMContentLoaded', () => {
    window.app = new SpreadingLiquidApp();
});
