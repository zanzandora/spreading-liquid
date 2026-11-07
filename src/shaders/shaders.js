/**
 * GLSL Shaders for 2.5D Viscoplastic Paste Smearing (mofu-dev liquid spreading)
 * 2-Channel Architecture:
 * - Channel .r (volH): Macro Volume & Mass Conservation (never destroyed by trough carve)
 * - Channel .g (sculptH): Surface Topography (trough depression, lateral ridges, head ripples)
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
 * - Channel .r (volH): True 3D hemispherical dome volume
 * - Channel .g (sculptH): 0.0 (pristine surface before brush contact)
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
        // .r = Macro Volume, .g = Initial Surface Sculpt (0.0)
        gl_FragColor = vec4(h * rimAlpha, 0.0, 0.0, 1.0);
    } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
}
`;

/**
 * Step B: 2-Channel Viscoplastic Smear & Sculpt (heightAdvection.frag)
 * - Channel .r (volH): Mass-conserving advection and transport. NEVER carved to zero.
 * - Channel .g (sculptH): Micro-relief (trough indent, side ridges, concentric ripples).
 */
export const heightSmearFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uHeightMap;
uniform vec2 uMouse;      // Current mouse position (UV space)
uniform vec2 uPrevMouse;  // Previous mouse position (UV space)
uniform float uBrushRadius;
uniform float uIsDown;

// Exact capsule distance to stroke segment to avoid gaps during fast drags
float sdSegment(vec2 p, vec2 a, vec2 b, out float hProj) {
    vec2 pa = p - a, ba = b - a;
    float lenSq = dot(ba, ba);
    hProj = (lenSq > 1e-6) ? clamp(dot(pa, ba) / lenSq, 0.0, 1.0) : 0.0;
    return length(pa - ba * hProj);
}

void main() {
    vec4 currentData = texture2D(uHeightMap, vUv);
    float currentVol = currentData.r;
    float currentSculpt = currentData.g;

    vec2 strokeVec = uMouse - uPrevMouse;
    float strokeLen = length(strokeVec);

    if (uIsDown < 0.5 || strokeLen < 1e-5) {
        gl_FragColor = currentData;
        return;
    }

    vec2 strokeDir = strokeVec / strokeLen;
    float tProj;
    float distSeg = sdSegment(vUv, uPrevMouse, uMouse, tProj);
    float distHead = length(vUv - uMouse);

    // Brush coverage mask
    float brushMask = smoothstep(uBrushRadius * 1.15, 0.0, distSeg);

    // =========================================================================
    // 1. KÊNH .r (volH - Thể tích vĩ mô & Bảo toàn khối lượng):
    // Vận chuyển kem theo cọ ra vùng trống mà KHÔNG bị carve trừ triệt tiêu.
    // =========================================================================
    vec2 sampleUv = vUv - strokeVec * brushMask * 0.95;
    float smearedVol = texture2D(uHeightMap, sampleUv).r;

    // Khi kéo ra vùng trống (currentVol thấp, smearedVol cao), suy hao nhẹ theo quãng đường strokeLen
    // để kem vươn dài thành dải bản rộng rồi mỏng dần tự nhiên.
    float distanceDecay = clamp(1.0 - strokeLen * 0.65, 0.92, 1.0);
    float transportedVol = smearedVol * distanceDecay;

    // Pha trộn thể tích theo vùng phủ của cọ
    float nextVol = mix(currentVol, transportedVol, brushMask);

    // =========================================================================
    // 2. KÊNH .g (sculptH - Địa hình bề mặt / Rãnh cọ, Gờ đùn & Gợn vân):
    // Chỉ tạo biến dạng khi có lớp kem bên dưới (nextVol > ngưỡng tối thiểu).
    // Khi xoay cọ tại chỗ, volH giữ nguyên còn sculptH liên tục in các nếp gờ mới.
    // =========================================================================
    float hasVolume = smoothstep(0.003, 0.035, nextVol);

    // Mặt cắt rãnh cọ (Lõm nhẹ ở giữa: d < 0.75 * R)
    float innerNorm = distSeg / (uBrushRadius * 0.75);
    float troughShape = max(0.0, 1.0 - innerNorm * innerNorm);
    float troughIndent = -0.018 * troughShape;

    // Mặt cắt gờ đùn hai bên sườn (0.75 * R < d < 1.35 * R)
    float ringCenter = uBrushRadius * 0.92;
    float ringWidth = uBrushRadius * 0.32;
    float ringDist = (distSeg - ringCenter) / ringWidth;
    float sideRidge = exp(-ringDist * ringDist * 2.2);

    // Gờ đùn phía trước mũi cọ (Bow wave)
    vec2 toFrag = vUv - uMouse;
    float frontBias = smoothstep(-0.2, 0.8, dot(normalize(toFrag + 1e-6), strokeDir));
    float headRing = exp(-pow((distHead - ringCenter) / ringWidth, 2.0) * 2.0) * frontBias;

    float ridgePlow = 0.024 * (sideRidge * 0.85 + headRing * 0.95);

    // Gợn vân đồng tâm sống động dưới đầu chuột như ở bản gốc
    float rippleFreq = distHead / uBrushRadius * 28.0;
    float headRipple = sin(rippleFreq) * 0.010 * smoothstep(uBrushRadius * 0.85, 0.0, distHead);

    // Độ lệch địa hình cục bộ của nét cọ hiện tại
    float newImpression = (troughIndent + ridgePlow + headRipple) * hasVolume;

    // Vận chuyển nhẹ địa hình cũ theo dòng chảy và ghi đè nét cọ mới
    float advectedSculpt = texture2D(uHeightMap, sampleUv).g;
    float nextSculpt = mix(advectedSculpt, newImpression, brushMask * 0.88);

    gl_FragColor = vec4(nextVol, nextSculpt, 0.0, 1.0);
}
`;

/**
 * Step C: Tái tạo Pháp tuyến sắc nét và Shading độ che phủ cao (liquidRender.frag)
 */
export const liquidRenderFrag = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uHeightMap;
uniform sampler2D uMatcap;
uniform vec2 uTexelSize;
uniform float uNormalScale;

// Tính độ cao tổng hợp để xây dựng vector pháp tuyến quang học
float getCompositeHeight(vec4 data) {
    float vol = data.r;
    float sculpt = data.g;
    // sculpt chỉ tác động khi có thể tích, không bao giờ làm thủng nền (vol)
    float sculptScale = clamp(vol / 0.04, 0.0, 1.0);
    return max(0.0005, vol + sculpt * sculptScale);
}

void main() {
    vec4 cData = texture2D(uHeightMap, vUv);
    float vol = cData.r;

    // Cắt alpha sắc nét ở mép ngoài cùng (chỉ khi hoàn toàn không có kem)
    float alpha = smoothstep(0.0005, 0.0035, vol);
    if (alpha <= 0.001) {
        gl_FragColor = vec4(1.0); // Nền trắng tinh
        return;
    }

    // 4-Tap gradient tính vector pháp tuyến từ địa hình tổng hợp
    vec4 dL = texture2D(uHeightMap, vUv - vec2(uTexelSize.x, 0.0));
    vec4 dR = texture2D(uHeightMap, vUv + vec2(uTexelSize.x, 0.0));
    vec4 dD = texture2D(uHeightMap, vUv - vec2(0.0, uTexelSize.y));
    vec4 dU = texture2D(uHeightMap, vUv + vec2(0.0, uTexelSize.y));

    float hL = getCompositeHeight(dL);
    float hR = getCompositeHeight(dR);
    float hD = getCompositeHeight(dD);
    float hU = getCompositeHeight(dU);

    vec2 grad = vec2(hR - hL, hU - hD) / (2.0 * uTexelSize);
    vec3 normal = normalize(vec3(-grad * uNormalScale, 1.0));

    // Tra cứu View-space Matcap
    vec2 matcapUv = normal.xy * 0.492 + 0.5;
    vec3 liquidColor = texture2D(uMatcap, matcapUv).rgb;

    // Giữ độ che phủ (Coverage) cao của kem đặc:
    // Ngay cả khi bị cọ ép mỏng, kem vẫn giữ sắc xanh đậm đà (alpha >= 75%)
    // Chỉ mép ngoài cùng của vệt thoa mới chuyển tiếp mượt mà vào nền trắng
    float thinFade = smoothstep(0.0006, 0.012, vol);
    float coverageAlpha = alpha * mix(0.72, 1.0, thinFade);
    vec3 finalColor = mix(vec3(1.0), liquidColor, coverageAlpha);

    gl_FragColor = vec4(finalColor, 1.0);
}
`;
