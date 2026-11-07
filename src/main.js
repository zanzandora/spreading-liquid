import * as THREE from 'three';
import { FluidSimulation } from './simulation/FluidSimulation.js';
import { LiquidSurface } from './simulation/LiquidSurface.js';
import { LiquidInteractionHandler } from './ui/LiquidUIBridge.js';
import { loadMatcapTexture } from './materials/matcap.js';
import { baseVert, renderFrag } from './shaders/shaders.js';

class SpreadingLiquidApp {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.displayScale = 1.12;

        this.initRenderer();
        this.initMaterials();
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
        this.renderer.setClearColor(0xffffff, 1.0);

        const width = this.container.clientWidth || 520;
        const height = this.container.clientHeight || 520;
        this.renderer.setSize(width, height);
        this.container.appendChild(this.renderer.domElement);
    }

    initMaterials() {
        this.matcapTexture = loadMatcapTexture();

        this.renderResolution = new THREE.Vector2();
        this.renderMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: renderFrag,
            uniforms: {
                heightMap: { value: null },
                alphaMap: { value: null },
                matcap: { value: this.matcapTexture },
                resolution: { value: this.renderResolution }
            },
            transparent: true,
            depthTest: false,
            depthWrite: false
        });

        this.scene = new THREE.Scene();
        this.camera = new THREE.Camera();
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.renderMaterial);
        this.quad.scale.set(this.displayScale, this.displayScale, 1.0);
        this.scene.add(this.quad);
    }

    initSimulations() {
        const width = this.container.clientWidth || 520;
        const height = this.container.clientHeight || 520;

        this.fluidSim = new FluidSimulation(this.renderer, width, height, 1);
        this.liquidSurface = new LiquidSurface(this.renderer, width, height, this.fluidSim, 1, true);

        this.onResize();
    }

    initInteraction() {
        this.interaction = new LiquidInteractionHandler(
            this.renderer.domElement,
            this.displayScale
        );
    }

    initControls() {
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.interaction.reset();
                this.fluidSim.clear();
                this.liquidSurface.reset();
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
        this.renderResolution.set(width, height);
        this.fluidSim.resize(width, height);
        this.liquidSurface.resize(width, height);
    }

    animate() {
        requestAnimationFrame(this.animate);

        // 1. Smooth pointer motion & calculate diff force
        this.interaction.update();

        // 2. Step Eulerian Navier-Stokes solver
        this.fluidSim.update(this.interaction);

        // 3. Advect height thickness map & update historical alpha traces
        this.liquidSurface.update();

        // 4. Render normal-mapped Matcap liquid to screen with alpha coverage
        this.renderMaterial.uniforms.heightMap.value = this.liquidSurface.heightTexture;
        this.renderMaterial.uniforms.alphaMap.value = this.liquidSurface.alphaTexture;

        this.renderer.setRenderTarget(null);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
    }
}

// Bootstrap on DOM ready
window.addEventListener('DOMContentLoaded', () => {
    window.app = new SpreadingLiquidApp();
});
