import * as THREE from 'three';
import matcapUrl from '../assets/matcap.jpg';

/**
 * Loads the authentic Matcap texture from mofu-dev:
 * Vibrant liquid foundation sky-blue sheen with specular highlight.
 */
export function loadMatcapTexture() {
    const loader = new THREE.TextureLoader();
    const texture = loader.load(matcapUrl);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}
