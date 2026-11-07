/**
 * Authentic GLSL shaders from Misaki Nakano's liquid spreading demo
 * (https://mofu-dev.com/en/blog/fluid-foundation/)
 */

// Full-screen Quad Vertex Shader
export const baseVert = `
precision highp float;
attribute vec3 position;
varying vec2 vUv;

void main() {
  vUv = 0.5 + position.xy * 0.5;
  gl_Position = vec4(position, 1.0);
}
`;

// Fluid Boundary Vertex Shader
export const boundaryVert = `
precision highp float;
attribute vec3 position;
uniform vec2 boundarySpace;
varying vec2 vUv;

void main() {
  vec3 pos = position;
  pos.xy *= 1.0 - boundarySpace * 2.0;
  vUv = 0.5 + pos.xy * 0.5;
  gl_Position = vec4(pos, 1.0);
}
`;

// Localized Mouse Brush Splat Quad Vertex Shader
export const forceVert = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform vec2 center;
uniform vec2 scale;
uniform vec2 px;
varying vec2 vUv;

void main() {
  vec2 pos = position.xy * scale * 2.0 * px + center;
  vUv = uv;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

// Localized Mouse Brush Splat Fragment Shader
export const forceFrag = `
precision highp float;
uniform sampler2D velocity;
uniform vec2 force;
uniform vec2 fboSize;
varying vec2 vUv;

void main() {
  vec2 sourceUv = gl_FragCoord.xy / fboSize;
  vec2 previousVelocity = texture2D(velocity, sourceUv).xy;
  float distanceFromCenter = length((vUv - 0.5) * 2.0);
  float alpha = smoothstep(0.7, 0.2, distanceFromCenter);
  gl_FragColor = vec4(previousVelocity + force, 0.0, alpha);
}
`;

// Common Backtrace Function for Advection & Height Transfer
export const backtraceGlsl = `
vec2 backtraceUv(vec2 uv, vec2 flow, vec2 fboSize, float dt) {
  vec2 ratio = max(fboSize.x, fboSize.y) / fboSize;
  vec2 velocityRatio = fboSize / min(fboSize.x, fboSize.y);
  return uv - flow * velocityRatio * dt * ratio;
}
`;

// Velocity Advection Fragment Shader (with 0.9 natural dissipation)
export const advectionFrag = `
precision highp float;
uniform sampler2D velocity;
uniform float dt;
uniform vec2 fboSize;
varying vec2 vUv;

${backtraceGlsl}

void main() {
  vec2 flow = texture2D(velocity, vUv).xy;
  vec2 previousUv = backtraceUv(vUv, flow, fboSize, dt);
  vec2 nextVelocity = texture2D(velocity, previousUv).xy * 0.9;
  gl_FragColor = vec4(nextVelocity, 0.0, 0.0);
}
`;

// Viscous Diffusion Fragment Shader (16 Jacobi iterations)
export const viscousFrag = `
precision highp float;
uniform sampler2D velocity;
uniform sampler2D velocityNew;
uniform float viscosity;
uniform vec2 px;
varying vec2 vUv;

void main() {
  float dx = 0.5;
  vec2 previous = texture2D(velocity, vUv).xy;
  vec2 next0 = texture2D(velocityNew, vUv + vec2(px.x, 0.0)).xy;
  vec2 next1 = texture2D(velocityNew, vUv - vec2(px.x, 0.0)).xy;
  vec2 next2 = texture2D(velocityNew, vUv + vec2(0.0, px.y)).xy;
  vec2 next3 = texture2D(velocityNew, vUv - vec2(0.0, px.y)).xy;
  vec2 nextVelocity = 4.0 * dx * dx * previous
    + viscosity * (next0 + next1 + next2 + next3);
  nextVelocity /= 4.0 * (dx * dx + viscosity);
  gl_FragColor = vec4(nextVelocity, 0.0, 0.0);
}
`;

// Divergence Fragment Shader
export const divergenceFrag = `
precision highp float;
uniform sampler2D velocity;
uniform vec2 px;
varying vec2 vUv;

void main() {
  float x0 = texture2D(velocity, vUv - vec2(px.x, 0.0)).x;
  float x1 = texture2D(velocity, vUv + vec2(px.x, 0.0)).x;
  float y0 = texture2D(velocity, vUv - vec2(0.0, px.y)).y;
  float y1 = texture2D(velocity, vUv + vec2(0.0, px.y)).y;
  gl_FragColor = vec4((x1 - x0 + y1 - y0) * 0.5, 0.0, 0.0, 0.0);
}
`;

// Pressure Poisson Jacobi Fragment Shader
export const poissonFrag = `
precision highp float;
uniform sampler2D pressure;
uniform sampler2D divergence;
uniform vec2 px;
varying vec2 vUv;

void main() {
  float p0 = texture2D(pressure, vUv + vec2(px.x, 0.0)).r;
  float p1 = texture2D(pressure, vUv - vec2(px.x, 0.0)).r;
  float p2 = texture2D(pressure, vUv + vec2(0.0, px.y)).r;
  float p3 = texture2D(pressure, vUv - vec2(0.0, px.y)).r;
  float div = texture2D(divergence, vUv).r;
  gl_FragColor = vec4((p0 + p1 + p2 + p3 - div) * 0.25, 0.0, 0.0, 0.0);
}
`;

// Gradient Subtract to enforce incompressibility
export const gradientSubtractFrag = `
precision highp float;
uniform sampler2D pressure;
uniform sampler2D velocity;
uniform vec2 px;
varying vec2 vUv;

void main() {
  float p0 = texture2D(pressure, vUv + vec2(px.x, 0.0)).r;
  float p1 = texture2D(pressure, vUv - vec2(px.x, 0.0)).r;
  float p2 = texture2D(pressure, vUv + vec2(0.0, px.y)).r;
  float p3 = texture2D(pressure, vUv - vec2(0.0, px.y)).r;
  vec2 currentVelocity = texture2D(velocity, vUv).xy;
  vec2 pressureGradient = vec2(p0 - p1, p2 - p3) * 0.5;
  gl_FragColor = vec4(currentVelocity - pressureGradient, 0.0, 0.0);
}
`;

// Initial Droplet Dome Fragment Shader
export const initDropFrag = `
precision highp float;
uniform vec2 resolution;
varying vec2 vUv;

float calculateHeight(float value) {
  return sqrt((1.0 - value * value) / 12.0);
}

void main() {
  vec2 point = (vUv - 0.5) * 2.0 * resolution / min(resolution.x, resolution.y);
  float distanceFromCenter = length(point);
  float height = calculateHeight(smoothstep(0.0, 0.3, distanceFromCenter));
  height = smoothstep(0.0, 0.025, height) * height * 0.66;
  gl_FragColor = vec4(height, 0.0, 0.0, 1.0);
}
`;

// Height Advection & Mass Transport Fragment Shader
export const heightFrag = `
precision highp float;
uniform sampler2D heightMap;
uniform sampler2D velocity;
uniform float dt;
uniform vec2 fboSize;
uniform vec2 velocityThreshold;
varying vec2 vUv;

${backtraceGlsl}

void main() {
  float previousHeight = texture2D(heightMap, vUv).r;
  vec2 flow = texture2D(velocity, vUv).xy;
  float previousStrength = smoothstep(
    velocityThreshold.x,
    velocityThreshold.y,
    length(flow)
  );
  float removed = min(previousHeight, previousStrength * 0.3 * previousHeight);

  vec2 sourceUv = backtraceUv(vUv, flow, fboSize, dt);
  float sourceHeight = texture2D(heightMap, sourceUv).r;
  float sourceStrength = smoothstep(
    velocityThreshold.x,
    velocityThreshold.y,
    length(texture2D(velocity, sourceUv).xy)
  );
  float added = min(sourceHeight, sourceStrength * 0.3 * sourceHeight);
  gl_FragColor = vec4(max(0.0, previousHeight - removed + added), 0.0, 0.0, 1.0);
}
`;

// Historical Alpha Tracking Fragment Shader
export const alphaFrag = `
precision highp float;
uniform sampler2D heightMap;
uniform sampler2D alphaMap;
varying vec2 vUv;

void main() {
  float previousMaximum = texture2D(alphaMap, vUv).r;
  float current = smoothstep(0.0, 0.01 / 0.7, max(0.0, texture2D(heightMap, vUv).r));
  float maximum = max(current, previousMaximum);
  gl_FragColor = vec4(maximum, maximum * 0.5 + current * 0.5, 0.0, 1.0);
}
`;

// Shading & Matcap Rendering Fragment Shader
export const renderFrag = `
precision highp float;
uniform sampler2D heightMap;
uniform sampler2D alphaMap;
uniform sampler2D matcap;
uniform vec2 resolution;
varying vec2 vUv;

void main() {
  float heightScale = 0.2 / 0.66;
  vec2 stepSize = 1.0 / resolution;
  vec2 ratio = resolution / min(resolution.x, resolution.y);

  float height = texture2D(heightMap, vUv).r;
  vec3 position = vec3((vUv * ratio).x, height * heightScale, (vUv * ratio).y);
  vec2 uvX = vUv + vec2(stepSize.x, 0.0);
  vec2 uvY = vUv + vec2(0.0, stepSize.y);
  vec3 positionX = vec3(((uvX) * ratio).x, texture2D(heightMap, uvX).r * heightScale, ((uvX) * ratio).y);
  vec3 positionY = vec3(((uvY) * ratio).x, texture2D(heightMap, uvY).r * heightScale, ((uvY) * ratio).y);
  vec3 normal = -normalize(cross(positionX - position, positionY - position));

  vec3 color = texture2D(matcap, normal.zx * 0.5 + 0.5).rgb + 0.05;
  float tilt = dot(vec3(0.0, 1.0, 0.0), normal) * 0.5 + 0.5;
  color = mix(color * 0.5 + 0.5, color, tilt);

  float alphaValue = texture2D(alphaMap, vUv).g;
  gl_FragColor = vec4(color, step(0.1, alphaValue) * alphaValue);
}
`;
