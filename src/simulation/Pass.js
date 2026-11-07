import * as THREE from 'three';

export class Pass {
    constructor(renderer, material, geometry = new THREE.PlaneGeometry(2, 2)) {
        this.renderer = renderer;
        this.material = material;
        this.geometry = geometry;
        this.scene = new THREE.Scene();
        this.camera = new THREE.Camera();
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
    }

    render(target) {
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.material.dispose();
        this.geometry.dispose();
        this.scene.clear();
    }
}

export function createRenderTarget(width, height, type = THREE.FloatType) {
    return new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: type,
        depthBuffer: false,
        stencilBuffer: false
    });
}
