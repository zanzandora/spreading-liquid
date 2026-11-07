precision highp float;

attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vB;
varying vec2 vT;

uniform vec2 uTexelSize;

void main() {
    vUv = uv;
    vL = uv - vec2(uTexelSize.x, 0.0);
    vR = uv + vec2(uTexelSize.x, 0.0);
    vB = uv - vec2(0.0, uTexelSize.y);
    vT = uv + vec2(0.0, uTexelSize.y);
    gl_Position = vec4(position, 1.0);
}
