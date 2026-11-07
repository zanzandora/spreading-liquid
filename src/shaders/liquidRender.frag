precision highp float;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vB;
varying vec2 vT;

uniform sampler2D uHeight;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
uniform float uNormalScale;
uniform float uLiquidOpacity;
uniform int uTheme; // 0: Chrome/Mercury, 1: Cosmetic Foundation, 2: Emerald Slime, 3: Obsidian Gold, 4: Rose Gold Pearl
uniform vec2 uLightPos;
uniform float uSpecularStrength;
uniform float uRefractionStrength;

// Procedural high-end Matcap shader models
vec3 getMatcap(vec3 normal, int theme) {
    vec2 muv = normal.xy * 0.495 + 0.5;
    float dist = length(normal.xy);
    float rim = pow(clamp(dist, 0.0, 1.0), 3.0);
    float spec = pow(max(0.0, normal.z), 16.0);
    float specSharp = pow(max(0.0, dot(normal, normalize(vec3(0.4, 0.5, 0.8)))), 48.0);
    
    if (theme == 0) {
        // Theme 0: Liquid Mercury / Chrome
        vec3 base = mix(vec3(0.55, 0.58, 0.63), vec3(0.85, 0.90, 0.96), normal.y * 0.5 + 0.5);
        vec3 col = mix(base, vec3(1.0, 1.0, 1.0), specSharp * 1.2);
        col += rim * vec3(0.3, 0.4, 0.5) * 0.7;
        return col;
    } else if (theme == 1) {
        // Theme 1: Luxury Cosmetic Foundation (Warm Honey / Nude Beige)
        vec3 deep = vec3(0.78, 0.52, 0.38);
        vec3 mid = vec3(0.92, 0.72, 0.58);
        vec3 highlight = vec3(1.0, 0.94, 0.88);
        vec3 col = mix(deep, mid, normal.y * 0.4 + 0.6);
        col = mix(col, highlight, spec * 0.35 + specSharp * 0.6);
        col += rim * vec3(0.95, 0.65, 0.5) * 0.3;
        return col;
    } else if (theme == 2) {
        // Theme 2: Bioluminescent Emerald / Cyber Slime
        vec3 darkGreen = vec3(0.02, 0.22, 0.16);
        vec3 neonGreen = vec3(0.0, 0.95, 0.55);
        vec3 cyanGlow = vec3(0.2, 0.8, 1.0);
        vec3 col = mix(darkGreen, neonGreen, normal.y * 0.5 + 0.5);
        col = mix(col, cyanGlow, specSharp * 0.8);
        col += rim * vec3(0.0, 1.0, 0.7) * 0.9;
        return col;
    } else if (theme == 3) {
        // Theme 3: Obsidian Black & Liquid Gold
        vec3 black = vec3(0.06, 0.07, 0.09);
        vec3 gold = vec3(0.95, 0.75, 0.25);
        vec3 goldHot = vec3(1.0, 0.95, 0.7);
        vec3 col = mix(black, gold * 0.4, rim);
        col = mix(col, goldHot, specSharp * 1.4);
        col += rim * gold * 0.6;
        return col;
    } else {
        // Theme 4: Rose Gold Pearl Silk
        vec3 roseDeep = vec3(0.65, 0.35, 0.40);
        vec3 roseMid = vec3(0.92, 0.68, 0.70);
        vec3 pearlWhite = vec3(1.0, 0.95, 0.96);
        vec3 col = mix(roseDeep, roseMid, normal.y * 0.5 + 0.5);
        col = mix(col, pearlWhite, specSharp * 0.9);
        col += rim * vec3(0.95, 0.5, 0.6) * 0.4;
        return col;
    }
}

void main() {
    // 1. Sample height map and compute gradient normals
    vec2 texel = uTexelSize;
    float hL = texture2D(uHeight, vL).r;
    float hR = texture2D(uHeight, vR).r;
    float hB = texture2D(uHeight, vB).r;
    float hT = texture2D(uHeight, vT).r;
    
    vec4 hData = texture2D(uHeight, vUv);
    float h = hData.r;
    float trail = hData.g;
    float adhesion = hData.b;

    // Normal calculation: Sobel-like filter for smooth curvature
    float dx = (hR - hL) * uNormalScale;
    float dy = (hT - hB) * uNormalScale;
    vec3 normal = normalize(vec3(-dx, -dy, 1.0));

    // 2. View vector and Fresnel calculation
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float NdotV = max(0.0, dot(normal, viewDir));
    float fresnel = pow(1.0 - NdotV, 3.5);

    // 3. Dynamic light highlight
    vec3 lightDir = normalize(vec3(uLightPos - vUv, 0.45));
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(0.0, dot(normal, halfVec)), 32.0) * uSpecularStrength;

    // 4. Matcap color from theme
    vec3 matcapColor = getMatcap(normal, uTheme);
    vec3 liquidColor = matcapColor + spec * vec3(1.0, 1.0, 1.0);

    // 5. Meniscus highlight rim along UI element boundaries
    if (adhesion > 0.01) {
        float meniscusSheen = pow(adhesion, 1.5) * 0.4;
        liquidColor += vec3(meniscusSheen);
    }

    // 6. Translucency & Thickness calculation (Beer-Lambert attenuation)
    float effectiveHeight = h + trail * 0.35;
    float alpha = clamp(effectiveHeight * 2.5 + fresnel * 0.4, 0.0, 1.0) * uLiquidOpacity;
    
    // Very thin smear is subtly glossy
    if (trail > 0.005 && h < 0.01) {
        alpha = max(alpha, trail * 0.28 * uLiquidOpacity);
    }

    gl_FragColor = vec4(liquidColor, alpha);
}
