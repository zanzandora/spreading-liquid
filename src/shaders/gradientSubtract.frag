precision highp float;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vB;
varying vec2 vT;

uniform sampler2D uPressure;
uniform sampler2D uVelocity;

void main() {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float B = texture2D(uPressure, vB).x;
    float T = texture2D(uPressure, vT).x;
    float C = texture2D(uPressure, vUv).x;

    if (vL.x < 0.0) { L = C; }
    if (vR.x > 1.0) { R = C; }
    if (vB.y < 0.0) { B = C; }
    if (vT.y > 1.0) { T = C; }

    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity.xy -= vec2(R - L, T - B) * 0.5;

    gl_FragColor = vec4(velocity, 0.0, 1.0);
}
