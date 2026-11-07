precision highp float;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vB;
varying vec2 vT;

uniform sampler2D uPressure;
uniform sampler2D uDivergence;

void main() {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float B = texture2D(uPressure, vB).x;
    float T = texture2D(uPressure, vT).x;
    float C = texture2D(uPressure, vUv).x;

    // Neumann boundary conditions for pressure
    if (vL.x < 0.0) { L = C; }
    if (vR.x > 1.0) { R = C; }
    if (vB.y < 0.0) { B = C; }
    if (vT.y > 1.0) { T = C; }

    float div = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + B + T - div) * 0.25;
    
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
