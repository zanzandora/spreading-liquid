/**
 * GLSL Shaders for mofu-dev Liquid Spreading simulation
 * Directly following the authentic implementation by Misaki Nakano:
 * - FluidSimulation: Eulerian Navier-Stokes (BFECC Advection, Jacobi Poisson solver)
 * - LiquidSurface: height.frag (velocity thresholding & removed/added mass transfer)
 * - alpha.frag: historical maximum tracking
 * - render.frag: analytical normal via cross product & Matcap sampling
 */

export const baseVert = `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

// External force injection (brush splat)
export const splatFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec2 uForce;
uniform float uRadius;
uniform float uAspectRatio;

void main() {
    vec2 p = vUv - uPoint;
    p.x *= uAspectRatio;
    float dist = length(p);
    float d = max(0.0, 1.0 - dist / uRadius);
    d = d * d;

    vec2 base = texture2D(uTarget, vUv).xy;
    gl_FragColor = vec4(base + uForce * d, 0.0, 1.0);
}
`;

// Advection with BFECC (from mnmxmx/fluid-three advection.frag)
export const advectionFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uFboSize;
uniform float uDt;
uniform float uDissipation;
uniform bool uIsBFECC;

void main() {
    vec2 ratio = max(uFboSize.x, uFboSize.y) / uFboSize;

    if (!uIsBFECC) {
        vec2 vel = texture2D(uVelocity, vUv).xy;
        vec2 uv2 = vUv - vel * uDt * ratio;
        vec2 newVel = texture2D(uSource, uv2).xy;
        gl_FragColor = vec4(newVel * (1.0 - uDissipation * uDt), 0.0, 1.0);
    } else {
        vec2 spot_new = vUv;
        vec2 vel_old = texture2D(uVelocity, vUv).xy;

        // 1. Back trace
        vec2 spot_old = spot_new - vel_old * uDt * ratio;
        vec2 vel_new1 = texture2D(uVelocity, spot_old).xy;

        // 2. Forward trace
        vec2 spot_new2 = spot_old + vel_new1 * uDt * ratio;
        vec2 error = spot_new2 - spot_new;

        // 3. Compensate error
        vec2 spot_new3 = spot_new - error * 0.5;
        vec2 vel_2 = texture2D(uVelocity, spot_new3).xy;

        // 4. Back trace corrected
        vec2 spot_old2 = spot_new3 - vel_2 * uDt * ratio;
        vec2 newVel2 = texture2D(uSource, spot_old2).xy;

        gl_FragColor = vec4(newVel2 * (1.0 - uDissipation * uDt), 0.0, 1.0);
    }
}
`;

// Divergence of velocity field (from fluid-three divergence.frag)
export const divergenceFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uVelocity;
uniform float uDt;
uniform vec2 uPx;

void main() {
    float x0 = texture2D(uVelocity, vUv - vec2(uPx.x, 0.0)).x;
    float x1 = texture2D(uVelocity, vUv + vec2(uPx.x, 0.0)).x;
    float y0 = texture2D(uVelocity, vUv - vec2(0.0, uPx.y)).y;
    float y1 = texture2D(uVelocity, vUv + vec2(0.0, uPx.y)).y;

    float divergence = (x1 - x0 + y1 - y0) * 0.5;
    gl_FragColor = vec4(divergence / uDt, 0.0, 0.0, 1.0);
}
`;

// Pressure Poisson Jacobi solver (from fluid-three poisson.frag)
export const pressureFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uPx;

void main() {
    float p0 = texture2D(uPressure, vUv + vec2(uPx.x * 2.0, 0.0)).r;
    float p1 = texture2D(uPressure, vUv - vec2(uPx.x * 2.0, 0.0)).r;
    float p2 = texture2D(uPressure, vUv + vec2(0.0, uPx.y * 2.0)).r;
    float p3 = texture2D(uPressure, vUv - vec2(0.0, uPx.y * 2.0)).r;
    float div = texture2D(uDivergence, vUv).r;

    float newP = (p0 + p1 + p2 + p3) * 0.25 - div;
    gl_FragColor = vec4(newP, 0.0, 0.0, 1.0);
}
`;

// Gradient Subtract to enforce incompressibility (from fluid-three pressure.frag)
export const gradientSubtractFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uPx;
uniform float uDt;

void main() {
    float step = 1.0;
    float p0 = texture2D(uPressure, vUv + vec2(uPx.x * step, 0.0)).r;
    float p1 = texture2D(uPressure, vUv - vec2(uPx.x * step, 0.0)).r;
    float p2 = texture2D(uPressure, vUv + vec2(0.0, uPx.y * step)).r;
    float p3 = texture2D(uPressure, vUv - vec2(0.0, uPx.y * step)).r;

    vec2 v = texture2D(uVelocity, vUv).xy;
    vec2 gradP = vec2(p0 - p1, p2 - p3) * 0.5;
    v = v - gradP * uDt;

    gl_FragColor = vec4(v, 0.0, 1.0);
}
`;

/**
 * initialHeight.frag - Khởi tạo giọt kem ban đầu
 * Exactly from mofu-dev:
 * float calculateHeight(float value) { return sqrt((1.0 - value * value) / 12.0); }
 * height = smoothstep(0.0, 0.025, height) * height * 0.66;
 */
export const initDropFrag = `
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;

float calculateHeight(float value) {
    return sqrt(max(0.0, (1.0 - value * value) / 12.0));
}

void main() {
    vec2 point = (vUv - 0.5) * 2.0 * uResolution / min(uResolution.x, uResolution.y);
    float distanceFromCenter = length(point);
    float height = calculateHeight(smoothstep(0.0, 0.32, distanceFromCenter));
    height = smoothstep(0.0, 0.025, height) * height * 0.66;
    gl_FragColor = vec4(height, 0.0, 0.0, 1.0);
}
`;

/**
 * height.frag - Dịch chuyển độ dày bằng Velocity Map
 * Exactly from mofu-dev:
 * - smoothstep(velocityThreshold.x, velocityThreshold.y, length(flow))
 * - removed = min(previousHeight, previousStrength * 0.3 * previousHeight)
 * - added = min(sourceHeight, sourceStrength * 0.3 * sourceHeight)
 */
export const heightFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uHeightMap;
uniform vec2 uFboSize;
uniform float uDt;
uniform vec2 uVelocityThreshold;

vec2 backtraceUv(vec2 uv, vec2 flow, vec2 fboSize, float dt) {
    vec2 ratio = max(fboSize.x, fboSize.y) / fboSize;
    vec2 velocityRatio = fboSize / min(fboSize.x, fboSize.y);
    return uv - flow * velocityRatio * dt * ratio;
}

void main() {
    float previousHeight = texture2D(uHeightMap, vUv).r;
    vec2 flow = texture2D(uVelocity, vUv).xy;

    // Ngưỡng cắt vận tốc: ngăn các vùng tĩnh bị trôi theo dòng chảy yếu
    float previousStrength = smoothstep(uVelocityThreshold.x, uVelocityThreshold.y, length(flow));
    float removed = min(previousHeight, previousStrength * 0.3 * previousHeight);

    vec2 sourceUv = backtraceUv(vUv, flow, uFboSize, uDt);
    float sourceHeight = texture2D(uHeightMap, sourceUv).r;
    float sourceStrength = smoothstep(uVelocityThreshold.x, uVelocityThreshold.y, length(texture2D(uVelocity, sourceUv).xy));
    float added = min(sourceHeight, sourceStrength * 0.3 * sourceHeight);

    float nextHeight = max(0.0, previousHeight - removed + added);
    gl_FragColor = vec4(nextHeight, 0.0, 0.0, 1.0);
}
`;

/**
 * alpha.frag - Lưu vết màu kem bằng một FBO riêng biệt
 * Exactly from mofu-dev:
 * float maximum = max(current, previousMaximum);
 * gl_FragColor = vec4(maximum, maximum * 0.5 + current * 0.5, 0.0, 0.0);
 */
export const alphaFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uHeightMap;
uniform sampler2D uAlphaMap;

void main() {
    float previousMaximum = texture2D(uAlphaMap, vUv).r;
    float current = smoothstep(0.0, 0.01 / 0.7, max(0.0, texture2D(uHeightMap, vUv).r));
    float maximum = max(current, previousMaximum);
    gl_FragColor = vec4(maximum, maximum * 0.5 + current * 0.5, 0.0, 0.0);
}
`;

/**
 * render.frag - Tính Normal bằng tích có hướng (cross) và lấy mẫu Matcap
 * Exactly from mofu-dev:
 * vec3 normal = -normalize(cross(positionX - position, positionY - position));
 * vec3 color = texture2D(matcap, normal.zx * 0.5 + 0.5).rgb + 0.05;
 * gl_FragColor = vec4(color, step(0.1, alphaValue) * alphaValue);
 */
export const renderFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uHeightMap;
uniform sampler2D uAlphaMap;
uniform sampler2D uMatcap;
uniform vec2 uResolution;

void main() {
    float height = texture2D(uHeightMap, vUv).r;
    vec2 stepSize = 1.0 / uResolution;
    vec2 uvX = vUv + vec2(stepSize.x, 0.0);
    vec2 uvY = vUv + vec2(0.0, stepSize.y);
    float heightScale = 0.2 / 0.66;
    vec2 ratio = uResolution / min(uResolution.x, uResolution.y);

    vec3 position  = vec3((vUv * ratio).x, height * heightScale, (vUv * ratio).y);
    vec3 positionX = vec3((uvX * ratio).x, texture2D(uHeightMap, uvX).r * heightScale, (uvX * ratio).y);
    vec3 positionY = vec3((uvY * ratio).x, texture2D(uHeightMap, uvY).r * heightScale, (uvY * ratio).y);
    vec3 normal = -normalize(cross(positionX - position, positionY - position));

    vec3 color = texture2D(uMatcap, normal.zx * 0.5 + 0.5).rgb + 0.05;
    float alphaValue = texture2D(uAlphaMap, vUv).g;

    // Composited smoothly over pure white background
    float a = step(0.1, alphaValue) * alphaValue;
    vec3 finalColor = mix(vec3(1.0, 1.0, 1.0), color, a);

    gl_FragColor = vec4(finalColor, 1.0);
}
`;
