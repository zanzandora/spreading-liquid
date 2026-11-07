/**
 * GLSL Shaders for 2.5D Viscoplastic Paste Smearing (mofu-dev liquid spreading)
 * Implements:
 * 1. True Hemispherical Dome Initialization
 * 2. Mass-Conserved Local Heightfield Smearing, Plowing (Trough & Ridge), and Head Ripples
 * 3. Gradient Normal Reconstruction and Matcap Shading with Thin-Film Fade
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

/**
 * Step A: True Hemispherical Dome Initialization
 * h(x, y) = sqrt(max(0.0, R^2 - ||p - c||^2))
 */
export const initDropFrag = `
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uRadius;

void main() {
    vec2 ratio = uResolution / min(uResolution.x, uResolution.y);
    vec2 p = (vUv - uCenter) * ratio;
    float distSq = dot(p, p);
    float rSq = uRadius * uRadius;

    if (distSq < rSq) {
        float h = sqrt(max(0.0, rSq - distSq));
        float dist = sqrt(distSq);
        float rimAlpha = smoothstep(uRadius, uRadius - 0.003, dist);
        gl_FragColor = vec4(h * rimAlpha, 0.0, 0.0, 1.0);
    } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
}
`;

/**
 * Step B: 2.5D Viscoplastic Local Smear, Plowing & Ripples (heightAdvection.frag)
 * - sdSegment prevents gaps during fast drags
 * - Local smear carry inside brush core
 * - Mass-conserved plowing: carves trough in center, builds ridges on sides & front bow wave
 * - Head ripples create concentric finger ridges under cursor
 */
export const heightSmearFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uHeightMap;
uniform vec2 uMouse;      // Current mouse position (UV space)
uniform vec2 uPrevMouse;  // Previous mouse position (UV space)
uniform float uBrushRadius;
uniform float uIsDown;

// Distance to line segment to guarantee continuous strokes during fast drags
float sdSegment(vec2 p, vec2 a, vec2 b, out float hProj) {
    vec2 pa = p - a, ba = b - a;
    float lenSq = dot(ba, ba);
    hProj = (lenSq > 1e-6) ? clamp(dot(pa, ba) / lenSq, 0.0, 1.0) : 0.0;
    return length(pa - ba * hProj);
}

void main() {
    float currentH = texture2D(uHeightMap, vUv).r;
    vec2 strokeVec = uMouse - uPrevMouse;
    float strokeLen = length(strokeVec);

    if (uIsDown < 0.5 || strokeLen < 1e-5) {
        gl_FragColor = vec4(currentH, 0.0, 0.0, 1.0);
        return;
    }

    vec2 strokeDir = strokeVec / strokeLen;
    float tProj;
    float distSeg = sdSegment(vUv, uPrevMouse, uMouse, tProj);
    float distHead = length(vUv - uMouse);

    // 1. KÉO TRƯỢT CỤC BỘ (Local Smear Advection) chỉ trong lòng nét cọ
    float carryMask = smoothstep(uBrushRadius * 1.15, 0.0, distSeg);
    vec2 sampleUv = vUv - strokeVec * carryMask * 0.90;
    float smearedH = texture2D(uHeightMap, sampleUv).r;

    // Hao hụt nhẹ khi kéo kem đi xa trên bề mặt phẳng
    float baseH = mix(currentH, smearedH * 0.985, carryMask);

    // 2. KHOÉT RÃNH (Trough) & ĐÙN GỜ HAI BÊN (Ridge Pile-up)
    float availableVolume = smoothstep(0.002, 0.035, baseH);

    // Mặt cắt ngang của rãnh (lõm ở giữa: d < 0.78 * R)
    float innerNorm = distSeg / (uBrushRadius * 0.78);
    float troughProfile = max(0.0, 1.0 - innerNorm * innerNorm);

    // Mặt cắt vành gờ hai bên & phía trước đầu cọ (0.7 * R < d < 1.35 * R)
    float ringCenter = uBrushRadius * 0.95;
    float ringWidth = uBrushRadius * 0.35;
    float ringDist = (distSeg - ringCenter) / ringWidth;
    float sideRidge = exp(-ringDist * ringDist * 2.2);

    // Gờ đùn phía trước mũi cọ (Bow wave)
    vec2 toFrag = vUv - uMouse;
    float frontBias = smoothstep(-0.2, 0.8, dot(normalize(toFrag + 1e-6), strokeDir));
    float headRing = exp(-pow((distHead - ringCenter) / ringWidth, 2.0) * 2.0) * frontBias;

    // Vân gợn nhỏ (Ripples) dưới đáy cọ tại đầu chuột
    float headRipple = sin(distHead / uBrushRadius * 26.0) * 0.012 * smoothstep(uBrushRadius * 0.8, 0.0, distHead);

    // Bảo toàn khối lượng cục bộ: vét kem ở rãnh, đùn lên gờ xung quanh
    float speedFactor = min(strokeLen * 18.0, 1.0);
    float scooped = baseH * 0.52 * troughProfile * availableVolume * speedFactor;
    float depositProfile = sideRidge * 0.85 + headRing * 0.95;
    float deposited = scooped * depositProfile;

    float finalH = max(0.0, baseH - scooped + deposited + headRipple * availableVolume * baseH);

    gl_FragColor = vec4(finalH, 0.0, 0.0, 1.0);
}
`;

/**
 * Step C: Tái tạo Pháp tuyến (Normal) sắc nét và Matcap Shading (liquidRender.frag)
 */
export const liquidRenderFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uHeightMap;
uniform sampler2D uMatcap;
uniform vec2 uTexelSize;
uniform float uNormalScale;

void main() {
    float hC = texture2D(uHeightMap, vUv).r;

    // Ngưỡng cắt alpha mượt ở rìa giọt kem và đuôi nét kéo
    float alpha = smoothstep(0.0006, 0.006, hC);
    if (alpha <= 0.001) {
        gl_FragColor = vec4(1.0); // Nền trắng
        return;
    }

    // Lấy mẫu lân cận tính vector pháp tuyến từ trường độ cao
    float hL = texture2D(uHeightMap, vUv - vec2(uTexelSize.x, 0.0)).r;
    float hR = texture2D(uHeightMap, vUv + vec2(uTexelSize.x, 0.0)).r;
    float hD = texture2D(uHeightMap, vUv - vec2(0.0, uTexelSize.y)).r;
    float hU = texture2D(uHeightMap, vUv + vec2(0.0, uTexelSize.y)).r;

    vec2 grad = vec2(hR - hL, hU - hD) / (2.0 * uTexelSize);
    vec3 normal = normalize(vec3(-grad * uNormalScale, 1.0));

    // Tra cứu MatCap từ View-space Normal
    vec2 matcapUv = normal.xy * 0.492 + 0.5;
    vec3 liquidColor = texture2D(uMatcap, matcapUv).rgb;

    // Hòa trộn mượt với nền trắng ở các dải kem mỏng (Beer-Lambert / Thin-film fade)
    float thicknessFade = smoothstep(0.0, 0.04, hC);
    vec3 finalColor = mix(vec3(1.0), liquidColor, alpha * mix(0.40, 1.0, thicknessFade));

    gl_FragColor = vec4(finalColor, 1.0);
}
`;
