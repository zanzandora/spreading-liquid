precision highp float;

varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uDissipation;

void main() {
    // Backtrace coordinate along velocity vector
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    vec2 coord = vUv - uDt * velocity * uTexelSize;
    
    // Sample previous quantity with bilinear filtering
    vec4 result = texture2D(uSource, coord);
    
    // Dissipation decay
    float decay = 1.0 + uDissipation * uDt;
    gl_FragColor = result / decay;
}
