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
            mouseForce: 22.0,
            splatRadius: 0.085,
            dissipation: 0.35, // Viscous settling for paint
            BFECC: true,
            dt: 0.014
        });

        // 2. Liquid Surface Height Map & Matcap Shading from mofu-dev
        this.liquidSurface = new LiquidSurface(this.renderer, this.fluidSim, {
            resolution: 512,
            dropRadius: 0.165,
            velocityThresholdMin: 0.001,
            velocityThresholdMax: 0.045,
            trailDecay: 1.0,
            dt: 0.014
        });

        this.onResize();
    }

    initInteraction() {
        this.interaction = new LiquidInteractionHandler(
            this.fluidSim,
            this.liquidSurface,
            this.renderer.domElement
        );
    }

    initControls() {
        // Reset Button restores the initial sky-blue droplet
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.fluidSim.clear();
                this.liquidSurface.resetToInitialDrops();
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

        // 1. Step Navier-Stokes velocity field
        this.fluidSim.step(dt);

        // 2. Advect liquid thickness height map & update historical alpha map
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
