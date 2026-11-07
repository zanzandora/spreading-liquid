precision highp float;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vB;
varying vec2 vT;

uniform sampler2D uVelocity;
uniform sampler2D uHeight;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uViscosity;
uniform float uDissipation;
uniform float uTrailDecay;
uniform float uAdvectionScale;

// Interactive UI Meniscus & Adhesion Uniforms
// Up to 4 active bounding boxes: [xMin, yMin, xMax, yMax]
uniform vec4 uCardBounds[4];
uniform int uCardCount;
uniform float uStickyStrength;
uniform float uMeniscusRadius;

// Signed distance to axis-aligned rectangle in UV space
float sdBox(vec2 p, vec2 bMin, vec2 bMax) {
    vec2 center = 0.5 * (bMin + bMax);
    vec2 halfSize = 0.5 * (bMax - bMin);
    vec2 d = abs(p - center) - halfSize;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
    // 1. Semi-Lagrangian advection of liquid film thickness
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    vec2 coord = vUv - uDt * velocity * uTexelSize * uAdvectionScale;
    
    vec4 oldSample = texture2D(uHeight, coord);
    float h = oldSample.r;
    float trail = oldSample.g;

    // 2. Viscous spreading / surface tension (Laplacian diffusion)
    float hL = texture2D(uHeight, vL).r;
    float hR = texture2D(uHeight, vR).r;
    float hB = texture2D(uHeight, vB).r;
    float hT = texture2D(uHeight, vT).r;
    float laplacian = (hL + hR + hB + hT - 4.0 * h);
    h += laplacian * uViscosity * 0.15;

    // 3. UI Element Clinging / Meniscus effect
    float adhesionFactor = 0.0;
    for (int i = 0; i < 4; i++) {
        if (i >= uCardCount) break;
        vec4 box = uCardBounds[i];
        if (box.z > box.x && box.w > box.y) {
            float dist = abs(sdBox(vUv, box.xy, box.zw));
            if (dist < uMeniscusRadius) {
                float edgeProximity = 1.0 - smoothstep(0.0, uMeniscusRadius, dist);
                // Meniscus capillary pull: liquid piles up along the edge
                h += edgeProximity * uStickyStrength * 0.02 * (0.2 + h * 0.8);
                adhesionFactor = max(adhesionFactor, edgeProximity);
            }
        }
    }

    // 4. Natural liquid height dissipation & damping
    float decay = 1.0 + uDissipation * uDt;
    h = max(0.0, h / decay);

    // 5. Update historical wetting trail (viscous trace)
    trail = max(trail * uTrailDecay, h);

    gl_FragColor = vec4(h, trail, adhesionFactor, 1.0);
}
