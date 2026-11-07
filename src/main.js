import * as THREE from 'three';
import { FluidSimulation } from './simulation/FluidSimulation.js';
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
        // 1. Navier-Stokes Solver from mnmxmx/fluid-three
        this.fluidSim = new FluidSimulation(this.renderer, {
            simResolution: 128,
            iterations: 32,
            mouseForce: 18.0,
            splatRadius: 0.080,
            dissipation: 0.22,
            BFECC: true,
            dt: 0.014
        });

        // 2. Liquid Surface Height Map & Alpha Map from mofu-dev
        this.liquidSurface = new LiquidSurface(this.renderer, this.fluidSim, {
            resolution: 512,
            velocityThresholdMin: 0.003,
            velocityThresholdMax: 0.055,
            dt: 0.014
        });

        this.onResize();
    }

    initInteraction() {
        this.interaction = new LiquidInteractionHandler(
            this.fluidSim,
            this.renderer.domElement
        );
    }

    initControls() {
        // Reset Button restores the initial hemispherical droplet
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.fluidSim.clear();
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
        this.fluidSim.setSize(width, height);
        this.liquidSurface.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(this.animate);

        const dt = 0.014;

        // 1. Step Eulerian Navier-Stokes solver
        this.fluidSim.step(dt);

        // 2. Advect liquid thickness heightMap & update historical alphaMap
        this.liquidSurface.update(dt);

        // 3. Render shaded surface to screen
        this.renderer.clear();
        this.liquidSurface.renderToScreen();
    }
}

// Bootstrap on DOM ready
window.addEventListener('DOMContentLoaded', () => {
    window.app = new SpreadingLiquidApp();
});
