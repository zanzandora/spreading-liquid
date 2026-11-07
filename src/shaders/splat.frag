precision highp float;

varying vec2 vUv;
uniform sampler2D uTarget;
uniform float uAspectRatio;
uniform vec2 uPoint;
uniform vec3 uColor;
uniform float uRadius;

void main() {
    vec2 p = vUv - uPoint;
    p.x *= uAspectRatio;
    
    // Gaussian falloff
    float d2 = dot(p, p);
    vec3 splat = exp(-d2 / uRadius) * uColor;
    
    vec4 base = texture2D(uTarget, vUv);
    gl_FragColor = vec4(base.rgb + splat, base.a);
}
