import * as THREE from 'three';

/**
 * Creates the exact Matcap texture matching mofu-dev's blue liquid demo:
 * Smooth sky-blue spherical body with crisp top-right specular reflection.
 */
export function createLiquidMatcapTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2;

    // 1. Draw base spherical body
    // Light is from upper-right: (cx + r * 0.38, cy - r * 0.38)
    const lightX = cx + r * 0.38;
    const lightY = cy - r * 0.38; // in 2D canvas, Y=0 is top

    // Primary diffuse gradient
    const baseGrad = ctx.createRadialGradient(lightX, lightY, r * 0.04, cx, cy, r);
    baseGrad.addColorStop(0.0, '#cce7ff');  // Highlight center halo
    baseGrad.addColorStop(0.25, '#7ebbff'); // Vibrant fresh sky blue
    baseGrad.addColorStop(0.60, '#509cf5'); // Mid body blue
    baseGrad.addColorStop(0.85, '#357ddc'); // Deep volume blue
    baseGrad.addColorStop(1.0, '#2669ce');  // Subtle rim shadow

    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 2. Secondary soft fill light from bottom-left (subsurface bounce)
    const fillX = cx - r * 0.45;
    const fillY = cy + r * 0.45;
    const fillGrad = ctx.createRadialGradient(fillX, fillY, r * 0.05, fillX, fillY, r * 0.7);
    fillGrad.addColorStop(0.0, 'rgba(140, 205, 255, 0.45)');
    fillGrad.addColorStop(1.0, 'rgba(38, 105, 206, 0.0)');

    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 3. Crisp white specular spot at upper-right (exact match to video)
    const specRadius = r * 0.18;
    const specGrad = ctx.createRadialGradient(lightX, lightY, 1, lightX, lightY, specRadius);
    specGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    specGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.95)');
    specGrad.addColorStop(0.65, 'rgba(235, 248, 255, 0.4)');
    specGrad.addColorStop(1.0, 'rgba(190, 230, 255, 0.0)');

    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(lightX, lightY, specRadius, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}
