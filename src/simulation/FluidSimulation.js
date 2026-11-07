import * as THREE from 'three';
import { PingPongRenderTarget } from './PingPongRenderTarget.js';
import {
    baseVert,
    splatFrag,
    advectionFrag,
    divergenceFrag,
    pressureFrag,
    gradientSubtractFrag
} from '../shaders/shaders.js';

/**
 * FluidSimulation
 * Eulerian Navier-Stokes solver rebuilt directly from mnmxmx/fluid-three.
 * Uses 2nd-order BFECC advection, 32 Jacobi Poisson pressure iterations,
 * and calibrated dissipation so velocity decays naturally like a viscous medium.
 */
export class FluidSimulation {
    constructor(renderer, options = {}) {
        this.renderer = renderer;

        this.options = Object.assign({
            simResolution: 128,
            iterations: 32,          // 32 Jacobi Poisson iterations from fluid-three
            mouseForce: 18.0,        // Calibrated mouse force
            splatRadius: 0.080,      // Brush splat radius in UV space
            dissipation: 0.22,       // Viscous damping so velocity settles naturally
            BFECC: true,             // Back and Forth Error Compensation from fluid-three
            dt: 0.014
        }, options);

        this.simWidth = this.options.simResolution;
        this.simHeight = this.options.simResolution;
        this.aspectRatio = 1.0;

        this.fboSize = new THREE.Vector2(this.simWidth, this.simHeight);
        this.cellScale = new THREE.Vector2(1.0 / this.simWidth, 1.0 / this.simHeight);

        this.initGPGPU();
        this.initRenderTargets();
        this.initMaterials();
    }

    initGPGPU() {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.quad = new THREE.Mesh(this.geometry, null);
        this.scene.add(this.quad);
    }

    initRenderTargets() {
        const type = THREE.FloatType; // 32-bit float for velocity precision
        const opts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: type,
            depthBuffer: false,
            stencilBuffer: false
        };

        this.velocity = new PingPongRenderTarget(this.simWidth, this.simHeight, opts);
        this.pressure = new PingPongRenderTarget(this.simWidth, this.simHeight, opts);
        this.divergence = new THREE.WebGLRenderTarget(this.simWidth, this.simHeight, opts);
    }

    initMaterials() {
        // Splat Material
        this.splatMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: splatFrag,
            uniforms: {
                uTarget: { value: null },
                uPoint: { value: new THREE.Vector2() },
                uForce: { value: new THREE.Vector2() },
                uRadius: { value: this.options.splatRadius },
                uAspectRatio: { value: this.aspectRatio }
            },
            depthTest: false,
            depthWrite: false
        });

        // Advection Material with BFECC (from fluid-three)
        this.advectionMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: advectionFrag,
            uniforms: {
                uVelocity: { value: null },
                uSource: { value: null },
                uFboSize: { value: this.fboSize },
                uDt: { value: this.options.dt },
                uDissipation: { value: this.options.dissipation },
                uIsBFECC: { value: this.options.BFECC }
            },
            depthTest: false,
            depthWrite: false
        });

        // Divergence Material (from fluid-three)
        this.divergenceMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: divergenceFrag,
            uniforms: {
                uVelocity: { value: null },
                uDt: { value: this.options.dt },
                uPx: { value: this.cellScale }
            },
            depthTest: false,
            depthWrite: false
        });

        // Pressure Solver Material (Poisson Jacobi from fluid-three)
        this.pressureMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: pressureFrag,
            uniforms: {
                uPressure: { value: null },
                uDivergence: { value: null },
                uPx: { value: this.cellScale }
            },
            depthTest: false,
            depthWrite: false
        });

        // Gradient Subtract Material (from fluid-three)
        this.gradientSubtractMaterial = new THREE.RawShaderMaterial({
            vertexShader: baseVert,
            fragmentShader: gradientSubtractFrag,
            uniforms: {
                uPressure: { value: null },
                uVelocity: { value: null },
                uPx: { value: this.cellScale },
                uDt: { value: this.options.dt }
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

    addSplat(x, y, dx, dy, radius = this.options.splatRadius) {
        this.splatMaterial.uniforms.uTarget.value = this.velocity.read.texture;
        this.splatMaterial.uniforms.uPoint.value.set(x, y);
        this.splatMaterial.uniforms.uForce.value.set(
            dx * this.options.mouseForce,
            dy * this.options.mouseForce
        );
        this.splatMaterial.uniforms.uRadius.value = radius;
        this.splatMaterial.uniforms.uAspectRatio.value = this.aspectRatio;

        this.renderPass(this.splatMaterial, this.velocity.write);
        this.velocity.swap();
    }

    step(dt = this.options.dt) {
        // 1. Divergence of Velocity Field
        this.divergenceMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
        this.divergenceMaterial.uniforms.uDt.value = dt;
        this.renderPass(this.divergenceMaterial, this.divergence);

        // 2. Jacobi Iterative Solver for Pressure Poisson Equation (32 iters)
        this.pressureMaterial.uniforms.uDivergence.value = this.divergence.texture;
        for (let i = 0; i < this.options.iterations; i++) {
            this.pressureMaterial.uniforms.uPressure.value = this.pressure.read.texture;
            this.renderPass(this.pressureMaterial, this.pressure.write);
            this.pressure.swap();
        }

        // 3. Gradient Subtraction to enforce incompressibility
        this.gradientSubtractMaterial.uniforms.uPressure.value = this.pressure.read.texture;
        this.gradientSubtractMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
        this.gradientSubtractMaterial.uniforms.uDt.value = dt;
        this.renderPass(this.gradientSubtractMaterial, this.velocity.write);
        this.velocity.swap();

        // 4. Advect Velocity field itself with BFECC (from fluid-three)
        this.advectionMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
        this.advectionMaterial.uniforms.uSource.value = this.velocity.read.texture;
        this.advectionMaterial.uniforms.uDt.value = dt;
        this.advectionMaterial.uniforms.uDissipation.value = this.options.dissipation;
        this.renderPass(this.advectionMaterial, this.velocity.write);
        this.velocity.swap();
    }

    clear() {
        const clearTarget = (t) => {
            this.renderer.setRenderTarget(t);
            this.renderer.clearColor();
        };

        clearTarget(this.velocity.read);
        clearTarget(this.velocity.write);
        clearTarget(this.pressure.read);
        clearTarget(this.pressure.write);
        clearTarget(this.divergence);
        this.renderer.setRenderTarget(null);
    }

    setSize(width, height) {
        this.aspectRatio = width / height;
        this.splatMaterial.uniforms.uAspectRatio.value = this.aspectRatio;
    }

    dispose() {
        this.velocity.dispose();
        this.pressure.dispose();
        this.divergence.dispose();
        this.geometry.dispose();
    }
}
