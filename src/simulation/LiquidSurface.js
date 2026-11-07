import * as THREE from 'three';
import { PingPongRenderTarget } from './PingPongRenderTarget.js';
import { createLiquidMatcapTexture } from '../materials/matcap.js';
import {
    baseVert,
    initDropFrag,
    heightSmearFrag,
    liquidRenderFrag
} from '../shaders/shaders.js';

/**
 * LiquidSurface
 * Manages 2.5D Viscoplastic Paste Smearing (Local Heightfield Deformation & Plowing).
 * Replaces global 2D Navier-Stokes solver with direct local shearing, trough carving,
 * and ridge pile-up.
 */
export class LiquidSurface {
    constructor(renderer, options = {}) {
        this.renderer = renderer;

        this.options = Object.assign({
            resolution: 512,
            dropRadius: 0.165,      // Radius of initial hemisphere (~1/3 container)
            brushRadius: 0.082,     // Width of spreading finger / brush
            normalScale: 0.45       // Calibrated slope amplification for true hemisphere specular
        }, options);

        this.width = this.options.resolution;
        this.height = this.options.resolution;

        this.resolution = new THREE.Vector2(this.width, this.height);
        this.texelSize = new THREE.Vector2(1.0 / this.width, 1.0 / this.height);

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
        const opts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };

        this.heightMap = new PingPongRenderTarget(this.width, this.height, opts);
    }

    initMaterials() {
        // 1. Initial True Hemispherical Dome Material
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

        // 2. 2.5D Local Smear & Plowing Material (heightAdvection.frag)
        this.smearMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: heightSmearFrag,
            uniforms: {
                uHeightMap: { value: null },
                uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uBrushRadius: { value: this.options.brushRadius },
                uIsDown: { value: 0.0 }
            },
            depthTest: false,
            depthWrite: false
        });

        // 3. Normal Reconstruction & Matcap Shading (liquidRender.frag)
        this.renderMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: liquidRenderFrag,
            uniforms: {
                uHeightMap: { value: null },
                uMatcap: { value: this.matcapTexture },
                uTexelSize: { value: this.texelSize },
                uNormalScale: { value: this.options.normalScale }
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
        // Clear heightMap ping-pong buffers
        const clearTarget = (t) => {
            this.renderer.setRenderTarget(t);
            this.renderer.clearColor();
        };

        clearTarget(this.heightMap.read);
        clearTarget(this.heightMap.write);
        this.renderer.setRenderTarget(null);

        // Render the initial 3D hemispherical dome into heightMap.read
        this.initDropMaterial.uniforms.uResolution.value.copy(this.resolution);
        this.initDropMaterial.uniforms.uCenter.value.set(0.5, 0.5);
        this.initDropMaterial.uniforms.uRadius.value = this.options.dropRadius;
        this.renderPass(this.initDropMaterial, this.heightMap.read);
    }

    stepSmear(currMouse, prevMouse, isDown) {
        if (!isDown) return;

        this.smearMaterial.uniforms.uHeightMap.value = this.heightMap.read.texture;
        this.smearMaterial.uniforms.uMouse.value.set(currMouse.x, currMouse.y);
        this.smearMaterial.uniforms.uPrevMouse.value.set(prevMouse.x, prevMouse.y);
        this.smearMaterial.uniforms.uBrushRadius.value = this.options.brushRadius;
        this.smearMaterial.uniforms.uIsDown.value = isDown ? 1.0 : 0.0;

        this.renderPass(this.smearMaterial, this.heightMap.write);
        this.heightMap.swap();
    }

    renderToScreen() {
        this.renderMaterial.uniforms.uHeightMap.value = this.heightMap.read.texture;
        this.quad.material = this.renderMaterial;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);
    }

    setSize(width, height) {
        this.resolution.set(width, height);
        this.initDropMaterial.uniforms.uResolution.value.set(width, height);
    }

    dispose() {
        this.heightMap.dispose();
        this.matcapTexture.dispose();
        this.geometry.dispose();
    }
}
