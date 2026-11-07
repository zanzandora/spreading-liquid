import * as THREE from 'three';
import { Pass, createRenderTarget } from './Pass.js';
import {
    baseVert,
    initDropFrag,
    heightFrag,
    alphaFrag
} from '../shaders/shaders.js';

/**
 * LiquidSurface
 * Authentic height-map & alpha-tracking liquid surface from mofu-dev:
 * - Ping-pong heightMap updated with velocity backtrace & velocityThreshold (0.05, 0.25)
 * - Alpha map initialized cleanly at 0 so no ghost silhouette remains
 * - Historical maximum tracking so faded liquid leaves realistic wetting traces
 */
export class LiquidSurface {
    constructor(renderer, width = 520, height = 520, simulation, variant = 1, trackAlpha = true) {
        this.renderer = renderer;
        this.simulation = simulation;
        this.variant = variant;
        this.trackAlpha = trackAlpha;
        this.resolution = new THREE.Vector2(width, height);
        const floatType = simulation.floatType;

        this.heightPairs = [
            [createRenderTarget(width, height, floatType), createRenderTarget(width, height, floatType)]
        ];
        this.alphaTargets = trackAlpha ? [
            createRenderTarget(width, height, floatType),
            createRenderTarget(width, height, floatType)
        ] : [];

        this.heightIndex = 0;
        this.alphaIndex = 0;
        this.useFloat = true;

        this.initialPass = new Pass(
            renderer,
            new THREE.RawShaderMaterial({
                vertexShader: baseVert,
                fragmentShader: initDropFrag,
                uniforms: {
                    resolution: { value: this.resolution }
                },
                depthTest: false,
                depthWrite: false
            })
        );

        this.heightPass = new Pass(
            renderer,
            new THREE.RawShaderMaterial({
                vertexShader: baseVert,
                fragmentShader: heightFrag,
                uniforms: {
                    heightMap: { value: null },
                    velocity: { value: simulation.targets.velocity1.texture },
                    dt: { value: simulation.dt },
                    fboSize: { value: simulation.fboSize },
                    velocityThreshold: { value: new THREE.Vector2(0.05, 0.25) }
                },
                depthTest: false,
                depthWrite: false
            })
        );

        this.alphaPass = trackAlpha ? new Pass(
            renderer,
            new THREE.RawShaderMaterial({
                vertexShader: baseVert,
                fragmentShader: alphaFrag,
                uniforms: {
                    heightMap: { value: null },
                    alphaMap: { value: this.alphaTargets[0].texture }
                },
                depthTest: false,
                depthWrite: false
            })
        ) : null;

        this.reset();
    }

    get heightTexture() {
        return this.heightPairs[0][this.heightIndex].texture;
    }

    get alphaTexture() {
        return this.alphaTargets[this.alphaIndex]?.texture ?? null;
    }

    reset() {
        const curTarget = this.renderer.getRenderTarget();

        // 1. Render initial drop dome to both height ping-pong buffers
        for (const pair of this.heightPairs) {
            this.initialPass.render(pair[0]);
            this.initialPass.render(pair[1]);
        }

        // 2. Clear alpha targets to transparent black (0, 0, 0, 0)
        // No ghost circle is pre-filled, so unvisited canvas stays 100% clean white!
        const curClearColor = this.renderer.getClearColor(new THREE.Color());
        const curClearAlpha = this.renderer.getClearAlpha();
        this.renderer.setClearColor(0, 0);
        for (const t of this.alphaTargets) {
            this.renderer.setRenderTarget(t);
            this.renderer.clear();
        }
        this.renderer.setClearColor(curClearColor, curClearAlpha);
        this.renderer.setRenderTarget(curTarget);

        this.heightIndex = 0;
        this.alphaIndex = 0;
    }

    resize(w, h) {
        this.resolution.set(w, h);
        for (const t of [...this.heightPairs.flat(), ...this.alphaTargets]) {
            t.setSize(w, h);
        }
        this.reset();
    }

    update() {
        const curTarget = this.renderer.getRenderTarget();
        const nextHeightIndex = 1 - this.heightIndex;

        // 1. Height transport pass
        for (const pair of this.heightPairs) {
            this.heightPass.material.uniforms.heightMap.value = pair[this.heightIndex].texture;
            this.heightPass.render(pair[nextHeightIndex]);
        }
        this.heightIndex = nextHeightIndex;

        // 2. Alpha tracking pass
        if (this.alphaPass) {
            const nextAlphaIndex = 1 - this.alphaIndex;
            this.alphaPass.material.uniforms.heightMap.value = this.heightTexture;
            this.alphaPass.material.uniforms.alphaMap.value = this.alphaTargets[this.alphaIndex].texture;
            this.alphaPass.render(this.alphaTargets[nextAlphaIndex]);
            this.alphaIndex = nextAlphaIndex;
        }

        this.renderer.setRenderTarget(curTarget);
    }

    dispose() {
        this.initialPass.dispose();
        this.heightPass.dispose();
        this.alphaPass?.dispose();
        for (const t of [...this.heightPairs.flat(), ...this.alphaTargets]) {
            t.dispose();
        }
    }
}
