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
 * Implements mofu-dev's height-map liquid spreading, historical alpha map,
 * and normal-mapped Matcap rendering.
 * https://mofu-dev.com/blog/fluid-foundation/
 */
export class LiquidSurface {
    constructor(renderer, fluidSim, options = {}) {
        this.renderer = renderer;
        this.fluidSim = fluidSim;

        this.options = Object.assign({
            resolution: 512,
            dropRadius: 0.165,             // Initial droplet radius matching video (~1/3 container)
            velocityThresholdMin: 0.001,   // Velocity threshold for thickness removal
            velocityThresholdMax: 0.045,
            trailDecay: 1.0,               // Persistent wetting trail (persists until Reset)
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
        this.resetToInitialDrops();
    }

    initGPGPU() {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.quad = new THREE.Mesh(this.geometry, null);
        this.scene.add(this.quad);
    }

    initRenderTargets() {
        const opts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };

        this.heightMap = new PingPongRenderTarget(this.width, this.height, opts);
        this.alphaMap = new PingPongRenderTarget(this.width, this.height, opts);
    }

    initMaterials() {
        // 1. Initial Droplet Dome Material
        this.initDropMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: initDropFrag,
            uniforms: {
                uResolution: { value: this.resolution },
                uCenter: { value: new THREE.Vector2(0.5, 0.5) },
                uRadius: { value: this.options.dropRadius }
            },
            depthTest: false,
            depthWrite: false
        });

        // 2. mofu-dev Height Advection Material (height.frag)
        this.heightMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: heightFrag,
            uniforms: {
                uVelocity: { value: null },
                uHeight: { value: null },
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

        // 3. mofu-dev Alpha Map Material (alpha.frag)
        this.alphaMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: alphaFrag,
            uniforms: {
                uHeight: { value: null },
                uAlphaMap: { value: null },
                uDecay: { value: this.options.trailDecay }
            },
            depthTest: false,
            depthWrite: false
        });

        // 4. mofu-dev Final Render Material (render.frag)
        this.renderMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: renderFrag,
            uniforms: {
                uHeight: { value: null },
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

    resetToInitialDrops() {
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

        // Render the initial centered droplet into heightMap.read
        this.initDropMaterial.uniforms.uResolution.value.copy(this.resolution);
        this.initDropMaterial.uniforms.uCenter.value.set(0.5, 0.5);
        this.initDropMaterial.uniforms.uRadius.value = this.options.dropRadius;
        this.renderPass(this.initDropMaterial, this.heightMap.read);

        // Pre-fill alpha map from the initial height droplet
        this.alphaMaterial.uniforms.uHeight.value = this.heightMap.read.texture;
        this.alphaMaterial.uniforms.uAlphaMap.value = this.alphaMap.read.texture;
        this.alphaMaterial.uniforms.uDecay.value = 1.0;
        this.renderPass(this.alphaMaterial, this.alphaMap.write);
        this.alphaMap.swap();
    }

    update(dt = this.options.dt) {
        // 1. Height Advection Pass
        this.heightMaterial.uniforms.uVelocity.value = this.fluidSim.velocity.read.texture;
        this.heightMaterial.uniforms.uHeight.value = this.heightMap.read.texture;
        this.heightMaterial.uniforms.uDt.value = dt;
        this.renderPass(this.heightMaterial, this.heightMap.write);
        this.heightMap.swap();

        // 2. Alpha Map Pass
        this.alphaMaterial.uniforms.uHeight.value = this.heightMap.read.texture;
        this.alphaMaterial.uniforms.uAlphaMap.value = this.alphaMap.read.texture;
        this.alphaMaterial.uniforms.uDecay.value = this.options.trailDecay;
        this.renderPass(this.alphaMaterial, this.alphaMap.write);
        this.alphaMap.swap();

        // 3. Prepare Render Material
        this.renderMaterial.uniforms.uHeight.value = this.heightMap.read.texture;
        this.renderMaterial.uniforms.uAlphaMap.value = this.alphaMap.read.texture;
    }

    renderToScreen() {
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
