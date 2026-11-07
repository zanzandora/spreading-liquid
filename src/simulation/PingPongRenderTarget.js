import * as THREE from 'three';

/**
 * PingPongRenderTarget
 * Double-buffered WebGLRenderTargets for GPGPU ping-pong simulation passes.
 * Uses 32-bit FloatType by default for smooth normal derivatives without banding.
 */
export class PingPongRenderTarget {
    constructor(width, height, options = {}) {
        this.width = width;
        this.height = height;

        const defaultOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType, // 32-bit float as emphasized in mofu-dev
            depthBuffer: false,
            stencilBuffer: false
        };

        const targetOptions = Object.assign({}, defaultOptions, options);

        this.read = new THREE.WebGLRenderTarget(width, height, targetOptions);
        this.write = new THREE.WebGLRenderTarget(width, height, targetOptions);
    }

    swap() {
        const temp = this.read;
        this.read = this.write;
        this.write = temp;
    }

    setSize(width, height) {
        this.width = width;
        this.height = height;
        this.read.setSize(width, height);
        this.write.setSize(width, height);
    }

    dispose() {
        this.read.dispose();
        this.write.dispose();
    }
}
