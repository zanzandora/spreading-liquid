import * as THREE from 'three';
import { Pass, createRenderTarget } from './Pass.js';
import {
    boundaryVert,
    forceVert,
    forceFrag,
    advectionFrag,
    viscousFrag,
    divergenceFrag,
    poissonFrag,
    gradientSubtractFrag
} from '../shaders/shaders.js';

/**
 * FluidSimulation
 * Authentic Eulerian Navier-Stokes solver from mofu-dev:
 * - 0.5x simulation resolution for natural fluid flow
 * - 16 viscous diffusion iterations (viscosity = 16)
 * - 16 Jacobi Poisson pressure solver iterations
 * - Localized force brush splat quad (75px scale, 26x velocity multiplier)
 * - Freezes velocity immediately when mouse is stationary (diff = 0)
 */
export class FluidSimulation {
    constructor(renderer, width = 520, height = 520, variant = 1) {
        this.renderer = renderer;
        this.variant = variant;
        this.floatType = THREE.FloatType;
        this.resolution = 0.5;
        this.dt = 1 / 50;

        this.fboSize = new THREE.Vector2();
        this.cellScale = new THREE.Vector2();
        this.boundarySpace = new THREE.Vector2();

        this.resizeVectors(width, height);

        this.targets = Object.fromEntries(
            ['velocity0', 'velocity1', 'viscous0', 'viscous1', 'divergence', 'pressure0', 'pressure1']
                .map(name => [name, createRenderTarget(this.fboSize.x, this.fboSize.y, this.floatType)])
        );

        this.createPasses();
        this.clear();
    }

    resizeVectors(w, h) {
        const n = Math.max(2, Math.round(w * this.resolution));
        const r = Math.max(2, Math.round(h * this.resolution));
        this.fboSize.set(n, r);
        this.cellScale.set(1 / n, 1 / r);
    }

    createPasses() {
        // 1. Advection Pass (shader_C)
        this.advection = new Pass(
            this.renderer,
            new THREE.RawShaderMaterial({
                vertexShader: boundaryVert,
                fragmentShader: advectionFrag,
                uniforms: {
                    boundarySpace: { value: this.cellScale },
                    velocity: { value: this.targets.velocity1.texture },
                    dt: { value: this.dt },
                    fboSize: { value: this.fboSize }
                },
                depthTest: false,
                depthWrite: false
            })
        );

        // 2. Viscous Diffusion Pass (shader_w)
        this.viscous = new Pass(
            this.renderer,
            new THREE.RawShaderMaterial({
                vertexShader: boundaryVert,
                fragmentShader: viscousFrag,
                uniforms: {
                    boundarySpace: { value: this.boundarySpace },
                    velocity: { value: this.targets.velocity0.texture },
                    velocityNew: { value: this.targets.viscous0.texture },
                    viscosity: { value: this.variant === 1 ? 16 : 6 },
                    px: { value: this.cellScale }
                },
                depthTest: false,
                depthWrite: false
            })
        );

        // 3. Divergence Pass (shader_T)
        this.divergence = new Pass(
            this.renderer,
            new THREE.RawShaderMaterial({
                vertexShader: boundaryVert,
                fragmentShader: divergenceFrag,
                uniforms: {
                    boundarySpace: { value: this.boundarySpace },
                    velocity: { value: this.targets.viscous0.texture },
                    px: { value: this.cellScale }
                },
                depthTest: false,
                depthWrite: false
            })
        );

        // 4. Pressure Poisson Solver Pass (shader_E)
        this.poisson = new Pass(
            this.renderer,
            new THREE.RawShaderMaterial({
                vertexShader: boundaryVert,
                fragmentShader: poissonFrag,
                uniforms: {
                    boundarySpace: { value: this.boundarySpace },
                    pressure: { value: this.targets.pressure0.texture },
                    divergence: { value: this.targets.divergence.texture },
                    px: { value: this.cellScale }
                },
                depthTest: false,
                depthWrite: false
            })
        );

        // 5. Gradient Subtraction Pass (shader_ee)
        this.pressure = new Pass(
            this.renderer,
            new THREE.RawShaderMaterial({
                vertexShader: boundaryVert,
                fragmentShader: gradientSubtractFrag,
                uniforms: {
                    boundarySpace: { value: this.boundarySpace },
                    pressure: { value: this.targets.pressure0.texture },
                    velocity: { value: this.targets.viscous0.texture },
                    px: { value: this.cellScale }
                },
                depthTest: false,
                depthWrite: false
            })
        );

        // 6. Force Injection Pass (shader_x, shader_D)
        this.force = new Pass(
            this.renderer,
            new THREE.RawShaderMaterial({
                vertexShader: forceVert,
                fragmentShader: forceFrag,
                uniforms: {
                    velocity: { value: this.targets.velocity0.texture },
                    force: { value: new THREE.Vector2() },
                    center: { value: new THREE.Vector2() },
                    scale: { value: new THREE.Vector2(this.variant === 2 ? 78 : 75, this.variant === 2 ? 78 : 75) },
                    px: { value: this.cellScale },
                    fboSize: { value: this.fboSize }
                },
                transparent: true,
                depthTest: false,
                depthWrite: false
            }),
            new THREE.PlaneGeometry(1, 1)
        );
    }

    clear() {
        const curTarget = this.renderer.getRenderTarget();
        const curClearColor = this.renderer.getClearColor(new THREE.Color());
        const curClearAlpha = this.renderer.getClearAlpha();

        this.renderer.setClearColor(0, 0);
        for (const t of Object.values(this.targets)) {
            this.renderer.setRenderTarget(t);
            this.renderer.clear();
        }
        this.renderer.setClearColor(curClearColor, curClearAlpha);
        this.renderer.setRenderTarget(curTarget);
    }

    resize(w, h) {
        this.resizeVectors(w, h);
        for (const t of Object.values(this.targets)) {
            t.setSize(this.fboSize.x, this.fboSize.y);
        }
        this.clear();
    }

    update(interaction) {
        if (!interaction || interaction.diff.lengthSq() === 0) {
            this.clear();
            return;
        }

        const curTarget = this.renderer.getRenderTarget();
        const autoClear = this.renderer.autoClear;
        this.renderer.autoClear = false;

        try {
            // 1. Advection
            this.advection.render(this.targets.velocity0);

            // 2. Viscous Diffusion (16 iters)
            let viscousResult = this.targets.viscous0;
            for (let i = 0; i < 16; i++) {
                const src = i % 2 === 0 ? this.targets.viscous0 : this.targets.viscous1;
                const dst = i % 2 === 0 ? this.targets.viscous1 : this.targets.viscous0;
                this.viscous.material.uniforms.velocityNew.value = src.texture;
                this.viscous.render(dst);
                viscousResult = dst;
            }

            // 3. Divergence
            this.divergence.material.uniforms.velocity.value = viscousResult.texture;
            this.divergence.render(this.targets.divergence);

            // 4. Poisson Pressure Solver (16 iters)
            let pressureResult = this.targets.pressure0;
            for (let i = 0; i < 16; i++) {
                const src = i % 2 === 0 ? this.targets.pressure0 : this.targets.pressure1;
                const dst = i % 2 === 0 ? this.targets.pressure1 : this.targets.pressure0;
                this.poisson.material.uniforms.pressure.value = src.texture;
                this.poisson.render(dst);
                pressureResult = dst;
            }

            // 5. Pressure Gradient Subtraction
            this.pressure.material.uniforms.velocity.value = viscousResult.texture;
            this.pressure.material.uniforms.pressure.value = pressureResult.texture;
            this.pressure.render(this.targets.velocity1);

            // 6. Force Injection (Mouse Splat)
            this.force.material.uniforms.force.value.copy(interaction.diff).multiplyScalar(26);
            this.force.material.uniforms.center.value.copy(interaction.coords);
            this.force.render(this.targets.velocity1);
        } finally {
            this.renderer.setRenderTarget(curTarget);
            this.renderer.autoClear = autoClear;
        }
    }

    dispose() {
        for (const p of [this.advection, this.viscous, this.divergence, this.poisson, this.pressure, this.force]) {
            p.dispose();
        }
        for (const t of Object.values(this.targets)) {
            t.dispose();
        }
    }
}
