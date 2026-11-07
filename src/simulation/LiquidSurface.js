import * as THREE from 'three';
import { PingPongRenderTarget } from './PingPongRenderTarget.js';
import { createLiquidMatcapTexture } from '../materials/matcap.js';
import {
    baseVert,
    initDropFrag,
    heightFrag,
    alphaFrag,
    renderFrag
} from '../shaders/shaders.js';

/**
 * LiquidSurface
 * Implements mofu-dev's height-map liquid spreading driven by Navier-Stokes velocity,
 * historical alpha map tracking, and normal-mapped Matcap rendering.
 * https://mofu-dev.com/blog/fluid-foundation/
 */
export class LiquidSurface {
    constructor(renderer, fluidSim, options = {}) {
        this.renderer = renderer;
        this.fluidSim = fluidSim;

        this.options = Object.assign({
            resolution: 512,
            velocityThresholdMin: 0.003,   // Velocity threshold floor: keeps static regions locked
            velocityThresholdMax: 0.055,   // Saturation ceiling for 30% advection step
            dt: 0.014
        }, options);

        this.width = this.options.resolution;
        this.height = this.options.resolution;

        this.fboSize = new THREE.Vector2(this.width, this.height);
        this.resolution = new THREE.Vector2(this.width, this.height);

        this.matcapTexture = createLiquidMatcapTexture();

        this.initGPGPU();
        this.initRenderTargets();
        this.initMaterials();
        this.resetToInitialDrop();
    }

    initGPGPU() {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.quad = new THREE.Mesh(this.geometry, null);
        this.scene.add(this.quad);
    }

    initRenderTargets() {
        // As highlighted in mofu-dev "Bonus: Texture Precision":
        // 32-bit FloatType is essential for smooth analytical cross normals without quantization banding.
        const opts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType, // 32-bit float
            depthBuffer: false,
            stencilBuffer: false
        };

        this.heightMap = new PingPongRenderTarget(this.width, this.height, opts);
        this.alphaMap = new PingPongRenderTarget(this.width, this.height, opts);
    }

    initMaterials() {
        // 1. Initial Droplet Dome Material (initialHeight.frag)
        this.initDropMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: initDropFrag,
            uniforms: {
                uResolution: { value: this.resolution }
            },
            depthTest: false,
            depthWrite: false
        });

        // 2. Height Advection & Mass Transfer Material (height.frag)
        this.heightMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: heightFrag,
            uniforms: {
                uVelocity: { value: null },
                uHeightMap: { value: null },
                uFboSize: { value: this.fboSize },
                uDt: { value: this.options.dt },
                uVelocityThreshold: {
                    value: new THREE.Vector2(
                        this.options.velocityThresholdMin,
                        this.options.velocityThresholdMax
                    )
                }
            },
            depthTest: false,
            depthWrite: false
        });

        // 3. Historical Alpha Map Material (alpha.frag)
        this.alphaMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: alphaFrag,
            uniforms: {
                uHeightMap: { value: null },
                uAlphaMap: { value: null }
            },
            depthTest: false,
            depthWrite: false
        });

        // 4. Final Render & Matcap Shading Material (render.frag)
        this.renderMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: renderFrag,
            uniforms: {
                uHeightMap: { value: null },
                uAlphaMap: { value: null },
                uMatcap: { value: this.matcapTexture },
                uResolution: { value: this.resolution }
            },
            depthTest: false,
            depthWrite: false
        });
    }

    renderPass(material, target) {
        this.quad.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
    }

    resetToInitialDrop() {
        // Clear both render targets to transparent black
        const clearTarget = (t) => {
            this.renderer.setRenderTarget(t);
            this.renderer.clearColor();
        };

        clearTarget(this.heightMap.read);
        clearTarget(this.heightMap.write);
        clearTarget(this.alphaMap.read);
        clearTarget(this.alphaMap.write);
        this.renderer.setRenderTarget(null);

        // Render the initial 3D droplet into heightMap.read
        this.initDropMaterial.uniforms.uResolution.value.copy(this.resolution);
        this.renderPass(this.initDropMaterial, this.heightMap.read);

        // Pre-fill alpha map with initial height
        this.alphaMaterial.uniforms.uHeightMap.value = this.heightMap.read.texture;
        this.alphaMaterial.uniforms.uAlphaMap.value = this.alphaMap.read.texture;
        this.renderPass(this.alphaMaterial, this.alphaMap.write);
        this.alphaMap.swap();
    }

    update(dt = this.options.dt) {
        // 1. Height Advection Pass (height.frag)
        this.heightMaterial.uniforms.uVelocity.value = this.fluidSim.velocity.read.texture;
        this.heightMaterial.uniforms.uHeightMap.value = this.heightMap.read.texture;
        this.heightMaterial.uniforms.uDt.value = dt;
        this.renderPass(this.heightMaterial, this.heightMap.write);
        this.heightMap.swap();

        // 2. Alpha Map Pass (alpha.frag)
        this.alphaMaterial.uniforms.uHeightMap.value = this.heightMap.read.texture;
        this.alphaMaterial.uniforms.uAlphaMap.value = this.alphaMap.read.texture;
        this.renderPass(this.alphaMaterial, this.alphaMap.write);
        this.alphaMap.swap();
    }

    renderToScreen() {
        this.renderMaterial.uniforms.uHeightMap.value = this.heightMap.read.texture;
        this.renderMaterial.uniforms.uAlphaMap.value = this.alphaMap.read.texture;
        this.quad.material = this.renderMaterial;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);
    }

    setSize(width, height) {
        this.resolution.set(width, height);
        this.initDropMaterial.uniforms.uResolution.value.set(width, height);
        this.renderMaterial.uniforms.uResolution.value.set(width, height);
    }

    dispose() {
        this.heightMap.dispose();
        this.alphaMap.dispose();
        this.matcapTexture.dispose();
        this.geometry.dispose();
    }
}
