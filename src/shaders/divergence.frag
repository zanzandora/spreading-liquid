precision highp float;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vB;
varying vec2 vT;

uniform sampler2D uVelocity;

void main() {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float B = texture2D(uVelocity, vB).y;
    float T = texture2D(uVelocity, vT).y;

    // Boundary conditions: clamp velocity at borders
    vec2 c = texture2D(uVelocity, vUv).xy;
    if (vL.x < 0.0) { L = -c.x; }
    if (vR.x > 1.0) { R = -c.x; }
    if (vB.y < 0.0) { B = -c.y; }
    if (vT.y > 1.0) { T = -c.y; }

    float div = 0.5 * ((R - L) + (T - B));
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
